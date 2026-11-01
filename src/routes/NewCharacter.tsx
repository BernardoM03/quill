import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { getCampaign } from "../api/campaigns";
import {
    CHARACTER_NAME_MAX_LENGTH, createCharacter, createSandboxCharacter, getCharacterOptions, validateCharacter,
    type characterOptions, type draftError,
} from "../api/characters";
import { getUser } from "../api/users";
import BackButton from "../components/BackButton";
import { SpeciesStep } from "../components/characterWizard/SpeciesStep";
import type { campaign } from "../datatypes/campaign";
import "../components/campaignSettings/CampaignSettings.css";
import "./NewCharacter.css";

// Stands in for a campaign id when the character goes in the Character Sandbox.
const SANDBOX = 'sandbox'
// How long typing pauses before the draft is checked with the server.
const VALIDATE_DELAY_MS = 250

// Everything the wizard collects. Each later step (class, ability scores, ...) adds its
// fields here and a step to stepsFor below. What each step offers, and whether the draft
// is valid, comes from the server (server/rules/characters.py).
interface wizardDraft {
    // A campaign id, SANDBOX, or '' while nothing is chosen.
    campaignId: string,
    species: string | null,
    // Choice id -> the picked option's key. Starts over when the species changes.
    speciesChoices: Record<string, string | string[]>,
    name: string,
}

type stepId = 'campaign' | 'species' | 'name'

interface wizardStep {
    id: stepId,
    label: string,
}

const CAMPAIGN_STEP: wizardStep = { id: 'campaign', label: 'Campaign' }
const SPECIES_STEP: wizardStep = { id: 'species', label: 'Species' }
const NAME_STEP: wizardStep = { id: 'name', label: 'Name' }

// Which step a server error field belongs to. 'campaign' errors belong to every step.
function stepOf(field: string): stepId | 'all' {
    if (field === 'campaign') return 'all'
    if (field === 'species' || field.startsWith('choice:')) return 'species'
    return 'name'
}

// Opened from a campaign, the campaign is already known; opened from home, it's the first step.
function stepsFor(campaignInUrl: boolean): wizardStep[] {
    return campaignInUrl ? [SPECIES_STEP, NAME_STEP] : [CAMPAIGN_STEP, SPECIES_STEP, NAME_STEP]
}

const serverCampaign = (campaignId: string) => (campaignId === SANDBOX ? null : campaignId)

