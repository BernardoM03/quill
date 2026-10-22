import { useParams } from "react-router";
import { useState, useEffect } from 'react'
import axios from "axios";

import type { campaign } from "../datatypes/campaign";
import type { campaignDetails } from "../datatypes/campaignDetails";

export default function CampaignSettings() {
    const { campaignID } = useParams();
    const [campaignDetails, setCampaignDetails] = useState<campaignDetails | null>(null)
    const [nameError, setNameError] = useState<string | null>(null)

    useEffect(() => {
        console.log(campaignID)
        fetch(`../../public/.campaigns/${campaignID}.json`)
            .then(response => response.json())
            .then(data => setCampaignDetails(data))
            .catch(error => console.error("Error fetching campaign details:", error))
    }, [campaignID])

    function validateName(raw: string): string | null {
        const name = raw.trim().replace(/\s+/g, ' ')
        if (!name) return null
        if (name.length > 64) return null
        if (/[\u0000-\u001F\u007F]/.test(name)) return null
        return name
    }

    function handleNameSubmit(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault()
        const raw = String(new FormData(e.currentTarget).get('campaignName') ?? '')
        const name = validateName(raw)
        if (!name) {
            setNameError('Name must be 1–64 characters with no control characters.')
            return
        }
        setNameError(null)

        axios.put('http://localhost:5174/update/campaign-name', { name, id: campaignID })
            .then(() => setCampaignDetails(d => d ? { ...d, name } : null))
            .catch((err) => setNameError(err.response?.data?.error ?? 'Could not save name.'))
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