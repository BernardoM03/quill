# The character sheet at the table: the stats worked out from the build (proficiency, saves,
# skills, spellcasting), and the play state that changes during a session (hit points, spell
# slots, conditions, Hit Point Dice, death saves), stored in the sheet's play part
# (schemas/records/sheet.schema.json $defs.play). Nothing derived is stored.

import re

from server.rules import packs
from server.rules.choices import ABILITY_NAMES
from server.rules.classes import _proficiency_names, column_value, scaling_value

EXHAUSTION_ID = 'srd-5.2:condition/exhaustion'
HP_LIMIT = 999

def _mod(abilities, code):
    a = (abilities or {}).get(code) or {}
    return a.get('currentModifier') if a.get('currentModifier') is not None else a.get('modifier')

def _signed_sum(*parts):
    return None if any(p is None for p in parts) else sum(parts)

# The spell slots the class has at this level: {"1": count, ...} for the levels it has any,
# and its Pact Magic slots ({count, slotLevel}) or None.
def slot_limits(cls, level):
    if not cls:
        return {}, None
    table = column_value(cls, 'spellSlots', level) or []
    slots = {str(i + 1): n for i, n in enumerate(table) if isinstance(n, int) and n > 0}
    pact = column_value(cls, 'pactSlots', level)
    return slots, (pact if isinstance(pact, dict) and pact.get('count') else None)

# The numbers the sheet shows that come from the build: abilities are the sheet's (with
# temporary effects, so current modifiers count); taken is check_draft's {option key: field},
# which holds every skill proficiency the character has.
def sheet_stats(build, level, abilities, taken):
    cls = packs.collection('classes').get(build.get('class')) if isinstance(build.get('class'), str) else None
    species = packs.collection('species').get(build.get('species')) if isinstance(build.get('species'), str) else None
    proficiency = column_value(cls, 'proficiencyBonus', level) if cls else None
    proficiency = proficiency if isinstance(proficiency, int) else 2 + (level - 1) // 4

    save_proficiencies = set((cls or {}).get('savingThrowProficiencies') or [])
    saves = [{'ability': code, 'proficient': code in save_proficiencies,
              'modifier': _signed_sum(_mod(abilities, code), proficiency if code in save_proficiencies else 0)}
             for code in ABILITY_NAMES]

    skilled = {key for key in (taken or {}) if ':skill/' in key}
    skills = []
    for skill_id, skill in sorted(packs.collection('skills').items(), key=lambda kv: kv[1]['name']):
        proficient = skill_id in skilled
        skills.append({'id': skill_id, 'name': skill['name'], 'ability': skill['ability'], 'proficient': proficient,
                       'modifier': _signed_sum(_mod(abilities, skill['ability']), proficiency if proficient else 0)})
    perception = next((s for s in skills if s['name'] == 'Perception'), None)

    casting = (cls or {}).get('spellcasting')
    spellcasting = None
    if casting and casting.get('ability'):
        mod = _mod(abilities, casting['ability'])
        spellcasting = {'ability': casting['ability'],
                        'saveDc': _signed_sum(8, proficiency, mod), 'attackBonus': _signed_sum(proficiency, mod)}

    dex = _mod(abilities, 'DEX')
    by_name = {s['name']: s for s in skills}
    def passive(name):
        skill = by_name.get(name)
        return _signed_sum(10, skill['modifier']) if skill and skill['modifier'] is not None else None
    subclass_id = (build.get('classChoices') or {}).get('subclass')
    subclass = packs.collection('subclasses').get(subclass_id) if isinstance(subclass_id, str) else None
    background = packs.collection('origins').get(build.get('background')) if isinstance(build.get('background'), str) else None
    return {
        # Names for the sheet's header.
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
            'armor': _proficiency_names((cls or {}).get('armorProficiencies')),
            'weapons': _proficiency_names((cls or {}).get('weaponProficiencies')),
            'tools': sorted(_names('tools', taken, ':tool/') | set(_proficiency_names((cls or {}).get('toolProficiencies')))),
            'languages': sorted(_names('languages', taken, ':language/')),
        },
        'proficiencyBonus': proficiency,
        'initiative': dex,
        # Without armor: equipment isn't tracked yet, so worn armor and shields aren't counted.
        'armorClass': _signed_sum(10, dex),
        'speed': (species or {}).get('speed'),
        # Every speed the character has, walking first (see speeds).
        'speeds': speeds(species, cls, subclass, level),
        # Resistances and immunities from the character's traits and features.
        'defenses': defenses(build, species, cls, subclass, level),
        'passivePerception': _signed_sum(10, perception['modifier']) if perception and perception['modifier'] is not None else None,
        'savingThrows': saves,
        'skills': skills,
        'spellcasting': spellcasting,
        'hitDie': (cls or {}).get('hitDie'),
    }

