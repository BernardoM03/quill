import hashlib
import os
import re
import secrets
import uuid

from flask import Blueprint, jsonify
from werkzeug.security import generate_password_hash

from server.access import public
from server.db import connection
from server.helpers import NAME_MAX_LENGTH, clean_name, error, json_body, sign_in
from server.ratelimit import limit
from server.routes.auth import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, USERNAME_PATTERN

# First-run setup creates the admin from QUILL_ADMIN_USERNAME / QUILL_ADMIN_PASSWORD (for Docker).
# Otherwise it prints a one-time setup link, so only whoever runs the server can claim the admin account.

bp = Blueprint('setup', __name__)

# Held in memory only, so a restart prints a fresh link.
_setup_token_hash = None

class SetupError(Exception):
    pass

def _hash(token):
    return hashlib.sha256(token.encode()).hexdigest()

def setup_needed(conn):
    return conn.execute(
        'SELECT 1 FROM users WHERE is_admin = 1 AND password_hash IS NOT NULL AND deleted_at IS NULL'
    ).fetchone() is None

# Saves the admin and returns its id, or raises SetupError.
# A passwordless admin (from older setups or imports) is taken over so it keeps its campaigns.
def save_admin(conn, username, display_name, password_hash):
    existing = conn.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone()
    passwordless_admin = conn.execute(
        'SELECT id FROM users WHERE is_admin = 1 AND password_hash IS NULL AND deleted_at IS NULL '
        'ORDER BY created_at LIMIT 1'
    ).fetchone()
    if existing and (passwordless_admin is None or existing['id'] != passwordless_admin['id']):
        raise SetupError('That username is taken.')
    if passwordless_admin:
        conn.execute(
            'UPDATE users SET username = ?, display_name = ?, password_hash = ? WHERE id = ?',
            (username, display_name, password_hash, passwordless_admin['id']),
        )
        return passwordless_admin['id']
    admin_id = str(uuid.uuid4())
    conn.execute(
        'INSERT INTO users (id, username, display_name, password_hash, is_admin) VALUES (?, ?, ?, ?, 1)',
        (admin_id, username, display_name, password_hash),
    )
    return admin_id

def credentials_problem(username, password):
    if not isinstance(username, str) or not re.fullmatch(USERNAME_PATTERN, username):
        return 'Username must be 3-32 letters, numbers, dots, dashes or underscores.'
    if not isinstance(password, str) or not PASSWORD_MIN_LENGTH <= len(password) <= PASSWORD_MAX_LENGTH:
        return f'Password must be {PASSWORD_MIN_LENGTH}-{PASSWORD_MAX_LENGTH} characters.'
    return None

# Returns True if the admin was created from the environment variables.
def _create_admin_from_env(conn):
    username = os.environ.get('QUILL_ADMIN_USERNAME')
    password = os.environ.get('QUILL_ADMIN_PASSWORD')
    if not (username or password):
        return False
    if credentials_problem(username, password) is None:
        try:
            with conn:
                save_admin(conn, username, username, generate_password_hash(password))
            print(f'Quill: created admin "{username}" from QUILL_ADMIN_USERNAME / QUILL_ADMIN_PASSWORD.', flush=True)
            return True
        except SetupError:
            pass
    print('Quill: could not create admin from environment variables.', flush=True)
    return False

def _print_setup_link(token):
    base_url = os.environ.get('QUILL_PUBLIC_URL', 'http://localhost:5173').rstrip('/')
    print('\n' + '=' * 72, flush=True)
    print('Quill needs an admin account. Open this link to create it:', flush=True)
    print(f'  {base_url}/setup?token={token}', flush=True)
    print('The link works once, and a new one is printed each time the server starts.', flush=True)
    print('=' * 72 + '\n', flush=True)

# Runs once when the server starts.
def bootstrap():
    global _setup_token_hash
    with connection() as conn:
        if not setup_needed(conn) or _create_admin_from_env(conn):
            return
    token = secrets.token_urlsafe(32)
    _setup_token_hash = _hash(token)
    _print_setup_link(token)

# Lets the home and setup pages know whether setup is still needed.
@bp.get('/setup')
@public
def get_setup():
    with connection() as conn:
        needed = setup_needed(conn)
    return jsonify({'needed': needed}), 200

def _token_matches(token):
    return (isinstance(token, str) and _setup_token_hash is not None
            and secrets.compare_digest(_hash(token), _setup_token_hash))

# Body: {token, username, password, displayName?}; signs the new admin in.
@bp.post('/setup')
@public
@limit('setup', 10, 60 * 60)
def complete_setup():
    global _setup_token_hash
    content = json_body()
    if content is None:
        return error('Body must be a JSON object.', 400)
    if not _token_matches(content.get('token')):
        return error('This setup link is not valid. Use the newest link from the server output.', 403)
    username = content.get('username')
    password = content.get('password')
    problem = credentials_problem(username, password)
    if problem:
        return error(problem, 400)
    display_name = clean_name(content.get('displayName') or username)
    if display_name is None:
        return error(f'Display name must be 1-{NAME_MAX_LENGTH} characters.', 400)

    password_hash = generate_password_hash(password)
    with connection() as conn:
        with conn:
            if not setup_needed(conn):
                _setup_token_hash = None
                return error('Quill is already set up.', 409)
            try:
                admin_id = save_admin(conn, username, display_name, password_hash)
            except SetupError as e:
                return error(str(e), 409)
    _setup_token_hash = None
    sign_in(admin_id)
    return jsonify({'id': admin_id, 'username': username, 'displayName': display_name}), 201
