import { useNavigate } from "react-router";

import { CAMPAIGN_NAME_MAX_LENGTH, createCampaign, validateCampaignName } from "../api/campaigns";
import FormField from "../components/FormField";

export default function SetupCampaign() {
    const navigate = useNavigate();

    function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault()

        const name = validateCampaignName(String(new FormData(e.currentTarget).get('campaignName') ?? ''))
        if (!name) {
            alert(`Name must be 1–${CAMPAIGN_NAME_MAX_LENGTH} characters with no control characters.`)
            return
        }

        createCampaign(name)
            .then((newCampaign) => navigate(`/campaignsettings/${newCampaign.id}`))
            .catch((err) => alert(err.response?.data?.error ?? 'Could not create campaign.'));
    }

    return (
        <div>
            <h1>Setup Campaign</h1>
            <form method="post" onSubmit={handleSubmit}>
                <FormField label="Campaign Name:" name="campaignName" maxLength={CAMPAIGN_NAME_MAX_LENGTH} />
                <button type="submit">Create Campaign</button>
            </form>
        </div>
    )
}
