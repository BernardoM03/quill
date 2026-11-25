import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { getCampaign } from "../api/campaigns";
import {
    createCharacter, createSandboxCharacter, getBackgroundOptions, getCharacter, getCharacterOptions,
    rollCharacterAbilities, submitCharacter, updateCharacter, validateCharacter,
    type AbilityRoll, type BackgroundOption, type CharacterDraft, type CharacterOptions, type ChoicePicks,
    type CreatedCharacter, type DraftCheck, type DraftError, type TakenOptions,
} from "../api/characters";
import { createDraft, getDraft, rollAbilities, saveDraft } from "../api/drafts";
import { getUser } from "../api/users";
import BackButton from "../components/BackButton";
import { AbilitiesStep } from "../components/characterWizard/AbilitiesStep";
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
    if (field === 'class' || field.startsWith('classChoice:')) return 'class'
    return 'name'
}

function belongsToStep(field: string, stepId: StepId): boolean {
    const owner = stepForField(field)
    return owner === 'all' || owner === stepId
}

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
    // Numbers validation requests so a slow answer can't replace a newer one.
    const latestCheck = useRef(0)

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
                setCharacterLevel(character.level)
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

    // The first save creates the draft and puts its id in the URL, so reloading reopens it.
    useEffect(() => {
        if (editing || !loaded || !draft.campaignId || finished.current) return
        const timer = setTimeout(() => {
            const saved = {
                campaignId: serverCampaignId(draft.campaignId),
                draft: characterFields(draft),
                step: STEPS[stepIndex].id,
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
    }, [draft, stepIndex, loaded, campaignID, setSearchParams, editing])

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
                .then(() => navigate(`/characters/${characterID}`, { replace: true }))
        }
        const body = { draftId: draftId.current ?? undefined, ...characterFields(draft) }
        return createFinishedCharacter(draft.campaignId, body)
            .then(created => navigate(`/characters/${created.id}`, { replace: true }))
    }

    function handleNext(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault()
        if (step.id === 'campaign') {
            if (!draft.campaignId) return setCampaignError('Choose a campaign, or the Character Sandbox.')
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
                    return
                }
                // Steps can be skipped from the bar, so send the player to the first unfinished one before creating.
                const unfinishedStep = isLastStep ? STEPS.findIndex(s => found.some(error => stepForField(error.field) === s.id)) : -1
                if (unfinishedStep >= 0) {
                    setAttempted(a => new Set(a).add(STEPS[unfinishedStep].id))
                    setStepIndex(unfinishedStep)
                    setSaving(false)
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
                <div className="wizard__progress-track" aria-hidden="true">
                    <div className="wizard__progress-fill" style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
                </div>
            </nav>

            <form className={WIDE_STEPS.includes(step.id) ? 'wizard__form wizard__form--wide' : 'wizard__form'} onSubmit={handleNext}>
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
                            ? (editing ? (saving ? 'Saving…' : 'Save Changes') : (saving ? 'Creating…' : 'Create Character'))
                            : 'Next'}
                    </button>
                </div>
            </form>
        </div>
    )
}
