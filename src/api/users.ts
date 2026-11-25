import { apiClient } from "./client";
import type { User } from "../datatypes/user";

export function getUser(): Promise<User> {
    return apiClient.get<User>("/user").then((res) => res.data);
}