// A step-by-step character creation wizard, at /campaigns/:campaignID/characters/new
// or, choosing the campaign first, at /characters/new.
export default function NewCharacter() {
    const { campaignID } = useParams();
    const navigate = useNavigate();
    const steps = stepsFor(Boolean(campaignID))
    // The campaigns a character can be made in: the one in the URL, or the user's memberships.
    const [campaigns, setCampaigns] = useState<campaign[] | null>(null)
    const [notFound, setNotFound] = useState(false)
    const [draft, setDraft] = useState<wizardDraft>({ campaignId: campaignID ?? '', species: null, speciesChoices: {}, name: '' })
    const [stepIndex, setStepIndex] = useState(0)
    // What the chosen campaign (or the sandbox) offers, from the server.
    const [options, setOptions] = useState<characterOptions | null>(null)
    // The server's verdict on the current draft.
    const [errors, setErrors] = useState<draftError[]>([])
    // A field's errors show once the player has changed it, or tried to leave its step.
    const [touched, setTouched] = useState<Set<string>>(new Set())
    const [attempted, setAttempted] = useState<Set<stepId>>(new Set())
    const [campaignError, setCampaignError] = useState<string | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    // Counts validation requests, so a slow answer can't replace a newer one.
    const latestCheck = useRef(0)

    useEffect(() => {
        if (campaignID) {
            getCampaign(campaignID)
                .then(c => setCampaigns([{ id: campaignID, name: c.name }]))
                .catch(() => setNotFound(true))
        } else {
            getUser()
                .then(user => setCampaigns(user.campaigns))
                .catch(() => setCampaigns([]))
        }
    }, [campaignID])

    // What the chosen campaign offers changes with the campaign.
    useEffect(() => {
        if (!draft.campaignId) return
        let current = true
        getCharacterOptions(serverCampaign(draft.campaignId))
            .then(o => {
                if (!current) return
                setOptions(o)
                // The card on show is the pick, so start on the first species.
                setDraft(d => (d.species || o.species.length === 0 ? d : { ...d, species: o.species[0].id, speciesChoices: {} }))
            })
            .catch(() => current && setOptions({ species: [] }))
        return () => { current = false }
    }, [draft.campaignId])

    function check(next: wizardDraft): Promise<draftError[]> {
        const request = ++latestCheck.current
        return validateCharacter(serverCampaign(next.campaignId),
            { name: next.name, species: next.species, speciesChoices: next.speciesChoices })
            .then(found => {
                if (request === latestCheck.current) setErrors(found)
                return found
            })
    }

    // Check the draft with the server as the player goes, once typing pauses.
    useEffect(() => {
        if (!draft.campaignId) return
        const timer = setTimeout(() => { check(draft).catch(() => {}) }, VALIDATE_DELAY_MS)
        return () => clearTimeout(timer)
    }, [draft])

    const step = steps[stepIndex]
    const isLast = stepIndex === steps.length - 1
    const chosenName = draft.campaignId === SANDBOX
        ? 'Character Sandbox'
        : campaigns?.find(c => c.id === draft.campaignId)?.name

    // Errors this step shows: anything wrong with the campaign, and its own fields once
    // touched or once the player has tried to move on.
    const stepErrors = draft.campaignId ? errors.filter(e =>
        stepOf(e.field) === 'all'
        || (stepOf(e.field) === step.id && (touched.has(e.field) || attempted.has(step.id)))) : []
    const errorsFor = (field: string) => stepErrors.filter(e => e.field === field).map(e => e.message)

    function update(changes: Partial<wizardDraft>, field?: string) {
        // What's allowed depends on the campaign, so a new campaign starts the species over.
        const newCampaign = changes.campaignId !== undefined && changes.campaignId !== draft.campaignId
        if (newCampaign) setOptions(null)
        setDraft(d => ({ ...d, ...changes, ...(newCampaign ? { species: null, speciesChoices: {} } : {}) }))
        if (field) setTouched(t => new Set(t).add(field))
        setCampaignError(null)
        setSaveError(null)
    }

    function handleNext(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault()
        if (step.id === 'campaign') {
            if (!draft.campaignId) return setCampaignError('Choose a campaign, or the Character Sandbox.')
            setStepIndex(i => i + 1)
            return
        }
        // Check again now, so an answer still on its way can't let the player through.
        setAttempted(a => new Set(a).add(step.id))
        setSaving(isLast)
        check(draft)
            .then(found => {
                const blocking = found.filter(err => stepOf(err.field) === 'all' || stepOf(err.field) === step.id)
                if (blocking.length > 0) {
                    setSaving(false)
                    return
                }
                if (!isLast) {
                    setStepIndex(i => i + 1)
                    return
                }
                const body = { name: draft.name, species: draft.species, speciesChoices: draft.speciesChoices }
                const create = draft.campaignId === SANDBOX
                    ? createSandboxCharacter(body)
                    : createCharacter(draft.campaignId, body)
                return create
                    // From a campaign, go back to it; from home, go home, where the new character is listed.
                    .then(() => navigate(campaignID ? `/campaign/${campaignID}` : '/', { replace: true }))
            })
            .catch(err => {
                const data = err.response?.data
                if (data?.errors) setErrors(data.errors)
                setSaveError(data?.errors ? null : (data?.error ?? 'Could not reach the server.'))
                setSaving(false)
            })
    }

    if (notFound) {
        return (
            <div className="page">
                <BackButton/>
                <h1>Campaign not found</h1>
                <p className="muted">It may have been deleted, or you aren’t a member.</p>
            </div>
        )
    }

    const blocked = stepErrors.some(e => e.field === 'campaign')

    return (
        <div className="page wizard">
            <BackButton/>
            <span className="setting-caption">{chosenName ?? ' '}</span>
            <h1>New Character</h1>

            <ol className="wizard__steps" aria-label="Steps">
                {steps.map((s, i) => (
                    <li key={s.id} className={i === stepIndex ? 'wizard__step wizard__step--current' : i < stepIndex ? 'wizard__step wizard__step--done' : 'wizard__step'}
                        aria-current={i === stepIndex ? 'step' : undefined}>
                        <span className="wizard__step-number">{i + 1}</span> {s.label}
                    </li>
                ))}
            </ol>

            <form className={step.id === 'species' ? 'wizard__form wizard__form--wide' : 'wizard__form'} onSubmit={handleNext}>
                {step.id === 'campaign' && campaigns && (
                    <fieldset className="wizard__choices">
                        <legend className="setting-caption">Campaign</legend>
                        {campaigns.map(c => (
                            <label key={c.id} className="wizard__choice">
                                <input type="radio" name="campaign" value={c.id}
                                    checked={draft.campaignId === c.id}
                                    onChange={() => update({ campaignId: c.id })} />
                                <span>{c.name}</span>
                            </label>
                        ))}
                        <label className="wizard__choice">
                            <input type="radio" name="campaign" value={SANDBOX}
                                checked={draft.campaignId === SANDBOX}
                                onChange={() => update({ campaignId: SANDBOX })} />
                            <span className="wizard__choice-text">
                                <span>Character Sandbox</span>
                            </span>
                        </label>
                    </fieldset>
                )}

                {step.id === 'species' && (options ? (
                    <SpeciesStep
                        options={options.species}
                        selected={draft.species}
                        choices={draft.speciesChoices}
                        onSelect={id => update({ species: id, speciesChoices: {} }, 'species')}
                        onChoose={(id, value) =>
                            update({ speciesChoices: { ...draft.speciesChoices, [id]: value } }, `choice:${id}`)}
                        errorsFor={errorsFor}
                    />
                ) : <p className="muted">Loading…</p>)}

                {step.id === 'name' && (
                    <div className="campaign-name">
                        <span className="setting-caption">Character Name</span>
                        <div className="campaign-name__form">
                            <input
                                className="campaign-name__input"
                                aria-label="Character name"
                                value={draft.name}
                                maxLength={CHARACTER_NAME_MAX_LENGTH}
                                autoFocus
                                onChange={e => update({ name: e.target.value }, 'name')}
                            />
                        </div>
                    </div>
                )}

                {campaignError && <p className="campaign-name__error">{campaignError}</p>}
                {stepErrors
                    .filter(err => step.id !== 'species' || stepOf(err.field) === 'all')
                    .map(err => <p key={err.field + err.message} className="campaign-name__error">{err.message}</p>)}
                {saveError && <p className="campaign-name__error">{saveError}</p>}

                <div className="wizard__actions">
                    {stepIndex > 0 && (
                        <button type="button" className="setting-button setting-button--quiet" disabled={saving}
                            onClick={() => setStepIndex(i => i - 1)}>
                            Back
                        </button>
                    )}
                    <button type="submit" className="setting-button" disabled={saving || !campaigns || blocked}>
                        {isLast ? (saving ? 'Creating…' : 'Create Character') : 'Next'}
                    </button>
                </div>
            </form>
        </div>
    )
}
