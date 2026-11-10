import json
import uuid

from flask import Blueprint, Response, g, jsonify, request

from server import portraits
from server.access import require_login, require_member
from server.campaign_content import load_allowed
from server.db import connect
from server.helpers import NOW, clean_name, error, is_gm, json_body
from server.ratelimit import limit
from server.rules.characters import (
    Setting, allowed_backgrounds, allowed_classes, allowed_species, background_detail_for, check_draft, class_detail_for,
    kept_background_choices, kept_class_choices, species_detail,
)
from server.rules.abilities import ability_rules, hp_method, roll_scores
from server.records import record_problems
from server.rules.scores import apply_adjustments, clean_adjustments
from server.rules.classes import class_summary
from server.rules.settings import MAX_LEVEL, with_rule_defaults
from server.rules.details import clean_answers, clean_details

bp = Blueprint('characters', __name__)

class NoCampaign(Exception):
    pass

# Where a new character is made: the campaign's allowed content and rules, or the Character
# Sandbox (campaign_id None: everything installed, the default rules). A character belongs
# to a membership, so even the admin must be in the campaign. Raises NoCampaign otherwise.
def creation_setting(conn, campaign_id):
    if campaign_id is None:
        return Setting(None, {})
    row = conn.execute(
        'SELECT c.settings FROM campaigns c JOIN memberships m ON m.campaign_id = c.id '
        'WHERE c.id = ? AND m.user_id = ?',
        (campaign_id, g.user['id']),
    ).fetchone()
    if row is None:
        raise NoCampaign()
    settings = json.loads(row['settings'])
    return Setting(load_allowed(conn, campaign_id), settings.get('rules', {}), settings.get('questions'))

# The setting a character was made under, as its campaign has it now: the campaign's content
# and rules (the sandbox's for no campaign), the character's own origin rules in the sandbox,
# at the character's level. Unlike creation_setting, membership isn't checked (the admin may
# look at anyone's character).
def character_setting(conn, row, sheet):
    if row['campaign_id'] is None:
        setting = Setting(None, {})
    else:
        campaign = conn.execute('SELECT settings FROM campaigns WHERE id = ?', (row['campaign_id'],)).fetchone()
        settings = json.loads(campaign['settings']) if campaign else {}
        setting = Setting(load_allowed(conn, row['campaign_id']), settings.get('rules', {}), settings.get('questions'))
    return setting.for_draft(sheet.get('build') or {}).at_level(sheet.get('level'))

# The rolls a character's scores were assigned from, or None.
def sheet_rolls(sheet):
    return sheet.get('rolls')

# A saved character as the wizard's draft, to check it or edit it: its build and name.
def sheet_draft(row, sheet):
    return {**(sheet.get('build') or {}), 'name': row['name']}

# The character checked against its campaign as it is now: check_draft's result, or None
# for a character with no build (made before the sheet had one; there's nothing to check).
def check_character(conn, row, sheet):
    if not sheet.get('build'):
        return None
    return check_draft(sheet_draft(row, sheet), character_setting(conn, row, sheet), sheet_rolls(sheet))

# Whatever no longer fits the character's campaign (its content or rules changed since it
# was made), as [{field, message}]. Nothing about the character is changed.
def character_problems(conn, row):
    result = check_character(conn, row, json.loads(row['sheet']))
    return result['errors'] if result else []

# Each ability as the sheet shows it: base, the permanent increases by source, the score,
# and current with the sheet's temporary effects (play.scoreAdjustments) applied.
def sheet_abilities(summary, sheet):
    return apply_adjustments(summary['abilities'], (sheet.get('play') or {}).get('scoreAdjustments') or [])

SHEET_VERSION = 1

def _picked(choices):
    return {k: v for k, v in choices.items() if v not in ('', [], None)}

