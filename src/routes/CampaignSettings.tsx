import { useParams } from "react-router";
import { useState, useEffect } from 'react'

import type { campaignDetails } from "../datatypes/campaignDetails";
import { getCampaign, updateCampaignAllowed } from "../api/campaigns";

import { SpeciesSettings } from "../components/campaignSettings/CampaignSpeciesSettings";
import { ClassSettings } from "../components/campaignSettings/CampaignClassSettings";
import { CampaignNameSettings } from "../components/campaignSettings/CampaignNameSettings";
import { CampaignDescriptionSettings } from "../components/campaignSettings/CampaignDescriptionSettings";

export default function CampaignSettings() {
    const { campaignID } = useParams();
    const [campaignDetails, setCampaignDetails] = useState<campaignDetails | null>(null)

    useEffect(() => {
        getCampaign(campaignID as string)
            .then(setCampaignDetails)
            .catch(error => console.error("Error fetching campaign details:", error))
    }, [campaignID])

    function handleRenamed(name: string) {
        if (campaignDetails) setCampaignDetails({ ...campaignDetails, name })
    }

    function handleDescriptionSaved(description: string | null) {
        if (campaignDetails) setCampaignDetails({ ...campaignDetails, description })
    }

    // Show the change right away; put the old list back if the save fails. Uses the setter's
    // function form so two saves from one click (class + its subclasses) don't overwrite each other.
    function handleAllowedChange(collection: string, ids: string[] | null) {
        const previous = campaignDetails?.allowedContent[collection] ?? null
        const setList = (list: string[] | null) => setCampaignDetails(details =>
            details && { ...details, allowedContent: { ...details.allowedContent, [collection]: list } })
        setList(ids)
        updateCampaignAllowed(campaignID as string, collection, ids).catch(() => {
            setList(previous)
            alert('Could not save.')
        })
    }

    return (
        <div className="page">
            <h1>Campaign Settings</h1>
            {/* Name element: Updates campaignDetails when renamed via <CampaignNameSettings />*/}
            <CampaignNameSettings name={campaignDetails?.name ?? null} onRenamed={handleRenamed}/>
            {campaignDetails && (
                <CampaignDescriptionSettings description={campaignDetails.description} onSaved={handleDescriptionSaved}/>
            )}
            {campaignDetails && (
                <SpeciesSettings
                    allowed={campaignDetails.allowedContent.species ?? null}
                    onChange={ids => handleAllowedChange('species', ids)}
                />
            )}
            {campaignDetails && (
                <ClassSettings
                    allowedClasses={campaignDetails.allowedContent.classes ?? null}
                    allowedSubclasses={campaignDetails.allowedContent.subclasses ?? null}
                    onClassesChange={ids => handleAllowedChange('classes', ids)}
                    onSubclassesChange={ids => handleAllowedChange('subclasses', ids)}
                />
            )}
        </div>
    )
}
