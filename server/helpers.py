import re
import uuid

from flask import jsonify, request, session

NAME_MAX_LENGTH = 64

NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"

def clean_name(raw):
    if not isinstance(raw, str):
        return None
    name = ' '.join(raw.split())
    if not 1 <= len(name) <= NAME_MAX_LENGTH or re.search(r'[\x00-\x1f\x7f]', name):
        return None
    return name

def canonical_uuid(value):
    try:
        parsed = str(uuid.UUID(value))
    except (ValueError, TypeError, AttributeError):
        return None
    return parsed if parsed == value else None

def error(message, status):
    return jsonify({'error': message}), status

# The request's JSON body if it is an object, else None (missing, malformed, or another type).
def json_body():
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else None

# The signed-in user from the session cookie, or None. There is no fallback user:
# anyone not signed in only reaches the public routes listed in create_app.
def current_user(conn):
    user_id = session.get('user_id')
    if not user_id:
        return None
    return conn.execute('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', (user_id,)).fetchone()

def sign_in(user_id):
    session.clear()
    session.permanent = True
    session['user_id'] = user_id

def is_gm(conn, campaign_id, user):
    return user is not None and conn.execute(
        "SELECT 1 FROM memberships WHERE campaign_id = ? AND user_id = ? AND role = 'gm'",
        (campaign_id, user['id']),
    ).fetchone() is not None

def list_campaigns(conn, user_id):
    rows = conn.execute(
        'SELECT c.id, c.name, m.role FROM campaigns c JOIN memberships m ON m.campaign_id = c.id '
        'WHERE m.user_id = ? ORDER BY c.created_at',
        (user_id,),
    ).fetchall()
    return [dict(r) for r in rows]
