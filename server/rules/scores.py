from itertools import combinations_with_replacement

from server.rules.choices import ABILITY_NAMES, option
from server.rules.common import ability_modifier, is_whole_number

# Ability scores are layered as base, then permanent increases, then temporary effects.
# base is assigned at creation and increases come from sources (background, feats) in the order gained.
# Each increase is capped at its source's maximum, which is 20, or 30 for an Epic Boon.
# current applies temporary effects (items, curses, spells) stored as scoreAdjustments, without changing the score.

ABILITIES = list(ABILITY_NAMES)
SCORE_CAP = 20
# 'set' makes the score exactly value, 'atLeast' raises it to value, and 'add' adds value (possibly negative).
ADJUSTMENT_MODES = ('set', 'atLeast', 'add')
ADJUSTMENT_MAX = 20
ADJUSTMENT_NAME_MAX = 60
ADJUSTMENT_ID_MAX = 64
ADD_RANGE = (-30, 30)
CURRENT_RANGE = (1, 30)

def modifier(score):
    return ability_modifier(score)

# Every way to spread points over abilities with at most max_each on one.
# Keys look like "WIS+2,CHA+1", biggest increase first and then STR to CHA, as the wizard writes them.
def spread_options(abilities, points, max_each):
    ordered = [ability for ability in ABILITIES if ability in abilities]
    options = []
    for combo in combinations_with_replacement(ordered, points):
        counts = {ability: combo.count(ability) for ability in ordered if ability in combo}
        if max(counts.values()) > max_each:
            continue
        parts = sorted(counts.items(), key=lambda part: (-part[1], ordered.index(part[0])))
        options.append(option(','.join(f'{ability}+{amount}' for ability, amount in parts),
                              ', '.join(f'+{amount} {ABILITY_NAMES[ability]}' for ability, amount in parts)))
    return options

def feat_maximum(feat):
    cap = (feat.get('abilityScoreIncrease') or {}).get('maximum')
    return cap if isinstance(cap, int) else SCORE_CAP

# The increase choice a feat adds once it is picked for the parent choice.
# For example, Ability Score Improvement gives 2 points with at most +2 on one ability.
def feat_increase_choice(parent_id, feat):
    increase = feat['abilityScoreIncrease']
    amount = increase.get('amount', 1)
    abilities = [ability for ability in ABILITIES if ability in increase.get('from') or ABILITIES]
    slug = feat['id'].rsplit('/', 1)[-1]
    return {
        'id': f'{parent_id}~{slug}',
        'prompt': f'Choose where {feat["name"]} raises your ability scores.',
        'count': 1,
        'options': spread_options(abilities, amount, amount),
        'proficientOnly': False,
        'condition': {'choice': parent_id, 'option': feat['id']},
        'kind': 'abilityIncrease', 'abilities': abilities, 'points': amount, 'max': amount,
        'source': feat['name'], 'maximum': feat_maximum(feat),
    }

# One increase choice per score-raising feat option, for each choice that offers feats.
def feat_increase_choices(choices, feats):
    increase_choices = []
    for choice in choices:
        for opt in choice['options']:
            feat = feats.get(opt['key'])
            if feat and feat.get('abilityScoreIncrease'):
                increase_choices.append(feat_increase_choice(choice['id'], feat))
    return increase_choices

# The {ability: amount} a picked spread key gives, or None if the key isn't one.
def parse_spread(key):
    try:
        return {ability: int(amount) for ability, amount in (part.split('+') for part in key.split(','))}
    except (AttributeError, ValueError):
        return None

# A source of permanent increases, gained at level (1 for the background).
def source(name, increases, level=1, maximum=SCORE_CAP, field=None):
    return {'name': name, 'increases': increases, 'level': level, 'maximum': maximum, 'field': field}

def _base_score(base, ability):
    value = base.get(ability) if isinstance(base, dict) else None
    return value if is_whole_number(value) else None