# The build a valid draft saves as (schemas/records/sheet.schema.json $defs.build): the
# draft's picks, with only the choices that apply and the campaign's methods filled in.
# old: the build being replaced, whose answers to questions no longer asked are kept.
def build_from_draft(draft, setting, old=None):
    return {
        'species': draft['species'],
        'speciesChoices': _picked(draft.get('speciesChoices') or {}),
        'originRules': setting.origin_rules(),
        'background': draft['background'],
        'backgroundChoices': _picked(kept_background_choices(draft, setting)),
        'class': draft['class'],
        'classChoices': _picked(kept_class_choices(draft, setting)),
        'abilityMethod': draft.get('abilityMethod') or ability_rules(setting)['allowedMethods'][0],
        # Base scores as assigned; increases are worked out from the picks when read.
        'abilityScores': draft['abilityScores'],
        'hpMethod': hp_method(draft, setting),
        'hpRolls': draft.get('hpRolls') or [],
        'details': clean_details(draft.get('details')),
        'answers': clean_answers(draft.get('answers'), setting.questions, (old or {}).get('answers')),
    }

# A new character's sheet. rolls: the ability rolls its scores came from (or None).
def new_sheet(draft, setting, rolls):
    return {'version': SHEET_VERSION, 'level': setting.level, 'build': build_from_draft(draft, setting),
            'rolls': rolls, 'play': {}}

# The sheet as JSON for the characters.sheet column, refused (ValueError) if it doesn't fit
# its schema. Every write goes through here.
def sheet_json(sheet):
    problems = record_problems('sheet', sheet)
    if problems:
        raise ValueError(f'The sheet doesn’t fit its schema: {problems[0]}')
    return json.dumps(sheet)

# The ability score rolls kept with one of the signed-in player's drafts, or None.
def draft_rolls(conn, draft_id):
    if not isinstance(draft_id, str):
        return None
    row = conn.execute('SELECT rolls FROM character_drafts WHERE id = ? AND owner_id = ?',
                       (draft_id, g.user['id'])).fetchone()
    return json.loads(row['rolls']) if row and row['rolls'] else None

def setting_from_query():
    campaign = request.args.get('campaign')
    if not campaign:
        return None, error('Say which campaign, or "sandbox".', 400)
    conn = connect()
    try:
        return creation_setting(conn, None if campaign == 'sandbox' else campaign), None
    except NoCampaign:
        return None, error('Campaign not found', 404)
    finally:
        conn.close()

# ?campaign=<id> or ?campaign=sandbox. What the creation wizard may offer: the level a new
# character starts at, every allowed species and background in full, and the allowed classes in brief.
@bp.get('/characters/options')
@require_login
def get_options():
    setting, problem = setting_from_query()
    if problem:
        return problem
    return jsonify({
        'level': setting.level,
        'species': [species_detail(s, setting) for s in allowed_species(setting)],
        'backgrounds': [background_detail_for(b['id'], setting) for b in allowed_backgrounds(setting)],
        'classes': [class_summary(c) for c in allowed_classes(setting)],
        'abilityRules': ability_rules(setting),
        # The origin rules, and whether they're the campaign's (locked) or the player's to pick.
        'originRules': setting.origin_rules(),
        'rulesLocked': not setting.sandbox,
        # The GM's custom questions, asked on the Details step.
        'questions': setting.questions,
    }), 200

# ?campaign=... as above, plus in the sandbox the player's origin rules (customizeOrigin=true,
# originFeat=any, startingEquipment=gold). Every allowed background under those rules.
@bp.get('/characters/options/backgrounds')
@require_login
def get_background_options():
    setting, problem = setting_from_query()
    if problem:
        return problem
    args = request.args
    chosen = {k: args[k] for k in ('originFeat', 'startingEquipment') if k in args}
    if 'customizeOrigin' in args:
        chosen['customizeOrigin'] = args['customizeOrigin'] == 'true'
    setting = setting.for_draft({'originRules': chosen})
    return jsonify([background_detail_for(b['id'], setting) for b in allowed_backgrounds(setting)]), 200

# ?campaign=... as above. One class in full at the starting level: features, choices, subclasses.
# &level=<n> instead shows it at that level, for editing a character that has it.
@bp.get('/characters/options/classes/<path:class_id>')
@require_login
def get_class_option(class_id):
    setting, problem = setting_from_query()
    if problem:
        return problem
    level = request.args.get('level', type=int)
    if level is not None:
        if not 1 <= level <= MAX_LEVEL:
            return error(f'level must be from 1 to {MAX_LEVEL}.', 400)
        setting = setting.at_level(level)
    if class_id not in {c['id'] for c in allowed_classes(setting)}:
        return error('Class not found', 404)
    return jsonify(class_detail_for(class_id, setting)), 200

