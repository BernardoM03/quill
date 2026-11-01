import uuid

from flask import Blueprint, Response, g, jsonify, request

from server import portraits
from server.access import require_login, require_member
from server.db import connect
from server.helpers import NAME_MAX_LENGTH, NOW, clean_name, error, json_body
from server.ratelimit import limit

bp = Blueprint('characters', __name__)

def name_from_body():
    content = json_body()
    return clean_name(content.get('name')) if content else None

# Body: {name}. Creates a Character Sandbox character: in no campaign, owned by the
# signed-in user alone, and built from all the content the server has with default rules.
@bp.post('/sandbox/characters')
@require_login
def create_sandbox_character():
    name = name_from_body()
    if name is None:
        return error(f'Name must be 1-{NAME_MAX_LENGTH} characters.', 400)
    character_id = str(uuid.uuid4())
    conn = connect()
    try:
        with conn:
            conn.execute(
                'INSERT INTO characters (id, campaign_id, owner_id, name, is_active) VALUES (?, NULL, ?, ?, 0)',
                (character_id, g.user['id'], name),
            )
    finally:
        conn.close()
    return jsonify({'id': character_id, 'name': name, 'isActive': False}), 201

# Body: {name}. Creates a character owned by the signed-in user in this campaign. Their
# first character here becomes the active one; later ones start inactive.
@bp.post('/campaigns/<campaign_id>/characters')
@require_member
def create_character(campaign_id):
    name = name_from_body()
    if name is None:
        return error(f'Name must be 1-{NAME_MAX_LENGTH} characters.', 400)

    character_id = str(uuid.uuid4())
    conn = connect()
    try:
        with conn:
            # A character belongs to a membership, so the admin passing @require_member
            # isn't enough: they must be in the campaign too.
            member = conn.execute(
                'SELECT 1 FROM memberships WHERE campaign_id = ? AND user_id = ?', (campaign_id, g.user['id'])
            ).fetchone()
            if member is None:
                return error('Only members of this campaign can create characters in it.', 403)
            has_active = conn.execute(
                'SELECT 1 FROM characters WHERE campaign_id = ? AND owner_id = ? AND is_active = 1 AND deleted_at IS NULL',
                (campaign_id, g.user['id']),
            ).fetchone() is not None
            conn.execute(
                'INSERT INTO characters (id, campaign_id, owner_id, name, is_active) VALUES (?, ?, ?, ?, ?)',
                (character_id, campaign_id, g.user['id'], name, 0 if has_active else 1),
            )
    finally:
        conn.close()
    return jsonify({'id': character_id, 'name': name, 'isActive': not has_active}), 201

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
