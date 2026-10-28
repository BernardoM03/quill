import { v4 as uuidv4 } from "uuid";

import { apiClient } from "./client";
import type { campaign } from "../datatypes/campaign";
import type { campaignDetails } from "../datatypes/campaignDetails";

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

    return apiClient.post("/create/campaign", newCampaign).then(() => newCampaign);
}

export function getCampaign(id: string): Promise<campaignDetails> {
    return apiClient.get(`/campaign/${id}`).then(response => response.data);
}

// ids null means every entry in the collection is allowed.
export function updateCampaignAllowed(id: string, collection: string, ids: string[] | null): Promise<void> {
    return apiClient.put("/update/campaign-allowed", { id, collection, ids }).then(() => undefined);
}

export function updateCampaignName(id: string, name: string): Promise<void> {
    return apiClient.put("/update/campaign-name", { id, name }).then(() => undefined);
}
