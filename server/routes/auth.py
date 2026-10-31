import re
import sqlite3
import uuid

from flask import Blueprint, jsonify, session
from werkzeug.security import check_password_hash, generate_password_hash

from server import ratelimit
from server.db import connect
from server.helpers import NAME_MAX_LENGTH, clean_name, error, json_body, session_user, sign_in
from server.ratelimit import limit
from server.routes.invites import claim_invite

USERNAME_PATTERN = r'[A-Za-z0-9_.-]{3,32}'
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128

# Checked against when the username doesn't exist, so a wrong username takes as long as a wrong password.
DUMMY_PASSWORD_HASH = generate_password_hash('quill-dummy-password')

bp = Blueprint('auth', __name__, url_prefix='/auth')

def user_json(user):
    return {'id': user['id'], 'username': user['username'], 'displayName': user['display_name']}

# Body: {token, username, password, displayName?}.
# Sign-up is invite-only and always makes a player;
# admins are created on the server, never through the web.
@bp.post('/signup')
@limit('signup', 5, 60 * 60)
def signup():
    content = json_body()
    if content is None:
        return error('Body must be a JSON object.', 400)
    unknown = set(content) - {'token', 'username', 'password', 'displayName'}
    if unknown:
        return error(f'Unknown field: {sorted(unknown)[0]}', 400)
    token = content.get('token')
    username = content.get('username')
    password = content.get('password')
    if not isinstance(token, str) or not token:
        return error('An invite token is required.', 400)
    if not isinstance(username, str) or not re.fullmatch(USERNAME_PATTERN, username):
        return error('Username must be 3–32 letters, numbers, dots, dashes or underscores.', 400)
    if not isinstance(password, str) or not PASSWORD_MIN_LENGTH <= len(password) <= PASSWORD_MAX_LENGTH:
        return error(f'Password must be {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} characters.', 400)
    display_name = clean_name(content.get('displayName', username))
    if display_name is None:
        return error(f'Display name must be 1–{NAME_MAX_LENGTH} characters.', 400)

    # Hash before taking the write lock; scrypt is deliberately slow.
    password_hash = generate_password_hash(password)
    user_id = str(uuid.uuid4())
    conn = connect()
    try:
        with conn:
            campaign_id = claim_invite(conn, token)
            if campaign_id is None:
                return error('This invite is not valid.', 400)
            conn.execute(
                'INSERT INTO users (id, username, display_name, password_hash, is_admin) VALUES (?, ?, ?, ?, 0)',
                (user_id, username, display_name, password_hash),
            )
            conn.execute(
                "INSERT INTO memberships (campaign_id, user_id, role) VALUES (?, ?, 'player')",
                (campaign_id, user_id),
            )
    except sqlite3.IntegrityError:
        # The with-block rolled back, so the invite use isn't spent.
        return error('That username is taken.', 409)
    finally:
        conn.close()
    sign_in(user_id)
    return jsonify({
        'id': user_id,
        'username': username,
        'displayName': display_name,
        'campaignId': campaign_id,
    }), 201

# Body: {username, password}. Limited per IP and per username, so neither one IP
# trying many accounts nor many IPs trying one account gets far.
@bp.post('/login')
@limit('login', 10, 15 * 60)
def login():
    content = json_body()
    username = content.get('username') if content else None
    password = content.get('password') if content else None
    if not isinstance(username, str) or not isinstance(password, str) or len(password) > PASSWORD_MAX_LENGTH:
        return error('Username and password are required.', 400)
    retry_after = ratelimit.hit('login-user', 5, 15 * 60, subject=username.lower())
    if retry_after:
        return ratelimit.too_many(retry_after)

    conn = connect()
    try:
        user = conn.execute(
            'SELECT * FROM users WHERE username = ? AND deleted_at IS NULL', (username,)
        ).fetchone()
    finally:
        conn.close()
    stored_hash = user['password_hash'] if user and user['password_hash'] else DUMMY_PASSWORD_HASH
    if not check_password_hash(stored_hash, password) or user is None or not user['password_hash']:
        return error('Wrong username or password.', 401)
    sign_in(user['id'])
    return jsonify(user_json(user)), 200

@bp.post('/logout')
def logout():
    session.clear()
    return jsonify({'success': True}), 200

# The signed-in user, or 401. Unlike other routes, never falls back to the admin.
@bp.get('/me')
def me():
    conn = connect()
    try:
        user = session_user(conn)
    finally:
        conn.close()
    if user is None:
        return error('Not signed in.', 401)
    return jsonify(user_json(user)), 200
