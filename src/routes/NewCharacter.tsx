import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { getCampaign } from "../api/campaigns";
import {
    createCharacter, createSandboxCharacter, getBackgroundOptions, getCharacter, getCharacterOptions,
    rollCharacterAbilities, saveDisguise, submitCharacter, updateCharacter, validateCharacter,
    type AbilityRoll, type BackgroundOption, type CharacterDisguise, type CharacterDraft, type CharacterOptions, type ChoicePicks,
    type CreatedCharacter, type DraftCheck, type DraftError, type TakenOptions,
} from "../api/characters";
import { createDraft, getDraft, rollAbilities, saveDraft } from "../api/drafts";
import { getUser } from "../api/users";
import BackButton from "../components/BackButton";
import { AbilitiesStep } from "../components/characterWizard/AbilitiesStep";
import { AbilitySummaryContext } from "../components/characterWizard/abilitySummaryContext";
import { BackgroundStep } from "../components/characterWizard/BackgroundStep";
import { ClassStep } from "../components/characterWizard/ClassStep";
import { DetailsStep } from "../components/characterWizard/DetailsStep";
import { SpeciesStep } from "../components/characterWizard/SpeciesStep";
import { StepIcon } from "../components/characterWizard/StepIcon";
import type { Campaign } from "../datatypes/campaign";
import "../components/campaignSettings/CampaignSettings.css";
import "./NewCharacter.css";

// Stands in for a campaign id when the character goes in the Character Sandbox.
const SANDBOX = 'sandbox'
// Typing pause before the draft is checked with the server.
const VALIDATE_DELAY_MS = 250
// Pause before the draft is saved.
const SAVE_DELAY_MS = 800

// Everything the wizard collects, while the server decides what each step offers and whether it's valid.
interface WizardDraft {
    // A campaign id, SANDBOX, or '' while nothing is chosen.
    campaignId: string,
    species: string | null,
    // Each choices map resets when its species, background or class changes.
    speciesChoices: ChoicePicks,
    originRules: CharacterDraft['originRules'],
    background: string | null,
    backgroundChoices: ChoicePicks,
    class: string | null,
    classChoices: ChoicePicks,
    abilityMethod: CharacterDraft['abilityMethod'],
    abilityScores: Record<string, number>,
    hpMethod: CharacterDraft['hpMethod'],
    hpRolls: number[],
    details: CharacterDraft['details'],
    // Missing on older drafts.
    answers?: CharacterDraft['answers'],
    name: string,
}

// Sets one pick, or removes it when cleared, since the schema forbids empty picks.
function withPick(picks: ChoicePicks, choiceId: string, value: string | string[]): ChoicePicks {
    const rest = { ...picks }
    delete rest[choiceId]
    if (value === '' || (Array.isArray(value) && value.length === 0)) return rest
    // The check above guarantees a non-empty list, as ChoicePicks requires.
    return { ...rest, [choiceId]: value as ChoicePicks[string] }
}

type StepId = 'campaign' | 'species' | 'background' | 'class' | 'abilities' | 'name'

interface WizardStep {
    id: StepId,
    label: string,
}

const CAMPAIGN_STEP: WizardStep = { id: 'campaign', label: 'Campaign' }
const SPECIES_STEP: WizardStep = { id: 'species', label: 'Species' }
const BACKGROUND_STEP: WizardStep = { id: 'background', label: 'Background' }
const CLASS_STEP: WizardStep = { id: 'class', label: 'Class' }
const ABILITIES_STEP: WizardStep = { id: 'abilities', label: 'Abilities & HP' }
const ABILITY_FIELDS = ['abilityMethod', 'abilityScores', 'hpMethod', 'hpRolls']
// The id stays 'name' so drafts saved on this step reopen there.
const NAME_STEP: WizardStep = { id: 'name', label: 'Details' }

// Every step is always shown, with Campaign locked when the campaign is already decided.
const STEPS: WizardStep[] = [CAMPAIGN_STEP, SPECIES_STEP, BACKGROUND_STEP, CLASS_STEP, ABILITIES_STEP, NAME_STEP]

// Steps whose card fills the page and shows errors beside each field.
const WIDE_STEPS: StepId[] = ['species', 'background', 'class', 'abilities', 'name']

