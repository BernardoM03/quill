import json
import secrets
import uuid

from flask import Blueprint, Response, g, jsonify, request

from server import portraits
from server.access import require_login, require_member
from server.campaign_content import load_allowed
from server.db import connection
from server.helpers import NOW, clean_name, error, is_gm, json_body
from server.ratelimit import limit
from server.records import record_problems
from server.rules import packs
from server.rules.abilities import ability_rules, hp_method, roll_scores
from server.rules.characters import (
    Setting, allowed_backgrounds, allowed_classes, allowed_species, background_detail_for, check_draft, class_detail_for,
    kept_background_choices, kept_class_choices, species_detail,
)
from server.rules.classes import class_summary
from server.rules.details import clean_answers, clean_details
from server.rules.scores import apply_adjustments, clean_adjustments
from server.rules.settings import MAX_LEVEL, with_rule_defaults
from server.rules.state import (
    clean_state_patch, play_state, rest_changes, sheet_features, sheet_spells, sheet_stats, state_limits,
)

bp = Blueprint('characters', __name__)

SHEET_VERSION = 1
REVIEW_REASON_MAX_LENGTH = 1000
DISGUISE_FIELDS = ('name', 'species', 'className')

# Build fields the GM approves; changing any of them on an approved character is logged.
REVIEWED_PICKS = ('species', 'background', 'class')
REVIEWED_CHOICES = ('speciesChoices', 'backgroundChoices', 'classChoices')

# Columns read by both sheet_access and the party list, for character_payload.
CHARACTER_COLUMNS = (
    'ch.*, c.name AS campaign_name, c.settings AS campaign_settings, p.updated_at AS portrait_version, '
    'u.display_name AS owner_name, u.username AS owner_username'
)

class NoCampaign(Exception):
    pass

def _setting_from_campaign_json(conn, campaign_id, settings_json):
    settings = json.loads(settings_json) if settings_json else {}
    return Setting(load_allowed(conn, campaign_id), settings.get('rules', {}), settings.get('questions'))

# The setting a new character is made under, or the Character Sandbox when campaign_id is None.
# Characters belong to memberships, so even the admin must be a member; raises NoCampaign otherwise.
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
    return _setting_from_campaign_json(conn, campaign_id, row['settings'])

# The setting an existing character is checked under: its campaign as it is now, at the character's level.
# Membership isn't checked, because the admin may look at anyone's character.
def character_setting(conn, row, sheet):
    campaign_id = row['campaign_id']
    if campaign_id is None:
        setting = Setting(None, {})
    else:
        campaign = conn.execute('SELECT settings FROM campaigns WHERE id = ?', (campaign_id,)).fetchone()
        setting = _setting_from_campaign_json(conn, campaign_id, campaign['settings'] if campaign else None)
    return setting.for_draft(sheet.get('build') or {}).at_level(sheet.get('level'))

def sheet_rolls(sheet):
    return sheet.get('rolls')

# A saved character in the wizard's draft shape: its build plus its name.
def sheet_draft(row, sheet):
    return {**(sheet.get('build') or {}), 'name': row['name']}

# check_draft's result for the character against its campaign now, or None for a character without a build.
def check_character(conn, row, sheet):
    if not sheet.get('build'):
        return None
    return check_draft(sheet_draft(row, sheet), character_setting(conn, row, sheet), sheet_rolls(sheet))

# What no longer fits the character's campaign, as [{field, message}].
def character_problems(conn, row):
    result = check_character(conn, row, json.loads(row['sheet']))
    return result['errors'] if result else []

def _play(sheet):
    return sheet.get('play') or {}

# Each ability's base, increases and score, plus its current value with temporary effects applied.
def sheet_abilities(summary, sheet):
    return apply_adjustments(summary['abilities'], _play(sheet).get('scoreAdjustments') or [])

# Drops empty picks so a choice with nothing chosen isn't stored.
def without_empty_picks(choices):
    if not isinstance(choices, dict):
        return choices
    return {key: value for key, value in choices.items() if value not in ('', [], None)}

