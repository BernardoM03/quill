import json
import sqlite3

from flask import Blueprint, jsonify

from server.access import require_admin, require_login, require_member
from server.campaign_content import load_allowed, save_allowed
from server.db import connection
from server.helpers import (
    NAME_MAX_LENGTH, NOW, canonical_uuid, clean_name, current_user, error, is_gm, json_body, list_campaigns,
    revalidated_json,
)
from server.rules import validate_campaign_patch
from server.rules.campaign import known_content
from server.rules.problems import campaign_problems, spell_change_problem, subclass_change_problem
from server.rules.settings import LIMITS, with_rule_defaults

bp = Blueprint('campaigns', __name__)

# The admin sees every campaign, with role 'admin' where they aren't a member.
@bp.get('/campaigns')
@require_login
def get_campaigns():
    with connection() as conn:
        user = current_user(conn)
        if user['is_admin']:
            rows = conn.execute(
                "SELECT c.id, c.name, COALESCE(m.role, 'admin') AS role FROM campaigns c "
                'LEFT JOIN memberships m ON m.campaign_id = c.id AND m.user_id = ? ORDER BY c.created_at',
                (user['id'],),
            ).fetchall()
            campaigns = [dict(row) for row in rows]
        else:
            campaigns = list_campaigns(conn, user['id'])
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
    settings = {'rules': {}}

    with connection() as conn:
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
    return jsonify({'name': campaign_name, 'id': campaign_id}), 201

# role is the user's role in the campaign, or 'admin' for an admin who isn't a member.
@bp.get('/campaigns/<campaign_id>')
@require_member
def get_campaign(campaign_id):
    with connection() as conn:
        row = conn.execute('SELECT name, description, settings FROM campaigns WHERE id = ?', (campaign_id,)).fetchone()
        allowed = load_allowed(conn, campaign_id)
        membership = conn.execute(
            'SELECT role FROM memberships WHERE campaign_id = ? AND user_id = ?', (campaign_id, current_user(conn)['id'])
        ).fetchone()
    if row is None:
        return error('Campaign not found', 404)
    details = json.loads(row['settings'])
    details.update({
        'name': row['name'],
        'description': row['description'] or None,
        'characters': [],
        'role': membership['role'] if membership else 'admin',
        # A collection missing from allowedContent allows everything in it.
        'allowedContent': allowed,
        # Only GM changes are stored, so defaults are filled in before sending.
        'rules': with_rule_defaults(details.get('rules')),
        'ruleLimits': LIMITS,
        'questions': details.get('questions') or [],
        # What the settings lack before characters can be made.
        'problems': campaign_problems(allowed),
    })
    return revalidated_json(details)

# Applies allowedContent changes to allowed in place and returns an error message, or None.
def _apply_content_changes(conn, campaign_id, allowed, requested):
    changes = known_content(requested)
    before = dict(allowed)
    for collection, entry_ids in changes.items():
        if entry_ids is None:
            allowed.pop(collection, None)
        else:
            allowed[collection] = entry_ids
    # Unlike campaign problems these are refused outright, because the pickers never pass through them.
    if 'classes' in changes or 'subclasses' in changes:
        problem = subclass_change_problem(before, allowed)
        if problem:
            return problem
    if 'spells' in changes:
        problem = spell_change_problem(before, allowed)
        if problem:
            return problem
    save_allowed(conn, campaign_id, changes)
    return None

# Body: any of {name, description, rules, allowedContent, questions}, all checked before any is saved.
# Returns the campaign's problems after the change, so the page needn't work them out.
@bp.patch('/campaigns/<campaign_id>')
@require_login
def update_campaign(campaign_id):
    content = json_body()
    problem = validate_campaign_patch(content)
    if problem:
        return error(problem, 400)

    with connection() as conn:
        with conn:
            row = conn.execute('SELECT name, description, settings FROM campaigns WHERE id = ?', (campaign_id,)).fetchone()
            if row is None or not is_gm(conn, campaign_id, current_user(conn)):
                return error('Campaign not found', 404)
            settings = json.loads(row['settings'])
            allowed = load_allowed(conn, campaign_id)
            # While problems remain, only fixes (allowed content and rules) can be saved, matching the settings page.
            if 'name' in content or 'description' in content:
                problems = campaign_problems(allowed)
                if problems:
                    return error('Fix the campaign’s problems first: ' + ' '.join(problems), 409)
            name = clean_name(content['name']) if 'name' in content else row['name']
            description = content['description'].strip() if 'description' in content else row['description']
            if 'questions' in content:
                settings['questions'] = [{**question, 'prompt': question['prompt'].strip()} for question in content['questions']]
            if 'rules' in content:
                settings.setdefault('rules', {}).update(content['rules'])
            if 'allowedContent' in content:
                problem = _apply_content_changes(conn, campaign_id, allowed, content['allowedContent'])
                if problem:
                    return error(problem, 400)
            conn.execute(
                f'UPDATE campaigns SET name = ?, description = ?, settings = ?, updated_at = {NOW} WHERE id = ?',
                (name, description, json.dumps(settings), campaign_id),
            )
    return jsonify({'success': True, 'problems': campaign_problems(allowed)}), 200

@bp.delete('/campaigns/<campaign_id>')
@require_login
def delete_campaign(campaign_id):
    with connection() as conn:
        with conn:
            if not is_gm(conn, campaign_id, current_user(conn)):
                return error('Campaign not found', 404)
            # Memberships, characters and invites go with it through ON DELETE CASCADE.
            deleted_count = conn.execute('DELETE FROM campaigns WHERE id = ?', (campaign_id,)).rowcount
    if not deleted_count:
        return error('Campaign not found', 404)
    return jsonify({'success': True}), 200

# Everyone in the campaign, GM first, with how many characters each has there.
@bp.get('/campaigns/<campaign_id>/members')
@require_login
def get_members(campaign_id):
    with connection() as conn:
        if not is_gm(conn, campaign_id, current_user(conn)):
            return error('Campaign not found', 404)
        rows = conn.execute(
            'SELECT u.id, u.username, u.display_name, m.role, m.joined_at, '
            '(SELECT COUNT(*) FROM characters ch WHERE ch.campaign_id = m.campaign_id AND ch.owner_id = u.id) '
            'AS character_count FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.campaign_id = ? '
            "ORDER BY m.role = 'gm' DESC, m.joined_at",
            (campaign_id,),
        ).fetchall()
    return jsonify([{
        'userId': row['id'],
        'username': row['username'],
        'displayName': row['display_name'],
        'role': row['role'],
        'joinedAt': row['joined_at'],
        'characterCount': row['character_count'],
    } for row in rows]), 200

# Removes a player, whose characters there cascade with the membership; the GM can't be removed.
@bp.delete('/campaigns/<campaign_id>/members/<user_id>')
@require_login
def remove_member(campaign_id, user_id):
    with connection() as conn:
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
    return jsonify({'success': True}), 200
