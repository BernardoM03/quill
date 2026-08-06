import { v4 as uuidv4 } from "uuid";

import { apiClient } from "./client";
import type { campaign } from "../datatypes/campaign";

export function createCampaign(name: string): Promise<campaign> {
    const newCampaign: campaign = { name, id: uuidv4() };

    return apiClient.post("/create/campaign", newCampaign).then(() => newCampaign);
}

export function updateCampaignName(id: string, name: string): Promise<void> {
    return apiClient.put("/update/campaign-name", { id, name }).then(() => undefined);
}