# Body: {campaignId (null for the sandbox), name, species, speciesChoices, background, backgroundChoices,
# class, classChoices, ...}. With characterId, checks an edit of that character instead: its
# campaign, level and rolls (campaignId and draftId are ignored).
# Returns {errors: [{field, message}], taken: {optionKey: field}}: errors is empty when the draft can
# be created; taken is each skill, tool and language already picked, and which choice picked it,
# so the wizard leaves it out of the other choices. Doesn't save anything.
@bp.post('/characters/validate')
@require_login
def validate_character():
    draft = json_body() or {}
    conn = connect()
    try:
        if draft.get('characterId'):
            row = own_character(conn, draft['characterId'])
            if row is None:
                return error('Character not found', 404)
            sheet = json.loads(row['sheet'])
            setting, rolls = character_setting(conn, row, sheet).for_draft(draft), sheet_rolls(sheet)
        else:
            setting = creation_setting(conn, draft.get('campaignId'))
            rolls = draft_rolls(conn, draft.get('draftId'))
    except NoCampaign:
        return error('Campaign not found', 404)
    finally:
        conn.close()
    return jsonify(check_draft(draft, setting, rolls)), 200

# Checks the body and saves the character. campaign_id None makes a sandbox character, which
# is never active and needs no approval. A campaign character is saved with status 'draft':
# it isn't playable until submitted (POST /characters/<id>/submit), which approves it or
# sends it to the GM, depending on the campaign's characterApproval rule.
# A draftId in the body names the draft it was made from, which is deleted with the save.
def create(campaign_id):
    draft = json_body() or {}
    conn = connect()
    try:
        with conn:
            try:
                setting = creation_setting(conn, campaign_id).for_draft(draft)
            except NoCampaign:
                return error('Only members of this campaign can create characters in it.', 403)
            rolls = draft_rolls(conn, draft.get('draftId'))
            result = check_draft(draft, setting, rolls)
            errors = result['errors']
            if errors:
                return jsonify({'error': errors[0]['message'], 'errors': errors}), 400
            name = clean_name(draft['name'])
            status = 'approved' if campaign_id is None else 'draft'
            character_id = str(uuid.uuid4())
            conn.execute(
                'INSERT INTO characters (id, campaign_id, owner_id, name, sheet, is_active, status) '
                'VALUES (?, ?, ?, ?, ?, 0, ?)',
                (character_id, campaign_id, g.user['id'], name,
                 sheet_json(new_sheet(draft, setting, rolls)), status),
            )
            if isinstance(draft.get('draftId'), str):
                conn.execute('DELETE FROM character_drafts WHERE id = ? AND owner_id = ?',
                             (draft['draftId'], g.user['id']))
    finally:
        conn.close()
    return jsonify({'id': character_id, 'name': name, 'isActive': False, 'status': status}), 201

# Body: {name, species, speciesChoices, background, backgroundChoices, class, classChoices}. A Character Sandbox character: in no campaign, owned by the
# signed-in user alone, built from all the content the server has with the default rules.
@bp.post('/sandbox/characters')
@require_login
def create_sandbox_character():
    return create(None)

# Body: {name, species, speciesChoices, background, backgroundChoices, class, classChoices}. A character owned by the signed-in user in this campaign.
@bp.post('/campaigns/<campaign_id>/characters')
@require_member
def create_character(campaign_id):
    return create(campaign_id)

# The character if the signed-in user may see and change it, else None. For now that's
# its owner and the admin; who else sees a character comes with the party-visibility rules.
def own_character(conn, character_id):
    row = conn.execute(
        'SELECT ch.*, c.name AS campaign_name, p.updated_at AS portrait_version '
        'FROM characters ch LEFT JOIN campaigns c ON c.id = ch.campaign_id '
        'LEFT JOIN character_portraits p ON p.character_id = ch.id '
        'WHERE ch.id = ? AND ch.deleted_at IS NULL',
        (character_id,),
    ).fetchone()
    if row is None or (row['owner_id'] != g.user['id'] and not g.user['is_admin']):
        return None
    return row

