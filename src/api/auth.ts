import { apiClient } from "./client";

export interface sessionUser {
    id: string,
    username: string,
    displayName: string,
    isAdmin: boolean,
}

export const USERNAME_PATTERN = "[A-Za-z0-9_.\\-]{3,32}";
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

// Creates a player from an invite and signs them in. Resolves with the campaign they joined.
export function signup(token: string, username: string, password: string, displayName?: string): Promise<string> {
    return apiClient.post("/auth/signup", { token, username, password, ...(displayName ? { displayName } : {}) })
        .then(response => response.data.campaignId);
}

export function login(username: string, password: string): Promise<sessionUser> {
    return apiClient.post("/auth/login", { username, password }).then(response => response.data);
}

export function logout(): Promise<void> {
    return apiClient.post("/auth/logout").then(() => undefined);
}

// The signed-in user, or null when nobody is.
export function getSessionUser(): Promise<sessionUser | null> {
    return apiClient.get("/auth/me")
        .then(response => response.data)
        .catch(err => {
            if (err.response?.status === 401) return null;
            throw err;
        });
}
