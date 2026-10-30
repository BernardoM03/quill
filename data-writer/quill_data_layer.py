from flask import Blueprint, Flask, jsonify, request
import json
import os
import hashlib, re, secrets, sqlite3, uuid
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from server.db import connect, init_db

CAMPAIGN_NAME_MAX_LENGTH = 64
CAMPAIGN_DESCRIPTION_MAX_LENGTH = 10000
# Caps on allowedContent so one request can't bloat the database.
ALLOWED_COLLECTIONS_MAX = 32
ALLOWED_IDS_MAX = 2000
ALLOWED_ID_MAX_LENGTH = 200
INVITE_DEFAULT_DAYS = 7
INVITE_MAX_DAYS = 365
INVITE_MAX_USES = 1000

NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"

def clean_name(raw):
    if not isinstance(raw, str):
        return None
    name = ' '.join(raw.split())
    if not 1 <= len(name) <= CAMPAIGN_NAME_MAX_LENGTH or re.search(r'[\x00-\x1f\x7f]', name):
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

# There's no sign-in yet, so the admin stands in for the current user.
def current_user(conn):
    return conn.execute(
        'SELECT * FROM users WHERE is_admin = 1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1'
    ).fetchone()

def list_campaigns(conn, user_id):
    rows = conn.execute(
        'SELECT c.id, c.name FROM campaigns c JOIN memberships m ON m.campaign_id = c.id '
        'WHERE m.user_id = ? ORDER BY c.created_at',
        (user_id,),
    ).fetchall()
    return [dict(r) for r in rows]

# Each rule's check. Mirrors src/datatypes/campaignRules.ts.
def is_bool(v): return isinstance(v, bool)
RULE_CHECKS = {
    'optionalClassFeatures': is_bool,
    'customizeOrigin': is_bool,
    'advancement': lambda v: v in ('xp', 'milestone'),
    'milestoneLevel': lambda v: isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= 20,
    'hitPoints': lambda v: v in ('automatic', 'manual'),
    'featPrerequisites': is_bool,
    'multiclassPrerequisites': is_bool,
    'encumbrance': is_bool,
    'ignoreCoinWeight': is_bool,
    'allowMulticlass': is_bool,
    'abilityScoreMethod': lambda v: v in ('standardArray', 'pointBuy', 'roll', 'manual', 'sharedManual'),
    'sharedScores': lambda v: isinstance(v, list) and len(v) == 6
        and all(isinstance(n, int) and not isinstance(n, bool) and 1 <= n <= 20 for n in v),
    'pointBuyBudget': lambda v: isinstance(v, int) and not isinstance(v, bool) and 15 <= v <= 40,
    'startingEquipment': lambda v: v in ('choice', 'equipment', 'gold'),
    'originFeat': lambda v: v in ('background', 'any'),
    'characterApproval': is_bool,
}

# Checks a PATCH body. Returns an error message, or None if every field is valid.
def validate_campaign_patch(content):
    if not isinstance(content, dict) or not content:
        return 'Body must be a non-empty object.'
    unknown = set(content) - {'name', 'description', 'rules', 'allowedContent'}
    if unknown:
        return f'Unknown field: {sorted(unknown)[0]}'
    if 'name' in content and clean_name(content['name']) is None:
        return f'Name must be 1–{CAMPAIGN_NAME_MAX_LENGTH} characters.'
    if 'description' in content:
        description = content['description']
        if not isinstance(description, str) or len(description) > CAMPAIGN_DESCRIPTION_MAX_LENGTH:
            return f'Description must be at most {CAMPAIGN_DESCRIPTION_MAX_LENGTH} characters.'
    if 'rules' in content:
        # rules holds only the rules being changed; they merge into the saved rules.
        rules = content['rules']
        if not isinstance(rules, dict) or not rules:
            return 'rules must be a non-empty object.'
        for key, value in rules.items():
            check = RULE_CHECKS.get(key)
            if check is None:
                return f'Unknown rule: {key}'
            if not check(value):
                return f'Invalid value for {key}.'
    if 'allowedContent' in content:
        # {collection: ids}. ids is a list of pack ids, or null for "everything allowed".
        allowed = content['allowedContent']
        if not isinstance(allowed, dict) or not allowed:
            return 'allowedContent must be a non-empty object.'
        if len(allowed) > ALLOWED_COLLECTIONS_MAX:
            return f'allowedContent may have at most {ALLOWED_COLLECTIONS_MAX} collections.'
        for collection, ids in allowed.items():
            if not re.fullmatch(r'[a-z-]{1,64}', collection):
                return 'Invalid collection.'
            if ids is not None and not (
                isinstance(ids, list) and len(ids) <= ALLOWED_IDS_MAX
                and all(isinstance(i, str) and len(i) <= ALLOWED_ID_MAX_LENGTH for i in ids)
            ):
                return f'ids must be null or a list of at most {ALLOWED_IDS_MAX} strings.'
            # A campaign with no species or no classes can't make characters.
            if collection in ('species', 'classes') and ids == []:
                return f'At least one entry in {collection} must stay allowed.'
    return None

