from flask import Flask, jsonify, request
from flask_cors import CORS
import json
import os
import re, sqlite3, uuid
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from server.db import connect, init_db

CAMPAIGN_NAME_MAX_LENGTH = 64
CAMPAIGN_DESCRIPTION_MAX_LENGTH = 10000

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

# There's no sign-in yet, so the admin stands in for the current user.
def current_user(conn):
    return conn.execute(
        'SELECT * FROM users WHERE is_admin = 1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1'
    ).fetchone()

# Runs fn(settings) on a campaign's settings JSON and saves the result.
# Returns False if the campaign doesn't exist.
def update_settings(campaign_id, fn):
    conn = connect()
    try:
        with conn:
            row = conn.execute('SELECT settings FROM campaigns WHERE id = ?', (campaign_id,)).fetchone()
            if row is None:
                return False
            settings = json.loads(row['settings'])
            fn(settings)
            conn.execute(
                f'UPDATE campaigns SET settings = ?, updated_at = {NOW} WHERE id = ?',
                (json.dumps(settings), campaign_id),
            )
        return True
    finally:
        conn.close()

app = Flask(__name__)
CORS(app)

@app.route('/user', methods=['GET'])
def get_user():
    conn = connect()
    try:
        user = current_user(conn)
        if user is None:
            return jsonify({'error': 'No user set up'}), 404
        campaigns = conn.execute(
            'SELECT c.id, c.name FROM campaigns c JOIN memberships m ON m.campaign_id = c.id '
            'WHERE m.user_id = ? ORDER BY c.created_at',
            (user['id'],),
        ).fetchall()
    finally:
        conn.close()
    return jsonify({'name': user['display_name'], 'campaigns': [dict(c) for c in campaigns]}), 200

@app.route('/create/user', methods=['POST'])
def create_user():
    username = clean_name(request.get_json().get('name'))
    if username is None:
        return jsonify({'error': 'Invalid name.'}), 400
    conn = connect()
    try:
        with conn:
            if current_user(conn) is not None:
                return jsonify({'error': 'A user is already set up.'}), 409
            conn.execute(
                'INSERT INTO users (id, username, display_name, is_admin) VALUES (?, ?, ?, 1)',
                (str(uuid.uuid4()), username, username),
            )
    finally:
        conn.close()
    return jsonify({'success': True}), 201

@app.route('/create/campaign', methods=['POST'])
def create_campaign():
    content = request.get_json()
    campaign_name = clean_name(content.get('name'))
    if campaign_name is None:
        return jsonify({'error': f'Name must be 1–{CAMPAIGN_NAME_MAX_LENGTH} characters.'}), 400
    campaign_id = canonical_uuid(content.get('id'))
    if campaign_id is None:
        return jsonify({'error': 'Invalid campaign id.'}), 400
    settings = {'alternateRules': [], 'allowedContent': {}, 'rules': {}}

    conn = connect()
    try:
        with conn:
            user = current_user(conn)
            if user is None:
                return jsonify({'error': 'Set up a user first.'}), 400
            try:
                conn.execute(
                    'INSERT INTO campaigns (id, owner_id, name, settings) VALUES (?, ?, ?, ?)',
                    (campaign_id, user['id'], campaign_name, json.dumps(settings)),
                )
            except sqlite3.IntegrityError:
                return jsonify({'error': 'Campaign id already in use.'}), 409
            conn.execute(
                "INSERT INTO memberships (campaign_id, user_id, role) VALUES (?, ?, 'gm')",
                (campaign_id, user['id']),
            )
    finally:
        conn.close()
    return jsonify({'name': campaign_name, 'id': campaign_id}), 201

@app.route('/update/campaign-name', methods=['PUT'])
def update_user_campaign():
    content = request.get_json()
    campaign_id = content.get('id')
    new_name = clean_name(content.get('name'))
    if new_name is None:
        return jsonify({'error': f'Name must be 1–{CAMPAIGN_NAME_MAX_LENGTH} characters.'}), 400
    conn = connect()
    try:
        with conn:
            updated = conn.execute(
                f'UPDATE campaigns SET name = ?, updated_at = {NOW} WHERE id = ?', (new_name, campaign_id)
            ).rowcount
    finally:
        conn.close()
    if not updated:
        return jsonify({'error': 'Campaign not found'}), 404
    return jsonify({'success': True, 'campaign': {'name': new_name, 'id': campaign_id}}), 200

