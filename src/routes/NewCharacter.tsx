import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { getCampaign } from "../api/campaigns";
import {
    createCharacter, createSandboxCharacter, getCharacterOptions, validateCharacter,
    getBackgroundOptions, type abilityRoll, type backgroundOption, type characterDraft, type characterOptions, type draftCheck, type draftError, type takenOptions,
} from "../api/characters";
import { createDraft, getDraft, rollAbilities, saveDraft } from "../api/drafts";
import { getUser } from "../api/users";
import BackButton from "../components/BackButton";
import { AbilitiesStep } from "../components/characterWizard/AbilitiesStep";
import { DetailsStep } from "../components/characterWizard/DetailsStep";
import { BackgroundStep } from "../components/characterWizard/BackgroundStep";
import { ClassStep } from "../components/characterWizard/ClassStep";
import { SpeciesStep } from "../components/characterWizard/SpeciesStep";
import type { campaign } from "../datatypes/campaign";
import "../components/campaignSettings/CampaignSettings.css";
import "./NewCharacter.css";

// Stands in for a campaign id when the character goes in the Character Sandbox.
const SANDBOX = 'sandbox'
// How long typing pauses before the draft is checked with the server.
const VALIDATE_DELAY_MS = 250
// How long the player pauses before the draft is saved.
const SAVE_DELAY_MS = 800

// Everything the wizard collects. Each later step (ability scores, ...) adds its
// fields here and a step to stepsFor below. What each step offers, and whether the draft
// is valid, comes from the server (server/rules/characters.py).
interface wizardDraft {
    // A campaign id, SANDBOX, or '' while nothing is chosen.
    campaignId: string,
    species: string | null,
    // Choice id -> the picked option's key. Starts over when the species changes.
    speciesChoices: Record<string, string | string[]>,
    originRules: characterDraft['originRules'],
    background: string | null,
    // Choice id -> the picked option's key. Starts over when the background changes.
    backgroundChoices: Record<string, string | string[]>,
    class: string | null,
    // Choice id -> the picked option's key. Starts over when the class changes.
    classChoices: Record<string, string | string[]>,
    abilityMethod: characterDraft['abilityMethod'],
    abilityScores: Record<string, number>,
    hpMethod: characterDraft['hpMethod'],
    hpRolls: number[],
    details: characterDraft['details'],
    name: string,
}

type stepId = 'campaign' | 'species' | 'background' | 'class' | 'abilities' | 'name'

interface wizardStep {
    id: stepId,
    label: string,
}

const CAMPAIGN_STEP: wizardStep = { id: 'campaign', label: 'Campaign' }
const SPECIES_STEP: wizardStep = { id: 'species', label: 'Species' }
const BACKGROUND_STEP: wizardStep = { id: 'background', label: 'Background' }
const CLASS_STEP: wizardStep = { id: 'class', label: 'Class' }
const ABILITIES_STEP: wizardStep = { id: 'abilities', label: 'Abilities & HP' }
const ABILITY_FIELDS = ['abilityMethod', 'abilityScores', 'hpMethod', 'hpRolls']
// The id stays 'name' so drafts saved on it reopen there.
const NAME_STEP: wizardStep = { id: 'name', label: 'Details' }

// Which step a server error field belongs to. 'campaign' errors belong to every step.
function stepOf(field: string): stepId | 'all' {
    if (field === 'campaign') return 'all'
    if (field === 'species' || field.startsWith('choice:')) return 'species'
    if (field === 'background' || field.startsWith('backgroundChoice:')) return 'background'
    if (ABILITY_FIELDS.includes(field)) return 'abilities'
    if (field === 'class' || field.startsWith('classChoice:')) return 'class'
    return 'name'
}

// Opened from a campaign, the campaign is already known; opened from home, it's the first step.
function stepsFor(campaignInUrl: boolean): wizardStep[] {
    return campaignInUrl ? [SPECIES_STEP, BACKGROUND_STEP, CLASS_STEP, ABILITIES_STEP, NAME_STEP]
        : [CAMPAIGN_STEP, SPECIES_STEP, BACKGROUND_STEP, CLASS_STEP, ABILITIES_STEP, NAME_STEP]
}

const serverCampaign = (campaignId: string) => (campaignId === SANDBOX ? null : campaignId)
// The steps whose card fills the page, with their errors shown beside each field.
const WIDE_STEPS: stepId[] = ['species', 'background', 'class', 'abilities', 'name']

