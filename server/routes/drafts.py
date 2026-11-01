import json
import uuid

from flask import Blueprint, g, jsonify

from server.access import require_login
from server.db import connect
from server.helpers import NOW, error, json_body
from server.ratelimit import limit
from server.routes.characters import NoCampaign, creation_setting
from server.rules import packs
from server.rules.abilities import roll_scores

bp = Blueprint('drafts', __name__)

# A draft is the creation wizard's progress, saved as the player goes. It isn't checked
# against the rules (that happens on /characters/validate and on create); it only has to
# be the right shape and size.
DRAFT_MAX_BYTES = 32_000
STEPS = {'campaign', 'species', 'background', 'class', 'abilities', 'name'}

# The draft fields worth keeping from a body, or None if they're the wrong shape.
def clean_draft(raw):
    if not isinstance(raw, dict):
        return None
    draft = {
        'name': raw.get('name') or '',
        'species': raw.get('species'),
        'speciesChoices': raw.get('speciesChoices') or {},
        'originRules': raw.get('originRules') or {},
        'background': raw.get('background'),
        'backgroundChoices': raw.get('backgroundChoices') or {},
        'class': raw.get('class'),
        'classChoices': raw.get('classChoices') or {},
        'abilityMethod': raw.get('abilityMethod'),
        'abilityScores': raw.get('abilityScores') or {},
        'hpMethod': raw.get('hpMethod'),
        'hpRolls': raw.get('hpRolls') or [],
        'details': raw.get('details') or {},
    }
    if not isinstance(draft['name'], str) or not all(
            draft[k] is None or isinstance(draft[k], str) for k in ('species', 'background', 'class', 'abilityMethod', 'hpMethod')):
        return None
    if not all(isinstance(draft[k], dict) for k in ('speciesChoices', 'backgroundChoices', 'classChoices')):
        return None
    if not isinstance(draft['abilityScores'], dict) or not isinstance(draft['hpRolls'], list)             or not isinstance(draft['originRules'], dict) or not isinstance(draft['details'], dict):
        return None
    if len(json.dumps(draft)) > DRAFT_MAX_BYTES:
        return None
    return draft

# Body: {campaignId (null for the sandbox), draft, step}. Checks it, and that the player may
# make characters in that campaign. Returns (campaign_id, draft json, step), or (None, None, problem).
def read_body(conn):
    body = json_body() or {}
    campaign_id = body.get('campaignId')
    draft = clean_draft(body.get('draft'))
    step = body.get('step')
    if draft is None:
        return None, None, error(f'A draft must be an object under {DRAFT_MAX_BYTES // 1000} KB.', 400)
    if step is not None and step not in STEPS:
        return None, None, error('Unknown step.', 400)
    try:
        creation_setting(conn, campaign_id)
    except NoCampaign:
        return None, None, error('Campaign not found', 404)
    return campaign_id, json.dumps(draft), step

def _name(collection, entry_id):
    entry = packs.collection(collection).get(entry_id) if entry_id else None
    return entry['name'] if entry else None

# The signed-in player's drafts, newest first, with what home needs to list them.
@bp.get('/drafts')
@require_login
def list_drafts():
    conn = connect()
    try:
        rows = conn.execute(
            'SELECT d.id, d.campaign_id, d.draft, d.updated_at, c.name AS campaign_name '
            'FROM character_drafts d LEFT JOIN campaigns c ON c.id = d.campaign_id '
            'WHERE d.owner_id = ? ORDER BY d.updated_at DESC',
            (g.user['id'],),
        ).fetchall()
    finally:
        conn.close()
    drafts = []
    for row in rows:
        draft = json.loads(row['draft'])
        drafts.append({
            'id': row['id'],
            'name': draft.get('name') or '',
            'species': _name('species', draft.get('species')),
            'class': _name('classes', draft.get('class')),
            'campaignId': row['campaign_id'],
            'campaignName': row['campaign_name'],
            'updatedAt': row['updated_at'],
        })
    return jsonify(drafts), 200

@bp.post('/drafts')
@require_login
@limit('draft-create', 60, 60 * 60)
def create_draft():
    conn = connect()
    try:
        with conn:
            campaign_id, draft, step = read_body(conn)
            if campaign_id is None and draft is None:
                return step
            draft_id = str(uuid.uuid4())
            conn.execute(
                'INSERT INTO character_drafts (id, owner_id, campaign_id, draft, step) VALUES (?, ?, ?, ?, ?)',
                (draft_id, g.user['id'], campaign_id, draft, step),
            )
    finally:
        conn.close()
    return jsonify({'id': draft_id}), 201

def own_draft(conn, draft_id):
    return conn.execute(
        'SELECT * FROM character_drafts WHERE id = ? AND owner_id = ?', (draft_id, g.user['id'])
    ).fetchone()

@bp.get('/drafts/<draft_id>')
@require_login
def get_draft(draft_id):
    conn = connect()
    try:
        row = own_draft(conn, draft_id)
    finally:
        conn.close()
    if row is None:
        return error('Draft not found', 404)
    return jsonify({
        'id': row['id'],
        'campaignId': row['campaign_id'],
        'draft': json.loads(row['draft']),
        'step': row['step'],
        'rolls': json.loads(row['rolls']) if row['rolls'] else None,
    }), 200

# Rolls the draft's ability scores: 4d6 drop the lowest, six times. In a campaign that's
# once per draft; in the Character Sandbox the player may roll again.
@bp.post('/drafts/<draft_id>/roll')
@require_login
@limit('ability-roll', 60, 60 * 60)
def roll_abilities(draft_id):
    conn = connect()
    try:
        with conn:
            row = own_draft(conn, draft_id)
            if row is None:
                return error('Draft not found', 404)
            if row['rolls'] and row['campaign_id'] is not None:
                return error('You’ve already rolled for this character.', 409)
            rolls = roll_scores()
            conn.execute('UPDATE character_drafts SET rolls = ? WHERE id = ?', (json.dumps(rolls), draft_id))
    finally:
        conn.close()
    return jsonify({'rolls': rolls}), 200

# Body as for POST. Replaces the draft with the wizard's current state.
@bp.put('/drafts/<draft_id>')
@require_login
def put_draft(draft_id):
    conn = connect()
    try:
        with conn:
            row = own_draft(conn, draft_id)
            if row is None:
                return error('Draft not found', 404)
            campaign_id, draft, step = read_body(conn)
            if campaign_id is None and draft is None:
                return step
            # Rolls belong to where they were made: moving the draft (say, out of the
            # sandbox, where rerolling is allowed) drops them.
            moved = campaign_id != row['campaign_id']
            conn.execute(
                f'UPDATE character_drafts SET campaign_id = ?, draft = ?, step = ?, updated_at = {NOW}, '
                f'rolls = CASE WHEN ? THEN NULL ELSE rolls END WHERE id = ?',
                (campaign_id, draft, step, moved, draft_id),
            )
    finally:
        conn.close()
    return jsonify({'success': True}), 200

@bp.delete('/drafts/<draft_id>')
@require_login
def delete_draft(draft_id):
    conn = connect()
    try:
        with conn:
            if own_draft(conn, draft_id) is None:
                return error('Draft not found', 404)
            conn.execute('DELETE FROM character_drafts WHERE id = ?', (draft_id,))
    finally:
        conn.close()
    return jsonify({'success': True}), 200
