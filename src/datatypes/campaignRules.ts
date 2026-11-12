import type { Rules } from "./generated/campaign-settings";

// Campaign-wide rules that character creation (and later, leveling) must follow.
// Defined in schemas/records/campaign-settings.schema.json ($defs.rules), which also holds
// each rule's meaning, default and limits; the type is generated from it (npm run gen-types).
// A campaign stores only the rules its GM changed, but the server always sends every rule
// filled in, so here every rule is present.
export type campaignRules = Required<Rules>

// The ranges the server accepts, sent with a campaign as ruleLimits.
export interface ruleLimits {
    maxLevel: number,
    pointBuyBudget: { min: number, max: number },
    sharedScore: { min: number, max: number },
}
