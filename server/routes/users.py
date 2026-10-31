from flask import Blueprint, jsonify

from server.db import connect
from server.helpers import current_user, list_campaigns
from server.access import require_login

bp = Blueprint('users', __name__)

# The signed-in user's home page data.
@bp.get('/user')
@require_login
def get_user():
    conn = connect()
    try:
        user = current_user(conn)
        campaigns = list_campaigns(conn, user['id'])
    finally:
        conn.close()
    return jsonify({'name': user['display_name'], 'campaigns': campaigns}), 200