api = Blueprint('api', __name__, url_prefix='/api')

@api.get('/user')
def get_user():
    conn = connect()
    try:
        user = current_user(conn)
        if user is None:
            return error('No user set up', 404)
        campaigns = list_campaigns(conn, user['id'])
    finally:
        conn.close()
    return jsonify({'name': user['display_name'], 'campaigns': campaigns}), 200

@api.post('/user')
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

@api.get('/campaigns')
def get_campaigns():
    conn = connect()
    try:
        user = current_user(conn)
        campaigns = list_campaigns(conn, user['id']) if user else []
    finally:
        conn.close()
    return jsonify(campaigns), 200

@api.post('/campaigns')
def create_campaign():
    content = json_body()
    if content is None:
        return error('Body must be a JSON object.', 400)
    campaign_name = clean_name(content.get('name'))
    if campaign_name is None:
        return error(f'Name must be 1–{CAMPAIGN_NAME_MAX_LENGTH} characters.', 400)
    campaign_id = canonical_uuid(content.get('id'))
    if campaign_id is None:
        return error('Invalid campaign id.', 400)
    settings = {'alternateRules': [], 'allowedContent': {}, 'rules': {}}

    conn = connect()
    try:
        with conn:
            user = current_user(conn)
            if user is None:
                return error('Set up a user first.', 400)
            try:
                conn.execute(
                    'INSERT INTO campaigns (id, owner_id, name, settings) VALUES (?, ?, ?, ?)',
                    (campaign_id, user['id'], campaign_name, json.dumps(settings)),
                )
            except sqlite3.IntegrityError:
                return error('Campaign id already in use.', 409)
            conn.execute(
                "INSERT INTO memberships (campaign_id, user_id, role) VALUES (?, ?, 'gm')",
                (campaign_id, user['id']),
            )
    finally:
        conn.close()
    return jsonify({'name': campaign_name, 'id': campaign_id}), 201

@api.get('/campaigns/<campaign_id>')
def get_campaign(campaign_id):
    conn = connect()
    try:
        row = conn.execute('SELECT name, description, settings FROM campaigns WHERE id = ?', (campaign_id,)).fetchone()
    finally:
        conn.close()
    if row is None:
        return error('Campaign not found', 404)
    details = json.loads(row['settings'])
    details.update({'name': row['name'], 'description': row['description'] or None, 'characters': []})
    # Campaigns made before allowedContent existed: missing means everything is allowed.
    details.setdefault('allowedContent', {})
    details.setdefault('rules', {})
    return jsonify(details), 200

# Body: any of {name, description, rules, allowedContent}. All are checked before any is saved.
@api.patch('/campaigns/<campaign_id>')
def update_campaign(campaign_id):
    content = json_body()
    message = validate_campaign_patch(content)
    if message:
        return error(message, 400)

    conn = connect()
    try:
        with conn:
            row = conn.execute('SELECT name, description, settings FROM campaigns WHERE id = ?', (campaign_id,)).fetchone()
            if row is None:
                return error('Campaign not found', 404)
            name = clean_name(content['name']) if 'name' in content else row['name']
            description = content['description'].strip() if 'description' in content else row['description']
            settings = json.loads(row['settings'])
            if 'rules' in content:
                settings.setdefault('rules', {}).update(content['rules'])
            if 'allowedContent' in content:
                settings.setdefault('allowedContent', {}).update(content['allowedContent'])
            conn.execute(
                f'UPDATE campaigns SET name = ?, description = ?, settings = ?, updated_at = {NOW} WHERE id = ?',
                (name, description, json.dumps(settings), campaign_id),
            )
    finally:
        conn.close()
    return jsonify({'success': True}), 200

@api.delete('/campaigns/<campaign_id>')
def delete_campaign(campaign_id):
    conn = connect()
    try:
        with conn:
            # Memberships, characters and invites go with it (ON DELETE CASCADE).
            deleted = conn.execute('DELETE FROM campaigns WHERE id = ?', (campaign_id,)).rowcount
    finally:
        conn.close()
    if not deleted:
        return error('Campaign not found', 404)
    return jsonify({'success': True}), 200

def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()

