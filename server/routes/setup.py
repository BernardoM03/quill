import hashlib
import os
import re
import secrets
import uuid

from flask import Blueprint, jsonify
from werkzeug.security import generate_password_hash

from server.db import connect
from server.helpers import NAME_MAX_LENGTH, clean_name, error, json_body, sign_in
from server.ratelimit import limit
from server.routes.auth import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, USERNAME_PATTERN
from server.access import public

# First-run setup. Until an admin has a password, the server either creates one from
# QUILL_ADMIN_USERNAME / QUILL_ADMIN_PASSWORD (for Docker), or prints a one-time setup
# link to its own output, so only whoever runs the server can claim the admin account.

# Hash of the current setup code. Kept in memory only: a restart prints a fresh link.
_setup_token_hash = None

bp = Blueprint('setup', __name__)

def _hash(token):
    return hashlib.sha256(token.encode()).hexdigest()

def setup_needed(conn):
    return conn.execute(
        'SELECT 1 FROM users WHERE is_admin = 1 AND password_hash IS NOT NULL AND deleted_at IS NULL'
    ).fetchone() is None

# Saves the admin. An admin left without a password (from the old setup page or the JSON
# import) is taken over rather than duplicated, so it keeps its campaigns.
# Returns an error message, or None on success with the admin's id in result['id'].
def save_admin(conn, username, display_name, password_hash, result):
    taken = conn.execute('SELECT id, is_admin, password_hash FROM users WHERE username = ?', (username,)).fetchone()
    passwordless = conn.execute(
        'SELECT id FROM users WHERE is_admin = 1 AND password_hash IS NULL AND deleted_at IS NULL '
        'ORDER BY created_at LIMIT 1'
    ).fetchone()
    if taken and (passwordless is None or taken['id'] != passwordless['id']):
        return 'That username is taken.'
    if passwordless:
        conn.execute(
            'UPDATE users SET username = ?, display_name = ?, password_hash = ? WHERE id = ?',
            (username, display_name, password_hash, passwordless['id']),
        )
        result['id'] = passwordless['id']
    else:
        result['id'] = str(uuid.uuid4())
        conn.execute(
            'INSERT INTO users (id, username, display_name, password_hash, is_admin) VALUES (?, ?, ?, ?, 1)',
            (result['id'], username, display_name, password_hash),
        )
    return None

def validate(username, password):
    if not isinstance(username, str) or not re.fullmatch(USERNAME_PATTERN, username):
        return 'Username must be 3-32 letters, numbers, dots, dashes or underscores.'
    if not isinstance(password, str) or not PASSWORD_MIN_LENGTH <= len(password) <= PASSWORD_MAX_LENGTH:
        return f'Password must be {PASSWORD_MIN_LENGTH}-{PASSWORD_MAX_LENGTH} characters.'
    return None

# Runs once when the server starts.
def bootstrap():
    global _setup_token_hash
    conn = connect()
    try:
        if not setup_needed(conn):
            return
        username = os.environ.get('QUILL_ADMIN_USERNAME')
        password = os.environ.get('QUILL_ADMIN_PASSWORD')
        if username or password:
            message = validate(username, password)
            if message is None:
                with conn:
                    message = save_admin(conn, username, username, generate_password_hash(password), {})
            if message is None:
                print(f'Quill: created admin "{username}" from QUILL_ADMIN_USERNAME / QUILL_ADMIN_PASSWORD.', flush=True)
                return
            print(f'Quill: could not create the admin from environment variables: {message}', flush=True)
    finally:
        conn.close()

    token = secrets.token_urlsafe(32)
    _setup_token_hash = _hash(token)
    base = os.environ.get('QUILL_PUBLIC_URL', 'http://localhost:5173').rstrip('/')
    print('\n' + '=' * 72, flush=True)
    print('Quill needs an admin account. Open this link to create it:', flush=True)
    print(f'  {base}/setup?token={token}', flush=True)
    print('The link works once, and a new one is printed each time the server starts.', flush=True)
    print('=' * 72 + '\n', flush=True)

# Public: lets the home page and setup page know whether setup is still needed.
@bp.get('/setup')
@public
def get_setup():
    conn = connect()
    try:
        needed = setup_needed(conn)
    finally:
        conn.close()
    return jsonify({'needed': needed}), 200

# Body: {token, username, password, displayName?}. Signs the new admin in.
@bp.post('/setup')
@public
@limit('setup', 10, 60 * 60)
def complete_setup():
    global _setup_token_hash
    content = json_body()
    if content is None:
        return error('Body must be a JSON object.', 400)
    token = content.get('token')
    if (not isinstance(token, str) or _setup_token_hash is None
            or not secrets.compare_digest(_hash(token), _setup_token_hash)):
        return error('This setup link is not valid. Use the newest link from the server output.', 403)
    username = content.get('username')
    password = content.get('password')
    message = validate(username, password)
    if message:
        return error(message, 400)
    display_name = clean_name(content.get('displayName') or username)
    if display_name is None:
        return error(f'Display name must be 1-{NAME_MAX_LENGTH} characters.', 400)

    password_hash = generate_password_hash(password)
    result = {}
    conn = connect()
    try:
        with conn:
            if not setup_needed(conn):
                _setup_token_hash = None
                return error('Quill is already set up.', 409)
            message = save_admin(conn, username, display_name, password_hash, result)
            if message:
                return error(message, 409)
    finally:
        conn.close()
    _setup_token_hash = None
    sign_in(result['id'])
    return jsonify({'id': result['id'], 'username': username, 'displayName': display_name}), 201
