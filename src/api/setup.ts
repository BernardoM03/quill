import { apiClient } from "./client";

// True until an admin account with a password exists.
export function isSetupNeeded(): Promise<boolean> {
    return apiClient.get("/setup").then(response => response.data.needed);
}

// token comes from the setup link the server prints. Signs the new admin in.
export function completeSetup(token: string, username: string, password: string, displayName?: string): Promise<void> {
    return apiClient.post("/setup", { token, username, password, ...(displayName ? { displayName } : {}) })
        .then(() => undefined);
}
