import { useNavigate } from "react-router";

import { createCampaign } from "../api/campaigns";
import FormField from "../components/FormField";

export default function SetupCampaign() {
    const navigate = useNavigate();

    function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault()

        const name = new FormData(e.currentTarget).get('campaignName') as string;

        createCampaign(name)
            .then((newCampaign) => navigate(`/campaignsettings/${newCampaign.id}`))
            .catch((error) => console.error('Error creating campaign:', error));
    }

    return (
        <div>
            <h1>Setup Campaign</h1>
            <form method="post" onSubmit={handleSubmit}>
                <FormField label="Campaign Name:" name="campaignName" maxLength={64} />
                <button type="submit">Create Campaign</button>
            </form>
        </div>
    )
}
