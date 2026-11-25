import random

from server.rules import packs
from server.rules.choices import ABILITY_NAMES
from server.rules.common import ability_modifier, field_error, is_whole_number

# Ability score and hit point methods for a new character.
# Campaigns fix one method each (abilityScoreMethod, hitPoints), while the Character Sandbox allows any.
# Hit points are the hit die at level 1, then its average (automatic) or a roll (manual) per level, plus CON each time.

ABILITIES = list(ABILITY_NAMES)
METHODS = ['standardArray', 'pointBuy', 'roll', 'manual', 'sharedManual']
HP_METHODS = ['automatic', 'manual']
STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]
POINT_COSTS = {8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9}
MANUAL_RANGE = (3, 18)
HP_TARGET = 'hitPointMaximum'
LEVEL_DERIVED_VALUES = ('$derived:characterLevel', '$derived:classLevel')
METHOD_LABELS = {
    'standardArray': 'Standard Array', 'pointBuy': 'Point Buy', 'roll': 'Roll', 'manual': 'Manual',
    'sharedManual': 'the GM’s scores',
}
POOL_DESCRIPTIONS = {'standardArray': 'the standard array', 'sharedManual': 'your GM’s scores', 'roll': 'your rolls'}

# The (ability methods, hit point methods) the setting allows.
def methods(setting):
    if setting.allowed is None:
        return METHODS, HP_METHODS
    return [setting.rules['abilityScoreMethod']], [setting.rules['hitPoints']]

# Every method (shown even when ruled out), which ones may be used, and each one's numbers.
def ability_rules(setting):
    ability_methods, hp_methods = methods(setting)
    return {
        'methods': METHODS,
        'allowedMethods': ability_methods,
        'hpMethods': HP_METHODS,
        'allowedHpMethods': hp_methods,
        'standardArray': STANDARD_ARRAY,
        'pointBuyBudget': setting.rules['pointBuyBudget'],
        'pointCosts': {str(score): cost for score, cost in POINT_COSTS.items()},
        'sharedScores': setting.rules['sharedScores'],
        'manualRange': {'min': MANUAL_RANGE[0], 'max': MANUAL_RANGE[1]},
    }

# Six sets of 4d6 keeping the highest three, as [{dice, total}].
def roll_scores(rng=random.SystemRandom()):
    rolls = []
    for _ in range(6):
        dice = [rng.randint(1, 6) for _ in range(4)]
        rolls.append({'dice': dice, 'total': sum(dice) - min(dice)})
    return rolls

def modifier(score):
    return ability_modifier(score)

# The sorted scores a method must use, or None when any scores in range will do.
def _required_pool(method, setting, rolls):
    if method == 'standardArray':
        return sorted(STANDARD_ARRAY)
    if method == 'sharedManual':
        return sorted(setting.rules['sharedScores'])
    if method == 'roll':
        return sorted(roll['total'] for roll in rolls) if rolls else None
    return None

def _chosen_method(draft, ability_methods):
    return draft.get('abilityMethod') or (ability_methods[0] if len(ability_methods) == 1 else None)

