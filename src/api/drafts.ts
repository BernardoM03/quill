import type { characterDraft } from "./characters";
import { apiClient } from "./client";

// A character still being made, as home lists it. Names are null until chosen.
export interface draftSummary {
    id: string,
    name: string,
    species: string | null,
    class: string | null,
    // Both null for the Character Sandbox.
    campaignId: string | null,
    campaignName: string | null,
    updatedAt: string,
}

// The wizard's saved progress: what's been chosen, and the step to reopen on.
export interface savedDraft {
    campaignId: string | null,
    draft: characterDraft,
    step: string | null,
}

export function listDrafts(): Promise<draftSummary[]> {
    return apiClient.get("/drafts").then(response => response.data);
}

export function getDraft(id: string): Promise<savedDraft & { id: string }> {
    return apiClient.get(`/drafts/${id}`).then(response => response.data);
}

// Resolves with the new draft's id.
export function createDraft(saved: savedDraft): Promise<string> {
    return apiClient.post("/drafts", saved).then(response => response.data.id);
}

export function saveDraft(id: string, saved: savedDraft): Promise<void> {
    return apiClient.put(`/drafts/${id}`, saved).then(() => undefined);
}

export function deleteDraft(id: string): Promise<void> {
    return apiClient.delete(`/drafts/${id}`).then(() => undefined);
}
