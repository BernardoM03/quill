import { Link, useBlocker, useNavigate, useParams, useSearchParams } from "react-router";
import { useState, useEffect, useRef } from 'react'

import type { campaignDetails } from "../datatypes/campaignDetails";
import { getCampaign, updateCampaignAllowed, updateCampaignRules } from "../api/campaigns";
import { getSessionUser } from "../api/auth";
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

const SETTINGS_TABS = [
    { id: 'general', label: 'General' },
    { id: 'rules', label: 'Rules' },
    { id: 'content', label: 'Content' },
] as const
type settingsTab = typeof SETTINGS_TABS[number]['id']

export default function CampaignSettings() {
    // No campaignID means /setup/campaign: only the name shows until the campaign is created,
    // then the page swaps to that campaign's settings URL.
    const { campaignID } = useParams();
    const navigate = useNavigate();
    // The open tab lives in ?tab=, so reloading or going Back keeps it. Unknown values mean General.
    const [searchParams, setSearchParams] = useSearchParams();
    const tab: settingsTab = SETTINGS_TABS.find(t => t.id === searchParams.get('tab'))?.id ?? 'general'
    function selectTab(next: settingsTab) {
        setSearchParams(next === 'general' ? {} : { tab: next }, { replace: true })
    }
    const [campaignDetails, setCampaignDetails] = useState<campaignDetails | null>(null)
    const [confirmingDelete, setConfirmingDelete] = useState(false)
    // Set once the campaign is deleted, so leaving isn't blocked even if its settings were broken.
    const deleted = useRef(false)

    // Creating and managing campaigns is admin-only for now; anyone else gets a message
    // instead of a form whose saves the server would refuse.
    const [isAdmin, setIsAdmin] = useState<boolean | undefined>(undefined)
    useEffect(() => {
        getSessionUser().then(user => setIsAdmin(user?.isAdmin ?? false)).catch(() => setIsAdmin(false))
    }, [])

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

    if (isAdmin === false) {
        return (
            <div className="page">
                <BackButton/>
                <h1>{campaignID ? 'Campaign Settings' : 'New Campaign'}</h1>
                <p className="muted">Only the admin can create and manage campaigns.</p>
                <Link to="/" className="setting-button">Go home</Link>
            </div>
        )
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

    const content = tab === 'content'
    const general = tab === 'general'

    return (
        <div className="page">
            <BackButton disabled={broken}/>
            <h1>{campaignID ? 'Campaign Settings' : 'New Campaign'}</h1>
            {broken && (
                <div className="settings-problems" role="alert">
                    <strong>Fix these settings before leaving this page:</strong>
                    <ul>{problems.map(p => <li key={p}>{p}</li>)}</ul>
                    {!content && (
                        <button type="button" className="setting-button" onClick={() => selectTab('content')}>Go to Content</button>
                    )}
                </div>
            )}
            {campaignDetails && campaignID && (
                <div className="tabs settings-tabs" role="tablist">
                    {SETTINGS_TABS.map(t => (
                        <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => selectTab(t.id)}>
                            {t.label}
                        </button>
                    ))}
                </div>
            )}
            {/* Without a campaignID only the name shows, so creating a campaign stays one step. */}
            {(general || !campaignID) && (
                <CampaignNameSettings
                    key={campaignID ?? 'new'}
                    name={campaignDetails?.name ?? null} onRenamed={handleRenamed} locked={broken}
                    onCreated={created => navigate(`/campaignsettings/${created.id}`, { replace: true })}
                />
            )}
            {campaignDetails && general && (
                <CampaignDescriptionSettings description={campaignDetails.description} onSaved={handleDescriptionSaved} locked={broken}/>
            )}
            {campaignDetails && campaignID && general && (
                <CampaignInviteSettings campaignId={campaignID}/>
            )}
            {campaignDetails && tab === 'rules' && (
                <>
                    <RulesSettings rules={withRuleDefaults(campaignDetails.rules)} onChange={handleRulesChange}/>
                    <AdvancedRulesSettings rules={withRuleDefaults(campaignDetails.rules)} onChange={handleRulesChange}/>
                </>
            )}
            {campaignDetails && content && (
                <>
                    <CollectionSettings
                        collection="species" caption="Allowed Species" noun="species" requireOne
                        allowed={campaignDetails.allowedContent.species ?? null}
                        onChange={ids => handleAllowedChange('species', ids)}
                    />
                    <ClassSettings
                        allowedClasses={campaignDetails.allowedContent.classes ?? null}
                        allowedSubclasses={campaignDetails.allowedContent.subclasses ?? null}
                        onClassesChange={ids => handleAllowedChange('classes', ids)}
                        onSubclassesChange={ids => handleAllowedChange('subclasses', ids)}
                    />
                    <SpellSettings
                        allowed={campaignDetails.allowedContent.spells ?? null}
                        allowedClasses={campaignDetails.allowedContent.classes ?? null}
                        onChange={ids => handleAllowedChange('spells', ids)}
                    />
                    <EquipmentSettings
                        allowed={campaignDetails.allowedContent.equipment ?? null}
                        onChange={ids => handleAllowedChange('equipment', ids)}
                    />
                    <MagicItemSettings
                        allowed={campaignDetails.allowedContent['magic-items'] ?? null}
                        onChange={ids => handleAllowedChange('magic-items', ids)}
                    />
                    {proficiencies.map(({ collection, caption }) => (
                        <CollectionSettings
                            key={collection}
                            collection={collection} caption={caption} noun={collection} compact
                            allowed={campaignDetails.allowedContent[collection] ?? null}
                            onChange={ids => handleAllowedChange(collection, ids)}
                        />
                    ))}
                </>
            )}
            {campaignDetails && campaignID && general && (
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
