import { useNavigate } from "react-router";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";

import type { campaign } from "../datatypes/campaign";


export default function SetupCampaign() {
    const navigate = useNavigate();

    function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault()

        const newCampaign: campaign = {
            name: new FormData(e.currentTarget).get('campaignName') as string,
            id: uuidv4()
        };

        axios.post('http://localhost:5174/createcampaign', newCampaign)
            .then(() => navigate(`/campaignsettings/${newCampaign.id}`))
            .catch((error) => console.error('Error creating campaign:', error));
    }

    return (
        <div>
            <h1>Setup Campaign</h1>
            <form method="post" onSubmit={handleSubmit}> 
                <label>
                    Campaign Name:
                    <input type="text" maxLength={64} name="campaignName" />
                </label>
                <button type="submit">Create Campaign</button>
            </form>
        </div>
    )
}