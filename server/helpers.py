import re
import uuid

from flask import g, jsonify, request, session

NAME_MAX_LENGTH = 64
CONTROL_CHARACTERS = re.compile(r'[\x00-\x1f\x7f]')

# SQLite expression for the current UTC time in ISO 8601 with milliseconds.
NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"

# A JSON response the browser caches privately but revalidates on every load.
# The ETag hashes the body, so an unchanged response comes back as an empty 304.
def revalidated_json(data):
    response = jsonify(data)
    response.add_etag()
    response.headers['Cache-Control'] = 'private, no-cache'
    return response.make_conditional(request)

# Collapses whitespace and returns the name, or None if it is empty, too long or has control characters.
def clean_name(raw):
    if not isinstance(raw, str):
        return None
    name = ' '.join(raw.split())
    if not 1 <= len(name) <= NAME_MAX_LENGTH or CONTROL_CHARACTERS.search(name):
        return None
    return name

# The value if it is a UUID in canonical lowercase hyphenated form, else None.
def canonical_uuid(value):
    try:
        parsed = str(uuid.UUID(value))
    except (ValueError, TypeError, AttributeError):
        return None
    return parsed if parsed == value else None

def error(message, status):
    return jsonify({'error': message}), status

# The request's JSON body if it is an object, else None.
def json_body():
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else None

# The signed-in user from the session cookie, or None.
def load_user(conn):
    user_id = session.get('user_id')
    if not user_id:
        return None
    return conn.execute('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', (user_id,)).fetchone()

# Prefers the user create_app already loaded into g for this request.
def current_user(conn):
    return g.user if 'user' in g else load_user(conn)

def sign_in(user_id):
    session.clear()
    session.permanent = True
    session['user_id'] = user_id

# True if the user is the campaign's GM or an admin; False for a missing campaign so callers can answer 404.
def is_gm(conn, campaign_id, user):
    if user is None:
        return False
    if user['is_admin']:
        return conn.execute('SELECT 1 FROM campaigns WHERE id = ?', (campaign_id,)).fetchone() is not None
    return conn.execute(
        "SELECT 1 FROM memberships WHERE campaign_id = ? AND user_id = ? AND role = 'gm'",
        (campaign_id, user['id']),
    ).fetchone() is not None

def list_campaigns(conn, user_id):
    rows = conn.execute(
        'SELECT c.id, c.name, m.role FROM campaigns c JOIN memberships m ON m.campaign_id = c.id '
        'WHERE m.user_id = ? ORDER BY c.created_at',
        (user_id,),
    ).fetchall()
    return [dict(row) for row in rows]
