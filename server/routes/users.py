from flask import Blueprint, jsonify

from server.db import connect
from server.helpers import current_user, list_campaigns
from server.access import require_login

bp = Blueprint('users', __name__)

# The signed-in user's home page data: their campaigns, and their characters across all of
# them and the Character Sandbox (campaignId and campaignName null).
@bp.get('/user')
@require_login
def get_user():
    conn = connect()
    try:
        user = current_user(conn)
        campaigns = list_campaigns(conn, user['id'])
        characters = conn.execute(
            # Character Sandbox characters have no campaign; they're listed after the rest.
            'SELECT ch.id, ch.name, ch.is_active, ch.campaign_id, c.name AS campaign_name, '
            'p.updated_at AS portrait_version '
            'FROM characters ch LEFT JOIN campaigns c ON c.id = ch.campaign_id '
            'LEFT JOIN character_portraits p ON p.character_id = ch.id '
            'WHERE ch.owner_id = ? AND ch.deleted_at IS NULL '
            'ORDER BY ch.campaign_id IS NULL, c.created_at, ch.created_at',
            (user['id'],),
        ).fetchall()
    finally:
        conn.close()
    return jsonify({
        'name': user['display_name'],
        'isAdmin': bool(user['is_admin']),
        'campaigns': campaigns,
        'characters': [{
            'id': ch['id'],
            'name': ch['name'],
            'isActive': bool(ch['is_active']),
            'campaignId': ch['campaign_id'],
            'campaignName': ch['campaign_name'],
            'portraitVersion': ch['portrait_version'],
        } for ch in characters],
    }), 200
