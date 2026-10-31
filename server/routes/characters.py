import uuid

from flask import Blueprint, g, jsonify

from server.access import require_login, require_member
from server.db import connect
from server.helpers import NAME_MAX_LENGTH, clean_name, error, json_body

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
