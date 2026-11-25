import re

from server.rules import packs
from server.rules.choices import ABILITY_NAMES
from server.rules.classes import column_value, proficiency_names, scaling_value
from server.rules.common import is_whole_number

# The sheet at the table: stats derived from the build, and play state that changes during a session.
# Play state lives in the sheet's play part (sheet.schema.json $defs.play), and nothing derived is stored.

EXHAUSTION_ID = 'srd-5.2:condition/exhaustion'
HP_LIMIT = 999
MAX_CONDITIONS = 30
MAX_EXHAUSTION = 6
MAX_DEATH_SAVES = 3
CHOICE_PREFIX = '$choice:'
COLUMN_PREFIX = '$column:'
DERIVED_PREFIX = '$derived:'
LEVEL_DERIVED_NAMES = ('classLevel', 'characterLevel', 'level')
SPEED_ORDER = ('walk', 'fly', 'swim', 'climb', 'burrow')
PICK_KEYS = ('speciesChoices', 'backgroundChoices', 'classChoices')
EMPTY_DEATH_SAVES = {'successes': 0, 'failures': 0}

STATE_FIELDS = ('currentHp', 'maxHpOverride', 'tempHp', 'spentSlots', 'spentPactSlots', 'conditions',
                'exhaustion', 'spentHitDice', 'deathSaves', 'featureUses')

# Short unit labels for the sheet's spell list.
_UNIT_LABELS = {'minute': 'min', 'hour': 'hr', 'day': 'day', 'round': 'rnd', 'feet': 'ft', 'miles': 'mi'}
_CASTING_TIME_LABELS = {'action': '1A', 'bonusAction': '1BA', 'reaction': '1R', 'special': 'Special'}
_RANGE_LABELS = {'self': 'Self', 'touch': 'Touch', 'sight': 'Sight', 'unlimited': 'Unlimited', 'special': 'Special'}
_DURATION_LABELS = {'instantaneous': 'Instantaneous', 'untilDispelled': 'Until dispelled', 'special': 'Special'}

def _lookup(collection, entry_id):
    return packs.collection(collection).get(entry_id) if isinstance(entry_id, str) else None

def _subclass_of(build):
    return _lookup('subclasses', (build.get('classChoices') or {}).get('subclass'))

# The current modifier (with temporary effects) if known, else the plain modifier.
def _ability_mod(abilities, code):
    ability = (abilities or {}).get(code) or {}
    return ability.get('currentModifier') if ability.get('currentModifier') is not None else ability.get('modifier')

# The sum, or None if any part is unknown.
def _sum_if_known(*parts):
    return None if any(part is None for part in parts) else sum(parts)

def _default_proficiency_bonus(level):
    return 2 + (level - 1) // 4

# The class's spell slots at this level as ({"1": count, ...}, pact slots {count, slotLevel} or None).
def slot_limits(cls, level):
    if not cls:
        return {}, None
    table = column_value(cls, 'spellSlots', level) or []
    slots = {str(index + 1): count for index, count in enumerate(table) if isinstance(count, int) and count > 0}
    pact = column_value(cls, 'pactSlots', level)
    return slots, (pact if isinstance(pact, dict) and pact.get('count') else None)

