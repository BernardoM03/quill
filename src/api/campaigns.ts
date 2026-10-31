import { v4 as uuidv4 } from "uuid";

import { apiClient } from "./client";
import type { campaign } from "../datatypes/campaign";
import type { campaignDetails } from "../datatypes/campaignDetails";
import type { campaignRules } from "../datatypes/campaignRules";

export const CAMPAIGN_NAME_MAX_LENGTH = 64;

// Returns the cleaned name, or null if it is empty, too long, or has control characters.
export function validateCampaignName(raw: string): string | null {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name || name.length > CAMPAIGN_NAME_MAX_LENGTH) return null;
    if (/\p{Cc}/u.test(name)) return null;
    return name;
}

export function createCampaign(name: string): Promise<campaign> {
    const newCampaign: campaign = { name, id: uuidv4() };

    return apiClient.post("/campaigns", newCampaign).then(() => newCampaign);
}

export function getCampaign(id: string): Promise<campaignDetails> {
    return apiClient.get(`/campaigns/${id}`).then(response => response.data);
}

// ids null means every entry in the collection is allowed.
export function updateCampaignAllowed(id: string, collection: string, ids: string[] | null): Promise<void> {
    return apiClient.patch(`/campaigns/${id}`, { allowedContent: { [collection]: ids } }).then(() => undefined);
}

// Saves only the rules given; the rest stay as they are.
export function updateCampaignRules(id: string, rules: Partial<campaignRules>): Promise<void> {
    return apiClient.patch(`/campaigns/${id}`, { rules }).then(() => undefined);
}

export const CAMPAIGN_DESCRIPTION_MAX_LENGTH = 10000;

export function updateCampaignDescription(id: string, description: string): Promise<void> {
    return apiClient.patch(`/campaigns/${id}`, { description }).then(() => undefined);
}

export function updateCampaignName(id: string, name: string): Promise<void> {
    return apiClient.patch(`/campaigns/${id}`, { name }).then(() => undefined);
}

// The short id shown on campaign cards
// 703ffe14-e831-4fb9-856f-8fe17aa026d4 --> 703ffe14
export function shortCampaignId(id: string): string {
    return id.slice(0, 8);
}

export function deleteCampaign(id: string): Promise<void> {
    return apiClient.delete(`/campaigns/${id}`).then(() => undefined);
}