# The stored build for a valid draft, keeping only applicable choices and filling in the campaign's methods.
# previous_build supplies answers to questions the GM no longer asks.
def build_from_draft(draft, setting, previous_build=None):
    return {
        'species': draft['species'],
        'speciesChoices': without_empty_picks(draft.get('speciesChoices') or {}),
        'originRules': setting.origin_rules(),
        'background': draft['background'],
        'backgroundChoices': without_empty_picks(kept_background_choices(draft, setting)),
        'class': draft['class'],
        'classChoices': without_empty_picks(kept_class_choices(draft, setting)),
        'abilityMethod': draft.get('abilityMethod') or ability_rules(setting)['allowedMethods'][0],
        # Base scores as assigned, since increases are derived from the picks when read.
        'abilityScores': draft['abilityScores'],
        'hpMethod': hp_method(draft, setting),
        'hpRolls': draft.get('hpRolls') or [],
        'details': clean_details(draft.get('details')),
        'answers': clean_answers(draft.get('answers'), setting.questions, (previous_build or {}).get('answers')),
    }

def new_sheet(draft, setting, rolls):
    return {'version': SHEET_VERSION, 'level': setting.level, 'build': build_from_draft(draft, setting),
            'rolls': rolls, 'play': {}}

# Every sheet write goes through here, so a sheet that breaks its schema is never stored.
def sheet_json(sheet):
    problems = record_problems('sheet', sheet)
    if problems:
        raise ValueError(f'The sheet doesn’t fit its schema: {problems[0]}')
    return json.dumps(sheet)

def _save_sheet(conn, character_id, sheet):
    conn.execute(f'UPDATE characters SET sheet = ?, updated_at = {NOW} WHERE id = ?',
                 (sheet_json(sheet), character_id))

# Merges play-state changes, dropping maxHpOverride when it is cleared.
def _apply_play_changes(play, changes):
    play.update(changes)
    if play.get('maxHpOverride') is None:
        play.pop('maxHpOverride', None)

def _draft_errors(errors):
    return jsonify({'error': errors[0]['message'], 'errors': errors}), 400

# The ability rolls stored with one of the signed-in player's drafts, or None.
def draft_rolls(conn, draft_id):
    if not isinstance(draft_id, str):
        return None
    row = conn.execute('SELECT rolls FROM character_drafts WHERE id = ? AND owner_id = ?',
                       (draft_id, g.user['id'])).fetchone()
    return json.loads(row['rolls']) if row and row['rolls'] else None

# Reads ?campaign=<id> or ?campaign=sandbox and returns (setting, None) or (None, error response).
def setting_from_query():
    campaign = request.args.get('campaign')
    if not campaign:
        return None, error('Say which campaign, or "sandbox".', 400)
    with connection() as conn:
        try:
            return creation_setting(conn, None if campaign == 'sandbox' else campaign), None
        except NoCampaign:
            return None, error('Campaign not found', 404)

# What the creation wizard may offer for ?campaign=: allowed species and backgrounds in full, and classes in brief.
@bp.get('/characters/options')
@require_login
def get_options():
    setting, problem = setting_from_query()
    if problem:
        return problem
    return jsonify({
        'level': setting.level,
        'species': [species_detail(species, setting) for species in allowed_species(setting)],
        'backgrounds': [background_detail_for(background['id'], setting) for background in allowed_backgrounds(setting)],
        'classes': [class_summary(cls) for cls in allowed_classes(setting)],
        'abilityRules': ability_rules(setting),
        'originRules': setting.origin_rules(),
        # Campaign origin rules are locked, while sandbox players pick their own.
        'rulesLocked': not setting.sandbox,
        # The GM's custom questions, asked on the Details step.
        'questions': setting.questions,
    }), 200

# Every allowed background, under the sandbox player's origin rules from the query (customizeOrigin, originFeat, startingEquipment).
@bp.get('/characters/options/backgrounds')
@require_login
def get_background_options():
    setting, problem = setting_from_query()
    if problem:
        return problem
    args = request.args
    origin_rules = {key: args[key] for key in ('originFeat', 'startingEquipment') if key in args}
    if 'customizeOrigin' in args:
        origin_rules['customizeOrigin'] = args['customizeOrigin'] == 'true'
    setting = setting.for_draft({'originRules': origin_rules})
    return jsonify([background_detail_for(background['id'], setting) for background in allowed_backgrounds(setting)]), 200

# One class in full at the starting level, or at &level=<n> when editing a character.
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
    if class_id not in {cls['id'] for cls in allowed_classes(setting)}:
        return error('Class not found', 404)
    return jsonify(class_detail_for(class_id, setting)), 200

