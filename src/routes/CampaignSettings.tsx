import { Link, useBlocker, useNavigate, useParams, useSearchParams } from "react-router";
import { useState, useEffect, useRef } from 'react'

import type { CampaignDetails } from "../datatypes/campaignDetails";
import { getCampaign, updateCampaignAllowed, updateCampaignRules } from "../api/campaigns";
import { getSessionUser } from "../api/auth";
import type { CampaignRules } from "../datatypes/campaignRules";

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
import { CampaignQuestionsSettings } from "../components/campaignSettings/CampaignQuestionsSettings";
import type { CampaignQuestion } from "../datatypes/campaignDetails";

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
type SettingsTab = typeof SETTINGS_TABS[number]['id']

export default function CampaignSettings() {
    // Without a campaignID this is /setup/campaign, which shows only the name until the campaign exists.
    const { campaignID } = useParams();
    const navigate = useNavigate();
    // The open tab lives in ?tab= so reloading keeps it, and unknown values mean General.
    const [searchParams, setSearchParams] = useSearchParams();
    const tab: SettingsTab = SETTINGS_TABS.find(t => t.id === searchParams.get('tab'))?.id ?? 'general'
    function selectTab(next: SettingsTab) {
        setSearchParams(next === 'general' ? {} : { tab: next }, { replace: true })
    }
    const [campaignDetails, setCampaignDetails] = useState<CampaignDetails | null>(null)
    const [confirmingDelete, setConfirmingDelete] = useState(false)
    // Set on delete, so leaving isn't blocked even if the settings were broken.
    const deleted = useRef(false)
    // Numbers allowed-content saves so only the newest one's problems are shown.
    const latestAllowedSave = useRef(0)
    // Why the last rules change failed, shown on the Rules tab.
    const [rulesError, setRulesError] = useState<string | null>(null)

    // Creating a campaign is admin-only, so others see a message instead of a form the server would refuse.
    const [isAdmin, setIsAdmin] = useState<boolean | undefined>(undefined)
    useEffect(() => {
        getSessionUser().then(user => setIsAdmin(user?.isAdmin ?? false)).catch(() => setIsAdmin(false))
    }, [])

    // Set when the campaign is gone or the user isn't a member.
    const [notFound, setNotFound] = useState(false)
    useEffect(() => {
        if (!campaignID) return
        getCampaign(campaignID as string)
            .then(setCampaignDetails)
            .catch(() => setNotFound(true))
    }, [campaignID])

    // While settings are broken the GM can't leave the page, and only allowed-content fixes can save.
    // Players see the same page read-only as Campaign Information.
    const readOnly = campaignDetails?.role === 'player'
    const problems = campaignDetails?.problems ?? []
    // Only someone who can fix broken settings is kept on the page.
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

    function handleQuestionsSaved(questions: CampaignQuestion[]) {
        setCampaignDetails(details => details && { ...details, questions })
    }

    function handleDescriptionSaved(description: string | null) {
        if (campaignDetails) setCampaignDetails({ ...campaignDetails, description })
    }

    // Applies the change optimistically and restores the old lists if the save fails.
    // Related collections (a class and its subclasses) are saved together so the server checks them as one change.
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
                // Saves can overlap, and only the last one sent knows the final state.
                if (request === latestAllowedSave.current) {
                    setCampaignDetails(details => details && { ...details, problems })
                }
            })
            .catch(err => {
                setLists(previous)
                // The server refuses changes such as leaving a class with no subclasses or cantrips.
                throw new Error(err.response?.data?.error ?? 'Could not save.')
            })
    }

    function handleAllowedChange(collection: string, ids: string[] | null): Promise<void> {
        return handleAllowedChanges({ [collection]: ids })
    }

    // Applies the rules optimistically and reverts only these rules if the save fails.
    function handleRulesChange(changed: Partial<CampaignRules>) {
        setRulesError(null)
        const previous = Object.fromEntries(
            Object.keys(changed).map(key => [key, campaignDetails?.rules[key as keyof CampaignRules]]))
        const setRules = (patch: Partial<CampaignRules>) => setCampaignDetails(details =>
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
                <CampaignMemberSettings campaignId={campaignID}/>
            )}
            {campaignDetails && campaignID && general && !readOnly && (
                <CampaignInviteSettings campaignId={campaignID}/>
            )}
            {campaignDetails && tab === 'rules' && (
                <>
                    {rulesError && <p className="setting-error" role="alert">{rulesError}</p>}
                    <RulesSettings rules={campaignDetails.rules} limits={campaignDetails.ruleLimits} onChange={handleRulesChange}/>
                    <AdvancedRulesSettings rules={campaignDetails.rules} onChange={handleRulesChange}/>
                    <CampaignQuestionsSettings questions={campaignDetails.questions} onSaved={handleQuestionsSaved}/>
                </>
            )}
            {campaignDetails && content && (
                <>
                    <CollectionSettings
                        collection="species" caption="Allowed Species" noun="species" requireOne
                        allowed={campaignDetails.allowedContent.species ?? null}
                        onChange={ids => handleAllowedChange('species', ids)}
                    />
                    <CollectionSettings
                        collection="origins" caption="Allowed Backgrounds" noun="backgrounds" requireOne
                        allowed={campaignDetails.allowedContent.origins ?? null}
                        onChange={ids => handleAllowedChange('origins', ids)}
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