# Applies each source in the order gained, capped at its maximum, to the base scores.
# Returns ({ability: {base, increases, bonus, total, modifier}}, overflow), where overflow lists (source, ability) lost to a cap.
# With before_level, only sources gained earlier count, which is what feat prerequisites check against.
def apply_increases(base, sources, before_level=None):
    abilities, overflow = {}, []
    for ability in ABILITIES:
        score = _base_score(base, ability)
        abilities[ability] = {
            'base': score, 'increases': [], 'bonus': 0, 'total': score,
            'modifier': modifier(score) if score is not None else None,
        }
    for increase_source in sorted(sources, key=lambda s: s['level']):
        if before_level is not None and increase_source['level'] >= before_level:
            continue
        for ability, amount in increase_source['increases'].items():
            entry = abilities.get(ability)
            if entry is None or entry['total'] is None or amount <= 0:
                continue
            gained = max(0, min(amount, increase_source['maximum'] - entry['total']))
            if gained < amount:
                overflow.append((increase_source, ability))
            if gained:
                # field names the draft pick it came from, so the wizard can show each pick what the others add.
                entry['increases'].append({'source': increase_source['name'], 'amount': gained, 'field': increase_source['field']})
                entry['bonus'] += gained
                entry['total'] += gained
                entry['modifier'] = modifier(entry['total'])
    return abilities, overflow

# Cleans temporary effects into [{id, name, ability, mode, value}], returning (effects, None) or (None, message).
def clean_adjustments(value):
    if not isinstance(value, list):
        return None, 'Temporary effects must be a list.'
    if len(value) > ADJUSTMENT_MAX:
        return None, f'At most {ADJUSTMENT_MAX} temporary effects.'
    cleaned = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            return None, 'Each temporary effect must be an object.'
        name = item.get('name')
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > ADJUSTMENT_NAME_MAX:
            return None, f'Give each temporary effect a name of 1-{ADJUSTMENT_NAME_MAX} characters.'
        name = name.strip()
        if item.get('ability') not in ABILITIES:
            return None, f'{name}: choose an ability.'
        if item.get('mode') not in ADJUSTMENT_MODES:
            return None, f'{name}: choose how it changes the score.'
        amount = item.get('value')
        if not is_whole_number(amount):
            return None, f'{name}: the value must be a whole number.'
        low, high = ADD_RANGE if item['mode'] == 'add' else CURRENT_RANGE
        if not low <= amount <= high:
            return None, f'{name}: the value must be {low} to {high}.'
        item_id = item.get('id') if isinstance(item.get('id'), str) and len(item['id']) <= ADJUSTMENT_ID_MAX else str(index)
        cleaned.append({'id': item_id, 'name': name, 'ability': item['ability'], 'mode': item['mode'], 'value': amount})
    return cleaned, None

# Adds current, currentModifier and the applied adjustment ids to each ability, in place.
# 'set' applies first (last one wins), then 'atLeast' (highest wins), then 'add', clamped to CURRENT_RANGE.
def apply_adjustments(abilities, adjustments):
    for ability, entry in abilities.items():
        applicable = [adjustment for adjustment in adjustments or [] if adjustment['ability'] == ability]
        current = entry['total']
        if current is not None:
            for adjustment in applicable:
                if adjustment['mode'] == 'set':
                    current = adjustment['value']
            floors = [adjustment['value'] for adjustment in applicable if adjustment['mode'] == 'atLeast']
            if floors:
                current = max(current, max(floors))
            current += sum(adjustment['value'] for adjustment in applicable if adjustment['mode'] == 'add')
            current = max(CURRENT_RANGE[0], min(CURRENT_RANGE[1], current))
        entry['current'] = current
        entry['currentModifier'] = modifier(current) if current is not None else None
        entry['adjustments'] = [adjustment['id'] for adjustment in applicable]
    return abilities