# How many times a limited-use feature can be used, from its pack "uses": a number, a column
# of the class table ($column:rages), the feature's own scaling ($scaling), an ability
# modifier or the class level ($derived:CHA, $derived:classLevel; times multiplier, at least
# minimum). None when it can't be worked out.
def use_max(uses, feature, cls, level, abilities, proficiency):
    raw = uses.get('max')
    if isinstance(raw, int):
        value = raw
    elif raw == '$scaling':
        value = scaling_value(feature, level)
    elif isinstance(raw, str) and raw.startswith('$column:'):
        value = column_value(cls, raw[len('$column:'):], level) if cls else None
    elif isinstance(raw, str) and raw.startswith('$derived:'):
        what = raw[len('$derived:'):]
        value = (level if what in ('classLevel', 'characterLevel', 'level') else
                 proficiency if what == 'proficiencyBonus' else _mod(abilities, what))
    else:
        value = None
    if not isinstance(value, int):
        return None
    value *= uses.get('multiplier', 1)
    return max(value, uses.get('minimum', 0))

def _feature_text(feature):
    if feature.get('description'):
        return feature['description']
    return '\n\n'.join(f"**{g['name']}.** {g.get('description', '')}" if g.get('name') else g.get('description', '')
                       for g in feature.get('effectGroups') or [])

# Everything the character has from its species, class, subclass and origin feat, for the
# sheet's Features & Traits and Actions tabs: [{id, name, source, level, activation,
# description, uses}]. source: species, class, subclass or feat. activation: action,
# bonusAction, reaction, free, special or passive. uses: {max, recharge, pool, shortRecover}
# for a limited-use feature (shortRecover: how many come back on a short rest, when it
# recharges on a long one), else None.
def sheet_features(build, level, abilities, proficiency):
    species = packs.collection('species').get(build.get('species')) if isinstance(build.get('species'), str) else None
    cls = packs.collection('classes').get(build.get('class')) if isinstance(build.get('class'), str) else None
    subclass_id = (build.get('classChoices') or {}).get('subclass')
    subclass = packs.collection('subclasses').get(subclass_id) if isinstance(subclass_id, str) else None
    origin = packs.collection('origins').get(build.get('background')) if isinstance(build.get('background'), str) else None
    feat = packs.collection('feats').get((origin or {}).get('featId') or '')
    picked = (build.get('backgroundChoices') or {}).get('originFeat')
    if isinstance(picked, str) and picked in packs.collection('feats'):
        feat = packs.collection('feats')[picked]

    entries = [(t, 'species') for t in (species or {}).get('traits') or []]
    entries += [(f, 'class') for f in (cls or {}).get('features') or [] if (f.get('level') or 1) <= level]
    entries += [(f, 'subclass') for f in (subclass or {}).get('features') or [] if (f.get('level') or 1) <= level]
    if feat:
        entries.append((feat, 'feat'))

    result = []
    for feature, source in entries:
        uses = feature.get('uses')
        limit = None
        if uses:
            top = use_max(uses, feature, cls, level, abilities, proficiency)
            if top:
                recover = uses.get('recover') or {}
                limit = {'max': top, 'recharge': uses.get('recharge'), 'pool': bool(uses.get('pool')),
                         'shortRecover': recover.get('amount') if recover.get('rest') == 'short' else None}
        result.append({
            'id': feature['id'], 'name': feature['name'], 'source': source,
            'level': feature.get('level') or 1 if source in ('class', 'subclass') else None,
            'activation': (feature.get('activation') or {}).get('type') or 'passive',
            'description': _feature_text(feature),
            'uses': limit,
        })
    return result

# A spell's casting time, range and duration as the sheet's spell list says them, short:
# "1A" / "1BA" / "1R" / "10 min", "90 ft" / "Self" / "Touch", "Inst." / "1 hr" / "Until dispelled".
_UNITS = {'minute': 'min', 'hour': 'hr', 'day': 'day', 'round': 'rnd', 'feet': 'ft', 'miles': 'mi'}