@bp.get('/characters/<character_id>')
@require_login
def get_character(character_id):
    conn = connect()
    try:
        row = own_character(conn, character_id)
        sheet = json.loads(row['sheet']) if row else {}
        result = check_character(conn, row, sheet) if row else None
    finally:
        conn.close()
    if row is None:
        return error('Character not found', 404)
    problems = result['errors'] if result else []
    return jsonify({
        'id': row['id'],
        'name': row['name'],
        'isActive': bool(row['is_active']),
        # draft, pending (waiting for the GM), approved or rejected; see db.py migration 11.
        'status': row['status'],
        # Why the GM rejected it; null unless rejected with a reason.
        'reviewReason': row['review_reason'],
        'campaignId': row['campaign_id'],
        'campaignName': row['campaign_name'],
        # Changes whenever the portrait does; null when there isn't one.
        'portraitVersion': row['portrait_version'],
        # What no longer fits the campaign's current settings; fixed by editing in the wizard.
        'problems': problems,
        # The character as the wizard edits it, and the ability rolls its scores came from.
        'draft': sheet_draft(row, sheet),
        'rolls': sheet_rolls(sheet),
        'level': sheet.get('level', 1),
        # Each ability's base, increases, score and current; null for a character without scores.
        'abilities': sheet_abilities(result['summary'], sheet) if result else None,
        'scoreAdjustments': (sheet.get('play') or {}).get('scoreAdjustments') or [],
    }), 200

# Body: {adjustments: [{id, name, ability, mode, value}]}. Replaces the character's temporary
# ability score effects (see server/rules/scores.py). Returns the abilities with them applied.
@bp.put('/characters/<character_id>/adjustments')
@require_login
def put_adjustments(character_id):
    adjustments, message = clean_adjustments((json_body() or {}).get('adjustments'))
    if message:
        return error(message, 400)
    conn = connect()
    try:
        with conn:
            row = own_character(conn, character_id)
            if row is None:
                return error('Character not found', 404)
            sheet = json.loads(row['sheet'])
            sheet.setdefault('play', {})['scoreAdjustments'] = adjustments
            conn.execute(f'UPDATE characters SET sheet = ?, updated_at = {NOW} WHERE id = ?',
                         (sheet_json(sheet), character_id))
            result = check_character(conn, row, sheet)
    finally:
        conn.close()
    return jsonify({'scoreAdjustments': adjustments,
                    'abilities': sheet_abilities(result['summary'], sheet) if result else None}), 200

# Body: the wizard's draft (name, species, ..., details). Saves an edit of the character,
# checked against its campaign as it is now, at the character's level. Refused unless
# everything fits, so a flagged character keeps its old sheet until it's fully fixed.
@bp.put('/characters/<character_id>')
@require_login
def update_character(character_id):
    draft = json_body() or {}
    conn = connect()
    try:
        with conn:
            row = own_character(conn, character_id)
            if row is None:
                return error('Character not found', 404)
            sheet = json.loads(row['sheet'])
            setting, rolls = character_setting(conn, row, sheet).for_draft(draft), sheet_rolls(sheet)
            result = check_draft(draft, setting, rolls)
            if result['errors']:
                return jsonify({'error': result['errors'][0]['message'], 'errors': result['errors']}), 400
            # Keys the wizard doesn't manage (anything added later in play) are kept.
            # The wizard owns build: replaced whole. rolls and play are kept as they are.
            old_build = sheet.get('build') or {}
            sheet['build'] = build_from_draft(draft, setting, old_build)
            name = clean_name(draft['name'])
            # An approved character stays approved, but the GM hears about changed picks.
            if row['status'] == 'approved' and row['campaign_id'] is not None \
                    and approval_required(conn, row['campaign_id']):
                changes = build_changes(old_build, sheet['build'])
                if changes:
                    conn.execute(
                        'INSERT INTO character_changes (id, campaign_id, character_id, changes) VALUES (?, ?, ?, ?)',
                        (str(uuid.uuid4()), row['campaign_id'], character_id, json.dumps(changes)),
                    )
            conn.execute(f'UPDATE characters SET name = ?, sheet = ?, updated_at = {NOW} WHERE id = ?',
                         (name, sheet_json(sheet), character_id))
    finally:
        conn.close()
    return jsonify({'id': character_id, 'name': name}), 200

