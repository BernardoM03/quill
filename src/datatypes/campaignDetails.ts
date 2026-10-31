import type { campaignRules } from "./campaignRules";

export interface campaignDetails {
    name: string,
    // The current user's role in this campaign.
    role: 'gm' | 'player',
    description: string | null,
    characters: string[],
    alternateRules: string[],
    // Per collection ("species", ...): the allowed pack ids, or null/missing for "everything".
    allowedContent: Record<string, string[] | null>
    // Only the rules the DM changed; read through withRuleDefaults.
    rules: Partial<campaignRules>
};
