import type { CampaignRules, RuleLimits } from "./campaignRules";
import type { Question } from "./generated/campaign-settings";

// A GM's custom question, asked on the wizard's Details step.
export type CampaignQuestion = Question;

export interface CampaignDetails {
    name: string,
    // 'admin' means an admin who isn't a member.
    role: 'gm' | 'player' | 'admin',
    description: string | null,
    characters: string[],
    // Allowed pack ids per collection, where a missing collection allows everything.
    allowedContent: Record<string, string[] | null>
    // Every rule, with server defaults filled in for those the GM hasn't changed.
    rules: CampaignRules,
    ruleLimits: RuleLimits,
    // Custom questions in the order they're asked.
    questions: CampaignQuestion[],
    // What the settings lack before characters can be made, empty when they're fine.
    problems: string[]
};
