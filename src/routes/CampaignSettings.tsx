import { Link, useBlocker, useNavigate, useParams } from "react-router";
import { useState, useEffect, useRef } from 'react'

import type { campaignDetails } from "../datatypes/campaignDetails";
import { getCampaign, updateCampaignAllowed, updateCampaignRules } from "../api/campaigns";
import { withRuleDefaults, type campaignRules } from "../datatypes/campaignRules";

import { CollectionSettings } from "../components/campaignSettings/CampaignCollectionSettings";
import { ClassSettings } from "../components/campaignSettings/CampaignClassSettings";
import { SpellSettings } from "../components/campaignSettings/CampaignSpellSettings";
import { EquipmentSettings, MagicItemSettings } from "../components/campaignSettings/CampaignItemSettings";
import { AdvancedRulesSettings, RulesSettings } from "../components/campaignSettings/CampaignRulesSettings";
import BackButton from "../components/BackButton";
import DeleteCampaignDialog from "../components/DeleteCampaignDialog";
import { CampaignNameSettings } from "../components/campaignSettings/CampaignNameSettings";
import { CampaignDescriptionSettings } from "../components/campaignSettings/CampaignDescriptionSettings";
import { CampaignInviteSettings } from "../components/campaignSettings/CampaignInviteSettings";
import { useCampaignProblems } from "../components/campaignSettings/useCampaignProblems";

const proficiencies = [
    { collection: 'skills', caption: 'Allowed Skills' },
    { collection: 'tools', caption: 'Allowed Tools' },
    { collection: 'languages', caption: 'Allowed Languages' },
] as const

export default function CampaignSettings() {
    // No campaignID means /setup/campaign: only the name shows until the campaign is created,
    // then the page swaps to that campaign's settings URL.
    const { campaignID } = useParams();
    const navigate = useNavigate();
    const [campaignDetails, setCampaignDetails] = useState<campaignDetails | null>(null)
    const [confirmingDelete, setConfirmingDelete] = useState(false)
    // Set once the campaign is deleted, so leaving isn't blocked even if its settings were broken.
    const deleted = useRef(false)

    useEffect(() => {
        if (!campaignID) return
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
        broken && !deleted.current && currentLocation.pathname !== nextLocation.pathname)
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

    // Same pattern as handleAllowedChange: show it now, undo just these rules if the save fails.
    function handleRulesChange(changed: Partial<campaignRules>) {
        const previous = Object.fromEntries(
            Object.keys(changed).map(key => [key, campaignDetails?.rules[key as keyof campaignRules]]))
        const setRules = (patch: Partial<campaignRules>) => setCampaignDetails(details =>
            details && { ...details, rules: { ...details.rules, ...patch } })
        setRules(changed)
        updateCampaignRules(campaignID as string, changed).catch(() => {
            setRules(previous)
            alert('Could not save.')
        })
    }

    function handleDeleted() {
        deleted.current = true
        navigate('/', { replace: true })
    }

    // Players can read a campaign but not change it; send them to its page instead.
    if (campaignDetails && campaignDetails.role !== 'gm') {
        return (
            <div className="page">
                <BackButton/>
                <h1>Campaign Settings</h1>
                <p className="muted">Only the campaign’s GM can change its settings.</p>
                <Link to={`/campaign/${campaignID}`} className="setting-button">Open {campaignDetails.name}</Link>
            </div>
        )
    }

    return (
        <div className="page">
            <BackButton disabled={broken}/>
            <h1>{campaignID ? 'Campaign Settings' : 'New Campaign'}</h1>
            {broken && (
                <div className="settings-problems" role="alert">
                    <strong>Fix these settings before leaving this page:</strong>
                    <ul>{problems.map(p => <li key={p}>{p}</li>)}</ul>
                </div>
            )}
            {/* Name element: Updates campaignDetails when renamed via <CampaignNameSettings />*/}
            <CampaignNameSettings
                key={campaignID ?? 'new'}
                name={campaignDetails?.name ?? null} onRenamed={handleRenamed} locked={broken}
                onCreated={created => navigate(`/campaignsettings/${created.id}`, { replace: true })}
            />
            {campaignDetails && (
                <CampaignDescriptionSettings description={campaignDetails.description} onSaved={handleDescriptionSaved} locked={broken}/>
            )}
            {campaignDetails && campaignID && (
                <CampaignInviteSettings campaignId={campaignID}/>
            )}
            {campaignDetails && (
                <RulesSettings rules={withRuleDefaults(campaignDetails.rules)} onChange={handleRulesChange}/>
            )}
            {campaignDetails && (
                <CollectionSettings
                    collection="species" caption="Allowed Species" noun="species" requireOne
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
            {campaignDetails && (
                <details className="settings-advanced">
                    <summary>
                        <span className="settings-advanced__title">Character Creation</span>
                        <span className="muted">Advanced · equipment, origin feat, approval</span>
                    </summary>
                    <AdvancedRulesSettings rules={withRuleDefaults(campaignDetails.rules)} onChange={handleRulesChange}/>
                </details>
            )}
            {campaignDetails && (
                <details className="settings-advanced">
                    <summary>
                        <span className="settings-advanced__title">Spells</span>
                        <span className="muted">Advanced · which spells players can learn</span>
                    </summary>
                    <SpellSettings
                        allowed={campaignDetails.allowedContent.spells ?? null}
                        allowedClasses={campaignDetails.allowedContent.classes ?? null}
                        onChange={ids => handleAllowedChange('spells', ids)}
                    />
                </details>
            )}
            {campaignDetails && (
                <details className="settings-advanced">
                    <summary>
                        <span className="settings-advanced__title">Items</span>
                        <span className="muted">Advanced · equipment and magic items</span>
                    </summary>
                    <EquipmentSettings
                        allowed={campaignDetails.allowedContent.equipment ?? null}
                        onChange={ids => handleAllowedChange('equipment', ids)}
                    />
                    <MagicItemSettings
                        allowed={campaignDetails.allowedContent['magic-items'] ?? null}
                        onChange={ids => handleAllowedChange('magic-items', ids)}
                    />
                </details>
            )}
            {campaignDetails && (
                <details className="settings-advanced">
                    <summary>
                        <span className="settings-advanced__title">Proficiencies</span>
                        <span className="muted">Advanced · skills, tools, languages</span>
                    </summary>
                    {proficiencies.map(({ collection, caption }) => (
                        <CollectionSettings
                            key={collection}
                            collection={collection} caption={caption} noun={collection} compact
                            allowed={campaignDetails.allowedContent[collection] ?? null}
                            onChange={ids => handleAllowedChange(collection, ids)}
                        />
                    ))}
                </details>
            )}
            {campaignDetails && campaignID && (
                <div className="settings-danger">
                    <button type="button" className="setting-button setting-button--danger" onClick={() => setConfirmingDelete(true)}>
                        Delete Campaign
                    </button>
                </div>
            )}
            {confirmingDelete && campaignDetails && campaignID && (
                <DeleteCampaignDialog
                    id={campaignID} name={campaignDetails.name}
                    onClose={() => setConfirmingDelete(false)}
                    onDeleted={handleDeleted}
                />
            )}
        </div>
    )
}