# The sheet's numbers derived from the build.
# abilities include temporary effects, and taken is check_draft's {option key: field} holding every proficiency.
def sheet_stats(build, level, abilities, taken):
    cls = _lookup('classes', build.get('class'))
    species = _lookup('species', build.get('species'))
    proficiency = column_value(cls, 'proficiencyBonus', level) if cls else None
    proficiency = proficiency if isinstance(proficiency, int) else _default_proficiency_bonus(level)

    save_proficiencies = set((cls or {}).get('savingThrowProficiencies') or [])
    saves = [{'ability': code, 'proficient': code in save_proficiencies,
              'modifier': _sum_if_known(_ability_mod(abilities, code), proficiency if code in save_proficiencies else 0)}
             for code in ABILITY_NAMES]

    proficient_skills = {key for key in (taken or {}) if ':skill/' in key}
    skills = []
    for skill_id, skill in sorted(packs.collection('skills').items(), key=lambda item: item[1]['name']):
        proficient = skill_id in proficient_skills
        skills.append({'id': skill_id, 'name': skill['name'], 'ability': skill['ability'], 'proficient': proficient,
                       'modifier': _sum_if_known(_ability_mod(abilities, skill['ability']), proficiency if proficient else 0)})
    skills_by_name = {skill['name']: skill for skill in skills}

    def passive(skill_name):
        skill = skills_by_name.get(skill_name)
        return _sum_if_known(10, skill['modifier']) if skill and skill['modifier'] is not None else None

    casting = (cls or {}).get('spellcasting')
    spellcasting = None
    if casting and casting.get('ability'):
        casting_mod = _ability_mod(abilities, casting['ability'])
        spellcasting = {'ability': casting['ability'], 'saveDc': _sum_if_known(8, proficiency, casting_mod),
                        'attackBonus': _sum_if_known(proficiency, casting_mod)}

    dex_mod = _ability_mod(abilities, 'DEX')
    subclass = _subclass_of(build)
    background = _lookup('origins', build.get('background'))
    class_tools = set(proficiency_names((cls or {}).get('toolProficiencies')))
    return {
        'identity': {
            'species': (species or {}).get('name'),
            'class': (cls or {}).get('name'),
            'subclass': (subclass or {}).get('name'),
            'background': (background or {}).get('name'),
        },
        'senses': {
            'passivePerception': passive('Perception'),
            'passiveInsight': passive('Insight'),
            'passiveInvestigation': passive('Investigation'),
            'darkvision': _darkvision(species),
        },
        'proficiencies': {
            'armor': proficiency_names((cls or {}).get('armorProficiencies')),
            'weapons': proficiency_names((cls or {}).get('weaponProficiencies')),
            'tools': sorted(_taken_names('tools', taken, ':tool/') | class_tools),
            'languages': sorted(_taken_names('languages', taken, ':language/')),
        },
        'proficiencyBonus': proficiency,
        'initiative': dex_mod,
        # Unarmored, because worn armor and shields aren't tracked yet.
        'armorClass': _sum_if_known(10, dex_mod),
        'speed': (species or {}).get('speed'),
        'speeds': speeds(species, cls, subclass, level),
        'defenses': defenses(build, species, cls, subclass, level),
        'passivePerception': passive('Perception'),
        'savingThrows': saves,
        'skills': skills,
        'spellcasting': spellcasting,
        'hitDie': (cls or {}).get('hitDie'),
    }

def _derived_value(name, level, abilities, proficiency):
    if name in LEVEL_DERIVED_NAMES:
        return level
    if name == 'proficiencyBonus':
        return proficiency
    return _ability_mod(abilities, name)

# How many times a limited-use feature can be used, or None when it can't be worked out.
# "max" is a number, a class table column, the feature's scaling, or a derived value, then multiplied and floored at minimum.
def use_max(uses, feature, cls, level, abilities, proficiency):
    raw_max = uses.get('max')
    if isinstance(raw_max, int):
        value = raw_max
    elif raw_max == '$scaling':
        value = scaling_value(feature, level)
    elif isinstance(raw_max, str) and raw_max.startswith(COLUMN_PREFIX):
        value = column_value(cls, raw_max[len(COLUMN_PREFIX):], level) if cls else None
    elif isinstance(raw_max, str) and raw_max.startswith(DERIVED_PREFIX):
        value = _derived_value(raw_max[len(DERIVED_PREFIX):], level, abilities, proficiency)
    else:
        value = None
    if not isinstance(value, int):
        return None
    value *= uses.get('multiplier', 1)
    return max(value, uses.get('minimum', 0))

def _feature_text(feature):
    if feature.get('description'):
        return feature['description']
    return '\n\n'.join(f"**{group['name']}.** {group.get('description', '')}" if group.get('name') else group.get('description', '')
                       for group in feature.get('effectGroups') or [])