// The step a server error field belongs to, where 'campaign' errors belong to every step.
function stepForField(field: string): StepId | 'all' {
    if (field === 'campaign') return 'all'
    if (field === 'species' || field.startsWith('choice:')) return 'species'
    if (field === 'background' || field.startsWith('backgroundChoice:')) return 'background'
    if (ABILITY_FIELDS.includes(field)) return 'abilities'
    // A character behind the campaign's milestone level levels up through its class.
    if (field === 'class' || field === 'level' || field.startsWith('classChoice:')) return 'class'
    return 'name'
}

function belongsToStep(field: string, stepId: StepId): boolean {
    const owner = stepForField(field)
    return owner === 'all' || owner === stepId
}

// Error messages in the wizard's form, of which the first in the page is the top-most.
const ERROR_SELECTOR = '.campaign-name__error, .setting-error'
const FOCUSABLE = 'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)'
// About three seconds of animation frames.
const ERROR_SEEK_FRAMES = 180

const serverCampaignId = (campaignId: string) => (campaignId === SANDBOX ? null : campaignId)

// The draft without the campaign, which is what the server checks, saves and creates from.
function characterFields(draft: WizardDraft): CharacterDraft {
    return {
        name: draft.name, species: draft.species, speciesChoices: draft.speciesChoices, originRules: draft.originRules,
        background: draft.background, backgroundChoices: draft.backgroundChoices,
        class: draft.class, classChoices: draft.classChoices,
        abilityMethod: draft.abilityMethod, abilityScores: draft.abilityScores, hpMethod: draft.hpMethod, hpRolls: draft.hpRolls,
        details: draft.details, answers: draft.answers ?? {},
    }
}

// Fields that depend on the campaign's content, reset when the campaign changes.
const FRESH_CHOICES = {
    species: null, speciesChoices: {}, originRules: {}, background: null, backgroundChoices: {}, class: null, classChoices: {},
    abilityMethod: null, abilityScores: {}, hpMethod: null, hpRolls: [],
}

// Creates a character, submitting campaign characters straight away.
// A failed submit still leaves a saved draft character, so it isn't retried here.
function createFinishedCharacter(campaignId: string, body: CharacterDraft & { draftId?: string }): Promise<CreatedCharacter> {
    if (campaignId === SANDBOX) return createSandboxCharacter(body)
    return createCharacter(campaignId, body)
        .then(created => submitCharacter(created.id).catch(() => undefined).then(() => created))
}

