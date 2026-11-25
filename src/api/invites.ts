import { apiClient } from "./client";

export type InviteStatus = 'active' | 'expired' | 'used' | 'revoked';

export interface InviteCheck {
    campaignName: string,
    valid: boolean,
    status: InviteStatus,
}

// The token isn't included because the server keeps only its hash.
export interface Invite {
    id: string,
    status: InviteStatus,
    maxUses: number | null,
    useCount: number,
    expiresAt: string | null,
    createdAt: string,
}

// Returned only on creation, the one time the raw token is available.
export interface CreatedInvite extends Invite {
    token: string,
}

export function joinLink(token: string): string {
    return `${window.location.origin}/join/${token}`;
}

export function getInvites(campaignId: string): Promise<Invite[]> {
    return apiClient.get(`/campaigns/${campaignId}/invites`).then(response => response.data);
}

// A null expiresInDays never expires, and a null maxUses is unlimited.
export function createInvite(campaignId: string, expiresInDays: number | null, maxUses: number | null): Promise<CreatedInvite> {
    return apiClient.post(`/campaigns/${campaignId}/invites`, { expiresInDays, maxUses }).then(response => response.data);
}

// The server accepts the invite id in place of the token.
export function revokeInvite(id: string): Promise<void> {
    return apiClient.delete(`/invites/${id}`).then(() => undefined);
}

// The invite behind a join link, or null if the token doesn't exist.
export function checkInvite(token: string): Promise<InviteCheck | null> {
    return apiClient.get(`/invites/${encodeURIComponent(token)}`)
        .then(response => response.data)
        .catch(err => {
            if (err.response?.status === 404) return null;
            throw err;
        });
}

// Joins the signed-in player to the invite's campaign and resolves with its id.
export function acceptInvite(token: string): Promise<string> {
    return apiClient.post(`/invites/${encodeURIComponent(token)}/accept`)
        .then(response => response.data.campaignId);
}
