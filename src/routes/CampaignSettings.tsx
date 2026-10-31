import { Link, useBlocker, useNavigate, useParams, useSearchParams } from "react-router";
import { useState, useEffect, useRef } from 'react'

import type { campaignDetails } from "../datatypes/campaignDetails";
import { getCampaign, updateCampaignAllowed, updateCampaignRules } from "../api/campaigns";
import { getSessionUser } from "../api/auth";
import type { campaignRules } from "../datatypes/campaignRules";

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
import { CampaignMemberSettings } from "../components/campaignSettings/CampaignMemberSettings";
import { ReadOnlyContext } from "../components/campaignSettings/ReadOnly";

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
    // Counts allowed-content saves, so only the newest one's problems are shown.
    const latestAllowedSave = useRef(0)
    // Why the last rules change didn't save, shown on the Rules tab.
    const [rulesError, setRulesError] = useState<string | null>(null)

    // Creating a campaign is admin-only for now; anyone else gets a message instead of a
    // form whose save the server would refuse. An existing campaign goes by role below.
    const [isAdmin, setIsAdmin] = useState<boolean | undefined>(undefined)
    useEffect(() => {
        getSessionUser().then(user => setIsAdmin(user?.isAdmin ?? false)).catch(() => setIsAdmin(false))
    }, [])

    // The server answers 404 when the campaign is gone or the user isn't in it.
    const [notFound, setNotFound] = useState(false)
    useEffect(() => {
        if (!campaignID) return
        getCampaign(campaignID as string)
            .then(setCampaignDetails)
            .catch(() => setNotFound(true))
    }, [campaignID])

    // While the settings are broken (no species, no classes, a class with no subclasses),
    // the page can't be left: Back is disabled, in-app links are blocked, closing the tab
    // asks first, and only the allowed-content toggles (the fix) can save.
    // Players see the same page as Campaign Information: everything shown, nothing editable.
    const readOnly = campaignDetails?.role === 'player'
    const problems = campaignDetails?.problems ?? []
    // Only someone who can fix broken settings is kept on the page until they do.
    const broken = problems.length > 0 && !readOnly

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

    // Show the change right away; put the old lists back if the save fails. changes can hold
    // several collections (a class and its subclasses), saved together so the server checks
    // them as one change. Uses the setter's function form so quick saves don't overwrite each other.
    // Rejects with the server's reason, which the section shows beside the toggle.
    function handleAllowedChanges(changes: Record<string, string[] | null>): Promise<void> {
        const previous = Object.fromEntries(
            Object.keys(changes).map(collection => [collection, campaignDetails?.allowedContent[collection] ?? null]))
        const setLists = (lists: Record<string, string[] | null>) => setCampaignDetails(details =>
            details && { ...details, allowedContent: { ...details.allowedContent, ...lists } })
        setLists(changes)
        const request = ++latestAllowedSave.current
        return updateCampaignAllowed(campaignID as string, changes)
            .then(problems => {
                // Saves can overlap; only the last one sent knows the final state.
                if (request === latestAllowedSave.current) {
                    setCampaignDetails(details => details && { ...details, problems })
                }
            })
            .catch(err => {
                setLists(previous)
                // The server refuses some changes outright, e.g. leaving a class with no
                // subclasses or no cantrips.
                throw new Error(err.response?.data?.error ?? 'Could not save.')
            })
    }

    function handleAllowedChange(collection: string, ids: string[] | null): Promise<void> {
        return handleAllowedChanges({ [collection]: ids })
    }

    // Same pattern as handleAllowedChange: show it now, undo just these rules if the save fails,
    // and say so at the top of the Rules tab.
    function handleRulesChange(changed: Partial<campaignRules>) {
        setRulesError(null)
        const previous = Object.fromEntries(
            Object.keys(changed).map(key => [key, campaignDetails?.rules[key as keyof campaignRules]]))
        const setRules = (patch: Partial<campaignRules>) => setCampaignDetails(details =>
            details && { ...details, rules: { ...details.rules, ...patch } })
        setRules(changed)
        updateCampaignRules(campaignID as string, changed).catch(err => {
            setRules(previous)
            setRulesError(err.response?.data?.error ?? 'Could not save that change. Check your connection and try again.')
        })
    }

    function handleDeleted() {
        deleted.current = true
        navigate('/', { replace: true })
    }

    if (!campaignID && isAdmin === false) {
        return (
            <div className="page">
                <BackButton/>
                <h1>New Campaign</h1>
                <p className="muted">Only the admin can create campaigns.</p>
                <Link to="/" className="setting-button">Go home</Link>
            </div>
        )
    }

    if (notFound) {
        return (
            <div className="page">
                <BackButton/>
                <h1>Campaign not found</h1>
                <p className="muted">It may have been deleted, or you aren’t a member.</p>
                <Link to="/" className="setting-button">Go home</Link>
            </div>
        )
    }

    const content = tab === 'content'
    const general = tab === 'general'

    return (
        <ReadOnlyContext.Provider value={readOnly}>
        <div className="page">
            <BackButton disabled={broken}/>
            <h1>{!campaignID ? 'New Campaign' : readOnly ? 'Campaign Information' : 'Campaign Settings'}</h1>
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
            {campaignDetails && campaignID && general && !readOnly && (
                <CampaignInviteSettings campaignId={campaignID}/>
            )}
            {campaignDetails && campaignID && general && !readOnly && (
                <CampaignMemberSettings campaignId={campaignID}/>
            )}
            {campaignDetails && tab === 'rules' && (
                <>
                    {rulesError && <p className="setting-error" role="alert">{rulesError}</p>}
                    <RulesSettings rules={campaignDetails.rules} limits={campaignDetails.ruleLimits} onChange={handleRulesChange}/>
                    <AdvancedRulesSettings rules={campaignDetails.rules} onChange={handleRulesChange}/>
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
                        onChange={handleAllowedChanges}
                    />
                    <SpellSettings
                        allowed={campaignDetails.allowedContent.spells ?? null}
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
            {campaignDetails && campaignID && general && !readOnly && (
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
        </ReadOnlyContext.Provider>
    )
}
