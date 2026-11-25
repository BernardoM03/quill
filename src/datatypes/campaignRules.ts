import type { Rules } from "./generated/campaign-settings";

// Campaign-wide rules, generated from campaign-settings.schema.json $defs.rules.
// The server always sends every rule with defaults filled in, so every field is required here.
export type CampaignRules = Required<Rules>

// The ranges the server accepts, sent with a campaign as ruleLimits.
export interface RuleLimits {
    maxLevel: number,
    pointBuyBudget: { min: number, max: number },
    sharedScore: { min: number, max: number },
}