def _origin_feat(build):
    feats = packs.collection('feats')
    origin = _lookup('origins', build.get('background'))
    picked_feat_id = (build.get('backgroundChoices') or {}).get('originFeat')
    if isinstance(picked_feat_id, str) and picked_feat_id in feats:
        return feats[picked_feat_id]
    return feats.get((origin or {}).get('featId') or '')

def _uses_limit(feature, cls, level, abilities, proficiency):
    uses = feature.get('uses')
    if not uses:
        return None
    max_uses = use_max(uses, feature, cls, level, abilities, proficiency)
    if not max_uses:
        return None
    recover = uses.get('recover') or {}
    return {'max': max_uses, 'recharge': uses.get('recharge'), 'pool': bool(uses.get('pool')),
            'shortRecover': recover.get('amount') if recover.get('rest') == 'short' else None}

# Species traits, class and subclass features and the origin feat for the Features and Actions tabs.
# Each is {id, name, source, level, activation, description, uses}, with uses None unless limited.
def sheet_features(build, level, abilities, proficiency):
    species = _lookup('species', build.get('species'))
    cls = _lookup('classes', build.get('class'))
    subclass = _subclass_of(build)
    feat = _origin_feat(build)

    sourced = [(trait, 'species') for trait in (species or {}).get('traits') or []]
    sourced += [(feature, 'class') for feature in (cls or {}).get('features') or [] if (feature.get('level') or 1) <= level]
    sourced += [(feature, 'subclass') for feature in (subclass or {}).get('features') or [] if (feature.get('level') or 1) <= level]
    if feat:
        sourced.append((feat, 'feat'))

    return [{
        'id': feature['id'], 'name': feature['name'], 'source': source,
        'level': (feature.get('level') or 1) if source in ('class', 'subclass') else None,
        'activation': (feature.get('activation') or {}).get('type') or 'passive',
        'description': _feature_text(feature),
        'uses': _uses_limit(feature, cls, level, abilities, proficiency),
    } for feature, source in sourced]

def _unit_label(unit):
    return _UNIT_LABELS.get(unit, unit or '')

# Short forms such as "1A", "1BA" or "10 min".
def _casting_time(casting_time):
    casting_time = casting_time or {}
    label = _CASTING_TIME_LABELS.get(casting_time.get('type'))
    if label:
        return label
    if not casting_time.get('unit'):
        return None
    return f"{casting_time.get('value', 1)} {_UNIT_LABELS.get(casting_time.get('unit'), casting_time.get('unit', ''))}".strip()

# Short forms such as "90 ft", "Self" or "Touch".
def _range(spell_range):
    spell_range = spell_range or {}
    if spell_range.get('type') == 'ranged':
        return f"{spell_range.get('distance', '?')} {_UNIT_LABELS.get(spell_range.get('unit'), spell_range.get('unit', ''))}".strip()
    return _RANGE_LABELS.get(spell_range.get('type'), spell_range.get('type'))

# Short forms such as "Instantaneous", "1 hr" or "Until dispelled".
def _duration(duration):
    duration = duration or {}
    unit = duration.get('unit')
    if unit in _DURATION_LABELS:
        return _DURATION_LABELS[unit]
    return f"{duration.get('value', 1)} {_unit_label(unit)}".strip() if unit else None

def _spell_view(spell):
    return {'id': spell['id'], 'name': spell['name'], 'level': spell.get('level', 0), 'school': spell.get('school'),
            'castingTime': _casting_time(spell.get('castingTime')), 'range': _range(spell.get('range')),
            'duration': _duration(spell.get('duration')),
            'concentration': bool(spell.get('concentration')), 'ritual': bool(spell.get('ritual')),
            'description': spell.get('shortDescription') or spell.get('description') or ''}

# Spells picked in any wizard choice, ordered by level then name.
def sheet_spells(build):
    spells = packs.collection('spells')
    spell_ids = set()
    for key in PICK_KEYS:
        for value in (build.get(key) or {}).values():
            for pick in value if isinstance(value, list) else [value]:
                if isinstance(pick, str) and pick in spells:
                    spell_ids.add(pick)
    return sorted((_spell_view(spells[spell_id]) for spell_id in spell_ids), key=lambda view: (view['level'], view['name']))

