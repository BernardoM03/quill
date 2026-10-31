import { apiClient } from "./client";

// A deleted account the admin can still restore.
export interface deletedAccount {
    id: string,
    username: string,
    displayName: string,
    deletedAt: string,
    // Whole days until the snapshot is permanently deleted; at least 1.
    daysLeft: number,
    campaigns: string[],
    characterCount: number,
}

export interface restoreResult {
    username: string,
    restoredCharacters: number,
    skippedCharacters: number,
    // Names of campaigns deleted since; those memberships and characters weren't restored.
    skippedCampaigns: string[],
}

export function getDeletedAccounts(): Promise<deletedAccount[]> {
    return apiClient.get("/admin/deleted-accounts").then(response => response.data);
}

export function restoreAccount(id: string): Promise<restoreResult> {
    return apiClient.post(`/admin/deleted-accounts/${id}/restore`).then(response => response.data);
}
