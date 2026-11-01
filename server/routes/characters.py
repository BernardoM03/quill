import json
import uuid

from flask import Blueprint, Response, g, jsonify, request

from server import portraits
from server.access import require_login, require_member
from server.db import connect
from server.helpers import NOW, clean_name, error, json_body
from server.ratelimit import limit
from server.rules.characters import allowed_species, species_detail, validate_draft

bp = Blueprint('characters', __name__)

class NoCampaign(Exception):
    pass

# The allowedContent a new character must follow: the campaign's, or None for the
# Character Sandbox (campaign_id None), which allows everything. A character belongs to a
# membership, so even the admin must be in the campaign. Raises NoCampaign otherwise.
def creation_content(conn, campaign_id):
    if campaign_id is None:
        return None
    row = conn.execute(
        'SELECT c.settings FROM campaigns c JOIN memberships m ON m.campaign_id = c.id '
        'WHERE c.id = ? AND m.user_id = ?',
        (campaign_id, g.user['id']),
    ).fetchone()
    if row is None:
        raise NoCampaign()
    return json.loads(row['settings']).get('allowedContent', {})

# ?campaign=<id> or ?campaign=sandbox. What the creation wizard may offer.
@bp.get('/characters/options')
@require_login
def get_options():
    campaign = request.args.get('campaign')
    if not campaign:
        return error('Say which campaign, or "sandbox".', 400)
    conn = connect()
    try:
        content = creation_content(conn, None if campaign == 'sandbox' else campaign)
    except NoCampaign:
        return error('Campaign not found', 404)
    finally:
        conn.close()
    return jsonify({'species': [species_detail(s, content) for s in allowed_species(content)]}), 200

# Body: {campaignId (null for the sandbox), name, species, speciesChoices}. Returns {errors: [{field, message}]},
# empty when the draft can be created. Doesn't save anything.
@bp.post('/characters/validate')
@require_login
def validate_character():
    draft = json_body() or {}
    conn = connect()
    try:
        content = creation_content(conn, draft.get('campaignId'))
    except NoCampaign:
        return error('Campaign not found', 404)
    finally:
        conn.close()
    return jsonify({'errors': validate_draft(draft, content)}), 200

# Checks the body and saves the character. campaign_id None makes a sandbox character, which
# is never active; in a campaign, the player's first character there becomes active.
def create(campaign_id):
    draft = json_body() or {}
    conn = connect()
    try:
        with conn:
            try:
                content = creation_content(conn, campaign_id)
            except NoCampaign:
                return error('Only members of this campaign can create characters in it.', 403)
            errors = validate_draft(draft, content)
            if errors:
                return jsonify({'error': errors[0]['message'], 'errors': errors}), 400
            name = clean_name(draft['name'])
            has_active = campaign_id is None or conn.execute(
                'SELECT 1 FROM characters WHERE campaign_id = ? AND owner_id = ? AND is_active = 1 AND deleted_at IS NULL',
                (campaign_id, g.user['id']),
            ).fetchone() is not None
            character_id = str(uuid.uuid4())
            conn.execute(
                'INSERT INTO characters (id, campaign_id, owner_id, name, sheet, is_active) VALUES (?, ?, ?, ?, ?, ?)',
                (character_id, campaign_id, g.user['id'], name,
                 json.dumps({'species': draft['species'], 'speciesChoices': draft.get('speciesChoices') or {}}),
                 0 if has_active else 1),
            )
    finally:
        conn.close()
    return jsonify({'id': character_id, 'name': name, 'isActive': not has_active}), 201

# Body: {name, species, speciesChoices}. A Character Sandbox character: in no campaign, owned by the
# signed-in user alone, built from all the content the server has with the default rules.
@bp.post('/sandbox/characters')
@require_login
def create_sandbox_character():
    return create(None)

# Body: {name, species, speciesChoices}. A character owned by the signed-in user in this campaign.
@bp.post('/campaigns/<campaign_id>/characters')
@require_member
def create_character(campaign_id):
    return create(campaign_id)