# Checks a draft without saving: {campaignId, draftId, ...picks}, or {characterId, ...picks} to check an edit.
# Returns {errors, taken}, where taken maps each picked skill, tool and language to the choice that took it.
@bp.post('/characters/validate')
@require_login
def validate_character():
    draft = json_body() or {}
    with connection() as conn:
        try:
            if draft.get('characterId'):
                row = own_character(conn, draft['characterId'])
                if row is None:
                    return error('Character not found', 404)
                sheet = json.loads(row['sheet'])
                setting = character_setting(conn, row, sheet).for_draft(draft)
                rolls = sheet_rolls(sheet)
            else:
                setting = creation_setting(conn, draft.get('campaignId'))
                rolls = draft_rolls(conn, draft.get('draftId'))
        except NoCampaign:
            return error('Campaign not found', 404)
    return jsonify(check_draft(draft, setting, rolls)), 200

# Saves a new character from the body, deleting the draft named by draftId.
# Sandbox characters are approved at once, while campaign characters start as 'draft' until submitted.
def create(campaign_id):
    draft = json_body() or {}
    with connection() as conn:
        with conn:
            try:
                setting = creation_setting(conn, campaign_id).for_draft(draft)
            except NoCampaign:
                return error('Only members of this campaign can create characters in it.', 403)
            rolls = draft_rolls(conn, draft.get('draftId'))
            errors = check_draft(draft, setting, rolls)['errors']
            if errors:
                return _draft_errors(errors)
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
    return jsonify({'id': character_id, 'name': name, 'isActive': False, 'status': status}), 201

# A Character Sandbox character, built from all installed content under the default rules.
@bp.post('/sandbox/characters')
@require_login
def create_sandbox_character():
    return create(None)

@bp.post('/campaigns/<campaign_id>/characters')
@require_member
def create_character(campaign_id):
    return create(campaign_id)

# The character if the signed-in user owns it or is the admin, else None.
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

# The campaign's partyVisibility rule, or None for the Character Sandbox.
def party_visibility(settings_json):
    if settings_json is None:
        return None
    return with_rule_defaults(json.loads(settings_json).get('rules'))['partyVisibility']

# 'owner' for the owner or admin, 'gm' for the campaign's GM, else None.
def _privileged_access(owner_id, viewer_role):
    if owner_id == g.user['id'] or g.user['is_admin']:
        return 'owner'
    if viewer_role == 'gm':
        return 'gm'
    return None

# (row, access) for whoever may see the sheet, or (None, None).
# 'owner' can do everything, 'gm' can change play state, and 'party' sees an approved character read-only.
# Party members see sheets only under partyVisibility 'full'; otherwise they get the party list.
def sheet_access(conn, character_id):
    row = conn.execute(
        f'SELECT {CHARACTER_COLUMNS}, m.role AS viewer_role '
        'FROM characters ch JOIN users u ON u.id = ch.owner_id '
        'LEFT JOIN campaigns c ON c.id = ch.campaign_id '
        'LEFT JOIN character_portraits p ON p.character_id = ch.id '
        'LEFT JOIN memberships m ON m.campaign_id = ch.campaign_id AND m.user_id = ? '
        'WHERE ch.id = ? AND ch.deleted_at IS NULL',
        (g.user['id'], character_id),
    ).fetchone()
    if row is None:
        return None, None
    access = _privileged_access(row['owner_id'], row['viewer_role'])
    if access:
        return row, access
    if (row['viewer_role'] == 'player' and row['status'] == 'approved'
            and party_visibility(row['campaign_settings']) == 'full'):
        return row, 'party'
    return None, None

# Species traits, class and subclass features and the origin feat, with limited uses worked out.
def character_features(sheet, result):
    if not result:
        return []
    level = sheet.get('level', 1)
    abilities = sheet_abilities(result['summary'], sheet)
    proficiency_bonus = 2 + (level - 1) // 4
    return sheet_features(sheet.get('build') or {}, level, abilities, proficiency_bonus)

# The sheet's play state and the limits it is checked against.
def character_state(sheet, result):
    build = sheet.get('build') or {}
    hit_points = (result or {}).get('summary', {}).get('hitPoints')
    limits = state_limits(build, sheet.get('level', 1), hit_points['max'] if hit_points else None,
                          character_features(sheet, result))
    return play_state(_play(sheet), limits), limits

@bp.get('/characters/<character_id>')
@require_login
def get_character(character_id):
    with connection() as conn:
        row, access = sheet_access(conn, character_id)
        if row is None:
            return error('Character not found', 404)
        payload = character_payload(conn, row, access)
    return jsonify(payload), 200

