import json
import sqlite3

from flask import Blueprint, jsonify

from server.db import connect
from server.helpers import (
    NAME_MAX_LENGTH, NOW, canonical_uuid, clean_name, current_user, error, is_gm, json_body, list_campaigns,
)
from server.rules import validate_campaign_patch
from server.rules.problems import campaign_problems, spell_change_problem, subclass_change_problem
from server.access import require_admin, require_login, require_member

bp = Blueprint('campaigns', __name__)

# The admin gets every campaign; anyone else only the ones they've joined. role is the
# user's role in each, or 'admin' where the admin isn't a member.
@bp.get('/campaigns')
@require_login
def get_campaigns():
    conn = connect()
    try:
        user = current_user(conn)
        if user['is_admin']:
            rows = conn.execute(
                "SELECT c.id, c.name, COALESCE(m.role, 'admin') AS role FROM campaigns c "
                'LEFT JOIN memberships m ON m.campaign_id = c.id AND m.user_id = ? ORDER BY c.created_at',
                (user['id'],),
            ).fetchall()
            campaigns = [dict(r) for r in rows]
        else:
            campaigns = list_campaigns(conn, user['id'])
    finally:
        conn.close()
    return jsonify(campaigns), 200

@bp.post('/campaigns')
@require_admin
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

# Members read their campaign; the admin can read any. role is the user's role in it,
# or 'admin' for an admin who isn't a member.
@bp.get('/campaigns/<campaign_id>')
@require_member
def get_campaign(campaign_id):
    conn = connect()
    try:
        row = conn.execute('SELECT name, description, settings FROM campaigns WHERE id = ?', (campaign_id,)).fetchone()
        membership = conn.execute(
            'SELECT role FROM memberships WHERE campaign_id = ? AND user_id = ?', (campaign_id, current_user(conn)['id'])
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return error('Campaign not found', 404)
    role = membership['role'] if membership else 'admin'
    details = json.loads(row['settings'])
    details.update({'name': row['name'], 'description': row['description'] or None, 'characters': [], 'role': role})
    # Campaigns made before allowedContent existed: missing means everything is allowed.
    details.setdefault('allowedContent', {})
    details.setdefault('rules', {})
    # What the settings are missing before characters can be made; the page shows these.
    details['problems'] = campaign_problems(details['allowedContent'])
    return jsonify(details), 200

# Body: any of {name, description, rules, allowedContent}. All are checked before any is saved.
# Returns the campaign's problems after the change, so the page needn't work them out.
@bp.patch('/campaigns/<campaign_id>')
@require_login
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
                before = dict(settings.get('allowedContent', {}))
                settings.setdefault('allowedContent', {}).update(content['allowedContent'])
                # Refused outright, unlike the problems list: the class and spell pickers
                # never need to pass through these states.
                if 'classes' in content['allowedContent'] or 'subclasses' in content['allowedContent']:
                    message = subclass_change_problem(before, settings['allowedContent'])
                    if message:
                        return error(message, 400)
                if 'spells' in content['allowedContent']:
                    message = spell_change_problem(before, settings['allowedContent'])
                    if message:
                        return error(message, 400)
            conn.execute(
                f'UPDATE campaigns SET name = ?, description = ?, settings = ?, updated_at = {NOW} WHERE id = ?',
                (name, description, json.dumps(settings), campaign_id),
            )
    finally:
        conn.close()
    return jsonify({'success': True, 'problems': campaign_problems(settings.get('allowedContent', {}))}), 200

@bp.delete('/campaigns/<campaign_id>')
@require_login
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

# Everyone in the campaign, GM first, with how many characters each has there.
@bp.get('/campaigns/<campaign_id>/members')
@require_login
def get_members(campaign_id):
    conn = connect()
    try:
        if not is_gm(conn, campaign_id, current_user(conn)):
            return error('Campaign not found', 404)
        rows = conn.execute(
            'SELECT u.id, u.username, u.display_name, m.role, m.joined_at, '
            '(SELECT COUNT(*) FROM characters ch WHERE ch.campaign_id = m.campaign_id AND ch.owner_id = u.id) '
            'AS character_count FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.campaign_id = ? '
            "ORDER BY m.role = 'gm' DESC, m.joined_at",
            (campaign_id,),
        ).fetchall()
    finally:
        conn.close()
    return jsonify([{
        'userId': r['id'],
        'username': r['username'],
        'displayName': r['display_name'],
        'role': r['role'],
        'joinedAt': r['joined_at'],
        'characterCount': r['character_count'],
    } for r in rows]), 200

# Removes a player from the campaign, and with them their characters there (the
# characters table cascades from memberships). The GM can't be removed this way.
@bp.delete('/campaigns/<campaign_id>/members/<user_id>')
@require_login
def remove_member(campaign_id, user_id):
    conn = connect()
    try:
        with conn:
            if not is_gm(conn, campaign_id, current_user(conn)):
                return error('Campaign not found', 404)
            member = conn.execute(
                'SELECT role FROM memberships WHERE campaign_id = ? AND user_id = ?', (campaign_id, user_id)
            ).fetchone()
            if member is None:
                return error('That user isn’t in this campaign.', 404)
            if member['role'] != 'player':
                return error('The GM can’t be removed from their campaign.', 400)
            conn.execute('DELETE FROM memberships WHERE campaign_id = ? AND user_id = ?', (campaign_id, user_id))
    finally:
        conn.close()
    return jsonify({'success': True}), 200
