import re
import sqlite3
import uuid

from flask import Blueprint, jsonify, session
from werkzeug.security import check_password_hash, generate_password_hash

from server import ratelimit
from server.access import public
from server.db import connection
from server.helpers import NAME_MAX_LENGTH, clean_name, current_user, error, json_body, sign_in
from server.ratelimit import limit
from server.routes.invites import claim_invite

USERNAME_PATTERN = r'[A-Za-z0-9_.-]{3,32}'
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128
SIGNUP_FIELDS = {'token', 'username', 'password', 'displayName'}

# Checked when the username doesn't exist, so a wrong username takes as long as a wrong password.
DUMMY_PASSWORD_HASH = generate_password_hash('quill-dummy-password')

bp = Blueprint('auth', __name__, url_prefix='/auth')

def user_json(user):
    return {'id': user['id'], 'username': user['username'], 'displayName': user['display_name'],
            'isAdmin': bool(user['is_admin'])}

# Body: {token, username, password, displayName?}.
# Sign-up is invite-only and always makes a player; admins are never created through the web.
@bp.post('/signup')
@public
@limit('signup', 5, 60 * 60)
def signup():
    content = json_body()
    if content is None:
        return error('Body must be a JSON object.', 400)
    unknown_fields = set(content) - SIGNUP_FIELDS
    if unknown_fields:
        return error(f'Unknown field: {sorted(unknown_fields)[0]}', 400)
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

    # Hash before taking the write lock, since scrypt is deliberately slow.
    password_hash = generate_password_hash(password)
    user_id = str(uuid.uuid4())
    with connection() as conn:
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
            # The transaction rolled back, so the invite use isn't spent.
            return error('That username is taken.', 409)
    sign_in(user_id)
    return jsonify({
        'id': user_id,
        'username': username,
        'displayName': display_name,
        'campaignId': campaign_id,
    }), 201

# Body: {username, password}.
# Limited per IP and per username, so neither one IP nor many IPs can guess for long.
@bp.post('/login')
@public
@limit('login', 10, 15 * 60)
def login():
    content = json_body() or {}
    username = content.get('username')
    password = content.get('password')
    if not isinstance(username, str) or not isinstance(password, str) or len(password) > PASSWORD_MAX_LENGTH:
        return error('Username and password are required.', 400)
    retry_after = ratelimit.hit('login-user', 5, 15 * 60, subject=username.lower())
    if retry_after:
        return ratelimit.too_many(retry_after)

    with connection() as conn:
        user = conn.execute(
            'SELECT * FROM users WHERE username = ? AND deleted_at IS NULL', (username,)
        ).fetchone()
    has_password = user is not None and bool(user['password_hash'])
    # Always run the hash check so response time doesn't reveal whether the account exists.
    password_ok = check_password_hash(user['password_hash'] if has_password else DUMMY_PASSWORD_HASH, password)
    if not (has_password and password_ok):
        return error('Wrong username or password.', 401)
    sign_in(user['id'])
    return jsonify(user_json(user)), 200

@bp.post('/logout')
@public
def logout():
    session.clear()
    return jsonify({'success': True}), 200

# Public so the login and join pages can ask without being redirected.
@bp.get('/me')
@public
def me():
    with connection() as conn:
        user = current_user(conn)
    if user is None:
        return error('Not signed in.', 401)
    return jsonify(user_json(user)), 200