# The species' traits and the class's and subclass's features up to this level.
# Only each feature's own effects count, not those of options it offers (such as an Eldritch Invocation's speed).
def _current_features(species, cls, subclass, level):
    yield from (species or {}).get('traits') or []
    for owner in (cls, subclass):
        for feature in (owner or {}).get('features') or []:
            if (feature.get('level') or 1) <= level:
                yield feature

# A base-speed increase counts unless some qualifier other than "not wearing equipment" limits it.
def _is_unconditional_speed_bonus(effect):
    return (effect.get('type') == 'modifier' and effect.get('target') == 'baseSpeed'
            and isinstance(effect.get('value'), int)
            and all(qualifier.get('type') == 'equipment' and qualifier.get('negate')
                    for qualifier in effect.get('qualifiers') or []))

# An always-on speed beats one that needs a feature active, and then the faster one wins.
def _better_speed(old, new):
    if old is None or (old['condition'] and not new['condition']):
        return True
    return bool(old['condition']) == bool(new['condition']) and new['value'] > old['value']

# The character's speeds as [{type, value, condition}], walking first.
# condition names the feature that must be active (Draconic Flight), or None for an always-on speed.
# Equipment isn't tracked, so increases that only apply outside some armor (Roving) are counted.
def speeds(species, cls, subclass, level):
    features = list(_current_features(species, cls, subclass, level))
    walk = (species or {}).get('speed')
    if walk is None:
        return []
    for feature in features:
        for effect in feature.get('effects') or []:
            if _is_unconditional_speed_bonus(effect):
                walk += effect['value']
    best = {'walk': {'type': 'walk', 'value': walk, 'condition': None}}
    for feature in features:
        for effect in feature.get('effects') or []:
            speed_type = effect.get('target')
            if effect.get('type') != 'grantSpeed' or effect.get('affects') or speed_type not in SPEED_ORDER[1:]:
                continue
            value = walk if effect.get('value') == '$derived:walkingSpeed' else effect.get('value')
            if not isinstance(value, int):
                continue
            needs_state = any(qualifier.get('type') == 'selfState' for qualifier in effect.get('qualifiers') or [])
            speed = {'type': speed_type, 'value': value, 'condition': feature['name'] if needs_state else None}
            if _better_speed(best.get(speed_type), speed):
                best[speed_type] = speed
    return [best[speed_type] for speed_type in SPEED_ORDER if speed_type in best]

# "magicalSleep" becomes "Magical sleep".
def _words(key):
    spaced = ''.join(' ' + char.lower() if char.isupper() else char for char in key).replace('-', ' ')
    return spaced[:1].upper() + spaced[1:]

# The value a "$choice:<id>" target resolves to from the character's pick, or None if not picked.
# The wizard stores the option's label (e.g. "Black" for acid draconic ancestry), so it is mapped back to a value.
def _chosen_value(choice_id, features, build):
    picks = {}
    for key in PICK_KEYS:
        picks.update(build.get(key) or {})
    pick = picks.get(choice_id)
    if isinstance(pick, list):
        pick = pick[0] if pick else None
    if not isinstance(pick, str):
        return None
    for feature in features:
        for choice in feature.get('choices') or []:
            if choice.get('id') != choice_id:
                continue
            for item in choice.get('from') or []:
                if isinstance(item, dict) and pick in (item.get('label'), item.get('name'), item.get('id'), item.get('value')):
                    return item.get('value') or item.get('id')
                if item == pick:
                    return item
    return pick

# A defense target as the sheet shows it: a damage type, a condition or another pack-named thing.
def _defense_name(target, effect):
    if ':condition/' in target:
        return packs.collection('conditions').get(target, {}).get('name', target.split('/')[-1].title())
    if target == 'allDamage':
        excluded = [damage_type for qualifier in effect.get('qualifiers') or []
                    if qualifier.get('type') == 'damageType' and qualifier.get('negate')
                    for damage_type in qualifier.get('damageTypes') or []]
        return 'All damage' + (f' except {", ".join(_words(damage_type) for damage_type in excluded)}' if excluded else '')
    return _words(str(target))

