import type { AbilityRoll, CharacterDraft } from "./characters";
import { apiClient } from "./client";

// A character still being made, as the home page lists it.
export interface DraftSummary {
    id: string,
    name: string,
    species: string | null,
    class: string | null,
    // Both null for the Character Sandbox.
    campaignId: string | null,
    campaignName: string | null,
    updatedAt: string,
}

// The wizard's saved progress and the step to reopen on.
export interface SavedDraft {
    campaignId: string | null,
    draft: CharacterDraft,
    step: string | null,
}

export function listDrafts(): Promise<DraftSummary[]> {
    return apiClient.get("/drafts").then(response => response.data);
}

// rolls are the ability scores the server rolled for the draft, if any.
export function getDraft(id: string): Promise<SavedDraft & { id: string, rolls: AbilityRoll[] | null }> {
    return apiClient.get(`/drafts/${id}`).then(response => response.data);
}

// Resolves with the new draft's id.
export function createDraft(saved: SavedDraft): Promise<string> {
    return apiClient.post("/drafts", saved).then(response => response.data.id);
}

export function saveDraft(id: string, saved: SavedDraft): Promise<void> {
    return apiClient.put(`/drafts/${id}`, saved).then(() => undefined);
}

// Campaign drafts can be rolled only once.
export function rollAbilities(id: string): Promise<AbilityRoll[]> {
    return apiClient.post(`/drafts/${id}/roll`).then(response => response.data.rolls);
}

export function deleteDraft(id: string): Promise<void> {
    return apiClient.delete(`/drafts/${id}`).then(() => undefined);
}