def _casting_time(t):
    t = t or {}
    kind = {'action': '1A', 'bonusAction': '1BA', 'reaction': '1R', 'special': 'Special'}.get(t.get('type'))
    if kind:
        return kind
    return f"{t.get('value', 1)} {_UNITS.get(t.get('unit'), t.get('unit', ''))}".strip() if t.get('unit') else None

def _range(r):
    r = r or {}
    if r.get('type') == 'ranged':
        return f"{r.get('distance', '?')} {_UNITS.get(r.get('unit'), r.get('unit', ''))}".strip()
    return {'self': 'Self', 'touch': 'Touch', 'sight': 'Sight', 'unlimited': 'Unlimited',
            'special': 'Special'}.get(r.get('type'), r.get('type'))

def _duration(d):
    d = d or {}
    unit = d.get('unit')
    if unit in ('instantaneous', 'untilDispelled', 'special'):
        return {'instantaneous': 'Instantaneous', 'untilDispelled': 'Until dispelled', 'special': 'Special'}[unit]
    return f"{d.get('value', 1)} {_UNITS.get(unit, unit or '')}".strip() if unit else None

# The spells the character picked in the wizard (any choice whose options are spells), in
# level then name order: [{id, name, level, school, castingTime, range, duration,
# concentration, ritual, description}].
def sheet_spells(build):
    spells = packs.collection('spells')
    ids = set()
    for key in ('speciesChoices', 'backgroundChoices', 'classChoices'):
        for value in (build.get(key) or {}).values():
            for v in value if isinstance(value, list) else [value]:
                if isinstance(v, str) and v in spells:
                    ids.add(v)
    def view(s):
        return {'id': s['id'], 'name': s['name'], 'level': s.get('level', 0), 'school': s.get('school'),
                'castingTime': _casting_time(s.get('castingTime')), 'range': _range(s.get('range')),
                'duration': _duration(s.get('duration')),
                'concentration': bool(s.get('concentration')), 'ritual': bool(s.get('ritual')),
                'description': s.get('shortDescription') or s.get('description') or ''}
    return sorted((view(spells[i]) for i in ids), key=lambda s: (s['level'], s['name']))

SPEED_ORDER = ('walk', 'fly', 'swim', 'climb', 'burrow')

# The features a character has now: the species' traits, and the class's and subclass's
# features up to its level. Each feature's own effects only, not those of options it offers
# (an Eldritch Invocation's speed comes with picking it, which the sheet doesn't follow yet).
def _features(species, cls, subclass, level):
    yield from (species or {}).get('traits') or []
    for owner in (cls, subclass):
        for feature in (owner or {}).get('features') or []:
            if (feature.get('level') or 1) <= level:
                yield feature

# The character's speeds, walking first: [{type, value, condition}]. Walking is the species'
# speed plus any feature's increase; other speeds come from features that grant one, at a
# number of feet or equal to walking speed. condition names the feature that has to be
# active (Draconic Flight), or None when the speed is always there. Equipment isn't tracked,
# so an increase that only applies out of some armor (Roving) is counted.
def speeds(species, cls, subclass, level):
    features = list(_features(species, cls, subclass, level))
    walk = (species or {}).get('speed')
    if walk is None:
        return []
    for feature in features:
        for effect in feature.get('effects') or []:
            if (effect.get('type') == 'modifier' and effect.get('target') == 'baseSpeed'
                    and isinstance(effect.get('value'), int)
                    and all(q.get('type') == 'equipment' and q.get('negate') for q in effect.get('qualifiers') or [])):
                walk += effect['value']
    found = {'walk': {'type': 'walk', 'value': walk, 'condition': None}}
    for feature in features:
        for effect in feature.get('effects') or []:
            kind = effect.get('target')
            if effect.get('type') != 'grantSpeed' or effect.get('affects') or kind not in SPEED_ORDER[1:]:
                continue
            value = walk if effect.get('value') == '$derived:walkingSpeed' else effect.get('value')
            if not isinstance(value, int):
                continue
            active = any(q.get('type') == 'selfState' for q in effect.get('qualifiers') or [])
            speed = {'type': kind, 'value': value, 'condition': feature['name'] if active else None}
            old = found.get(kind)
            # An always-on speed beats one that needs a feature active; then the faster one.
            if old is None or (old['condition'] and not speed['condition']) or \
                    (bool(old['condition']) == bool(speed['condition']) and value > old['value']):
                found[kind] = speed
    return [found[k] for k in SPEED_ORDER if k in found]