# The character's {resistances, immunities}, each [{name, condition}] where condition names a required active feature.
# Defenses given to others (auras), triggered ones and unmade choices are left out.
def defenses(build, species, cls, subclass, level):
    features = list(_current_features(species, cls, subclass, level))
    feature_names = {feature.get('id'): feature.get('name') for feature in features}
    found = {'grantResistance': {}, 'grantImmunity': {}}
    for feature in features:
        for effect in feature.get('effects') or []:
            effect_type = effect.get('type')
            if effect_type not in found or effect.get('affects') or effect.get('trigger'):
                continue
            target = effect.get('target')
            if isinstance(target, str) and target.startswith(CHOICE_PREFIX):
                target = _chosen_value(target[len(CHOICE_PREFIX):], features, build)
            if not isinstance(target, str) or target.startswith('$'):
                continue
            required_states = [qualifier.get('featureId') for qualifier in effect.get('qualifiers') or []
                               if qualifier.get('type') == 'selfState']
            condition = None
            if required_states:
                condition = feature_names.get(required_states[0]) or _words(required_states[0].split('/')[-1])
            name = _defense_name(target, effect)
            existing = found[effect_type].get(name)
            # An always-on defense beats one that needs a feature active.
            if existing is None or (existing['condition'] and not condition):
                found[effect_type][name] = {'name': name, 'condition': condition}
    return {'resistances': list(found['grantResistance'].values()),
            'immunities': list(found['grantImmunity'].values())}

# Names of taken options whose key contains marker, such as ':tool/' or ':language/'.
def _taken_names(collection, taken, marker):
    entries = packs.collection(collection)
    return {entries.get(key, {}).get('name', key) for key in (taken or {}) if marker in key}

# Darkvision range in feet from the species' Darkvision trait, or None.
def _darkvision(species):
    for trait in (species or {}).get('traits') or []:
        if trait.get('name') == 'Darkvision':
            match = re.search(r'(\d+) feet', trait.get('description') or '')
            return int(match.group(1)) if match else None
    return None

# What a play state is checked against: derived max HP (None if unknown), spell slots, level and feature use limits.
def state_limits(build, level, derived_max_hp, features=()):
    cls = _lookup('classes', build.get('class'))
    slots, pact = slot_limits(cls, level)
    return {'workedOutMaxHp': derived_max_hp, 'slots': slots, 'pact': pact, 'level': level,
            'features': {feature['id']: feature['uses'] for feature in features if feature['uses']}}

def _max_hp(play, limits):
    return play.get('maxHpOverride') or limits['workedOutMaxHp']

def _current_hp(play, max_hp):
    current = play.get('currentHp')
    if current is None:
        return max_hp
    return min(current, max_hp) if max_hp else current

# The full play state with defaults filled in and stored values clamped to the current limits.
def play_state(play, limits):
    max_hp = _max_hp(play, limits)
    spent_slots = play.get('spentSlots') or {}
    spent_feature_uses = play.get('featureUses') or {}
    pact = limits['pact']
    return {
        'currentHp': _current_hp(play, max_hp),
        'maxHp': max_hp,
        'workedOutMaxHp': limits['workedOutMaxHp'],
        'maxHpOverride': play.get('maxHpOverride'),
        'tempHp': play.get('tempHp', 0),
        'spellSlots': {slot_level: {'total': total, 'spent': min(spent_slots.get(slot_level, 0), total)}
                       for slot_level, total in limits['slots'].items()},
        'pactSlots': {'total': pact['count'], 'slotLevel': pact['slotLevel'],
                      'spent': min(play.get('spentPactSlots', 0), pact['count'])} if pact else None,
        'conditions': play.get('conditions') or [],
        'exhaustion': play.get('exhaustion', 0),
        'hitDice': {'total': limits['level'], 'spent': min(play.get('spentHitDice', 0), limits['level'])},
        'deathSaves': play.get('deathSaves') or dict(EMPTY_DEATH_SAVES),
        'featureUses': {feature_id: min(spent_feature_uses.get(feature_id, 0), limit['max'])
                        for feature_id, limit in limits.get('features', {}).items()},
    }