def stored_disguise(row):
    return json.loads(row['disguise']) if row['disguise'] else None

# The character as its sheet shows it to this viewer; row must select CHARACTER_COLUMNS.
def character_payload(conn, row, access):
    sheet = json.loads(row['sheet'])
    build = sheet.get('build') or {}
    level = sheet.get('level', 1)
    result = check_character(conn, row, sheet)
    abilities = sheet_abilities(result['summary'], sheet) if result else None
    draft = sheet_draft(row, sheet)
    if access == 'party':
        # Answers to the GM's questions stay between the player and the GM.
        draft.pop('answers', None)
    return {
        'access': access,
        'owner': {'name': row['owner_name'], 'username': row['owner_username']},
        'notes': row['personal_notes'] if access == 'owner' else None,
        # Derived from the build on every read.
        'stats': sheet_stats(build, level, abilities, result['taken']) if result else None,
        'state': character_state(sheet, result)[0],
        'features': character_features(sheet, result),
        'spells': sheet_spells(build),
        'id': row['id'],
        'name': row['name'],
        'isActive': bool(row['is_active']),
        # One of draft, pending, approved or rejected.
        'status': row['status'],
        'reviewReason': row['review_reason'],
        'campaignId': row['campaign_id'],
        'campaignName': row['campaign_name'],
        'portraitVersion': row['portrait_version'],
        # What no longer fits the campaign's current settings.
        'problems': result['errors'] if result else [],
        'draft': draft,
        'rolls': sheet_rolls(sheet),
        'level': level,
        'abilities': abilities,
        'scoreAdjustments': _play(sheet).get('scoreAdjustments') or [],
        'partyVisibility': party_visibility(row['campaign_settings']),
        # The party never learns what the disguise hides.
        'disguise': stored_disguise(row) if access != 'party' else None,
    }

# The character and its access for a sheet change, or an error response when the viewer may not change it.
def _editable_sheet(conn, character_id):
    row, access = sheet_access(conn, character_id)
    if row is None:
        return None, error('Character not found', 404)
    if access == 'party':
        return None, error('Only the character’s player and the GM can change this sheet.', 403)
    return row, None

# Body: only the play-state fields that changed (currentHp, tempHp, spentSlots, conditions, deathSaves, ...).
# Allowed for the owner, admin or GM, and returns the whole play state.
@bp.patch('/characters/<character_id>/state')
@require_login
def patch_state(character_id):
    body = json_body()
    with connection() as conn:
        with conn:
            row, failure = _editable_sheet(conn, character_id)
            if failure:
                return failure
            sheet = json.loads(row['sheet'])
            _, limits = character_state(sheet, check_character(conn, row, sheet))
            play = sheet.setdefault('play', {})
            changes, problem = clean_state_patch(body, play, limits)
            if problem:
                return error(problem, 400)
            _apply_play_changes(play, changes)
            _save_sheet(conn, character_id, sheet)
    return jsonify(play_state(play, limits)), 200

# The optional rest flags from the body, or an error message.
def _rest_options(body):
    options = {}
    for flag in ('applyHealing', 'resetMaxHp'):
        if flag in body:
            if not isinstance(body[flag], bool):
                return None, f'{flag} must be true or false.'
            options[flag] = body[flag]
    if 'hitDiceRecovery' in body:
        if body['hitDiceRecovery'] not in ('all', 'half'):
            return None, 'hitDiceRecovery must be "all" or "half".'
        options['hitDiceRecovery'] = body['hitDiceRecovery']
    return options, None

def _roll_die(sides):
    return secrets.randbelow(sides) + 1

