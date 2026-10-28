// Campaign-wide rules that character creation (and later, leveling) must follow.
// The campaign file stores only what the DM changed; read through withRuleDefaults.
export interface campaignRules {
    // Allow the optional class features (extra options some classes gain at certain levels).
    optionalClassFeatures: boolean,
    // Let players move their origin's ability score increases and swap its proficiencies.
    customizeOrigin: boolean,
    // xp: characters start at level 1 and level up from experience points.
    // milestone: the DM sets the level; new characters start at milestoneLevel.
    advancement: 'xp' | 'milestone',
    milestoneLevel: number,
    // automatic: each level past 1st gives the hit die's fixed average.
    // manual: players roll or enter hit points for each level.
    hitPoints: 'automatic' | 'manual',
    // When off, any feat (or multiclass) can be picked regardless of its prerequisites.
    featPrerequisites: boolean,
    // When off, characters keep to one class and multiclassPrerequisites doesn't apply.
    allowMulticlass: boolean,
    multiclassPrerequisites: boolean,
    // Track carrying capacity and apply the encumbered penalties.
    encumbrance: boolean,
    // Coins count for nothing toward carried weight.
    ignoreCoinWeight: boolean,

    // How ability scores are set. pointBuyBudget applies only to pointBuy.
    // sharedManual: the DM sets six scores (sharedScores) that every player assigns as they like.
    abilityScoreMethod: 'standardArray' | 'pointBuy' | 'roll' | 'manual' | 'sharedManual',
    pointBuyBudget: number,
    sharedScores: number[],

    // ---- Advanced: character creation ----
    // equipment / gold: every class and background uses that option. choice: players pick per option.
    startingEquipment: 'choice' | 'equipment' | 'gold',
    // background: the Origin feat the background grants. any: players pick any Origin feat.
    originFeat: 'background' | 'any',
    // New characters wait for the DM's approval before they can be played.
    characterApproval: boolean,
}

export const DEFAULT_CAMPAIGN_RULES: campaignRules = {
    optionalClassFeatures: false,
    customizeOrigin: false,
    advancement: 'xp',
    milestoneLevel: 1,
    hitPoints: 'automatic',
    featPrerequisites: true,
    allowMulticlass: true,
    multiclassPrerequisites: true,
    encumbrance: false,
    ignoreCoinWeight: false,
    abilityScoreMethod: 'standardArray',
    pointBuyBudget: 27,
    sharedScores: [15, 14, 13, 12, 10, 8],
    startingEquipment: 'choice',
    originFeat: 'background',
    characterApproval: false,
}

export const MAX_LEVEL = 20
export const POINT_BUY_BUDGET_RANGE = { min: 15, max: 40 }
export const SHARED_SCORE_RANGE = { min: 1, max: 20 }

export function withRuleDefaults(rules: Partial<campaignRules> | undefined): campaignRules {
    return { ...DEFAULT_CAMPAIGN_RULES, ...rules }
}

// The level a new character starts at under these rules.
export function startingLevel(rules: campaignRules): number {
    return rules.advancement === 'milestone' ? rules.milestoneLevel : 1
}
