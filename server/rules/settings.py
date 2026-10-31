# Campaign rule defaults and limits, ported from src/datatypes/campaignRules.ts (which now
# only describes their shape). A campaign stores just the rules its GM changed; everything
# else uses these defaults, and so does the Character Sandbox.

MAX_LEVEL = 20

# Sent to the browser as ruleLimits, so the settings page offers exactly what the server accepts.
LIMITS = {
    'maxLevel': MAX_LEVEL,
    'pointBuyBudget': {'min': 15, 'max': 40},
    'sharedScore': {'min': 1, 'max': 20},
}

RULE_DEFAULTS = {
    # Allow the optional class features (extra options some classes gain at certain levels).
    'optionalClassFeatures': False,
    # Let players move their origin's ability score increases and swap its proficiencies.
    'customizeOrigin': False,
    # xp: characters start at level 1 and level up from experience points.
    # milestone: the GM sets the level; new characters start at milestoneLevel.
    'advancement': 'xp',
    'milestoneLevel': 1,
    # automatic: each level past 1st gives the hit die's fixed average. manual: players roll or enter it.
    'hitPoints': 'automatic',
    # When off, any feat (or multiclass) can be picked regardless of its prerequisites.
    'featPrerequisites': True,
    # When off, characters keep to one class and multiclassPrerequisites doesn't apply.
    'allowMulticlass': True,
    'multiclassPrerequisites': True,
    # Track carrying capacity and apply the encumbered penalties.
    'encumbrance': False,
    # Coins count for nothing toward carried weight.
    'ignoreCoinWeight': False,
    # How ability scores are set. pointBuyBudget applies only to pointBuy; sharedManual has
    # every player assign the six sharedScores the GM sets.
    'abilityScoreMethod': 'standardArray',
    'pointBuyBudget': 27,
    'sharedScores': [15, 14, 13, 12, 10, 8],
    # equipment / gold: every class and background uses that option. choice: players pick per option.
    'startingEquipment': 'choice',
    # background: the Origin feat the background grants. any: players pick any Origin feat.
    'originFeat': 'background',
    # New characters wait for the GM's approval before they can be played.
    'characterApproval': False,
}

# The full rules: the stored changes over the defaults. Rules no longer known are dropped.
def with_rule_defaults(stored):
    rules = {key: (list(value) if isinstance(value, list) else value) for key, value in RULE_DEFAULTS.items()}
    rules.update({key: value for key, value in (stored or {}).items() if key in RULE_DEFAULTS})
    return rules

# The level a new character starts at under these rules.
def starting_level(rules):
    return rules['milestoneLevel'] if rules['advancement'] == 'milestone' else 1