# Body: {type: 'short', hitDice, applyHealing?, resetMaxHp?} or {type: 'long', hitDiceRecovery?, resetMaxHp?}.
# The server rolls the Hit Point Dice and returns {state, rest}.
@bp.post('/characters/<character_id>/rest')
@require_login
@limit('rest', 120, 60 * 60)
def take_rest(character_id):
    body = json_body() or {}
    rest_type = body.get('type')
    if rest_type not in ('short', 'long'):
        return error('type must be "short" or "long".', 400)
    hit_dice = body.get('hitDice', 0) if rest_type == 'short' else 0
    if not isinstance(hit_dice, int) or isinstance(hit_dice, bool) or not 0 <= hit_dice <= MAX_LEVEL:
        return error(f'hitDice must be from 0 to {MAX_LEVEL}.', 400)
    options, problem = _rest_options(body)
    if problem:
        return error(problem, 400)
    with connection() as conn:
        with conn:
            row, failure = _editable_sheet(conn, character_id)
            if failure:
                return failure
            sheet = json.loads(row['sheet'])
            result = check_character(conn, row, sheet)
            current_state, limits = character_state(sheet, result)
            # Both rest rules require at least 1 Hit Point to start.
            if current_state['currentHp'] == 0:
                return error('A character needs at least 1 Hit Point to start a rest.', 409)
            abilities = sheet_abilities(result['summary'], sheet) if result else {}
            con_modifier = (abilities.get('CON') or {}).get('currentModifier')
            character_class = packs.collection('classes').get((sheet.get('build') or {}).get('class') or '')
            play = sheet.setdefault('play', {})
            changes, rest = rest_changes(rest_type, hit_dice, play, limits, (character_class or {}).get('hitDie'),
                                         con_modifier, _roll_die, options)
            _apply_play_changes(play, changes)
            _save_sheet(conn, character_id, sheet)
    return jsonify({'state': play_state(play, limits), 'rest': rest}), 200

# Body: {adjustments: [{id, name, ability, mode, value}]}, replacing the temporary ability effects.
@bp.put('/characters/<character_id>/adjustments')
@require_login
def put_adjustments(character_id):
    adjustments, problem = clean_adjustments((json_body() or {}).get('adjustments'))
    if problem:
        return error(problem, 400)
    with connection() as conn:
        with conn:
            row = own_character(conn, character_id)
            if row is None:
                return error('Character not found', 404)
            sheet = json.loads(row['sheet'])
            sheet.setdefault('play', {})['scoreAdjustments'] = adjustments
            _save_sheet(conn, character_id, sheet)
            result = check_character(conn, row, sheet)
    return jsonify({'scoreAdjustments': adjustments,
                    'abilities': sheet_abilities(result['summary'], sheet) if result else None}), 200

# Whether the campaign's GM must approve characters (its characterApproval rule).
def approval_required(conn, campaign_id):
    row = conn.execute('SELECT settings FROM campaigns WHERE id = ?', (campaign_id,)).fetchone()
    rules = json.loads(row['settings']).get('rules', {}) if row else {}
    return with_rule_defaults(rules)['characterApproval']

# Changes to picks the GM approved, as [{field, from, to}].
# Only picks the old build had count, so a choice made for the first time (as on levelling up) isn't a change.
def build_changes(old_build, new_build):
    changes = []
    for field in REVIEWED_PICKS + ('abilityScores',):
        if old_build.get(field) is not None and old_build.get(field) != new_build.get(field):
            changes.append({'field': field, 'from': old_build.get(field), 'to': new_build.get(field)})
    for key in REVIEWED_CHOICES:
        before, after = old_build.get(key) or {}, new_build.get(key) or {}
        for choice_id, value in before.items():
            if after.get(choice_id) != value:
                changes.append({'field': f'{key}:{choice_id}', 'from': value, 'to': after.get(choice_id)})
    return changes

def _log_approved_changes(conn, row, old_build, new_build):
    changes = build_changes(old_build, new_build)
    if changes:
        conn.execute(
            'INSERT INTO character_changes (id, campaign_id, character_id, changes) VALUES (?, ?, ?, ?)',
            (str(uuid.uuid4()), row['campaign_id'], row['id'], json.dumps(changes)),
        )

# Body: the wizard's draft; saves an edit checked against the campaign as it is now.
# Refused unless everything fits, so a flagged character keeps its old sheet until fully fixed.
@bp.put('/characters/<character_id>')
@require_login
def update_character(character_id):
    draft = json_body() or {}
    with connection() as conn:
        with conn:
            row = own_character(conn, character_id)
            if row is None:
                return error('Character not found', 404)
            sheet = json.loads(row['sheet'])
            setting = character_setting(conn, row, sheet).for_draft(draft)
            errors = check_draft(draft, setting, sheet_rolls(sheet))['errors']
            if errors:
                return _draft_errors(errors)
            # The wizard owns the build, while rolls, play and any other keys are kept.
            old_build = sheet.get('build') or {}
            sheet['build'] = build_from_draft(draft, setting, old_build)
            name = clean_name(draft['name'])
            # An approved character stays approved, but the GM is told about changed picks.
            if (row['status'] == 'approved' and row['campaign_id'] is not None
                    and approval_required(conn, row['campaign_id'])):
                _log_approved_changes(conn, row, old_build, sheet['build'])
            conn.execute(f'UPDATE characters SET name = ?, sheet = ?, updated_at = {NOW} WHERE id = ?',
                         (name, sheet_json(sheet), character_id))
    return jsonify({'id': character_id, 'name': name}), 200