// What the server checks, saves and creates from: the draft without the campaign.
function characterFields(d: wizardDraft): characterDraft {
    return {
        name: d.name, species: d.species, speciesChoices: d.speciesChoices, originRules: d.originRules,
        background: d.background, backgroundChoices: d.backgroundChoices,
        class: d.class, classChoices: d.classChoices,
        abilityMethod: d.abilityMethod, abilityScores: d.abilityScores, hpMethod: d.hpMethod, hpRolls: d.hpRolls,
        details: d.details,
    }
}

// What a campaign's content decides; a new campaign starts these over.
const FRESH_CHOICES = {
    species: null, speciesChoices: {}, originRules: {}, background: null, backgroundChoices: {}, class: null, classChoices: {},
    abilityMethod: null, abilityScores: {}, hpMethod: null, hpRolls: [],
}

// A step-by-step character creation wizard, at /campaigns/:campaignID/characters/new
// or, choosing the campaign first, at /characters/new. Once a campaign is chosen, progress
// is saved as a draft as the player goes; ?draft=<id> reopens it where they left off.
export default function NewCharacter() {
    const { campaignID } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams()
    // The saved draft's id: from the URL when reopening, or once the first save makes it.
    const draftId = useRef<string | null>(searchParams.get('draft'))
    // Resolves once the first save has made the draft, so later saves don't make another.
    const creatingDraft = useRef<Promise<string> | null>(null)
    // False while a reopened draft loads, so nothing is saved over it first.
    const [loaded, setLoaded] = useState(() => !searchParams.get('draft'))
    const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed' | null>(null)
    // Set once the character is created, so no save brings the draft back.
    const finished = useRef(false)
    const steps = stepsFor(Boolean(campaignID))
    // The campaigns a character can be made in: the one in the URL, or the user's memberships.
    const [campaigns, setCampaigns] = useState<campaign[] | null>(null)
    const [notFound, setNotFound] = useState(false)
    const [draft, setDraft] = useState<wizardDraft>({
        campaignId: campaignID ?? '', ...FRESH_CHOICES, details: {}, name: '',
    })
    const [stepIndex, setStepIndex] = useState(0)
    // What the chosen campaign (or the sandbox) offers, from the server.
    const [options, setOptions] = useState<characterOptions | null>(null)
    const [optionsFailed, setOptionsFailed] = useState(false)
    // The sandbox's backgrounds under the player's own origin rules; null: those in options.
    const [ruledBackgrounds, setRuledBackgrounds] = useState<backgroundOption[] | null>(null)
    // The server's verdict on the current draft.
    const [errors, setErrors] = useState<draftError[]>([])
    const [taken, setTaken] = useState<takenOptions>({})
    const [summary, setSummary] = useState<draftCheck['summary'] | null>(null)
    // The ability scores the server rolled for this draft, for the roll method.
    const [rolls, setRolls] = useState<abilityRoll[] | null>(null)
    // A field's errors show once the player has changed it, or tried to leave its step.
    const [touched, setTouched] = useState<Set<string>>(new Set())
    const [attempted, setAttempted] = useState<Set<stepId>>(new Set())
    const [campaignError, setCampaignError] = useState<string | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    // Counts validation requests, so a slow answer can't replace a newer one.
    const latestCheck = useRef(0)

    useEffect(() => {
        if (!draftId.current) return
        getDraft(draftId.current)
            .then(saved => {
                setDraft(d => ({ ...d, ...saved.draft, campaignId: saved.campaignId ?? SANDBOX }))
                setRolls(saved.rolls)
                const index = stepsFor(Boolean(campaignID)).findIndex(s => s.id === saved.step)
                if (index > 0) setStepIndex(index)
            })
            // Gone (created, deleted, or left the campaign): start a fresh one.
            .catch(() => {
                draftId.current = null
                setSearchParams({}, { replace: true })
            })
            .finally(() => setLoaded(true))
    }, [campaignID, setSearchParams])

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
                setDraft(d => ({
                    ...d,
                    ...(d.species || o.species.length === 0 ? {} : { species: o.species[0].id, speciesChoices: {} }),
                    ...(d.background || o.backgrounds.length === 0 ? {} : { background: o.backgrounds[0].id, backgroundChoices: {} }),
                    ...(d.class || o.classes.length === 0 ? {} : { class: o.classes[0].id, classChoices: {} }),
                }))
            })
            .catch(() => current && setOptionsFailed(true))
        return () => { current = false }
    }, [draft.campaignId])

    // The origin rules in force: the campaign's, or in the sandbox the player's picks.
    const originRules = options && (options.rulesLocked ? options.originRules : { ...options.originRules, ...draft.originRules })
    const rulesKey = options && !options.rulesLocked && Object.keys(draft.originRules).length > 0
        ? JSON.stringify(originRules) : null

    // Backgrounds change with the sandbox's origin rules, so fetch them for the rules picked.
    useEffect(() => {
        if (!rulesKey) return
        let current = true
        getBackgroundOptions(null, JSON.parse(rulesKey))
            .then(found => current && setRuledBackgrounds(found))
            .catch(() => {})
        return () => { current = false }
    }, [rulesKey])
    const backgrounds = rulesKey ? ruledBackgrounds : options?.backgrounds ?? null

    function check(next: wizardDraft): Promise<draftError[]> {
        const request = ++latestCheck.current
        return validateCharacter(serverCampaign(next.campaignId), characterFields(next), draftId.current)
            .then(found => {
                if (request === latestCheck.current) {
                    setErrors(found.errors)
                    setTaken(found.taken)
                    setSummary(found.summary)
                }
                return found.errors
            })
    }

    // Check the draft with the server as the player goes, once typing pauses.
    useEffect(() => {
        if (!draft.campaignId) return
        const timer = setTimeout(() => { check(draft).catch(() => {}) }, VALIDATE_DELAY_MS)
        return () => clearTimeout(timer)
    }, [draft])

    // Save the draft once the player pauses. The first save makes it and puts its id in
    // the URL, so reloading or coming back from home reopens it.
    useEffect(() => {
        if (!loaded || !draft.campaignId || finished.current) return
        const timer = setTimeout(() => {
            const saved = {
                campaignId: serverCampaign(draft.campaignId),
                draft: characterFields(draft),
                step: stepsFor(Boolean(campaignID))[stepIndex].id,
            }
            setSaveState('saving')
            let save: Promise<unknown>
            if (draftId.current) {
                save = saveDraft(draftId.current, saved)
            } else if (creatingDraft.current) {
                save = creatingDraft.current.then(id => saveDraft(id, saved))
            } else {
                creatingDraft.current = createDraft(saved)
                save = creatingDraft.current.then(id => {
                    draftId.current = id
                    if (!finished.current) setSearchParams({ draft: id }, { replace: true })
                })
            }
            save.then(() => setSaveState('saved'), () => setSaveState('failed'))
        }, SAVE_DELAY_MS)
        return () => clearTimeout(timer)
    }, [draft, stepIndex, loaded, campaignID, setSearchParams])

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
        if (newCampaign) {
            setOptions(null)
            setOptionsFailed(false)
        }
        setDraft(d => ({
            ...d, ...changes,
            ...(newCampaign ? FRESH_CHOICES : {}),
        }))
        if (newCampaign) setRolls(null)
        if (field) setTouched(t => new Set(t).add(field))
        setCampaignError(null)
        setSaveError(null)
    }

    // For the abilities step, which sets point buy's starting scores from an effect, so it
    // needs a function that stays the same between renders.
    const changeAbilities = useCallback((changes: Partial<wizardDraft>, field: string) => {
        setDraft(d => ({ ...d, ...changes }))
        setTouched(t => new Set(t).add(field))
        setSaveError(null)
    }, [])

    // The draft must be saved before the server can roll for it; make it now if it isn't yet.
    function ensureDraft(): Promise<string> {
        if (draftId.current) return Promise.resolve(draftId.current)
        if (!creatingDraft.current) {
            creatingDraft.current = createDraft({
                campaignId: serverCampaign(draft.campaignId), draft: characterFields(draft), step: step.id,
            }).then(id => {
                draftId.current = id
                setSearchParams({ draft: id }, { replace: true })
                return id
            })
        }
        return creatingDraft.current
    }

    function rollScores() {
        return ensureDraft().then(rollAbilities).then(found => {
            setRolls(found)
            // Check again with the new rolls.
            setDraft(d => ({ ...d }))
        })
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
                const body = { draftId: draftId.current ?? undefined, ...characterFields(draft) }
                const create = draft.campaignId === SANDBOX
                    ? createSandboxCharacter(body)
                    : createCharacter(draft.campaignId, body)
                finished.current = true
                return create
                    // From a campaign, go back to it; from home, go home, where the new character is listed.
                    .then(() => navigate(campaignID ? `/campaign/${campaignID}` : '/', { replace: true }))
            })
            .catch(err => {
                const data = err.response?.data
                if (data?.errors) setErrors(data.errors)
                setSaveError(data?.errors ? null : (data?.error ?? 'Could not reach the server.'))
                finished.current = false
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
    const waiting = optionsFailed
        ? <p className="setting-error">Couldn’t load what this campaign offers. Reload to try again.</p>
        : <p className="muted">Loading…</p>

    return (
        <div className="page wizard">
            <BackButton/>
            <span className="setting-caption">{chosenName ?? ' '}</span>
            <h1>New Character</h1>
            {saveState && (
                <span className="setting-hint" aria-live="polite">
                    {saveState === 'saving' ? 'Saving draft…' : saveState === 'saved' ? 'Draft saved' : 'Couldn’t save the draft'}
                </span>
            )}

            <ol className="wizard__steps" aria-label="Steps">
                {steps.map((s, i) => (
                    <li key={s.id} className={i === stepIndex ? 'wizard__step wizard__step--current' : i < stepIndex ? 'wizard__step wizard__step--done' : 'wizard__step'}
                        aria-current={i === stepIndex ? 'step' : undefined}>
                        <span className="wizard__step-number">{i + 1}</span> {s.label}
                    </li>
                ))}
            </ol>

            <form className={WIDE_STEPS.includes(step.id) ? 'wizard__form wizard__form--wide' : 'wizard__form'} onSubmit={handleNext}>
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
                        taken={taken}
                        onSelect={id => update({ species: id, speciesChoices: {} }, 'species')}
                        onChoose={(id, value) =>
                            update({ speciesChoices: { ...draft.speciesChoices, [id]: value } }, `choice:${id}`)}
                        errorsFor={errorsFor}
                    />
                ) : waiting)}

                {step.id === 'background' && (options && originRules && backgrounds ? (
                    <BackgroundStep
                        rules={originRules}
                        locked={options.rulesLocked}
                        // A new rule changes what the background asks for, so its choices start over.
                        onRuleChange={changes => update({
                            originRules: { ...draft.originRules, ...changes }, backgroundChoices: {},
                        }, 'background')}
                        options={backgrounds}
                        selected={draft.background}
                        choices={draft.backgroundChoices}
                        taken={taken}
                        onSelect={id => update({ background: id, backgroundChoices: {} }, 'background')}
                        onChoose={(id, value) =>
                            update({ backgroundChoices: { ...draft.backgroundChoices, [id]: value } }, `backgroundChoice:${id}`)}
                        errorsFor={errorsFor}
                    />
                ) : waiting)}

                {step.id === 'class' && (options ? (
                    <ClassStep
                        campaignId={serverCampaign(draft.campaignId)}
                        level={options.level}
                        classes={options.classes}
                        selected={draft.class}
                        choices={draft.classChoices}
                        taken={taken}
                        onSelect={id => update({ class: id, classChoices: {} }, 'class')}
                        onChoose={(id, value) =>
                            update({ classChoices: { ...draft.classChoices, [id]: value } }, `classChoice:${id}`)}
                        errorsFor={errorsFor}
                    />
                ) : waiting)}

                {step.id === 'abilities' && (options ? (
                    <AbilitiesStep
                        rules={options.abilityRules}
                        level={options.level}
                        hitDie={options.classes.find(c => c.id === draft.class)?.hitDie ?? null}
                        fields={draft}
                        rolls={rolls}
                        canReroll={draft.campaignId === SANDBOX}
                        summary={summary}
                        onChange={changeAbilities}
                        onRoll={rollScores}
                        errorsFor={errorsFor}
                    />
                ) : waiting)}

                {step.id === 'name' && (
                    <DetailsStep
                        name={draft.name}
                        details={draft.details}
                        onName={name => update({ name }, 'name')}
                        onDetail={(key, value) => update({ details: { ...draft.details, [key]: value } }, `details:${key}`)}
                        errorsFor={errorsFor}
                    />
                )}

                {campaignError && <p className="campaign-name__error">{campaignError}</p>}
                {stepErrors
                    .filter(err => !WIDE_STEPS.includes(step.id) || stepOf(err.field) === 'all')
                    .map(err => <p key={err.field + err.message} className="campaign-name__error">{err.message}</p>)}
                {saveError && <p className="campaign-name__error">{saveError}</p>}

                <div className="wizard__actions">
                    {stepIndex > 0 && (
                        <button type="button" className="setting-button setting-button--quiet" disabled={saving}
                            onClick={() => setStepIndex(i => i - 1)}>
                            Back
                        </button>
                    )}
                    <button type="submit" className="setting-button" disabled={saving || !campaigns || blocked || !loaded}>
                        {isLast ? (saving ? 'Creating…' : 'Create Character') : 'Next'}
                    </button>
                </div>
            </form>
        </div>
    )
}