# The character if the signed-in user may see and change it, else None. For now that's
# its owner and the admin; who else sees a character comes with the party-visibility rules.
def own_character(conn, character_id):
    row = conn.execute(
        'SELECT ch.*, c.name AS campaign_name, p.updated_at AS portrait_version '
        'FROM characters ch LEFT JOIN campaigns c ON c.id = ch.campaign_id '
        'LEFT JOIN character_portraits p ON p.character_id = ch.id '
        'WHERE ch.id = ? AND ch.deleted_at IS NULL',
        (character_id,),
    ).fetchone()
    if row is None or (row['owner_id'] != g.user['id'] and not g.user['is_admin']):
        return None
    return row

@bp.get('/characters/<character_id>')
@require_login
def get_character(character_id):
    conn = connect()
    try:
        row = own_character(conn, character_id)
    finally:
        conn.close()
    if row is None:
        return error('Character not found', 404)
    return jsonify({
        'id': row['id'],
        'name': row['name'],
        'isActive': bool(row['is_active']),
        'campaignId': row['campaign_id'],
        'campaignName': row['campaign_name'],
        # Changes whenever the portrait does; null when there isn't one.
        'portraitVersion': row['portrait_version'],
    }), 200

@bp.get('/characters/<character_id>/portrait')
@require_login
def get_portrait(character_id):
    conn = connect()
    try:
        image = own_character(conn, character_id) and conn.execute(
            'SELECT image FROM character_portraits WHERE character_id = ?', (character_id,)
        ).fetchone()
    finally:
        conn.close()
    if not image:
        return error('No portrait', 404)
    response = Response(image['image'], mimetype='image/webp')
    # The page asks with ?v=<portraitVersion>, so a new portrait is a new URL and this can be kept.
    response.headers['Cache-Control'] = 'private, max-age=86400'
    return response

# Body: the image file itself (PNG, JPEG or WebP, up to 200 KB). Stored re-encoded as a
# 256x256 WebP, replacing any earlier portrait.
@bp.put('/characters/<character_id>/portrait')
@require_login
@limit('portrait-upload', 30, 60 * 60)
def put_portrait(character_id):
    if (request.content_length or 0) > portraits.MAX_UPLOAD_BYTES:
        return error(f'The image is too large (over {portraits.MAX_UPLOAD_BYTES // 1000} KB).', 413)
    try:
        image = portraits.normalise(request.get_data(cache=False))
    except portraits.PortraitError as e:
        return error(str(e), 400)
    conn = connect()
    try:
        with conn:
            if own_character(conn, character_id) is None:
                return error('Character not found', 404)
            conn.execute(
                f'INSERT INTO character_portraits (character_id, image) VALUES (?, ?) '
                f'ON CONFLICT (character_id) DO UPDATE SET image = excluded.image, updated_at = {NOW}',
                (character_id, image),
            )
            version = conn.execute(
                'SELECT updated_at FROM character_portraits WHERE character_id = ?', (character_id,)
            ).fetchone()[0]
    finally:
        conn.close()
    return jsonify({'portraitVersion': version}), 200

@bp.delete('/characters/<character_id>/portrait')
@require_login
def delete_portrait(character_id):
    conn = connect()
    try:
        with conn:
            if own_character(conn, character_id) is None:
                return error('Character not found', 404)
            conn.execute('DELETE FROM character_portraits WHERE character_id = ?', (character_id,))
    finally:
        conn.close()
    return jsonify({'portraitVersion': None}), 200

# Body: {confirm}, which must be the character's name, checked here as well as in the dialog.
# Deletes the character and its portrait for good. If it was its owner's active character in
# a campaign, their newest remaining character there becomes active instead.
@bp.delete('/characters/<character_id>')
@require_login
@limit('character-delete', 30, 60 * 60)
def delete_character(character_id):
    content = json_body()
    confirm = content.get('confirm') if content else None
    conn = connect()
    try:
        with conn:
            row = own_character(conn, character_id)
            if row is None:
                return error('Character not found', 404)
            if confirm != row['name']:
                return error('The confirmation text doesn’t match the character’s name.', 400)
            conn.execute('DELETE FROM characters WHERE id = ?', (character_id,))
            if row['is_active'] and row['campaign_id'] is not None:
                conn.execute(
                    'UPDATE characters SET is_active = 1 WHERE id = ('
                    '  SELECT id FROM characters WHERE campaign_id = ? AND owner_id = ? AND deleted_at IS NULL'
                    '  ORDER BY created_at DESC LIMIT 1)',
                    (row['campaign_id'], row['owner_id']),
                )
    finally:
        conn.close()
    return jsonify({'success': True}), 200
