from flask import Blueprint, jsonify

from server.access import require_login
from server.db import connection
from server.helpers import current_user, list_campaigns
from server.routes.characters import character_problems

bp = Blueprint('users', __name__)

def _character_json(character, needs_changes):
    return {
        'id': character['id'],
        'name': character['name'],
        'isActive': bool(character['is_active']),
        'status': character['status'],
        'campaignId': character['campaign_id'],
        'campaignName': character['campaign_name'],
        'portraitVersion': character['portrait_version'],
        'needsChanges': needs_changes,
    }

# Home page data: the user's campaigns and their characters, with Sandbox characters (no campaign) last.
@bp.get('/user')
@require_login
def get_user():
    with connection() as conn:
        user = current_user(conn)
        campaigns = list_campaigns(conn, user['id'])
        characters = conn.execute(
            'SELECT ch.id, ch.name, ch.is_active, ch.status, ch.campaign_id, ch.sheet, c.name AS campaign_name, '
            'p.updated_at AS portrait_version '
            'FROM characters ch LEFT JOIN campaigns c ON c.id = ch.campaign_id '
            'LEFT JOIN character_portraits p ON p.character_id = ch.id '
            'WHERE ch.owner_id = ? AND ch.deleted_at IS NULL '
            'ORDER BY ch.campaign_id IS NULL, c.created_at, ch.created_at',
            (user['id'],),
        ).fetchall()
        # A character needs changes when it no longer fits its campaign's settings.
        needing_changes = {ch['id'] for ch in characters if character_problems(conn, ch)}
    return jsonify({
        'name': user['display_name'],
        'isAdmin': bool(user['is_admin']),
        'campaigns': campaigns,
        'characters': [_character_json(ch, ch['id'] in needing_changes) for ch in characters],
    }), 200
