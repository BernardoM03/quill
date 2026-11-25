import json
import uuid

from flask import Blueprint, g, jsonify

from server.access import require_login
from server.db import connection
from server.helpers import NOW, error, json_body
from server.ratelimit import limit
from server.records import record_problems
from server.routes.characters import NoCampaign, creation_setting, without_empty_picks
from server.rules import packs
from server.rules.abilities import roll_scores

bp = Blueprint('drafts', __name__)

# A draft is the creation wizard's saved progress.
# Drafts only have to fit their schema and size, since rules are checked on validate and create.
DRAFT_MAX_BYTES = 32_000
DRAFT_VERSION = 1
STEPS = {'campaign', 'species', 'background', 'class', 'abilities', 'name'}

class DraftRequestError(Exception):
    def __init__(self, message, status):
        super().__init__(message)
        self.status = status

    def response(self):
        return error(str(self), self.status)

# The storable draft from a request body, with every field present, or a DraftRequestError.
def clean_draft(raw):
    if not isinstance(raw, dict):
        raise DraftRequestError('A draft must be an object.', 400)
    draft = {
        'version': DRAFT_VERSION,
        'name': raw.get('name') or '',
        'species': raw.get('species'),
        'speciesChoices': without_empty_picks(raw.get('speciesChoices') or {}),
        'originRules': raw.get('originRules') or {},
        'background': raw.get('background'),
        'backgroundChoices': without_empty_picks(raw.get('backgroundChoices') or {}),
        'class': raw.get('class'),
        'classChoices': without_empty_picks(raw.get('classChoices') or {}),
        'abilityMethod': raw.get('abilityMethod'),
        'abilityScores': raw.get('abilityScores') or {},
        'hpMethod': raw.get('hpMethod'),
        'hpRolls': raw.get('hpRolls') or [],
        'details': raw.get('details') or {},
        'answers': raw.get('answers') or {},
    }
    problems = record_problems('draft', draft)
    if problems:
        raise DraftRequestError(f'The draft doesn’t fit: {problems[0]}', 400)
    if len(json.dumps(draft)) > DRAFT_MAX_BYTES:
        raise DraftRequestError(f'A draft must be under {DRAFT_MAX_BYTES // 1000} KB.', 400)
    return draft

# Parses {campaignId (null for the sandbox), draft, step} and checks the player may create characters there.
# Returns (campaign_id, draft as JSON text, step).
def read_body(conn):
    body = json_body() or {}
    campaign_id = body.get('campaignId')
    draft = clean_draft(body.get('draft'))
    step = body.get('step')
    if step is not None and step not in STEPS:
        raise DraftRequestError('Unknown step.', 400)
    try:
        creation_setting(conn, campaign_id)
    except NoCampaign:
        raise DraftRequestError('Campaign not found', 404)
    return campaign_id, json.dumps(draft), step

def _entry_name(collection, entry_id):
    entry = packs.collection(collection).get(entry_id) if entry_id else None
    return entry['name'] if entry else None

def own_draft(conn, draft_id):
    return conn.execute(
        'SELECT * FROM character_drafts WHERE id = ? AND owner_id = ?', (draft_id, g.user['id'])
    ).fetchone()

# The signed-in player's drafts, newest first, summarised for the home page.
@bp.get('/drafts')
@require_login
def list_drafts():
    with connection() as conn:
        rows = conn.execute(
            'SELECT d.id, d.campaign_id, d.draft, d.updated_at, c.name AS campaign_name '
            'FROM character_drafts d LEFT JOIN campaigns c ON c.id = d.campaign_id '
            'WHERE d.owner_id = ? ORDER BY d.updated_at DESC',
            (g.user['id'],),
        ).fetchall()
    summaries = []
    for row in rows:
        draft = json.loads(row['draft'])
        summaries.append({
            'id': row['id'],
            'name': draft.get('name') or '',
            'species': _entry_name('species', draft.get('species')),
            'class': _entry_name('classes', draft.get('class')),
            'campaignId': row['campaign_id'],
            'campaignName': row['campaign_name'],
            'updatedAt': row['updated_at'],
        })
    return jsonify(summaries), 200

@bp.post('/drafts')
@require_login
@limit('draft-create', 60, 60 * 60)
def create_draft():
    with connection() as conn:
        with conn:
            try:
                campaign_id, draft, step = read_body(conn)
            except DraftRequestError as e:
                return e.response()
            draft_id = str(uuid.uuid4())
            conn.execute(
                'INSERT INTO character_drafts (id, owner_id, campaign_id, draft, step) VALUES (?, ?, ?, ?, ?)',
                (draft_id, g.user['id'], campaign_id, draft, step),
            )
    return jsonify({'id': draft_id}), 201

@bp.get('/drafts/<draft_id>')
@require_login
def get_draft(draft_id):
    with connection() as conn:
        row = own_draft(conn, draft_id)
    if row is None:
        return error('Draft not found', 404)
    return jsonify({
        'id': row['id'],
        'campaignId': row['campaign_id'],
        'draft': json.loads(row['draft']),
        'step': row['step'],
        'rolls': json.loads(row['rolls']) if row['rolls'] else None,
    }), 200

# Rolls 4d6-drop-lowest six times; campaigns allow one roll per draft while the sandbox allows rerolls.
@bp.post('/drafts/<draft_id>/roll')
@require_login
@limit('ability-roll', 60, 60 * 60)
def roll_abilities(draft_id):
    with connection() as conn:
        with conn:
            row = own_draft(conn, draft_id)
            if row is None:
                return error('Draft not found', 404)
            if row['rolls'] and row['campaign_id'] is not None:
                return error('You’ve already rolled for this character.', 409)
            rolls = roll_scores()
            conn.execute('UPDATE character_drafts SET rolls = ? WHERE id = ?', (json.dumps(rolls), draft_id))
    return jsonify({'rolls': rolls}), 200

# Body as for POST; replaces the draft with the wizard's current state.
@bp.put('/drafts/<draft_id>')
@require_login
def put_draft(draft_id):
    with connection() as conn:
        with conn:
            row = own_draft(conn, draft_id)
            if row is None:
                return error('Draft not found', 404)
            try:
                campaign_id, draft, step = read_body(conn)
            except DraftRequestError as e:
                return e.response()
            # Rolls belong to the campaign they were made in, so moving the draft drops them.
            moved = campaign_id != row['campaign_id']
            conn.execute(
                f'UPDATE character_drafts SET campaign_id = ?, draft = ?, step = ?, updated_at = {NOW}, '
                f'rolls = CASE WHEN ? THEN NULL ELSE rolls END WHERE id = ?',
                (campaign_id, draft, step, moved, draft_id),
            )
    return jsonify({'success': True}), 200

@bp.delete('/drafts/<draft_id>')
@require_login
def delete_draft(draft_id):
    with connection() as conn:
        with conn:
            if own_draft(conn, draft_id) is None:
                return error('Draft not found', 404)
            conn.execute('DELETE FROM character_drafts WHERE id = ?', (draft_id,))
    return jsonify({'success': True}), 200
