# Ability scores and hit points for a new character. The campaign's rules pick the method
# for each (abilityScoreMethod, hitPoints); the Character Sandbox lets the player pick any.
#   standardArray  assign 15, 14, 13, 12, 10, 8
#   pointBuy       scores 8-15, bought from pointBuyBudget points
#   roll           4d6 drop the lowest, six times, rolled by the server and kept with the draft
#   manual         enter each score
#   sharedManual   assign the six scores the GM set (sharedScores)
# Hit points: the class's hit die at level 1, then the die's average (automatic) or the
# player's roll (manual) each level after, each plus the Constitution modifier.

import random

from server.rules import packs
from server.rules.choices import ABILITY_NAMES
from server.rules.settings import LIMITS

ABILITIES = list(ABILITY_NAMES)
METHODS = ['standardArray', 'pointBuy', 'roll', 'manual', 'sharedManual']
HP_METHODS = ['automatic', 'manual']
STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]
POINT_COSTS = {8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9}
MANUAL_RANGE = (3, 18)
SCORE_MAX = 20
HP_TARGET = 'hitPointMaximum'

def methods(setting):
    if setting.allowed is None:
        return METHODS, HP_METHODS
    return [setting.rules['abilityScoreMethod']], [setting.rules['hitPoints']]

# What the wizard needs to offer the methods: every method (shown even when the campaign
# rules it out), which may be used, and each one's numbers.
def ability_rules(setting):
    ability_methods, hp_methods = methods(setting)
    return {
        'methods': METHODS,
        'allowedMethods': ability_methods,
        'hpMethods': HP_METHODS,
        'allowedHpMethods': hp_methods,
        'standardArray': STANDARD_ARRAY,
        'pointBuyBudget': setting.rules['pointBuyBudget'],
        'pointCosts': {str(k): v for k, v in POINT_COSTS.items()},
        'sharedScores': setting.rules['sharedScores'],
        'manualRange': {'min': MANUAL_RANGE[0], 'max': MANUAL_RANGE[1]},
    }

# Six sets of 4d6, each keeping the highest three: [{dice: [4 rolls], total}].
def roll_scores(rng=random.SystemRandom()):
    rolls = []
    for _ in range(6):
        dice = [rng.randint(1, 6) for _ in range(4)]
        rolls.append({'dice': dice, 'total': sum(dice) - min(dice)})
    return rolls

def modifier(score):
    return (score - 10) // 2

def _error(field, message):
    return {'field': field, 'message': message}

def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)

# The scores a method must use, as a sorted list, or None when any scores in range will do.
def _pool(method, setting, rolls):
    if method == 'standardArray':
        return sorted(STANDARD_ARRAY)
    if method == 'sharedManual':
        return sorted(setting.rules['sharedScores'])
    if method == 'roll':
        return sorted(r['total'] for r in rolls) if rolls else None
    return None

# Problems with the method and base scores. rolls: the draft's server rolls, or None.
def ability_errors(draft, setting, rolls):
    ability_methods, _ = methods(setting)
    method = draft.get('abilityMethod') or (ability_methods[0] if len(ability_methods) == 1 else None)
    if method not in ability_methods:
        return [_error('abilityMethod', 'Choose how to set your ability scores.')]
    scores = draft.get('abilityScores')
    if not isinstance(scores, dict) or not all(_is_int(scores.get(a)) for a in ABILITIES):
        if method == 'roll' and not rolls:
            return [_error('abilityScores', 'Roll your ability scores.')]
        return [_error('abilityScores', 'Give every ability a score.')]
    values = [scores[a] for a in ABILITIES]
    if method == 'roll' and not rolls:
        return [_error('abilityScores', 'Roll your ability scores.')]
    pool = _pool(method, setting, rolls)
    if pool is not None and sorted(values) != pool:
        what = {'standardArray': 'the standard array', 'sharedManual': 'your GM’s scores',
                'roll': 'your rolls'}[method]
        return [_error('abilityScores', f'Use each of {what} once: {", ".join(map(str, sorted(pool, reverse=True)))}.')]
    if method == 'pointBuy':
        if not all(v in POINT_COSTS for v in values):
            return [_error('abilityScores', 'With point buy, each score is from 8 to 15.')]
        spent, budget = sum(POINT_COSTS[v] for v in values), setting.rules['pointBuyBudget']
        if spent > budget:
            return [_error('abilityScores', f'That costs {spent} points; you have {budget}.')]
    if method == 'manual' and not all(MANUAL_RANGE[0] <= v <= MANUAL_RANGE[1] for v in values):
        return [_error('abilityScores', f'Each score must be from {MANUAL_RANGE[0]} to {MANUAL_RANGE[1]}.')]
    return []