# Problems with the ability method and base scores, given the draft's server rolls (or None).
def ability_errors(draft, setting, rolls):
    ability_methods, _ = methods(setting)
    method = _chosen_method(draft, ability_methods)
    if method not in ability_methods:
        if method in METHOD_LABELS and len(ability_methods) == 1:
            # A saved character whose campaign has since changed its method.
            return [field_error('abilityMethod', f'This campaign uses {METHOD_LABELS[ability_methods[0]]} for ability '
                                                 f'scores now, not {METHOD_LABELS[method]}. Set your scores again.')]
        return [field_error('abilityMethod', 'Choose how to set your ability scores.')]
    scores = draft.get('abilityScores')
    if not isinstance(scores, dict) or not all(is_whole_number(scores.get(ability)) for ability in ABILITIES):
        if method == 'roll' and not rolls:
            return [field_error('abilityScores', 'Roll your ability scores.')]
        return [field_error('abilityScores', 'Give every ability a score.')]
    values = [scores[ability] for ability in ABILITIES]
    if method == 'roll' and not rolls:
        return [field_error('abilityScores', 'Roll your ability scores.')]
    pool = _required_pool(method, setting, rolls)
    if pool is not None and sorted(values) != pool:
        listed = ', '.join(map(str, sorted(pool, reverse=True)))
        return [field_error('abilityScores', f'Use each of {POOL_DESCRIPTIONS[method]} once: {listed}.')]
    if method == 'pointBuy':
        if not all(value in POINT_COSTS for value in values):
            return [field_error('abilityScores', 'With point buy, each score is from 8 to 15.')]
        spent, budget = sum(POINT_COSTS[value] for value in values), setting.rules['pointBuyBudget']
        if spent > budget:
            return [field_error('abilityScores', f'That costs {spent} points; you have {budget}.')]
    if method == 'manual' and not all(MANUAL_RANGE[0] <= value <= MANUAL_RANGE[1] for value in values):
        return [field_error('abilityScores', f'Each score must be from {MANUAL_RANGE[0]} to {MANUAL_RANGE[1]}.')]
    return []

def hp_method(draft, setting):
    _, hp_methods = methods(setting)
    return draft.get('hpMethod') if len(hp_methods) > 1 else hp_methods[0]

def hp_errors(draft, setting, hit_die):
    _, hp_methods = methods(setting)
    method = hp_method(draft, setting)
    if method not in hp_methods:
        return [field_error('hpMethod', 'Choose how to set your hit points.')]
    if method == 'manual' and setting.level > 1 and hit_die:
        rolls = draft.get('hpRolls')
        if (not isinstance(rolls, list) or len(rolls) != setting.level - 1
                or not all(is_whole_number(roll) and 1 <= roll <= hit_die for roll in rolls)):
            return [field_error('hpRolls', f'Roll or enter a d{hit_die} for each level after the first '
                                           f'({setting.level - 1} in all).')]
    return []

# Features raising the Hit Point maximum (Dwarven Toughness, Draconic Resilience) as [{name, amount}].
# features is a list of (feature, level gained) pairs.
def hp_bonuses(features, level):
    bonuses = []
    for feature, gained_at in features:
        if gained_at > level:
            continue
        for effect in feature.get('effects') or []:
            if effect.get('type') != 'modifier' or effect.get('target') != HP_TARGET:
                continue
            value = effect.get('value')
            if is_whole_number(value):
                amount = value
            else:
                amount = level if value in LEVEL_DERIVED_VALUES else 0
            if amount:
                bonuses.append({'name': feature['name'], 'amount': amount})
    return bonuses

def _level_gain(method, hit_die, hp_rolls, index):
    if method == 'automatic':
        return hit_die // 2 + 1
    if isinstance(hp_rolls, list) and index < len(hp_rolls) and is_whole_number(hp_rolls[index]):
        return hp_rolls[index]
    return None

# {max, perLevel, conModifier, bonuses}, or None until it can be worked out.
def hit_points(hit_die, level, con_modifier, method, hp_rolls, bonuses):
    if not hit_die or con_modifier is None:
        return None
    gains = [hit_die]
    for index in range(level - 1):
        gain = _level_gain(method, hit_die, hp_rolls, index)
        if gain is None:
            return None
        gains.append(gain)
    per_level = [max(1, gain + con_modifier) for gain in gains]
    return {'max': sum(per_level) + sum(bonus['amount'] for bonus in bonuses), 'perLevel': per_level,
            'conModifier': con_modifier, 'bonuses': bonuses}

# Species trait and subclass feature (feature, level gained) pairs for hp_bonuses.
def hp_features(species_id, subclass_id):
    pairs = []
    species = packs.collection('species').get(species_id) if species_id else None
    if species:
        pairs += [(trait, 1) for trait in species.get('traits') or []]
    subclass = packs.collection('subclasses').get(subclass_id) if isinstance(subclass_id, str) else None
    if subclass:
        pairs += [(feature, feature.get('level', 1)) for feature in subclass.get('features') or []]
    return pairs
