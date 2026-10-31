import { apiClient } from "./client";

export type inviteStatus = 'active' | 'expired' | 'used' | 'revoked';

export interface inviteCheck {
    campaignName: string,
    valid: boolean,
    status: inviteStatus,
}

// An invite as its GM sees it. The token isn't included: the server only keeps its hash.
export interface invite {
    id: string,
    status: inviteStatus,
    maxUses: number | null,
    useCount: number,
    expiresAt: string | null,
    createdAt: string,
}

// Returned once, on creation; the only time the raw token is available.
export interface createdInvite extends invite {
    token: string,
}

export function joinLink(token: string): string {
    return `${window.location.origin}/join/${token}`;
}

export function getInvites(campaignId: string): Promise<invite[]> {
    return apiClient.get(`/campaigns/${campaignId}/invites`).then(response => response.data);
}

// expiresInDays and maxUses: null means never / unlimited.
export function createInvite(campaignId: string, expiresInDays: number | null, maxUses: number | null): Promise<createdInvite> {
    return apiClient.post(`/campaigns/${campaignId}/invites`, { expiresInDays, maxUses }).then(response => response.data);
}

// Takes the invite id; the server accepts it in place of the token.
export function revokeInvite(id: string): Promise<void> {
    return apiClient.delete(`/invites/${id}`).then(() => undefined);
}

// The invite behind a join link, or null if the token doesn't exist.
export function checkInvite(token: string): Promise<inviteCheck | null> {
    return apiClient.get(`/invites/${encodeURIComponent(token)}`)
        .then(response => response.data)
        .catch(err => {
            if (err.response?.status === 404) return null;
            throw err;
        });
}

// Joins the signed-in player to the invite's campaign. Resolves with the campaign id.
export function acceptInvite(token: string): Promise<string> {
    return apiClient.post(`/invites/${encodeURIComponent(token)}/accept`)
        .then(response => response.data.campaignId);
}