# Rolls scores for a character switching to the roll method; campaigns allow one roll, the sandbox allows rerolls.
@bp.post('/characters/<character_id>/roll')
@require_login
@limit('ability-roll', 60, 60 * 60)
def roll_character_abilities(character_id):
    with connection() as conn:
        with conn:
            row = own_character(conn, character_id)
            if row is None:
                return error('Character not found', 404)
            sheet = json.loads(row['sheet'])
            if sheet_rolls(sheet) and row['campaign_id'] is not None:
                return error('You’ve already rolled for this character.', 409)
            sheet['rolls'] = roll_scores()
            _save_sheet(conn, character_id, sheet)
    return jsonify({'rolls': sheet['rolls']}), 200

@bp.get('/characters/<character_id>/portrait')
@require_login
def get_portrait(character_id):
    with connection() as conn:
        portrait = None
        if sheet_access(conn, character_id)[0]:
            portrait = conn.execute(
                'SELECT image FROM character_portraits WHERE character_id = ?', (character_id,)
            ).fetchone()
    if not portrait:
        return error('No portrait', 404)
    response = Response(portrait['image'], mimetype='image/webp')
    # The page requests ?v=<portraitVersion>, so a new portrait gets a new URL and this can be cached.
    response.headers['Cache-Control'] = 'private, max-age=86400'
    return response

# Body: the raw image file, stored re-encoded as a 256x256 WebP that replaces any earlier portrait.
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
    with connection() as conn:
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
    return jsonify({'portraitVersion': version}), 200

@bp.delete('/characters/<character_id>/portrait')
@require_login
def delete_portrait(character_id):
    with connection() as conn:
        with conn:
            if own_character(conn, character_id) is None:
                return error('Character not found', 404)
            conn.execute('DELETE FROM character_portraits WHERE character_id = ?', (character_id,))
    return jsonify({'portraitVersion': None}), 200

# Body: {confirm}, which must equal the character's name.
# Deleting the active campaign character activates the owner's newest remaining approved one there.
@bp.delete('/characters/<character_id>')
@require_login
@limit('character-delete', 30, 60 * 60)
def delete_character(character_id):
    confirm = (json_body() or {}).get('confirm')
    with connection() as conn:
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
    return jsonify({'success': True}), 200

# Activates a newly approved character if its owner has no active one in the campaign, and returns whether it did.
def activate_if_first(conn, row):
    has_active = conn.execute(
        'SELECT 1 FROM characters WHERE campaign_id = ? AND owner_id = ? AND is_active = 1 AND deleted_at IS NULL',
        (row['campaign_id'], row['owner_id']),
    ).fetchone()
    if has_active:
        return False
    conn.execute('UPDATE characters SET is_active = 1 WHERE id = ?', (row['id'],))
    return True

# Submits a draft or rejected campaign character, which becomes pending or approved per characterApproval.
@bp.post('/characters/<character_id>/submit')
@require_login
def submit_character(character_id):
    with connection() as conn:
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
            is_active = status == 'approved' and activate_if_first(conn, row)
    return jsonify({'status': status, 'isActive': is_active}), 200

# Whether the signed-in user is the campaign's GM or the admin.
def can_review(conn, campaign_id):
    return is_gm(conn, campaign_id, g.user)

# Body: {decision: 'approve' | 'reject', reason?}.
# Rejecting sends the character back to its owner with the reason, to edit and submit again.
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
    with connection() as conn:
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
            is_active = status == 'approved' and activate_if_first(conn, row)
    return jsonify({'status': status, 'reviewReason': reason, 'isActive': is_active}), 200