def is_gm(conn, campaign_id, user):
    return user is not None and conn.execute(
        "SELECT 1 FROM memberships WHERE campaign_id = ? AND user_id = ? AND role = 'gm'",
        (campaign_id, user['id']),
    ).fetchone() is not None

def invite_json(row):
    if row['revoked_at']:
        status = 'revoked'
    elif row['expired']:
        status = 'expired'
    elif row['max_uses'] is not None and row['use_count'] >= row['max_uses']:
        status = 'used'
    else:
        status = 'active'
    return {
        'id': row['id'],
        'status': status,
        'maxUses': row['max_uses'],
        'useCount': row['use_count'],
        'expiresAt': row['expires_at'],
        'createdAt': row['created_at'],
    }

INVITE_COLUMNS = f'id, max_uses, use_count, expires_at, revoked_at, created_at, expires_at <= {NOW} AS expired'

# Newest first, including revoked and expired ones. Raw tokens are never stored, so they can't be listed.
@api.get('/campaigns/<campaign_id>/invites')
def get_invites(campaign_id):
    conn = connect()
    try:
        if not is_gm(conn, campaign_id, current_user(conn)):
            return error('Campaign not found', 404)
        rows = conn.execute(
            f'SELECT {INVITE_COLUMNS} FROM invites WHERE campaign_id = ? ORDER BY created_at DESC',
            (campaign_id,),
        ).fetchall()
    finally:
        conn.close()
    return jsonify([invite_json(r) for r in rows]), 200

# Body (optional): {expiresInDays: 1–365 or null for never, maxUses: 1–1000 or null for unlimited}.
# The response is the only time the raw token is shown.
@api.post('/campaigns/<campaign_id>/invites')
def create_invite(campaign_id):
    content = json_body() if request.content_length else {}
    if content is None:
        return error('Body must be a JSON object.', 400)
    unknown = set(content) - {'expiresInDays', 'maxUses'}
    if unknown:
        return error(f'Unknown field: {sorted(unknown)[0]}', 400)
    days = content.get('expiresInDays', INVITE_DEFAULT_DAYS)
    max_uses = content.get('maxUses')
    def valid_count(v, top): return v is None or (isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= top)
    if not valid_count(days, INVITE_MAX_DAYS):
        return error(f'expiresInDays must be 1–{INVITE_MAX_DAYS} or null.', 400)
    if not valid_count(max_uses, INVITE_MAX_USES):
        return error(f'maxUses must be 1–{INVITE_MAX_USES} or null.', 400)

    token = secrets.token_urlsafe(32)
    invite_id = str(uuid.uuid4())
    conn = connect()
    try:
        with conn:
            user = current_user(conn)
            if not is_gm(conn, campaign_id, user):
                return error('Campaign not found', 404)
            conn.execute(
                'INSERT INTO invites (id, campaign_id, created_by, token_hash, max_uses, expires_at) VALUES '
                "(?, ?, ?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+' || ? || ' days') END)",
                (invite_id, campaign_id, user['id'], hash_token(token), max_uses, days, days),
            )
            row = conn.execute(f'SELECT {INVITE_COLUMNS} FROM invites WHERE id = ?', (invite_id,)).fetchone()
    finally:
        conn.close()
    return jsonify({**invite_json(row), 'token': token}), 201

# Revokes an invite. Takes the raw token from the link, or the invite id from the list
# (for a GM who no longer has the link). The row stays, marked revoked.
@api.delete('/invites/<token>')
def revoke_invite(token):
    conn = connect()
    try:
        with conn:
            row = conn.execute(
                'SELECT id, campaign_id FROM invites WHERE token_hash = ? OR id = ?', (hash_token(token), token)
            ).fetchone()
            if row is None or not is_gm(conn, row['campaign_id'], current_user(conn)):
                return error('Invite not found', 404)
            conn.execute(f'UPDATE invites SET revoked_at = COALESCE(revoked_at, {NOW}) WHERE id = ?', (row['id'],))
    finally:
        conn.close()
    return jsonify({'success': True}), 200

app = Flask(__name__)
# Reject requests addressed to any other hostname, so a page using DNS rebinding
# (a domain re-pointed at 127.0.0.1) can't reach the API. Ports are ignored; the
# Vite proxy forwards the browser's localhost:5173 Host header unchanged.
app.config['TRUSTED_HOSTS'] = ['localhost', '127.0.0.1']
# Larger bodies get 413 before any route runs.
app.config['MAX_CONTENT_LENGTH'] = 1_000_000
app.register_blueprint(api)

if __name__ == '__main__':
    init_db()
    app.run(port=5174, debug=False)
