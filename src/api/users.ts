import { apiClient } from "./client";
import type { user } from "../datatypes/user";

export function getUser(): Promise<user> {
    return apiClient.get<user>("/user").then((res) => res.data);
}

export function createUser(name: string): Promise<void> {
    return apiClient.post("/user", { name }).then(() => undefined);
}
