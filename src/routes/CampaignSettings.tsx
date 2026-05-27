import { useParams } from "react-router";
import { useState, useEffect } from 'react'
import axios from "axios";

import type { campaign } from "../datatypes/campaign";
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

        const updatedCampaignInfo: campaign = {
            name: new FormData(e.currentTarget).get('campaignName') as string,
            id: campaignID as string
        };        
        axios.put('http://localhost:5174/update/campaign-name', updatedCampaignInfo)
            .then(() => setCampaignDetails(details => details ? { ...details, name: updatedCampaignInfo.name } : null))
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
                    <label>
                        Campaign Name:
                        <input type="text" name="campaignName" />
                    </label>
                    <button type="submit">Modify Campaign</button>
                </form>
            </div>
        </div>
    )
}