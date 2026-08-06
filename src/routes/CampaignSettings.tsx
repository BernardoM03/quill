import { useParams } from "react-router";
import { useState, useEffect } from 'react'

import { updateCampaignName } from "../api/campaigns";
import FormField from "../components/FormField";
import type { campaignDetails } from "../datatypes/campaignDetails";

export default function CampaignSettings() {
    const { campaignID } = useParams();
    const [campaignDetails, setCampaignDetails] = useState<campaignDetails | null>(null)

    useEffect(() => {
        console.log(campaignID)
        fetch(`../../public/.campaigns/${campaignID}.json`)
            .then(response => response.json())
            .then(data => setCampaignDetails(data))
            .catch(error => console.error("Error fetching campaign details:", error))
    }, [campaignID])

    function handleNameSubmit(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault()

        const name = new FormData(e.currentTarget).get('campaignName') as string;

        updateCampaignName(campaignID as string, name)
            .then(() => setCampaignDetails(details => details ? { ...details, name } : null))
            .catch((error) => console.error('Error changing campaign name:', error));
    }

    return (
        <div>
            <h1>Campaign Settings</h1>
            <h2>{campaignDetails && campaignDetails.name ?
            campaignDetails.name : "Loading..."}</h2>
            <div className="campaign-basic-info">
                <h2>Change Campaign Name</h2>
                <form method="post" onSubmit={handleNameSubmit}>
                    <FormField label="Campaign Name:" name="campaignName" maxLength={64} />
                    <button type="submit">Modify Campaign</button>
                </form>
            </div>
        </div>
    )
}