import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { getCampaign } from "../api/campaigns";
import { CHARACTER_NAME_MAX_LENGTH, createCharacter } from "../api/characters";
import { getUser } from "../api/users";
import BackButton from "../components/BackButton";
import type { campaign } from "../datatypes/campaign";
import "../components/campaignSettings/CampaignSettings.css";
import "./NewCharacter.css";

// Everything the wizard collects. Each later step (species, class, ability scores, ...)
// adds its fields here and a step to stepsFor below.
interface characterDraft {
    campaignId: string,
    name: string,
}

// A step returns an error message while its part of the draft isn't finished, else null.
interface wizardStep {
    id: 'campaign' | 'name',
    label: string,
    validate: (draft: characterDraft) => string | null,
}

const CAMPAIGN_STEP: wizardStep = {
    id: 'campaign',
    label: 'Campaign',
    validate: draft => draft.campaignId ? null : 'Choose the campaign this character is for.',
}

const NAME_STEP: wizardStep = {
    id: 'name',
    label: 'Name',
    validate: draft => {
        const name = draft.name.trim()
        if (!name) return 'Give your character a name.'
        if (name.length > CHARACTER_NAME_MAX_LENGTH) return `Name must be at most ${CHARACTER_NAME_MAX_LENGTH} characters.`
        return null
    },
}

// Opened from a campaign, the campaign is already known; opened from home, it's the first step.
function stepsFor(campaignInUrl: boolean): wizardStep[] {
    return campaignInUrl ? [NAME_STEP] : [CAMPAIGN_STEP, NAME_STEP]
}

function errorMessage(err: unknown, fallback: string): string {
    const response = (err as { response?: { data?: { error?: string } } }).response;
    return response?.data?.error ?? fallback;
}

// A step-by-step character creation wizard, at /campaigns/:campaignID/characters/new
// or, choosing the campaign first, at /characters/new.
export default function NewCharacter() {
    const { campaignID } = useParams();
    const navigate = useNavigate();
    const steps = stepsFor(Boolean(campaignID))
    // The campaigns a character can be made in: the one in the URL, or the user's memberships.
    const [campaigns, setCampaigns] = useState<campaign[] | null>(null)
    const [notFound, setNotFound] = useState(false)
    const [draft, setDraft] = useState<characterDraft>({ campaignId: campaignID ?? '', name: '' })
    const [stepIndex, setStepIndex] = useState(0)
    // Shown only after the user tries to move on, not while they're still typing.
    const [stepError, setStepError] = useState<string | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (campaignID) {
            getCampaign(campaignID)
                .then(c => setCampaigns([{ id: campaignID, name: c.name }]))
                .catch(() => setNotFound(true))
        } else {
            getUser()
                .then(user => {
                    setCampaigns(user.campaigns)
                    // Only one to choose from: choose it, but still show the step.
                    if (user.campaigns.length === 1) setDraft(d => ({ ...d, campaignId: user.campaigns[0].id }))
                })
                .catch(() => setCampaigns([]))
        }
    }, [campaignID])

    const step = steps[stepIndex]
    const isLast = stepIndex === steps.length - 1
    const chosenCampaign = campaigns?.find(c => c.id === draft.campaignId)

    function update(changes: Partial<characterDraft>) {
        setDraft(d => ({ ...d, ...changes }))
        setStepError(null)
    }

    function handleNext(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault()
        const problem = step.validate(draft)
        if (problem) {
            setStepError(problem)
            return
        }
        if (!isLast) {
            setStepIndex(i => i + 1)
            return
        }
        setSaving(true)
        setSaveError(null)
        createCharacter(draft.campaignId, draft.name.trim())
            // From a campaign, go back to it; from home, go home, where the new character is listed.
            .then(() => navigate(campaignID ? `/campaign/${campaignID}` : '/', { replace: true }))
            .catch(err => {
                setSaveError(errorMessage(err, 'Could not create the character.'))
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

    if (campaigns && campaigns.length === 0) {
        return (
            <div className="page">
                <BackButton/>
                <h1>New Character</h1>
                <p className="muted">
                    Characters are made for a campaign, and you aren’t in one yet. Ask your GM for an invite link.
                </p>
                <Link to="/" className="setting-button">Go home</Link>
            </div>
        )
    }

    return (
        <div className="page wizard">
            <BackButton/>
            <span className="setting-caption">{chosenCampaign?.name ?? ' '}</span>
            <h1>New Character</h1>

            <ol className="wizard__steps" aria-label="Steps">
                {steps.map((s, i) => (
                    <li key={s.id} className={i === stepIndex ? 'wizard__step wizard__step--current' : i < stepIndex ? 'wizard__step wizard__step--done' : 'wizard__step'}
                        aria-current={i === stepIndex ? 'step' : undefined}>
                        <span className="wizard__step-number">{i + 1}</span> {s.label}
                    </li>
                ))}
            </ol>

            <form className="wizard__form" onSubmit={handleNext}>
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
                    </fieldset>
                )}

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
                                onChange={e => update({ name: e.target.value })}
                            />
                        </div>
                    </div>
                )}

                {stepError && <p className="campaign-name__error">{stepError}</p>}
                {saveError && <p className="campaign-name__error">{saveError}</p>}

                <div className="wizard__actions">
                    {stepIndex > 0 && (
                        <button type="button" className="setting-button setting-button--quiet" disabled={saving}
                            onClick={() => { setStepIndex(i => i - 1); setStepError(null) }}>
                            Back
                        </button>
                    )}
                    <button type="submit" className="setting-button" disabled={saving || !campaigns}>
                        {isLast ? (saving ? 'Creating…' : 'Create Character') : 'Next'}
                    </button>
                </div>
            </form>
        </div>
    )
}
