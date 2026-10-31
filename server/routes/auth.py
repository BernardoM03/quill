import re
import sqlite3
import uuid

from flask import Blueprint, jsonify
from werkzeug.security import generate_password_hash

from server.db import connect
from server.helpers import NAME_MAX_LENGTH, NOW, clean_name, error, json_body
from server.ratelimit import limit
from server.routes.invites import hash_token

USERNAME_PATTERN = r'[A-Za-z0-9_.-]{3,32}'
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128

bp = Blueprint('auth', __name__, url_prefix='/auth')

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
            # Claims one use only if the invite is still active
            claimed = conn.execute(
                'UPDATE invites SET use_count = use_count + 1 WHERE token_hash = ? AND revoked_at IS NULL '
                f'AND (expires_at IS NULL OR expires_at > {NOW}) AND (max_uses IS NULL OR use_count < max_uses) '
                'RETURNING campaign_id',
                (hash_token(token),),
            ).fetchone()
            if claimed is None:
                return error('This invite is not valid.', 400)
            conn.execute(
                'INSERT INTO users (id, username, display_name, password_hash, is_admin) VALUES (?, ?, ?, ?, 0)',
                (user_id, username, display_name, password_hash),
            )
            conn.execute(
                "INSERT INTO memberships (campaign_id, user_id, role) VALUES (?, ?, 'player')",
                (claimed['campaign_id'], user_id),
            )
    except sqlite3.IntegrityError:
        # The with-block rolled back, so the invite use isn't spent.
        return error('That username is taken.', 409)
    finally:
        conn.close()
    return jsonify({
        'id': user_id,
        'username': username,
        'displayName': display_name,
        'campaignId': claimed['campaign_id'],
    }), 201
