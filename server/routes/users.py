import uuid

from flask import Blueprint, jsonify

from server.db import connect
from server.helpers import clean_name, current_user, error, json_body, list_campaigns, session_user

bp = Blueprint('users', __name__)

@bp.get('/user')
def get_user():
    conn = connect()
    try:
        user = current_user(conn)
        if user is None:
            return error('No user set up', 404)
        campaigns = list_campaigns(conn, user['id'])
        # False while acting as the admin without signing in.
        signed_in = session_user(conn) is not None
    finally:
        conn.close()
    return jsonify({'name': user['display_name'], 'signedIn': signed_in, 'campaigns': campaigns}), 200

@bp.post('/user')
def create_user():
    content = json_body()
    username = clean_name(content.get('name')) if content else None
    if username is None:
        return error('Invalid name.', 400)
    conn = connect()
    try:
        with conn:
            if current_user(conn) is not None:
                return error('A user is already set up.', 409)
            conn.execute(
                'INSERT INTO users (id, username, display_name, is_admin) VALUES (?, ?, ?, 1)',
                (str(uuid.uuid4()), username, username),
            )
    finally:
        conn.close()
    return jsonify({'success': True}), 201