# The base scores plus the background's increases, at most 20: {ability: {base, bonus, total, modifier}}.
def final_scores(base, increases):
    result = {}
    for a in ABILITIES:
        b = base.get(a) if isinstance(base, dict) and _is_int(base.get(a)) else None
        bonus = increases.get(a, 0) if b is not None else 0
        total = min(SCORE_MAX, b + bonus) if b is not None else None
        result[a] = {'base': b, 'bonus': bonus, 'total': total,
                     'modifier': modifier(total) if total is not None else None}
    return result

def hp_method(draft, setting):
    _, hp_methods = methods(setting)
    return draft.get('hpMethod') if len(hp_methods) > 1 else hp_methods[0]

def hp_errors(draft, setting, hit_die):
    _, hp_methods = methods(setting)
    method = hp_method(draft, setting)
    if method not in hp_methods:
        return [_error('hpMethod', 'Choose how to set your hit points.')]
    if method == 'manual' and setting.level > 1 and hit_die:
        rolls = draft.get('hpRolls')
        if (not isinstance(rolls, list) or len(rolls) != setting.level - 1
                or not all(_is_int(r) and 1 <= r <= hit_die for r in rolls)):
            return [_error('hpRolls', f'Roll or enter a d{hit_die} for each level after the first '
                                      f'({setting.level - 1} in all).')]
    return []

# Features that raise the Hit Point maximum (Dwarven Toughness, Draconic Resilience), as
# [{name, amount}] at this level. features: (feature, level it's gained at) pairs.
def hp_bonuses(features, level):
    bonuses = []
    for feature, gained in features:
        if gained > level:
            continue
        for effect in feature.get('effects') or []:
            if effect.get('type') != 'modifier' or effect.get('target') != HP_TARGET:
                continue
            value = effect.get('value')
            amount = value if _is_int(value) else (
                level if value in ('$derived:characterLevel', '$derived:classLevel') else 0)
            if amount:
                bonuses.append({'name': feature['name'], 'amount': amount})
    return bonuses

# {max, perLevel: [hp gained at each level], conModifier, bonuses}; None until it can be worked out.
def hit_points(hit_die, level, con_modifier, method, hp_rolls, bonuses):
    if not hit_die or con_modifier is None:
        return None
    gains = [hit_die]
    for i in range(level - 1):
        roll = hit_die // 2 + 1 if method == 'automatic' else (
            hp_rolls[i] if isinstance(hp_rolls, list) and i < len(hp_rolls) and _is_int(hp_rolls[i]) else None)
        if roll is None:
            return None
        gains.append(roll)
    per_level = [max(1, g + con_modifier) for g in gains]
    return {'max': sum(per_level) + sum(b['amount'] for b in bonuses), 'perLevel': per_level,
            'conModifier': con_modifier, 'bonuses': bonuses}

# Species trait and subclass feature pairs for hp_bonuses.
def hp_features(species_id, subclass_id):
    pairs = []
    species = packs.collection('species').get(species_id) if species_id else None
    if species:
        pairs += [(t, 1) for t in species.get('traits') or []]
    subclass = packs.collection('subclasses').get(subclass_id) if isinstance(subclass_id, str) else None
    if subclass:
        pairs += [(f, f.get('level', 1)) for f in subclass.get('features') or []]
    return pairs