def _words(key):
    # "bludgeoning" -> "Bludgeoning", "magicalSleep" -> "Magical sleep"
    spaced = ''.join(' ' + c.lower() if c.isupper() else c for c in key).replace('-', ' ')
    return spaced[:1].upper() + spaced[1:]

# What a "$choice:<id>" target came to: the value of the option the character picked for that
# choice (the wizard stores the option's label, e.g. "Black" for draconic ancestry: acid), or
# None if it wasn't picked.
def _chosen(choice_id, features, build):
    picks = {}
    for key in ('speciesChoices', 'backgroundChoices', 'classChoices'):
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

# What a resistance or immunity is to, as the sheet says it: a damage type ("Poison"), a
# condition ("Charmed"), or anything else the pack names ("Magical sleep").
def _defense_name(target, effect):
    if ':condition/' in target:
        return packs.collection('conditions').get(target, {}).get('name', target.split('/')[-1].title())
    if target == 'allDamage':
        excluded = [t for q in effect.get('qualifiers') or [] if q.get('type') == 'damageType' and q.get('negate')
                    for t in q.get('damageTypes') or []]
        return 'All damage' + (f' except {", ".join(_words(t) for t in excluded)}' if excluded else '')
    return _words(str(target))

# The character's resistances and immunities: {resistances, immunities}, each [{name,
# condition}]. condition names the feature that has to be active (Rage), or None when it
# always applies. Left out: ones a feature gives to others (an aura), ones that only last a
# moment after a trigger, and choices not yet made.
def defenses(build, species, cls, subclass, level):
    features = list(_features(species, cls, subclass, level))
    names = {f.get('id'): f.get('name') for f in features}
    found = {'grantResistance': {}, 'grantImmunity': {}}
    for feature in features:
        for effect in feature.get('effects') or []:
            kind = effect.get('type')
            if kind not in found or effect.get('affects') or effect.get('trigger'):
                continue
            target = effect.get('target')
            if isinstance(target, str) and target.startswith('$choice:'):
                target = _chosen(target[len('$choice:'):], features, build)
            if not isinstance(target, str) or target.startswith('$'):
                continue
            states = [q.get('featureId') for q in effect.get('qualifiers') or [] if q.get('type') == 'selfState']
            condition = (names.get(states[0]) or _words(states[0].split('/')[-1])) if states else None
            name = _defense_name(target, effect)
            old = found[kind].get(name)
            # Always-on beats needing a feature active.
            if old is None or (old['condition'] and not condition):
                found[kind][name] = {'name': name, 'condition': condition}
    return {'resistances': list(found['grantResistance'].values()),
            'immunities': list(found['grantImmunity'].values())}

# Names of the taken options of one kind (':tool/', ':language/') from check_draft's taken.
def _names(collection, taken, marker):
    entries = packs.collection(collection)
    return {entries.get(key, {}).get('name', key) for key in (taken or {}) if marker in key}

# Darkvision's range in feet from the species' Darkvision trait, or None.
def _darkvision(species):
    for trait in (species or {}).get('traits') or []:
        if trait.get('name') == 'Darkvision':
            match = re.search(r'(\d+) feet', trait.get('description') or '')
            return int(match.group(1)) if match else None
    return None

# The limits a play state is checked against: worked-out maximum hit points (None if they
# can't be worked out yet), the slots the class has, and the level (for Hit Point Dice).
# features: sheet_features' list, whose limited-use ones are tracked in play.featureUses.
def state_limits(build, level, worked_out_max_hp, features=()):
    cls = packs.collection('classes').get(build.get('class')) if isinstance(build.get('class'), str) else None
    slots, pact = slot_limits(cls, level)
    return {'workedOutMaxHp': worked_out_max_hp, 'slots': slots, 'pact': pact, 'level': level,
            'features': {f['id']: f['uses'] for f in features if f['uses']}}

def _max_hp(play, limits):
    return play.get('maxHpOverride') or limits['workedOutMaxHp']

