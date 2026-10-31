import { apiClient } from "./client";

export const CHARACTER_NAME_MAX_LENGTH = 64;

export interface createdCharacter {
    id: string,
    name: string,
    // True when this is the player's first character in the campaign.
    isActive: boolean,
}

// Creates a Character Sandbox character: in no campaign, using all the content the
// server has and the default rules.
export function createSandboxCharacter(name: string): Promise<createdCharacter> {
    return apiClient.post("/sandbox/characters", { name }).then(response => response.data);
}

// Creates a character for the signed-in player in this campaign.
export function createCharacter(campaignId: string, name: string): Promise<createdCharacter> {
    return apiClient.post(`/campaigns/${campaignId}/characters`, { name }).then(response => response.data);
}