# Rolls ability scores for a character switching to the roll method while being edited.
# Like a draft's: once in a campaign (a character that has rolls keeps them), again in the sandbox.
@bp.post('/characters/<character_id>/roll')
@require_login
@limit('ability-roll', 60, 60 * 60)
def roll_character_abilities(character_id):
    conn = connect()
    try:
        with conn:
            row = own_character(conn, character_id)
            if row is None:
                return error('Character not found', 404)
            sheet = json.loads(row['sheet'])
            if sheet_rolls(sheet) and row['campaign_id'] is not None:
                return error('You’ve already rolled for this character.', 409)
            sheet['rolls'] = roll_scores()
            conn.execute(f'UPDATE characters SET sheet = ?, updated_at = {NOW} WHERE id = ?',
                         (sheet_json(sheet), character_id))
    finally:
        conn.close()
    return jsonify({'rolls': sheet['rolls']}), 200

@bp.get('/characters/<character_id>/portrait')
@require_login
def get_portrait(character_id):
    conn = connect()
    try:
        image = own_character(conn, character_id) and conn.execute(
            'SELECT image FROM character_portraits WHERE character_id = ?', (character_id,)
        ).fetchone()
    finally:
        conn.close()
    if not image:
        return error('No portrait', 404)
    response = Response(image['image'], mimetype='image/webp')
    # The page asks with ?v=<portraitVersion>, so a new portrait is a new URL and this can be kept.
    response.headers['Cache-Control'] = 'private, max-age=86400'
    return response

# Body: the image file itself (PNG, JPEG or WebP, up to 200 KB). Stored re-encoded as a
# 256x256 WebP, replacing any earlier portrait.
@bp.put('/characters/<character_id>/portrait')
@require_login
@limit('portrait-upload', 30, 60 * 60)
def put_portrait(character_id):
    if (request.content_length or 0) > portraits.MAX_UPLOAD_BYTES:
        return error(f'The image is too large (over {portraits.MAX_UPLOAD_BYTES // 1000} KB).', 413)
    try:
        image = portraits.normalise(request.get_data(cache=False))
    except portraits.PortraitError as e:
        return error(str(e), 400)
    conn = connect()
    try:
        with conn:
            if own_character(conn, character_id) is None:
                return error('Character not found', 404)
            conn.execute(
                f'INSERT INTO character_portraits (character_id, image) VALUES (?, ?) '
                f'ON CONFLICT (character_id) DO UPDATE SET image = excluded.image, updated_at = {NOW}',
                (character_id, image),
            )
            version = conn.execute(
                'SELECT updated_at FROM character_portraits WHERE character_id = ?', (character_id,)
            ).fetchone()[0]
    finally:
        conn.close()
    return jsonify({'portraitVersion': version}), 200

@bp.delete('/characters/<character_id>/portrait')
@require_login
def delete_portrait(character_id):
    conn = connect()
    try:
        with conn:
            if own_character(conn, character_id) is None:
                return error('Character not found', 404)
            conn.execute('DELETE FROM character_portraits WHERE character_id = ?', (character_id,))
    finally:
        conn.close()
    return jsonify({'portraitVersion': None}), 200

# Body: {confirm}, which must be the character's name, checked here as well as in the dialog.
# Deletes the character and its portrait for good. If it was its owner's active character in
# a campaign, their newest remaining approved character there becomes active instead.
@bp.delete('/characters/<character_id>')
@require_login
@limit('character-delete', 30, 60 * 60)
def delete_character(character_id):
    content = json_body()
    confirm = content.get('confirm') if content else None
    conn = connect()
    try:
        with conn:
            row = own_character(conn, character_id)
            if row is None:
                return error('Character not found', 404)
            if confirm != row['name']:
                return error('The confirmation text doesn’t match the character’s name.', 400)
            conn.execute('DELETE FROM characters WHERE id = ?', (character_id,))
            if row['is_active'] and row['campaign_id'] is not None:
                conn.execute(
                    'UPDATE characters SET is_active = 1 WHERE id = ('
                    '  SELECT id FROM characters WHERE campaign_id = ? AND owner_id = ? AND deleted_at IS NULL'
                    "  AND status = 'approved' ORDER BY created_at DESC LIMIT 1)",
                    (row['campaign_id'], row['owner_id']),
                )
    finally:
        conn.close()
    return jsonify({'success': True}), 200

# Whether the campaign's GM must approve new characters (its characterApproval rule).
def approval_required(conn, campaign_id):
    row = conn.execute('SELECT settings FROM campaigns WHERE id = ?', (campaign_id,)).fetchone()
    rules = json.loads(row['settings']).get('rules', {}) if row else {}
    return with_rule_defaults(rules)['characterApproval']

