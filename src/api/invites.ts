import { apiClient } from "./client";

export type inviteStatus = 'active' | 'expired' | 'used' | 'revoked';

export interface inviteCheck {
    campaignName: string,
    valid: boolean,
    status: inviteStatus,
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