# The play state as the sheet shows it, every field filled in: what's stored, kept within the
# current limits (a level or class change can lower them), with defaults for what's missing.
def play_state(play, limits):
    max_hp = _max_hp(play, limits)
    current = play.get('currentHp')
    current = max_hp if current is None else (min(current, max_hp) if max_hp else current)
    spent = play.get('spentSlots') or {}
    pact = limits['pact']
    return {
        'currentHp': current,
        'maxHp': max_hp,
        'workedOutMaxHp': limits['workedOutMaxHp'],
        'maxHpOverride': play.get('maxHpOverride'),
        'tempHp': play.get('tempHp', 0),
        # {level: {total, spent}} for each slot level the class has.
        'spellSlots': {lvl: {'total': n, 'spent': min(spent.get(lvl, 0), n)} for lvl, n in limits['slots'].items()},
        'pactSlots': {'total': pact['count'], 'slotLevel': pact['slotLevel'],
                      'spent': min(play.get('spentPactSlots', 0), pact['count'])} if pact else None,
        'conditions': play.get('conditions') or [],
        'exhaustion': play.get('exhaustion', 0),
        'hitDice': {'total': limits['level'], 'spent': min(play.get('spentHitDice', 0), limits['level'])},
        'deathSaves': play.get('deathSaves') or {'successes': 0, 'failures': 0},
        # Feature id -> uses spent, for each limited-use feature (0 when none are).
        'featureUses': {fid: min((play.get('featureUses') or {}).get(fid, 0), u['max'])
                        for fid, u in limits.get('features', {}).items()},
    }

