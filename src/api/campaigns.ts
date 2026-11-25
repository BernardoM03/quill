import { v4 as uuidv4 } from "uuid";

import { apiClient } from "./client";
import type { Campaign } from "../datatypes/campaign";
import type { CampaignDetails, CampaignQuestion } from "../datatypes/campaignDetails";
import type { CampaignRules } from "../datatypes/campaignRules";

export const CAMPAIGN_NAME_MAX_LENGTH = 64;

// Returns the cleaned name, or null if it is empty, too long, or has control characters.
export function validateCampaignName(raw: string): string | null {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name || name.length > CAMPAIGN_NAME_MAX_LENGTH) return null;
    if (/\p{Cc}/u.test(name)) return null;
    return name;
}

export function createCampaign(name: string): Promise<Campaign> {
    const newCampaign: Campaign = { name, id: uuidv4() };

    return apiClient.post("/campaigns", newCampaign).then(() => newCampaign);
}

export function getCampaign(id: string): Promise<CampaignDetails> {
    return apiClient.get(`/campaigns/${id}`).then(response => response.data);
}

// Applies {collection: ids} as one change, where null ids allow the whole collection.
// Resolves with the campaign's problems after the change.
export function updateCampaignAllowed(id: string, changes: Record<string, string[] | null>): Promise<string[]> {
    return apiClient.patch(`/campaigns/${id}`, { allowedContent: changes })
        .then(response => response.data.problems);
}

// Saves only the rules given and leaves the rest unchanged.
export function updateCampaignRules(id: string, rules: Partial<CampaignRules>): Promise<void> {
    return apiClient.patch(`/campaigns/${id}`, { rules }).then(() => undefined);
}

export const QUESTION_PROMPT_MAX_LENGTH = 200;
export const MAX_QUESTIONS = 20;

// Replaces the campaign's custom questions with these, in order.
export function updateCampaignQuestions(id: string, questions: CampaignQuestion[]): Promise<void> {
    return apiClient.patch(`/campaigns/${id}`, { questions }).then(() => undefined);
}

export const CAMPAIGN_DESCRIPTION_MAX_LENGTH = 10000;

export function updateCampaignDescription(id: string, description: string): Promise<void> {
    return apiClient.patch(`/campaigns/${id}`, { description }).then(() => undefined);
}

export function updateCampaignName(id: string, name: string): Promise<void> {
    return apiClient.patch(`/campaigns/${id}`, { name }).then(() => undefined);
}

// The first UUID segment shown on campaign cards, e.g. 703ffe14.
export function shortCampaignId(id: string): string {
    return id.slice(0, 8);
}

export function deleteCampaign(id: string): Promise<void> {
    return apiClient.delete(`/campaigns/${id}`).then(() => undefined);
}

// Someone in a campaign, as its GM sees them.
export interface CampaignMember {
    userId: string,
    username: string,
    displayName: string,
    role: 'gm' | 'player',
    joinedAt: string,
    characterCount: number,
}

export function getMembers(campaignId: string): Promise<CampaignMember[]> {
    return apiClient.get(`/campaigns/${campaignId}/members`).then(response => response.data);
}

// Removes a player and deletes their characters in this campaign.
export function removeMember(campaignId: string, userId: string): Promise<void> {
    return apiClient.delete(`/campaigns/${campaignId}/members/${userId}`).then(() => undefined);
}
