import type { campaignRules, ruleLimits } from "./campaignRules";

export interface campaignDetails {
    name: string,
    // The current user's role in this campaign; 'admin' for an admin who isn't a member.
    role: 'gm' | 'player' | 'admin',
    description: string | null,
    characters: string[],
    alternateRules: string[],
    // Per collection ("species", ...): the allowed pack ids, or null/missing for "everything".
    allowedContent: Record<string, string[] | null>
    // Every rule, with the server's defaults filled in for any the GM hasn't changed.
    rules: campaignRules,
    ruleLimits: ruleLimits,
    // What the settings are missing before characters can be made, worked out by the
    // server (server/rules/problems.py). Empty when they're fine.
    problems: string[]
};