# The play-state changes a rest makes, and what it did, as (changes, summary). Options:
# resetMaxHp: drop a hand-set maximum, so the worked-out one applies again (either rest).
# short: spends hit_dice Hit Point Dice (at most those left), each rolling the die plus the
#   Constitution modifier (at least 1, per the SRD's Short Rest rule); with applyHealing (the default) that's healed, up to
#   the maximum. Pact Magic slots come back.
# long: hit points to the maximum, temporary hit points gone, every spell slot back, death
#   saves cleared, exhaustion down by one, and Hit Point Dice back: all of them
#   (hitDiceRecovery 'all', the 2024 rules) or half the total, at least one ('half', 2014).
def rest_changes(kind, hit_dice, play, limits, hit_die, con_modifier, roll, options=None):
    options = options or {}
    changes = {'maxHpOverride': None} if options.get('resetMaxHp') else {}
    state = play_state({**play, **changes}, limits)
    if kind == 'long':
        spent = state['hitDice']['spent']
        recovered = spent if options.get('hitDiceRecovery', 'all') == 'all' else min(spent, max(1, state['hitDice']['total'] // 2))
        changes.update({
            'currentHp': state['maxHp'] if state['maxHp'] is not None else state['currentHp'],
            'tempHp': 0, 'spentSlots': {}, 'spentPactSlots': 0, 'spentHitDice': spent - recovered,
            'deathSaves': {'successes': 0, 'failures': 0},
            'exhaustion': max(0, state['exhaustion'] - 1),
            # Every limited-use feature recharges ("short" ones on a long rest too).
            'featureUses': {},
        })
        return changes, {'kind': 'long', 'hitDiceRecovered': recovered,
                         'healed': (state['maxHp'] or 0) - (state['currentHp'] or 0)}
    left = state['hitDice']['total'] - state['hitDice']['spent']
    spend = min(hit_dice, left)
    rolls = [roll(hit_die) for _ in range(spend)] if hit_die else []
    healed = sum(max(1, r + (con_modifier or 0)) for r in rolls)
    apply = options.get('applyHealing', True)
    changes['spentPactSlots'] = 0
    # Features that recharge on a short rest come back in full; those that regain some on one
    # (Rage, Channel Divinity) get that many back.
    uses = {}
    for fid, spent in state['featureUses'].items():
        limit = limits['features'][fid]
        if limit['recharge'] == 'short':
            spent = 0
        elif limit['shortRecover']:
            spent = max(0, spent - limit['shortRecover'])
        if spent:
            uses[fid] = spent
    changes['featureUses'] = uses
    if rolls:
        changes['spentHitDice'] = state['hitDice']['spent'] + len(rolls)
        if apply and state['currentHp'] is not None:
            top = state['maxHp'] if state['maxHp'] is not None else state['currentHp'] + healed
            changes['currentHp'] = min(top, state['currentHp'] + healed)
            if changes['currentHp'] > 0:
                changes['deathSaves'] = {'successes': 0, 'failures': 0}
    return changes, {'kind': 'short', 'rolls': rolls, 'conModifier': con_modifier or 0, 'healed': healed,
                     'applied': bool(apply)}

STATE_FIELDS = ('currentHp', 'maxHpOverride', 'tempHp', 'spentSlots', 'spentPactSlots', 'conditions',
                'exhaustion', 'spentHitDice', 'deathSaves', 'featureUses')

def _int_in(value, low, high):
    return isinstance(value, int) and not isinstance(value, bool) and low <= value <= high

# Checks a PATCH /state body against the limits and the stored play state, and returns
# (changes, None) to merge into play, or (None, message). Only the fields sent change;
# spentSlots merges by slot level, so one slot level can be saved on its own.
def clean_state_patch(body, play, limits):
    if not isinstance(body, dict) or not body:
        return None, 'Send at least one field to change.'
    unknown = set(body) - set(STATE_FIELDS)
    if unknown:
        return None, f'Unknown field: {sorted(unknown)[0]}.'
    changes = {}
    if 'maxHpOverride' in body:
        value = body['maxHpOverride']
        if value is not None and not _int_in(value, 1, HP_LIMIT):
            return None, f'Maximum hit points must be from 1 to {HP_LIMIT}, or null to work them out.'
        changes['maxHpOverride'] = value
    max_hp = _max_hp({**play, **changes}, limits) or HP_LIMIT
    if 'currentHp' in body:
        if not _int_in(body['currentHp'], 0, max_hp):
            return None, f'Hit points must be from 0 to {max_hp}.'
        changes['currentHp'] = body['currentHp']
    if 'tempHp' in body:
        if not _int_in(body['tempHp'], 0, HP_LIMIT):
            return None, f'Temporary hit points must be from 0 to {HP_LIMIT}.'
        changes['tempHp'] = body['tempHp']
    if 'spentSlots' in body:
        value = body['spentSlots']
        if not isinstance(value, dict):
            return None, 'spentSlots must be {slot level: slots used}.'
        merged = dict(play.get('spentSlots') or {})
        for lvl, used in value.items():
            total = limits['slots'].get(lvl)
            if total is None:
                return None, f'This character has no level {lvl} spell slots.'
            if not _int_in(used, 0, total):
                return None, f'Level {lvl} slots used must be from 0 to {total}.'
            merged[lvl] = used
        changes['spentSlots'] = {k: v for k, v in merged.items() if v}
    if 'spentPactSlots' in body:
        total = limits['pact']['count'] if limits['pact'] else 0
        if not total:
            return None, 'This character has no Pact Magic slots.'
        if not _int_in(body['spentPactSlots'], 0, total):
            return None, f'Pact slots used must be from 0 to {total}.'
        changes['spentPactSlots'] = body['spentPactSlots']
    if 'conditions' in body:
        value = body['conditions']
        known = packs.collection('conditions')
        if not isinstance(value, list) or len(value) > 30 or len(set(map(str, value))) != len(value):
            return None, 'conditions must be a list of different conditions.'
        for cid in value:
            if cid not in known or cid == EXHAUSTION_ID:
                return None, f'Unknown condition: {cid}.'
        changes['conditions'] = value
    if 'exhaustion' in body:
        if not _int_in(body['exhaustion'], 0, 6):
            return None, 'Exhaustion must be from 0 to 6.'
        changes['exhaustion'] = body['exhaustion']
    if 'spentHitDice' in body:
        if not _int_in(body['spentHitDice'], 0, limits['level']):
            return None, f'Hit Point Dice spent must be from 0 to {limits["level"]}.'
        changes['spentHitDice'] = body['spentHitDice']
    if 'deathSaves' in body:
        value = body['deathSaves']
        if not (isinstance(value, dict) and set(value) == {'successes', 'failures'}
                and _int_in(value['successes'], 0, 3) and _int_in(value['failures'], 0, 3)):
            return None, 'deathSaves must be {successes, failures}, each from 0 to 3.'
        changes['deathSaves'] = value
    if 'featureUses' in body:
        value = body['featureUses']
        if not isinstance(value, dict):
            return None, 'featureUses must be {feature id: uses spent}.'
        merged = dict(play.get('featureUses') or {})
        for fid, used in value.items():
            limit = limits.get('features', {}).get(fid)
            if limit is None:
                return None, 'That feature has no limited uses.'
            if not _int_in(used, 0, limit['max']):
                return None, f'Uses spent must be from 0 to {limit["max"]}.'
            merged[fid] = used
        changes['featureUses'] = {k: v for k, v in merged.items() if v}
    return changes, None
