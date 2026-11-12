# A character's ability scores, in layers:
#   base       the scores assigned at creation (standard array, point buy, roll, ...)
#   increases  permanent ones, each from a source: the background, then feats such as
#              Ability Score Improvement in the order they're gained; each capped at its
#              own maximum (20, or 30 for an Epic Boon)
#   score      base + increases: the character's own score
#   current    the score with temporary effects applied: a Belt of Giant Strength, a curse,
#              a spell. These are kept on the sheet (scoreAdjustments) and never change score.

from itertools import combinations_with_replacement

from server.rules.choices import ABILITY_NAMES, option

ABILITIES = list(ABILITY_NAMES)
SCORE_CAP = 20
# A temporary effect: 'set' makes the score exactly value, 'atLeast' raises it to value
# unless it's already higher (most magic items), 'add' adds value (negative lowers it).
ADJUSTMENT_MODES = ('set', 'atLeast', 'add')
ADJUSTMENT_MAX = 20
ADJUSTMENT_NAME_MAX = 60
CURRENT_RANGE = (1, 30)

def modifier(score):
    return (score - 10) // 2

# Every way to spread points over abilities, at most max_each on one. Keys look like
# "WIS+2,CHA+1": the biggest increase first, then STR to CHA, as the wizard's boxes write them.
def spread_options(abilities, points, max_each):
    order = [a for a in ABILITIES if a in abilities]
    options = []
    for combo in combinations_with_replacement(order, points):
        counts = {a: combo.count(a) for a in order if a in combo}
        if max(counts.values()) > max_each:
            continue
        parts = sorted(counts.items(), key=lambda p: (-p[1], order.index(p[0])))
        options.append(option(','.join(f'{a}+{n}' for a, n in parts),
                              ', '.join(f'+{n} {ABILITY_NAMES[a]}' for a, n in parts)))
    return options

def feat_maximum(feat):
    cap = (feat.get('abilityScoreIncrease') or {}).get('maximum')
    return cap if isinstance(cap, int) else SCORE_CAP

# The choice a feat's increase asks for once the feat is picked for parent (a choice id).
# Ability Score Improvement: 2 points, at most +2 on one; Grappler: +1 to STR or DEX.
def feat_increase_choice(parent_id, feat):
    asi = feat['abilityScoreIncrease']
    amount = asi.get('amount', 1)
    abilities = [a for a in ABILITIES if a in asi.get('from') or ABILITIES]
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

# One increase choice per feat option that raises scores, for each choice that offers feats.
def feat_increase_choices(choices, feats):
    extra = []
    for choice in choices:
        for o in choice['options']:
            feat = feats.get(o['key'])
            if feat and feat.get('abilityScoreIncrease'):
                extra.append(feat_increase_choice(choice['id'], feat))
    return extra

# The increases a picked key gives, {ability: amount}, or None if the key isn't one.
def parse_spread(key):
    try:
        return {a: int(n) for a, n in (part.split('+') for part in key.split(','))}
    except (AttributeError, ValueError):
        return None

# A source of permanent increases. level: when it's gained (the background's is 1).
def source(name, increases, level=1, maximum=SCORE_CAP, field=None):
    return {'name': name, 'increases': increases, 'level': level, 'maximum': maximum, 'field': field}

# base + each source in the order gained, each capped at its maximum. Returns
# ({ability: {base, increases: [{source, amount}], bonus, total, modifier}}, overflow), where
# overflow is [(source, ability)] for increases lost to a cap. before_level: only sources
# gained earlier count (what a feat's prerequisites are checked against).
def apply_increases(base, sources, before_level=None):
    result, overflow = {}, []
    for a in ABILITIES:
        b = base.get(a) if isinstance(base, dict) and isinstance(base.get(a), int) and not isinstance(base.get(a), bool) else None
        result[a] = {'base': b, 'increases': [], 'bonus': 0, 'total': b, 'modifier': modifier(b) if b is not None else None}
    for s in sorted(sources, key=lambda s: s['level']):
        if before_level is not None and s['level'] >= before_level:
            continue
        for a, amount in s['increases'].items():
            entry = result.get(a)
            if entry is None or entry['total'] is None or amount <= 0:
                continue
            gained = max(0, min(amount, s['maximum'] - entry['total']))
            if gained < amount:
                overflow.append((s, a))
            if gained:
                entry['increases'].append({'source': s['name'], 'amount': gained})
                entry['bonus'] += gained
                entry['total'] += gained
                entry['modifier'] = modifier(entry['total'])
    return result, overflow

# Temporary effects, cleaned: [{id, name, ability, mode, value}], or (None, message).
def clean_adjustments(value):
    if not isinstance(value, list):
        return None, 'Temporary effects must be a list.'
    if len(value) > ADJUSTMENT_MAX:
        return None, f'At most {ADJUSTMENT_MAX} temporary effects.'
    cleaned = []
    for i, item in enumerate(value):
        if not isinstance(item, dict):
            return None, 'Each temporary effect must be an object.'
        name = item.get('name')
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > ADJUSTMENT_NAME_MAX:
            return None, f'Give each temporary effect a name of 1-{ADJUSTMENT_NAME_MAX} characters.'
        if item.get('ability') not in ABILITIES:
            return None, f'{name.strip()}: choose an ability.'
        if item.get('mode') not in ADJUSTMENT_MODES:
            return None, f'{name.strip()}: choose how it changes the score.'
        v = item.get('value')
        if not isinstance(v, int) or isinstance(v, bool):
            return None, f'{name.strip()}: the value must be a whole number.'
        low, high = (-30, 30) if item['mode'] == 'add' else CURRENT_RANGE
        if not low <= v <= high:
            return None, f'{name.strip()}: the value must be {low} to {high}.'
        item_id = item.get('id') if isinstance(item.get('id'), str) and len(item['id']) <= 64 else str(i)
        cleaned.append({'id': item_id, 'name': name.strip(), 'ability': item['ability'], 'mode': item['mode'], 'value': v})
    return cleaned, None

# Adds current (and its modifier, and the effects that apply) to each ability of apply_increases'
# result. 'set' effects apply first (the last one listed wins), then 'atLeast' (the highest),
# then 'add', clamped to 1-30.
def apply_adjustments(abilities, adjustments):
    for a, entry in abilities.items():
        mine = [x for x in adjustments or [] if x['ability'] == a]
        current = entry['total']
        if current is not None:
            for x in mine:
                if x['mode'] == 'set':
                    current = x['value']
            floors = [x['value'] for x in mine if x['mode'] == 'atLeast']
            if floors:
                current = max(current, max(floors))
            current += sum(x['value'] for x in mine if x['mode'] == 'add')
            current = max(CURRENT_RANGE[0], min(CURRENT_RANGE[1], current))
        entry['current'] = current
        entry['currentModifier'] = modifier(current) if current is not None else None
        entry['adjustments'] = [x['id'] for x in mine]
    return abilities
