import { useBlocker, useParams } from "react-router";
import { useState, useEffect } from 'react'

import type { campaignDetails } from "../datatypes/campaignDetails";
import { getCampaign, updateCampaignAllowed } from "../api/campaigns";

import { SpeciesSettings } from "../components/campaignSettings/CampaignSpeciesSettings";
import { ClassSettings } from "../components/campaignSettings/CampaignClassSettings";
import BackButton from "../components/BackButton";
import { CampaignNameSettings } from "../components/campaignSettings/CampaignNameSettings";
import { CampaignDescriptionSettings } from "../components/campaignSettings/CampaignDescriptionSettings";
import { useCampaignProblems } from "../components/campaignSettings/useCampaignProblems";

export default function CampaignSettings() {
    const { campaignID } = useParams();
    const [campaignDetails, setCampaignDetails] = useState<campaignDetails | null>(null)

    useEffect(() => {
        getCampaign(campaignID as string)
            .then(setCampaignDetails)
            .catch(error => console.error("Error fetching campaign details:", error))
    }, [campaignID])

    // While the settings are broken (no species, no classes, a class with no subclasses),
    // the page can't be left: Back is disabled, in-app links are blocked, closing the tab
    // asks first, and only the allowed-content toggles (the fix) can save.
    const problems = useCampaignProblems(campaignDetails?.allowedContent)
    const broken = problems.length > 0

    const blocker = useBlocker(({ currentLocation, nextLocation }) =>
        broken && currentLocation.pathname !== nextLocation.pathname)
    useEffect(() => {
        if (blocker.state === 'blocked') blocker.reset()
    }, [blocker])

    useEffect(() => {
        if (!broken) return
        const warn = (e: BeforeUnloadEvent) => e.preventDefault()
        window.addEventListener('beforeunload', warn)
        return () => window.removeEventListener('beforeunload', warn)
    }, [broken])

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
            <BackButton disabled={broken}/>
            <h1>Campaign Settings</h1>
            {broken && (
                <div className="settings-problems" role="alert">
                    <strong>Fix these settings before leaving this page:</strong>
                    <ul>{problems.map(p => <li key={p}>{p}</li>)}</ul>
                </div>
            )}
            {/* Name element: Updates campaignDetails when renamed via <CampaignNameSettings />*/}
            <CampaignNameSettings name={campaignDetails?.name ?? null} onRenamed={handleRenamed} locked={broken}/>
            {campaignDetails && (
                <CampaignDescriptionSettings description={campaignDetails.description} onSaved={handleDescriptionSaved} locked={broken}/>
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