def _long_rest(changes, state, options):
    spent_dice = state['hitDice']['spent']
    if options.get('hitDiceRecovery', 'all') == 'all':
        recovered = spent_dice
    else:
        recovered = min(spent_dice, max(1, state['hitDice']['total'] // 2))
    changes.update({
        'currentHp': state['maxHp'] if state['maxHp'] is not None else state['currentHp'],
        'tempHp': 0, 'spentSlots': {}, 'spentPactSlots': 0, 'spentHitDice': spent_dice - recovered,
        'deathSaves': dict(EMPTY_DEATH_SAVES),
        'exhaustion': max(0, state['exhaustion'] - 1),
        # Every limited-use feature recharges, including short-rest ones.
        'featureUses': {},
    })
    return changes, {'kind': 'long', 'hitDiceRecovered': recovered,
                     'healed': (state['maxHp'] or 0) - (state['currentHp'] or 0)}

# Short-rest features recharge fully, and those that regain some on one (Rage, Channel Divinity) get that many back.
def _feature_uses_after_short_rest(state, limits):
    remaining = {}
    for feature_id, spent in state['featureUses'].items():
        limit = limits['features'][feature_id]
        if limit['recharge'] == 'short':
            spent = 0
        elif limit['shortRecover']:
            spent = max(0, spent - limit['shortRecover'])
        if spent:
            remaining[feature_id] = spent
    return remaining

# The play-state changes a rest makes and a summary, as (changes, summary).
# resetMaxHp drops a hand-set maximum on either rest.
# A short rest spends up to hit_dice Hit Point Dice, healing die + CON each (at least 1) unless applyHealing is false.
# A long rest restores HP, slots and features, clears death saves, lowers exhaustion and recovers all or half the Hit Point Dice.
def rest_changes(rest_type, hit_dice, play, limits, hit_die, con_modifier, roll, options=None):
    options = options or {}
    changes = {'maxHpOverride': None} if options.get('resetMaxHp') else {}
    state = play_state({**play, **changes}, limits)
    if rest_type == 'long':
        return _long_rest(changes, state, options)
    dice_left = state['hitDice']['total'] - state['hitDice']['spent']
    dice_spent = min(hit_dice, dice_left)
    rolls = [roll(hit_die) for _ in range(dice_spent)] if hit_die else []
    healed = sum(max(1, die_roll + (con_modifier or 0)) for die_roll in rolls)
    apply_healing = options.get('applyHealing', True)
    changes['spentPactSlots'] = 0
    changes['featureUses'] = _feature_uses_after_short_rest(state, limits)
    if rolls:
        changes['spentHitDice'] = state['hitDice']['spent'] + len(rolls)
        if apply_healing and state['currentHp'] is not None:
            ceiling = state['maxHp'] if state['maxHp'] is not None else state['currentHp'] + healed
            changes['currentHp'] = min(ceiling, state['currentHp'] + healed)
            if changes['currentHp'] > 0:
                changes['deathSaves'] = dict(EMPTY_DEATH_SAVES)
    return changes, {'kind': 'short', 'rolls': rolls, 'conModifier': con_modifier or 0, 'healed': healed,
                     'applied': bool(apply_healing)}

def _is_whole_in_range(value, low, high):
    return is_whole_number(value) and low <= value <= high

class _PatchError(Exception):
    pass

def _merged_counts(current, updates, limit_for, missing_message, range_message):
    merged = dict(current or {})
    for key, used in updates.items():
        limit = limit_for(key)
        if limit is None:
            raise _PatchError(missing_message(key))
        if not _is_whole_in_range(used, 0, limit):
            raise _PatchError(range_message(key, limit))
        merged[key] = used
    return {key: value for key, value in merged.items() if value}

def _clean_conditions(value):
    known = packs.collection('conditions')
    if not isinstance(value, list) or len(value) > MAX_CONDITIONS or len(set(map(str, value))) != len(value):
        raise _PatchError('conditions must be a list of different conditions.')
    for condition_id in value:
        if condition_id not in known or condition_id == EXHAUSTION_ID:
            raise _PatchError(f'Unknown condition: {condition_id}.')
    return value

def _clean_death_saves(value):
    if not (isinstance(value, dict) and set(value) == {'successes', 'failures'}
            and _is_whole_in_range(value['successes'], 0, MAX_DEATH_SAVES)
            and _is_whole_in_range(value['failures'], 0, MAX_DEATH_SAVES)):
        raise _PatchError('deathSaves must be {successes, failures}, each from 0 to 3.')
    return value

def _require_range(value, low, high, message):
    if not _is_whole_in_range(value, low, high):
        raise _PatchError(message)
    return value

def _state_patch_changes(body, play, limits):
    changes = {}
    if 'maxHpOverride' in body:
        value = body['maxHpOverride']
        if value is not None and not _is_whole_in_range(value, 1, HP_LIMIT):
            raise _PatchError(f'Maximum hit points must be from 1 to {HP_LIMIT}, or null to work them out.')
        changes['maxHpOverride'] = value
    max_hp = _max_hp({**play, **changes}, limits) or HP_LIMIT
    if 'currentHp' in body:
        changes['currentHp'] = _require_range(body['currentHp'], 0, max_hp, f'Hit points must be from 0 to {max_hp}.')
    if 'tempHp' in body:
        changes['tempHp'] = _require_range(body['tempHp'], 0, HP_LIMIT, f'Temporary hit points must be from 0 to {HP_LIMIT}.')
    if 'spentSlots' in body:
        if not isinstance(body['spentSlots'], dict):
            raise _PatchError('spentSlots must be {slot level: slots used}.')
        changes['spentSlots'] = _merged_counts(
            play.get('spentSlots'), body['spentSlots'], limits['slots'].get,
            lambda slot_level: f'This character has no level {slot_level} spell slots.',
            lambda slot_level, total: f'Level {slot_level} slots used must be from 0 to {total}.')
    if 'spentPactSlots' in body:
        total = limits['pact']['count'] if limits['pact'] else 0
        if not total:
            raise _PatchError('This character has no Pact Magic slots.')
        changes['spentPactSlots'] = _require_range(body['spentPactSlots'], 0, total,
                                                   f'Pact slots used must be from 0 to {total}.')
    if 'conditions' in body:
        changes['conditions'] = _clean_conditions(body['conditions'])
    if 'exhaustion' in body:
        changes['exhaustion'] = _require_range(body['exhaustion'], 0, MAX_EXHAUSTION, 'Exhaustion must be from 0 to 6.')
    if 'spentHitDice' in body:
        changes['spentHitDice'] = _require_range(body['spentHitDice'], 0, limits['level'],
                                                 f'Hit Point Dice spent must be from 0 to {limits["level"]}.')
    if 'deathSaves' in body:
        changes['deathSaves'] = _clean_death_saves(body['deathSaves'])
    if 'featureUses' in body:
        if not isinstance(body['featureUses'], dict):
            raise _PatchError('featureUses must be {feature id: uses spent}.')
        feature_limits = limits.get('features', {})
        changes['featureUses'] = _merged_counts(
            play.get('featureUses'), body['featureUses'],
            lambda feature_id: feature_limits[feature_id]['max'] if feature_id in feature_limits else None,
            lambda feature_id: 'That feature has no limited uses.',
            lambda feature_id, max_uses: f'Uses spent must be from 0 to {max_uses}.')
    return changes

# Checks a PATCH /state body and returns (changes, None) to merge into play, or (None, message).
# Only sent fields change, and spentSlots and featureUses merge by key.
def clean_state_patch(body, play, limits):
    if not isinstance(body, dict) or not body:
        return None, 'Send at least one field to change.'
    unknown_fields = set(body) - set(STATE_FIELDS)
    if unknown_fields:
        return None, f'Unknown field: {sorted(unknown_fields)[0]}.'
    try:
        return _state_patch_changes(body, play, limits), None
    except _PatchError as e:
        return None, str(e)
