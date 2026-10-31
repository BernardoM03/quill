import { useEffect, useState } from "react";
import { useParams } from "react-router";
import Markdown from "react-markdown";

import { getCampaign } from "../api/campaigns";
import type { campaignDetails } from "../datatypes/campaignDetails";
import BackButton from "../components/BackButton";
import "../components/campaignSettings/CampaignSettings.css";

// Read-only campaign page for members; where a player lands after joining.
export default function CampaignView() {
    const { campaignID } = useParams();
    const [campaign, setCampaign] = useState<campaignDetails | null | undefined>(undefined)

    useEffect(() => {
        if (!campaignID) return
        getCampaign(campaignID).then(setCampaign).catch(() => setCampaign(null))
    }, [campaignID])

    if (campaign === undefined) return <div className="page" />

    if (campaign === null) {
        return (
            <div className="page">
                <BackButton/>
                <h1>Campaign not found</h1>
                <p className="muted">It may have been deleted, or you aren’t a member.</p>
            </div>
        )
    }

    return (
        <div className="page">
            <BackButton/>
            <h1>{campaign.name}</h1>
            <div className="campaign-description__body markdown">
                {campaign.description ? <Markdown>{campaign.description}</Markdown> : <p className="muted">No description provided.</p>}
            </div>
        </div>
    )
}