# Makes a newly approved campaign character its owner's active one there if they have none
# yet, so a player's first playable character is the one they play. Returns whether it did.
def activate_if_first(conn, row):
    has_active = conn.execute(
        'SELECT 1 FROM characters WHERE campaign_id = ? AND owner_id = ? AND is_active = 1 AND deleted_at IS NULL',
        (row['campaign_id'], row['owner_id']),
    ).fetchone()
    if has_active:
        return False
    conn.execute('UPDATE characters SET is_active = 1 WHERE id = ?', (row['id'],))
    return True

# Finishes creating a campaign character, or sends a rejected one back after editing. With
# the campaign's characterApproval on it becomes pending until reviewed; otherwise it's
# approved straight away (and active, if it's the owner's first). Returns {status, isActive}.
# A pending or approved character can't be submitted again (409).
@bp.post('/characters/<character_id>/submit')
@require_login
def submit_character(character_id):
    conn = connect()
    try:
        with conn:
            row = own_character(conn, character_id)
            if row is None:
                return error('Character not found', 404)
            if row['campaign_id'] is None:
                return error('Character Sandbox characters don’t need approval.', 409)
            if row['status'] not in ('draft', 'rejected'):
                return error('This character has already been submitted.', 409)
            if character_problems(conn, row):
                return error('Fix this character’s problems before submitting it.', 409)
            status = 'pending' if approval_required(conn, row['campaign_id']) else 'approved'
            conn.execute(f'UPDATE characters SET status = ?, review_reason = NULL, updated_at = {NOW} WHERE id = ?',
                         (status, character_id))
            active = status == 'approved' and activate_if_first(conn, row)
    finally:
        conn.close()
    return jsonify({'status': status, 'isActive': active}), 200

REVIEW_REASON_MAX_LENGTH = 1000

# The build fields the GM approves; changing any of them on an approved character is logged.
REVIEWED_PICKS = ('species', 'background', 'class')
REVIEWED_CHOICES = ('speciesChoices', 'backgroundChoices', 'classChoices')

# What changed between two builds in the picks the GM approved: [{field, from, to}]. field is
# 'species', 'background', 'class', 'abilityScores', or '<choices key>:<choice id>' (skills,
# subclass, feats...). Only picks the old build had count: a choice made for the first time,
# as on levelling up, isn't a change to anything approved.
def build_changes(old, new):
    changes = []
    for field in REVIEWED_PICKS + ('abilityScores',):
        if old.get(field) is not None and old.get(field) != new.get(field):
            changes.append({'field': field, 'from': old.get(field), 'to': new.get(field)})
    for key in REVIEWED_CHOICES:
        before, after = old.get(key) or {}, new.get(key) or {}
        for choice, value in before.items():
            if after.get(choice) != value:
                changes.append({'field': f'{key}:{choice}', 'from': value, 'to': after.get(choice)})
    return changes

# Whether the signed-in user is the campaign's GM, or the admin.
def can_review(conn, campaign_id):
    return is_gm(conn, campaign_id, g.user)

# Body: {decision: 'approve' | 'reject', reason?}. The campaign's GM (or the admin) reviews
# a pending character. Approving makes it playable (and active, if it's the owner's first);
# rejecting sends it back to its owner with the reason, to edit and submit again.
@bp.post('/characters/<character_id>/review')
@require_login
def review_character(character_id):
    content = json_body() or {}
    decision = content.get('decision')
    if decision not in ('approve', 'reject'):
        return error('decision must be "approve" or "reject".', 400)
    reason = content.get('reason')
    if reason is not None and not isinstance(reason, str):
        return error('reason must be text.', 400)
    reason = (reason or '').strip()[:REVIEW_REASON_MAX_LENGTH] or None
    conn = connect()
    try:
        with conn:
            row = conn.execute('SELECT * FROM characters WHERE id = ? AND deleted_at IS NULL',
                               (character_id,)).fetchone()
            if row is None or row['campaign_id'] is None or not can_review(conn, row['campaign_id']):
                return error('Character not found', 404)
            if row['status'] != 'pending':
                return error('This character isn’t waiting for review.', 409)
            status = 'approved' if decision == 'approve' else 'rejected'
            conn.execute(f'UPDATE characters SET status = ?, review_reason = ?, updated_at = {NOW} WHERE id = ?',
                         (status, reason, character_id))
            active = status == 'approved' and activate_if_first(conn, row)
    finally:
        conn.close()
    return jsonify({'status': status, 'reviewReason': reason, 'isActive': active}), 200