@app.route('/campaign/<campaign_id>', methods=['GET'])
def get_campaign(campaign_id):
    conn = connect()
    try:
        row = conn.execute('SELECT name, description, settings FROM campaigns WHERE id = ?', (campaign_id,)).fetchone()
    finally:
        conn.close()
    if row is None:
        return jsonify({'error': 'Campaign not found'}), 404
    details = json.loads(row['settings'])
    details.update({'name': row['name'], 'description': row['description'] or None, 'characters': []})
    # Campaigns made before allowedContent existed: missing means everything is allowed.
    details.setdefault('allowedContent', {})
    details.setdefault('rules', {})
    return jsonify(details), 200

# Body: {id, collection, ids}. ids is a list of pack ids, or null for "everything allowed".
@app.route('/update/campaign-allowed', methods=['PUT'])
def update_campaign_allowed():
    content = request.get_json()
    collection = content.get('collection')
    ids = content.get('ids')
    if not isinstance(collection, str) or not re.fullmatch(r'[a-z-]+', collection):
        return jsonify({'error': 'Invalid collection.'}), 400
    if ids is not None and not (isinstance(ids, list) and all(isinstance(i, str) for i in ids)):
        return jsonify({'error': 'ids must be a list of strings or null.'}), 400
    # A campaign with no species or no classes can't make characters.
    if collection in ('species', 'classes') and ids == []:
        return jsonify({'error': f'At least one entry in {collection} must stay allowed.'}), 400

    if not update_settings(content.get('id'), lambda s: s.setdefault('allowedContent', {}).update({collection: ids})):
        return jsonify({'error': 'Campaign not found'}), 404
    return jsonify({'success': True}), 200

@app.route('/update/campaign-description', methods=['PUT'])
def update_campaign_description():
    content = request.get_json()
    description = content.get('description')
    if not isinstance(description, str) or len(description) > CAMPAIGN_DESCRIPTION_MAX_LENGTH:
        return jsonify({'error': f'Description must be at most {CAMPAIGN_DESCRIPTION_MAX_LENGTH} characters.'}), 400
    conn = connect()
    try:
        with conn:
            updated = conn.execute(
                f'UPDATE campaigns SET description = ?, updated_at = {NOW} WHERE id = ?',
                (description.strip(), content.get('id')),
            ).rowcount
    finally:
        conn.close()
    if not updated:
        return jsonify({'error': 'Campaign not found'}), 404
    return jsonify({'success': True}), 200

# Each rule's check. Mirrors src/datatypes/campaignRules.ts. bool is a subclass of
# int in Python, so the level check rules bools out explicitly.
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

# Body: {id, rules}. rules holds only the rules being changed; they merge into the saved rules.
@app.route('/update/campaign-rules', methods=['PUT'])
def update_campaign_rules():
    content = request.get_json()
    rules = content.get('rules')
    if not isinstance(rules, dict) or not rules:
        return jsonify({'error': 'rules must be a non-empty object.'}), 400
    for key, value in rules.items():
        check = RULE_CHECKS.get(key)
        if check is None:
            return jsonify({'error': f'Unknown rule: {key}'}), 400
        if not check(value):
            return jsonify({'error': f'Invalid value for {key}.'}), 400

    if not update_settings(content.get('id'), lambda s: s.setdefault('rules', {}).update(rules)):
        return jsonify({'error': 'Campaign not found'}), 404
    return jsonify({'success': True}), 200

@app.route('/delete/campaign', methods=['DELETE'])
def delete_campaign():
    campaign_id = request.get_json().get('id')
    conn = connect()
    try:
        with conn:
            # Memberships, characters and invites go with it (ON DELETE CASCADE).
            deleted = conn.execute('DELETE FROM campaigns WHERE id = ?', (campaign_id,)).rowcount
    finally:
        conn.close()
    if not deleted:
        return jsonify({'error': 'Campaign not found'}), 404
    return jsonify({'success': True}), 200

if __name__ == '__main__':
    init_db()
    app.run(port=5174, debug=False)
