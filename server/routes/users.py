from flask import Blueprint, jsonify

from server.db import connect
from server.helpers import current_user, list_campaigns

bp = Blueprint('users', __name__)

# The signed-in user's home page data. Signing in is checked in create_app.
@bp.get('/user')
def get_user():
    conn = connect()
    try:
        user = current_user(conn)
        campaigns = list_campaigns(conn, user['id'])
    finally:
        conn.close()
    return jsonify({'name': user['display_name'], 'campaigns': campaigns}), 200