# Makes an approved campaign character its owner's active one there, in place of any other.
@bp.post('/characters/<character_id>/activate')
@require_login
def activate_character(character_id):
    conn = connect()
    try:
        with conn:
            row = own_character(conn, character_id)
            if row is None:
                return error('Character not found', 404)
            if row['campaign_id'] is None:
                return error('Character Sandbox characters can’t be active.', 409)
            if row['status'] != 'approved':
                return error('Only an approved character can be made active.', 409)
            # Off first: the unique index allows one active character per player per campaign.
            conn.execute('UPDATE characters SET is_active = 0 WHERE campaign_id = ? AND owner_id = ? AND is_active = 1',
                         (row['campaign_id'], row['owner_id']))
            conn.execute('UPDATE characters SET is_active = 1 WHERE id = ?', (character_id,))
    finally:
        conn.close()
    return jsonify({'isActive': True}), 200

# The campaign's characters waiting for review, oldest submission first: the GM's queue.
@bp.get('/campaigns/<campaign_id>/characters/pending')
@require_member
def pending_characters(campaign_id):
    conn = connect()
    try:
        if not can_review(conn, campaign_id):
            return error('Not found', 404)
        rows = conn.execute(
            'SELECT ch.id, ch.name, ch.updated_at, u.display_name AS owner_name, p.updated_at AS portrait_version '
            'FROM characters ch JOIN users u ON u.id = ch.owner_id '
            'LEFT JOIN character_portraits p ON p.character_id = ch.id '
            "WHERE ch.campaign_id = ? AND ch.status = 'pending' AND ch.deleted_at IS NULL ORDER BY ch.updated_at",
            (campaign_id,),
        ).fetchall()
    finally:
        conn.close()
    return jsonify([{
        'id': r['id'], 'name': r['name'], 'ownerName': r['owner_name'],
        'submittedAt': r['updated_at'], 'portraitVersion': r['portrait_version'],
    } for r in rows]), 200

# The GM's log of changes players made to approved characters in this campaign, newest
# first. ?all=true includes the ones already dismissed (the newest 100).
@bp.get('/campaigns/<campaign_id>/character-changes')
@require_member
def character_changes(campaign_id):
    show_all = request.args.get('all') == 'true'
    conn = connect()
    try:
        if not can_review(conn, campaign_id):
            return error('Not found', 404)
        rows = conn.execute(
            'SELECT x.id, x.character_id, x.changes, x.created_at, x.dismissed_at, ch.name, u.display_name AS owner_name '
            'FROM character_changes x JOIN characters ch ON ch.id = x.character_id JOIN users u ON u.id = ch.owner_id '
            'WHERE x.campaign_id = ?' + ('' if show_all else ' AND x.dismissed_at IS NULL') +
            ' ORDER BY x.created_at DESC LIMIT 100',
            (campaign_id,),
        ).fetchall()
    finally:
        conn.close()
    return jsonify([{
        'id': r['id'], 'characterId': r['character_id'], 'characterName': r['name'], 'ownerName': r['owner_name'],
        'changes': json.loads(r['changes']), 'createdAt': r['created_at'], 'dismissed': r['dismissed_at'] is not None,
    } for r in rows]), 200

# The GM has seen this change; it leaves the log (but stays under ?all=true).
@bp.post('/campaigns/<campaign_id>/character-changes/<change_id>/dismiss')
@require_member
def dismiss_character_change(campaign_id, change_id):
    conn = connect()
    try:
        with conn:
            if not can_review(conn, campaign_id):
                return error('Not found', 404)
            updated = conn.execute(
                f'UPDATE character_changes SET dismissed_at = {NOW} WHERE id = ? AND campaign_id = ? AND dismissed_at IS NULL',
                (change_id, campaign_id),
            ).rowcount
    finally:
        conn.close()
    if not updated:
        return error('Change not found', 404)
    return jsonify({'success': True}), 200
