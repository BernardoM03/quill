import { apiClient } from "./client";

// The phrase that erases everything with no snapshot. Must match the server's ERASE_PHRASE.
export const ERASE_PHRASE = "All data completely removed";

// A same-origin link: the browser sends the session cookie and saves the JSON file.
export const ACCOUNT_EXPORT_URL = "/api/account/export";

// 'snapshot' keeps a copy the admin can restore for 30 days; 'erase' keeps nothing.
// confirm is the username for 'snapshot' and ERASE_PHRASE for 'erase'.
export function deleteAccount(mode: 'snapshot' | 'erase', confirm: string): Promise<void> {
    return apiClient.delete("/account", { data: { mode, confirm } }).then(() => undefined);
}