// The character creation wizard at /characters/new or /campaigns/:campaignID/characters/new.
// Progress is saved as a draft once a campaign is chosen, and ?draft=<id> reopens it.
// At /characters/:characterID/edit it edits a saved character, without drafts, saving only once every step fits.
export default function NewCharacter() {
    const { campaignID, characterID } = useParams();
    const editing = Boolean(characterID)
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams()
    // Comes from the URL when reopening, or is set by the first save.
    const draftId = useRef<string | null>(searchParams.get('draft'))
    // Pending first save, so later saves wait for it instead of creating another draft.
    const creatingDraft = useRef<Promise<string> | null>(null)
    // False while a reopened draft loads, so nothing is saved over it first.
    const [loaded, setLoaded] = useState(() => !searchParams.get('draft') && !characterID)
    // The edited character's level, which may differ from the campaign's starting level.
    const [characterLevel, setCharacterLevel] = useState<number | null>(null)
    const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed' | null>(null)
    // Set once the character is created, so no late save brings the draft back.
    const finished = useRef(false)
    const campaignFixed = Boolean(campaignID) || editing
    // The URL's campaign, or every campaign the user belongs to.
    const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
    const [notFound, setNotFound] = useState(false)
    const [draft, setDraft] = useState<WizardDraft>({
        campaignId: campaignID ?? '', ...FRESH_CHOICES, details: {}, name: '',
    })
    const [stepIndex, setStepIndex] = useState(() => (campaignID || characterID ? 1 : 0))
    const [options, setOptions] = useState<CharacterOptions | null>(null)
    const [optionsFailed, setOptionsFailed] = useState(false)
    // Sandbox backgrounds under the player's own origin rules, or null to use those in options.
    const [ruledBackgrounds, setRuledBackgrounds] = useState<BackgroundOption[] | null>(null)
    const [errors, setErrors] = useState<DraftError[]>([])
    const [taken, setTaken] = useState<TakenOptions>({})
    const [summary, setSummary] = useState<DraftCheck['summary'] | null>(null)
    const [rolls, setRolls] = useState<AbilityRoll[] | null>(null)
    // A field's errors show once it has changed, or once the player tried to leave its step.
    const [touched, setTouched] = useState<Set<string>>(new Set())
    const [attempted, setAttempted] = useState<Set<StepId>>(new Set())
    const [campaignError, setCampaignError] = useState<string | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    // What the party sees under partyVisibility 'misleading', saved with the character.
    const [disguise, setDisguise] = useState<CharacterDisguise>({})
    // Numbers validation requests so a slow answer can't replace a newer one.
    const latestCheck = useRef(0)
    const formRef = useRef<HTMLFormElement>(null)
    // Bumped when Next or Complete finds problems, to scroll to the top-most error once it shows.
    const [errorJump, setErrorJump] = useState(0)
    // False when the problem is a general message at the foot of the form, with no field error to wait for.
    const jumpToField = useRef(true)
    // When set, only errors with these messages are jumped to, so a real error wins over unfinished fields above it.
    const jumpMessages = useRef<Set<string> | null>(null)
    const jumpToFirstError = (toField = true, messages: string[] | null = null) => {
        jumpToField.current = toField
        jumpMessages.current = messages && new Set(messages)
        setErrorJump(n => n + 1)
    }

    // A new step may still be loading its choices, so this looks for the error over the next few seconds.
    useEffect(() => {
        if (!errorJump) return
        let frame = 0
        let tries = 0
        const seek = () => {
            const form = formRef.current
            const wanted = jumpMessages.current
            const found = (form ? [...form.querySelectorAll<HTMLElement>(ERROR_SELECTOR)] : [])
                .filter(el => !wanted || wanted.has(el.textContent?.trim() ?? ''))
            // Errors beside a field come first; the general messages at the foot of the form
            // (direct children of it) are used only once the step's own errors have had time to show.
            const first = found.find(el => el.parentElement !== form)
                ?? (!jumpToField.current || tries >= ERROR_SEEK_FRAMES / 2 ? found[0] : undefined)
            if (!first) {
                if (++tries < ERROR_SEEK_FRAMES) frame = requestAnimationFrame(seek)
                return
            }
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
            first.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
            // Focus the field the error belongs to, so the player can fix it straight away.
            const control = first.closest('label, .pick-choice, .details-field')?.querySelector<HTMLElement>(FOCUSABLE)
            control?.focus({ preventScroll: true })
        }
        frame = requestAnimationFrame(seek)
        return () => cancelAnimationFrame(frame)
    }, [errorJump])

    // When editing, start from the saved character on the first step with a problem.
    useEffect(() => {
        if (!characterID) return
        getCharacter(characterID)
            .then(character => {
                setDraft({
                    ...FRESH_CHOICES, ...character.draft, details: character.draft.details ?? {},
                    campaignId: character.campaignId ?? SANDBOX,
                })
                setRolls(character.rolls)
                setDisguise(character.disguise ?? {})
                setCharacterLevel(character.editLevel)
                setCampaigns(character.campaignId ? [{ id: character.campaignId, name: character.campaignName ?? '' }] : [])
                setAttempted(new Set(STEPS.map(s => s.id)))
                const firstProblemStep = STEPS.findIndex(s => character.problems.some(p => stepForField(p.field) === s.id))
                if (firstProblemStep > 0) setStepIndex(firstProblemStep)
                setLoaded(true)
            })
            .catch(() => setNotFound(true))
    }, [characterID])

    useEffect(() => {
        if (!draftId.current) return
        getDraft(draftId.current)
            .then(saved => {
                setDraft(current => ({ ...current, ...saved.draft, campaignId: saved.campaignId ?? SANDBOX }))
                setRolls(saved.rolls)
                const savedStep = STEPS.findIndex(s => s.id === saved.step)
                if (savedStep > 0) setStepIndex(savedStep)
            })
            // The draft is gone (created, deleted or the player left the campaign), so start fresh.
            .catch(() => {
                draftId.current = null
                setSearchParams({}, { replace: true })
            })
            .finally(() => setLoaded(true))
    }, [campaignID, setSearchParams])

    useEffect(() => {
        // When editing, the character supplies the campaign.
        if (characterID) return
        if (campaignID) {
            getCampaign(campaignID)
                .then(campaign => setCampaigns([{ id: campaignID, name: campaign.name }]))
                .catch(() => setNotFound(true))
        } else {
            getUser()
                .then(user => setCampaigns(user.campaigns))
                .catch(() => setCampaigns([]))
        }
    }, [campaignID, characterID])

    useEffect(() => {
        if (!draft.campaignId) return
        let current = true
        getCharacterOptions(serverCampaignId(draft.campaignId))
            .then(loadedOptions => {
                if (!current) return
                setOptions(loadedOptions)
                // The card on show counts as the pick, so preselect the first of each.
                setDraft(d => ({
                    ...d,
                    ...(d.species || loadedOptions.species.length === 0 ? {} : { species: loadedOptions.species[0].id, speciesChoices: {} }),
                    ...(d.background || loadedOptions.backgrounds.length === 0 ? {} : { background: loadedOptions.backgrounds[0].id, backgroundChoices: {} }),
                    ...(d.class || loadedOptions.classes.length === 0 ? {} : { class: loadedOptions.classes[0].id, classChoices: {} }),
                }))
            })
            .catch(() => current && setOptionsFailed(true))
        return () => { current = false }
    }, [draft.campaignId])

    // The campaign shows the party a disguise, set on the Details step.
    const misleading = options?.partyVisibility === 'misleading'
    // The campaign's origin rules, or in the sandbox the player's picks over the defaults.
    const originRules = options && (options.rulesLocked ? options.originRules : { ...options.originRules, ...draft.originRules })
    // A stable key for the sandbox's custom origin rules, or null when the defaults apply.
    const rulesKey = options && !options.rulesLocked && Object.keys(draft.originRules).length > 0
        ? JSON.stringify(originRules) : null

    useEffect(() => {
        if (!rulesKey) return
        let current = true
        getBackgroundOptions(null, JSON.parse(rulesKey))
            .then(found => current && setRuledBackgrounds(found))
            .catch(() => {})
        return () => { current = false }
    }, [rulesKey])
    const backgrounds = rulesKey ? ruledBackgrounds : options?.backgrounds ?? null

    const check = useCallback((next: WizardDraft): Promise<DraftError[]> => {
        const request = ++latestCheck.current
        return validateCharacter(serverCampaignId(next.campaignId), characterFields(next), draftId.current, characterID)
            .then(found => {
                if (request === latestCheck.current) {
                    setErrors(found.errors)
                    setTaken(found.taken)
                    setSummary(found.summary)
                }
                return found.errors
            })
    }, [characterID])

    useEffect(() => {
        if (!draft.campaignId) return
        const timer = setTimeout(() => { check(draft).catch(() => {}) }, VALIDATE_DELAY_MS)
        return () => clearTimeout(timer)
    }, [draft, check])

    // Saves a new character's progress as a draft. The first save creates it and puts its id in the URL, so reloading reopens it.
    const persistDraft = useCallback((current: WizardDraft, stepId: StepId): Promise<unknown> => {
        const saved = {
            campaignId: serverCampaignId(current.campaignId),
            draft: characterFields(current),
            step: stepId,
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
        return save
    }, [setSearchParams])

    useEffect(() => {
        if (editing || !loaded || !draft.campaignId || finished.current) return
        const timer = setTimeout(() => { persistDraft(draft, STEPS[stepIndex].id).catch(() => {}) }, SAVE_DELAY_MS)
        return () => clearTimeout(timer)
    }, [draft, stepIndex, loaded, editing, persistDraft])

    const step = STEPS[stepIndex]
    const isLastStep = stepIndex === STEPS.length - 1
    const chosenCampaignName = draft.campaignId === SANDBOX
        ? 'Character Sandbox'
        : campaigns?.find(campaign => campaign.id === draft.campaignId)?.name

    // Campaign-wide errors always show, and this step's own once touched or attempted.
    const stepErrors = draft.campaignId ? errors.filter(error =>
        stepForField(error.field) === 'all'
        || (stepForField(error.field) === step.id && (touched.has(error.field) || attempted.has(step.id)))) : []
    const errorsFor = (field: string) => stepErrors.filter(error => error.field === field).map(error => error.message)

    function update(changes: Partial<WizardDraft>, field?: string) {
        // What's allowed depends on the campaign, so a new campaign resets the picks.
        const campaignChanged = changes.campaignId !== undefined && changes.campaignId !== draft.campaignId
        if (campaignChanged) {
            setOptions(null)
            setOptionsFailed(false)
        }
        setDraft(d => ({
            ...d, ...changes,
            ...(campaignChanged ? FRESH_CHOICES : {}),
        }))
        if (campaignChanged) setRolls(null)
        if (field) setTouched(t => new Set(t).add(field))
        setCampaignError(null)
        setSaveError(null)
    }

    // Stable across renders because the abilities step calls it from an effect.
    const changeAbilities = useCallback((changes: Partial<WizardDraft>, field: string) => {
        setDraft(d => ({ ...d, ...changes }))
        setTouched(t => new Set(t).add(field))
        setSaveError(null)
    }, [])

    // The server rolls only for a saved draft, so create it now if needed.
    function ensureDraft(): Promise<string> {
        if (draftId.current) return Promise.resolve(draftId.current)
        if (!creatingDraft.current) {
            creatingDraft.current = createDraft({
                campaignId: serverCampaignId(draft.campaignId), draft: characterFields(draft), step: step.id,
            }).then(id => {
                draftId.current = id
                setSearchParams({ draft: id }, { replace: true })
                return id
            })
        }
        return creatingDraft.current
    }

    function rollScores() {
        const roll = characterID ? rollCharacterAbilities(characterID) : ensureDraft().then(rollAbilities)
        return roll.then(found => {
            setRolls(found)
            // A fresh object triggers revalidation with the new rolls.
            setDraft(d => ({ ...d }))
        })
    }

    // Saves the edit or creates the character, then opens its sheet.
    function finish(): Promise<unknown> {
        finished.current = true
        if (characterID) {
            return updateCharacter(characterID, characterFields(draft))
                .then(() => misleading ? saveDisguise(characterID, disguise) : null)
                .then(() => navigate(`/characters/${characterID}`, { replace: true }))
        }
        const body = { draftId: draftId.current ?? undefined, ...characterFields(draft) }
        const hasDisguise = misleading && Object.values(disguise).some(Boolean)
        // The character exists by now, so a failed disguise save mustn't offer a retry that creates it twice.
        // The disguise can be set again by editing the character.
        return createFinishedCharacter(draft.campaignId, body)
            .then(created => Promise.resolve(hasDisguise ? saveDisguise(created.id, disguise).catch(() => null) : null)
                .then(() => navigate(`/characters/${created.id}`, { replace: true })))
    }

    function handleNext(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault()
        if (step.id === 'campaign') {
            if (!draft.campaignId) {
                setCampaignError('Choose a campaign, or the Character Sandbox.')
                return jumpToFirstError(false)
            }
            setStepIndex(i => i + 1)
            return
        }
        // Recheck now, so an answer still in flight can't let the player through.
        setAttempted(a => new Set(a).add(step.id))
        setSaving(isLastStep)
        check(draft)
            .then(found => {
                if (found.some(error => belongsToStep(error.field, step.id))) {
                    setSaving(false)
                    jumpToFirstError()
                    return
                }
                // Steps can be skipped from the bar, so send the player to the first unfinished one before creating.
                const unfinishedStep = isLastStep ? STEPS.findIndex(s => found.some(error => stepForField(error.field) === s.id)) : -1
                if (unfinishedStep >= 0) {
                    setAttempted(a => new Set(a).add(STEPS[unfinishedStep].id))
                    setStepIndex(unfinishedStep)
                    setSaving(false)
                    jumpToFirstError()
                    return
                }
                if (!isLastStep) {
                    setStepIndex(i => i + 1)
                    return
                }
                return finish()
            })
            .catch(err => {
                const data = err.response?.data
                if (data?.errors) setErrors(data.errors)
                setSaveError(data?.errors ? null : (data?.error ?? 'Could not reach the server.'))
                finished.current = false
                setSaving(false)
                jumpToFirstError(Boolean(data?.errors))
            })
    }

    // The Complete square, in order:
    // 1. Anything wrong (rather than just not filled in yet) sends the player to the top-most such error.
    // 2. An unfinished new character is kept as a draft and the player returns to the campaign.
    //    An edit can't be saved half-done, so it shows the first step still needing work instead.
    // 3. A finished character is saved and opens its sheet.
    function handleComplete() {
        if (!draft.campaignId) {
            setCampaignError('Choose a campaign, or the Character Sandbox.')
            return jumpToFirstError(false)
        }
        setSaving(true)
        setSaveError(null)
        check(draft)
            .then(found => {
                const wrong = found.filter(error => !error.incomplete)
                if (wrong.length > 0) {
                    // Campaign-wide errors show on every step, so the player stays put for those.
                    const wrongStep = STEPS.findIndex(s => wrong.some(error => stepForField(error.field) === s.id))
                    setAttempted(new Set(STEPS.map(s => s.id)))
                    if (wrongStep >= 0) setStepIndex(wrongStep)
                    setSaving(false)
                    jumpToFirstError(wrongStep >= 0, wrong.map(error => error.message))
                    return
                }
                const unfinishedStep = STEPS.findIndex(s => found.some(error => stepForField(error.field) === s.id))
                if (unfinishedStep < 0) return finish()
                if (editing) {
                    setAttempted(new Set(STEPS.map(s => s.id)))
                    setStepIndex(unfinishedStep)
                    setSaveError('Finish the marked steps to save these changes.')
                    setSaving(false)
                    jumpToFirstError()
                    return
                }
                finished.current = true
                return persistDraft(draft, step.id)
                    .then(() => navigate(draft.campaignId === SANDBOX ? '/' : `/campaign/${draft.campaignId}`))
            })
            .catch(err => {
                const data = err.response?.data
                if (data?.errors) setErrors(data.errors)
                setSaveError(data?.errors ? null : (data?.error ?? 'Could not reach the server.'))
                finished.current = false
                setSaving(false)
                jumpToFirstError(Boolean(data?.errors))
            })
    }

    if (notFound) {
        return (
            <div className="page">
                <BackButton/>
                <h1>{editing ? 'Character not found' : 'Campaign not found'}</h1>
                <p className="muted">{editing ? 'It may have been deleted, or it isn’t yours.' : 'It may have been deleted, or you aren’t a member.'}</p>
            </div>
        )
    }

    const blocked = stepErrors.some(error => error.field === 'campaign')
    const waiting = optionsFailed
        ? <p className="setting-error">Couldn’t load what this campaign offers. Reload to try again.</p>
        : <p className="muted">Loading…</p>

    return (
        <div className="page wizard">
            <BackButton/>
            <span className="setting-caption">{chosenCampaignName ?? ' '}</span>
            <h1>{editing ? `Edit ${draft.name || 'Character'}` : 'New Character'}</h1>
            {saveState && (
                <span className="setting-hint" aria-live="polite">
                    {saveState === 'saving' ? 'Saving draft…' : saveState === 'saved' ? 'Draft saved' : 'Couldn’t save the draft'}
                </span>
            )}

            <nav className="wizard__progress" aria-label="Steps">
                <div className="wizard__bar">
                    <ol className="wizard__steps">
                        {STEPS.map((s, i) => {
                            const locked = s.id === 'campaign' ? campaignFixed : !draft.campaignId
                            // A step is done once visited with nothing wrong, and otherwise keeps its number.
                            const hasProblems = errors.some(error => belongsToStep(error.field, s.id))
                            const visited = i < stepIndex || attempted.has(s.id)
                            const state = i === stepIndex ? 'current'
                                : (s.id === 'campaign' && campaignFixed) || (visited && !hasProblems) ? 'done'
                                : 'todo'
                            return (
                                <li key={s.id} className={`wizard__step wizard__step--${state}`}
                                    title={s.id === 'campaign' && campaignFixed ? 'The campaign is already decided.' : undefined}>
                                    <button type="button" className="wizard__step-button"
                                        aria-current={i === stepIndex ? 'step' : undefined}
                                        disabled={saving || locked}
                                        onClick={() => setStepIndex(i)}>
                                        <span className="wizard__step-number" aria-hidden="true">{state === 'done' ? '✓' : i + 1}</span>
                                        <StepIcon step={s.id} />
                                        <span className="wizard__step-label">{s.label}</span>
                                    </button>
                                </li>
                            )
                        })}
                    </ol>
                    <button type="button" className="wizard__complete" onClick={handleComplete}
                        disabled={saving || !campaigns || blocked || !loaded || !draft.campaignId}
                        aria-label="Complete"
                        title={editing
                            ? 'Save the changes and open the character sheet'
                            : 'Create the character if it’s finished, or save it for later and go back to the campaign'}>
                        <StepIcon step="complete" />
                    </button>
                </div>
                <div className="wizard__progress-track" aria-hidden="true">
                    <div className="wizard__progress-fill" style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
                </div>
            </nav>

            <AbilitySummaryContext.Provider value={summary?.abilities ?? null}>
                <form ref={formRef} className={WIDE_STEPS.includes(step.id) ? 'wizard__form wizard__form--wide' : 'wizard__form'} onSubmit={handleNext}>
                    {step.id === 'campaign' && campaigns && (
                        <fieldset className="wizard__choices">
                            <legend className="setting-caption">Campaign</legend>
                            {campaigns.map(campaign => (
                                <label key={campaign.id} className="wizard__choice">
                                    <input type="radio" name="campaign" value={campaign.id}
                                        checked={draft.campaignId === campaign.id}
                                        onChange={() => update({ campaignId: campaign.id })} />
                                    <span>{campaign.name}</span>
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
                                update({ speciesChoices: withPick(draft.speciesChoices, id, value) }, `choice:${id}`)}
                            errorsFor={errorsFor}
                        />
                    ) : waiting)}

                    {step.id === 'background' && (options && originRules && backgrounds ? (
                        <BackgroundStep
                            rules={originRules}
                            locked={options.rulesLocked}
                            // A new rule changes what the background asks for, so its choices reset.
                            onRuleChange={changes => update({
                                originRules: { ...draft.originRules, ...changes }, backgroundChoices: {},
                            }, 'background')}
                            options={backgrounds}
                            selected={draft.background}
                            choices={draft.backgroundChoices}
                            taken={taken}
                            onSelect={id => update({ background: id, backgroundChoices: {} }, 'background')}
                            onChoose={(id, value) =>
                                update({ backgroundChoices: withPick(draft.backgroundChoices, id, value) }, `backgroundChoice:${id}`)}
                            errorsFor={errorsFor}
                        />
                    ) : waiting)}

                    {step.id === 'class' && (options ? (
                        <ClassStep
                            campaignId={serverCampaignId(draft.campaignId)}
                            level={characterLevel ?? options.level}
                            classes={options.classes}
                            selected={draft.class}
                            choices={draft.classChoices}
                            taken={taken}
                            onSelect={id => update({ class: id, classChoices: {} }, 'class')}
                            onChoose={(id, value) =>
                                update({ classChoices: withPick(draft.classChoices, id, value) }, `classChoice:${id}`)}
                            errorsFor={errorsFor}
                        />
                    ) : waiting)}

                    {step.id === 'abilities' && (options ? (
                        <AbilitiesStep
                            rules={options.abilityRules}
                            level={characterLevel ?? options.level}
                            hitDie={options.classes.find(cls => cls.id === draft.class)?.hitDie ?? null}
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
                            questions={options?.questions ?? []}
                            answers={draft.answers ?? {}}
                            disguise={misleading ? {
                                disguise,
                                realSpecies: options.species.find(sp => sp.id === draft.species)?.name ?? null,
                                realClass: options.classes.find(cls => cls.id === draft.class)?.name ?? null,
                                species: options.species.map(sp => sp.name),
                                classes: options.classes.map(cls => cls.name),
                                onChange: setDisguise,
                            } : undefined}
                            onAnswer={(id, value) => update({ answers: { ...draft.answers, [id]: value } }, `answer:${id}`)}
                            onName={name => update({ name }, 'name')}
                            onDetail={(key, value) => update({ details: { ...draft.details, [key]: value } }, `details:${key}`)}
                            errorsFor={errorsFor}
                        />
                    )}

                    {campaignError && <p className="campaign-name__error">{campaignError}</p>}
                    {stepErrors
                        .filter(error => !WIDE_STEPS.includes(step.id) || stepForField(error.field) === 'all')
                        .map(error => <p key={error.field + error.message} className="campaign-name__error">{error.message}</p>)}
                    {saveError && <p className="campaign-name__error">{saveError}</p>}

                    <div className="wizard__actions">
                        {stepIndex > (campaignFixed ? 1 : 0) && (
                            <button type="button" className="setting-button setting-button--quiet" disabled={saving}
                                onClick={() => setStepIndex(i => i - 1)}>
                                Back
                            </button>
                        )}
                        <button type="submit" className="setting-button" disabled={saving || !campaigns || blocked || !loaded}>
                            {isLastStep
                                ? (editing ? (saving ? 'Updating…' : 'Update Character') : (saving ? 'Creating…' : 'Create Character'))
                                : 'Next'}
                        </button>
                    </div>
                </form>
            </AbilitySummaryContext.Provider>
        </div>
    )
}
