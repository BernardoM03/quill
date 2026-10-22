import { useParams } from "react-router";
import { useState, useEffect } from 'react'

import { CAMPAIGN_NAME_MAX_LENGTH, updateCampaignName, validateCampaignName } from "../api/campaigns";
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

        const name = validateCampaignName(String(new FormData(e.currentTarget).get('campaignName') ?? ''))
        if (!name) {
            alert(`Name must be 1–${CAMPAIGN_NAME_MAX_LENGTH} characters with no control characters.`)
            return
        }

        updateCampaignName(campaignID as string, name)
            .then(() => setCampaignDetails(details => details ? { ...details, name } : null))
            .catch((err) => alert(err.response?.data?.error ?? 'Could not save name.'))
    }

    return (
        <div>
            <h1>Campaign Settings</h1>
            <h2>{campaignDetails && campaignDetails.name ?
            campaignDetails.name : "Loading..."}</h2>
            <div className="campaign-basic-info">
                <h2>Change Campaign Name</h2>
                <form method="post" onSubmit={handleNameSubmit}>
                    <FormField label="Campaign Name:" name="campaignName" maxLength={CAMPAIGN_NAME_MAX_LENGTH} />
                    <button type="submit">Modify Campaign</button>
                </form>
            </div>
        </div>
    )
}
