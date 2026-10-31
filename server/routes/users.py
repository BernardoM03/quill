from flask import Blueprint, jsonify

from server.db import connect
from server.helpers import current_user, list_campaigns
from server.access import require_login

bp = Blueprint('users', __name__)

# The signed-in user's home page data: their campaigns, and their characters across all of them.
@bp.get('/user')
@require_login
def get_user():
    conn = connect()
    try:
        user = current_user(conn)
        campaigns = list_campaigns(conn, user['id'])
        characters = conn.execute(
            'SELECT ch.id, ch.name, ch.is_active, c.id AS campaign_id, c.name AS campaign_name '
            'FROM characters ch JOIN campaigns c ON c.id = ch.campaign_id '
            'WHERE ch.owner_id = ? AND ch.deleted_at IS NULL ORDER BY c.created_at, ch.created_at',
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
        } for ch in characters],
    }), 200
