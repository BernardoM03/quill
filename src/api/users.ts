import { apiClient } from "./client";

export function createUser(name: string): Promise<void> {
    return apiClient.post("/create/user", { name }).then(() => undefined);
}
