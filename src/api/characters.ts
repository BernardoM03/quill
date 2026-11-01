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

// A character as its owner (or the admin) sees it.
export interface characterSummary {
    id: string,
    name: string,
    isActive: boolean,
    // Both null for a Character Sandbox character.
    campaignId: string | null,
    campaignName: string | null,
    // Changes whenever the portrait does; null when there isn't one.
    portraitVersion: string | null,
}

export function getCharacter(id: string): Promise<characterSummary> {
    return apiClient.get(`/characters/${id}`).then(response => response.data);
}

// The portrait's address. version (from portraitVersion) makes a replaced portrait a new
// URL, so the browser can cache each one without showing an old picture.
export function portraitUrl(characterId: string, version: string): string {
    return `/api/characters/${characterId}/portrait?v=${encodeURIComponent(version)}`;
}

// Uploads an image already cropped and shrunk in the browser (see makePortrait). Resolves
// with the new portraitVersion; rejects with the server's reason if it refuses the image.
export function uploadPortrait(characterId: string, image: Blob): Promise<string> {
    return apiClient.put(`/characters/${characterId}/portrait`, image, { headers: { 'Content-Type': image.type || 'application/octet-stream' } })
        .then(response => response.data.portraitVersion);
}

export function deletePortrait(characterId: string): Promise<void> {
    return apiClient.delete(`/characters/${characterId}/portrait`).then(() => undefined);
}

// Deletes the character and its portrait for good. confirm must be its name.
export function deleteCharacter(characterId: string, confirm: string): Promise<void> {
    return apiClient.delete(`/characters/${characterId}`, { data: { confirm } }).then(() => undefined);
}
