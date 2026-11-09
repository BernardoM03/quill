import type { campaignRules, ruleLimits } from "./campaignRules";
import type { Question } from "./generated/campaign-settings";

// A GM's custom question, asked on the wizard's Details step. Defined in
// schemas/records/campaign-settings.schema.json ($defs.question).
export type campaignQuestion = Question;

export interface campaignDetails {
    name: string,
    // The current user's role in this campaign; 'admin' for an admin who isn't a member.
    role: 'gm' | 'player' | 'admin',
    description: string | null,
    characters: string[],
    // Per collection ("species", ...): the allowed pack ids; missing for "everything".
    // Stored in the campaign_content tables, not in settings.
    allowedContent: Record<string, string[] | null>
    // Every rule, with the server's defaults filled in for any the GM hasn't changed.
    rules: campaignRules,
    ruleLimits: ruleLimits,
    // The custom questions, in the order they're asked; empty for none.
    questions: campaignQuestion[],
    // What the settings are missing before characters can be made, worked out by the
    // server (server/rules/problems.py). Empty when they're fine.
    problems: string[]
};