# Makes an approved campaign character its owner's active one there, replacing any other.
@bp.post('/characters/<character_id>/activate')
@require_login
def activate_character(character_id):
    with connection() as conn:
        with conn:
            row = own_character(conn, character_id)
            if row is None:
                return error('Character not found', 404)
            if row['campaign_id'] is None:
                return error('Character Sandbox characters can’t be active.', 409)
            if row['status'] != 'approved':
                return error('Only an approved character can be made active.', 409)
            # Deactivate first, because a unique index allows one active character per player per campaign.
            conn.execute('UPDATE characters SET is_active = 0 WHERE campaign_id = ? AND owner_id = ? AND is_active = 1',
                         (row['campaign_id'], row['owner_id']))
            conn.execute('UPDATE characters SET is_active = 1 WHERE id = ?', (character_id,))
    return jsonify({'isActive': True}), 200

# The GM's review queue, oldest submission first.
@bp.get('/campaigns/<campaign_id>/characters/pending')
@require_member
def pending_characters(campaign_id):
    with connection() as conn:
        if not can_review(conn, campaign_id):
            return error('Not found', 404)
        rows = conn.execute(
            'SELECT ch.id, ch.name, ch.updated_at, u.display_name AS owner_name, p.updated_at AS portrait_version '
            'FROM characters ch JOIN users u ON u.id = ch.owner_id '
            'LEFT JOIN character_portraits p ON p.character_id = ch.id '
            "WHERE ch.campaign_id = ? AND ch.status = 'pending' AND ch.deleted_at IS NULL ORDER BY ch.updated_at",
            (campaign_id,),
        ).fetchall()
    return jsonify([{
        'id': row['id'], 'name': row['name'], 'ownerName': row['owner_name'],
        'submittedAt': row['updated_at'], 'portraitVersion': row['portrait_version'],
    } for row in rows]), 200

# The GM's log of player changes to approved characters, newest first.
# ?all=true includes dismissed entries, capped at the newest 100.
@bp.get('/campaigns/<campaign_id>/character-changes')
@require_member
def character_changes(campaign_id):
    show_all = request.args.get('all') == 'true'
    dismissed_filter = '' if show_all else ' AND x.dismissed_at IS NULL'
    with connection() as conn:
        if not can_review(conn, campaign_id):
            return error('Not found', 404)
        rows = conn.execute(
            'SELECT x.id, x.character_id, x.changes, x.created_at, x.dismissed_at, ch.name, u.display_name AS owner_name '
            'FROM character_changes x JOIN characters ch ON ch.id = x.character_id JOIN users u ON u.id = ch.owner_id '
            'WHERE x.campaign_id = ?' + dismissed_filter + ' ORDER BY x.created_at DESC LIMIT 100',
            (campaign_id,),
        ).fetchall()
    return jsonify([{
        'id': row['id'], 'characterId': row['character_id'], 'characterName': row['name'],
        'ownerName': row['owner_name'], 'changes': json.loads(row['changes']), 'createdAt': row['created_at'],
        'dismissed': row['dismissed_at'] is not None,
    } for row in rows]), 200

# Hides a change from the GM's log while keeping it under ?all=true.
@bp.post('/campaigns/<campaign_id>/character-changes/<change_id>/dismiss')
@require_member
def dismiss_character_change(campaign_id, change_id):
    with connection() as conn:
        with conn:
            if not can_review(conn, campaign_id):
                return error('Not found', 404)
            updated_count = conn.execute(
                f'UPDATE character_changes SET dismissed_at = {NOW} WHERE id = ? AND campaign_id = ? AND dismissed_at IS NULL',
                (change_id, campaign_id),
            ).rowcount
    if not updated_count:
        return error('Change not found', 404)
    return jsonify({'success': True}), 200

# Body: {name, species, className}, where blank or null shows the real value.
# The party sees this under partyVisibility 'misleading', but it can be set ahead of time.
@bp.put('/characters/<character_id>/disguise')
@require_login
def put_disguise(character_id):
    content = json_body()
    if content is None or set(content) - set(DISGUISE_FIELDS):
        return error(f'Body must be an object with any of {", ".join(DISGUISE_FIELDS)}.', 400)
    disguise = {}
    for field in DISGUISE_FIELDS:
        value = content.get(field)
        if value is None or (isinstance(value, str) and not value.strip()):
            continue
        cleaned = clean_name(value)
        if cleaned is None:
            return error(f'{field} must be up to 64 characters, without control characters.', 400)
        disguise[field] = cleaned
    with connection() as conn:
        with conn:
            row = own_character(conn, character_id)
            if row is None:
                return error('Character not found', 404)
            if row['campaign_id'] is None:
                return error('Character Sandbox characters have no party to mislead.', 409)
            conn.execute(f'UPDATE characters SET disguise = ?, updated_at = {NOW} WHERE id = ?',
                         (json.dumps(disguise) if disguise else None, character_id))
    return jsonify({'disguise': disguise or None}), 200

