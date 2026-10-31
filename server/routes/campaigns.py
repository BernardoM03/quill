import json
import sqlite3

from flask import Blueprint, jsonify

from server.db import connect
from server.helpers import (
    NAME_MAX_LENGTH, NOW, canonical_uuid, clean_name, current_user, error, is_gm, json_body, list_campaigns,
)
from server.rules import validate_campaign_patch

bp = Blueprint('campaigns', __name__)

@bp.get('/campaigns')
def get_campaigns():
    conn = connect()
    try:
        campaigns = list_campaigns(conn, current_user(conn)['id'])
    finally:
        conn.close()
    return jsonify(campaigns), 200

@bp.post('/campaigns')
def create_campaign():
    content = json_body()
    if content is None:
        return error('Body must be a JSON object.', 400)
    campaign_name = clean_name(content.get('name'))
    if campaign_name is None:
        return error(f'Name must be 1–{NAME_MAX_LENGTH} characters.', 400)
    campaign_id = canonical_uuid(content.get('id'))
    if campaign_id is None:
        return error('Invalid campaign id.', 400)
    settings = {'alternateRules': [], 'allowedContent': {}, 'rules': {}}

    conn = connect()
    try:
        with conn:
            user = current_user(conn)
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

@bp.get('/campaigns/<campaign_id>')
def get_campaign(campaign_id):
    conn = connect()
    try:
        row = conn.execute('SELECT name, description, settings FROM campaigns WHERE id = ?', (campaign_id,)).fetchone()
        user = current_user(conn)
        role = user and conn.execute(
            'SELECT role FROM memberships WHERE campaign_id = ? AND user_id = ?', (campaign_id, user['id'])
        ).fetchone()
    finally:
        conn.close()
    if row is None or not role:
        return error('Campaign not found', 404)
    details = json.loads(row['settings'])
    details.update({'name': row['name'], 'description': row['description'] or None, 'characters': [], 'role': role['role']})
    # Campaigns made before allowedContent existed: missing means everything is allowed.
    details.setdefault('allowedContent', {})
    details.setdefault('rules', {})
    return jsonify(details), 200

# Body: any of {name, description, rules, allowedContent}. All are checked before any is saved.
@bp.patch('/campaigns/<campaign_id>')
def update_campaign(campaign_id):
    content = json_body()
    message = validate_campaign_patch(content)
    if message:
        return error(message, 400)

    conn = connect()
    try:
        with conn:
            row = conn.execute('SELECT name, description, settings FROM campaigns WHERE id = ?', (campaign_id,)).fetchone()
            if row is None or not is_gm(conn, campaign_id, current_user(conn)):
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

@bp.delete('/campaigns/<campaign_id>')
def delete_campaign(campaign_id):
    conn = connect()
    try:
        with conn:
            # Memberships, characters and invites go with it (ON DELETE CASCADE).
            if not is_gm(conn, campaign_id, current_user(conn)):
                return error('Campaign not found', 404)
            deleted = conn.execute('DELETE FROM campaigns WHERE id = ?', (campaign_id,)).rowcount
    finally:
        conn.close()
    if not deleted:
        return error('Campaign not found', 404)
    return jsonify({'success': True}), 200