def _entry_name(collection, entry_id):
    entry = packs.collection(collection).get(entry_id) if entry_id else None
    return entry['name'] if entry else None

# The party list's view of a character, which is what partyVisibility 'limited' shows.
def party_summary(payload):
    build = payload['draft']
    state = payload['state']
    return {
        'id': payload['id'],
        'name': payload['name'],
        'species': _entry_name('species', build.get('species')),
        'className': _entry_name('classes', build.get('class')),
        'level': payload['level'],
        'hitPoints': {'current': state['currentHp'], 'max': state['maxHp'], 'temp': state['tempHp']},
        # Names rather than pack ids, so the list needn't load the conditions collection.
        'conditions': [_entry_name('conditions', condition) or condition for condition in state['conditions']],
        'exhaustion': state['exhaustion'],
    }

# One active character as this viewer may see it in the party list.
def _party_character(conn, row, viewer_role, visibility):
    access = _privileged_access(row['owner_id'], viewer_role) or 'party'
    payload = character_payload(conn, row, access)
    character = party_summary(payload)
    hidden_from_viewer = access == 'party' and visibility != 'full'
    character['portraitVersion'] = None if hidden_from_viewer else payload['portraitVersion']
    character['sheet'] = None if hidden_from_viewer else payload
    character['disguise'] = None
    if visibility == 'misleading':
        disguise = stored_disguise(row) or {}
        if access == 'party':
            # The party sees the disguised fields in place of the real ones.
            character.update(disguise)
        else:
            character['disguise'] = disguise or None
    return character

# The campaign's members, GM first, each with their active character as this viewer may see it.
# sheet is the full character when the viewer may open it, and portraits are hidden from the party unless visibility is 'full'.
@bp.get('/campaigns/<campaign_id>/party')
@require_member
def get_party(campaign_id):
    with connection() as conn:
        campaign = conn.execute('SELECT settings FROM campaigns WHERE id = ?', (campaign_id,)).fetchone()
        if campaign is None:
            return error('Campaign not found', 404)
        visibility = party_visibility(campaign['settings'])
        viewer = conn.execute('SELECT role FROM memberships WHERE campaign_id = ? AND user_id = ?',
                              (campaign_id, g.user['id'])).fetchone()
        viewer_role = viewer['role'] if viewer else None
        members = conn.execute(
            'SELECT u.id, u.display_name, m.role FROM memberships m JOIN users u ON u.id = m.user_id '
            "WHERE m.campaign_id = ? ORDER BY m.role = 'gm' DESC, m.joined_at",
            (campaign_id,),
        ).fetchall()
        active_by_owner = {row['owner_id']: row for row in conn.execute(
            f'SELECT {CHARACTER_COLUMNS} FROM characters ch JOIN users u ON u.id = ch.owner_id '
            'JOIN campaigns c ON c.id = ch.campaign_id '
            'LEFT JOIN character_portraits p ON p.character_id = ch.id '
            'WHERE ch.campaign_id = ? AND ch.is_active = 1 AND ch.deleted_at IS NULL',
            (campaign_id,),
        )}
        party = []
        for member in members:
            active_row = active_by_owner.get(member['id'])
            party.append({
                'userId': member['id'],
                'playerName': member['display_name'],
                'role': member['role'],
                'character': _party_character(conn, active_row, viewer_role, visibility) if active_row else None,
            })
        my_characters = conn.execute(
            'SELECT ch.id, ch.name, ch.status, ch.is_active, p.updated_at AS portrait_version '
            'FROM characters ch LEFT JOIN character_portraits p ON p.character_id = ch.id '
            'WHERE ch.campaign_id = ? AND ch.owner_id = ? AND ch.deleted_at IS NULL ORDER BY ch.created_at',
            (campaign_id, g.user['id']),
        ).fetchall()
    return jsonify({
        'visibility': visibility,
        'members': party,
        'myCharacters': [{
            'id': row['id'], 'name': row['name'], 'status': row['status'],
            'isActive': bool(row['is_active']), 'portraitVersion': row['portrait_version'],
        } for row in my_characters],
    }), 200
