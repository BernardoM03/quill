import { useState } from "react";
import { useParams } from "react-router";

import { CAMPAIGN_NAME_MAX_LENGTH, updateCampaignName, validateCampaignName } from "../../api/campaigns";
import "./CampaignSettings.css";

// Shows the campaign name; the pencil swaps it for an input in place, like a GitHub PR title.
// name is null while the campaign is still loading. onRenamed runs once the save succeeds.
// locked blocks saving while other campaign settings are broken.
export function CampaignNameSettings({ name, onRenamed, locked = false }: { name: string | null; onRenamed: (name: string) => void; locked?: boolean }) {
    const { campaignID } = useParams();
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    function startEditing() {
        setDraft(name ?? '')
        setError(null)
        setEditing(true)
    }

    function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault()
        if (locked) return

        const newName = validateCampaignName(draft)
        if (!newName) {
            setError(`Name must be 1–${CAMPAIGN_NAME_MAX_LENGTH} characters with no control characters.`)
            return
        }
        if (newName === name) {
            setEditing(false)
            return
        }

        setSaving(true)
        updateCampaignName(campaignID as string, newName)
            .then(() => {
                onRenamed(newName)
                setEditing(false)
            })
            .catch((err) => setError(err.response?.data?.error ?? 'Could not save name.'))
            .finally(() => setSaving(false))
    }

    return (
        <div className="campaign-name">
            <span className="setting-caption">Campaign Name</span>

            {editing ? (
                <form className="campaign-name__form" onSubmit={handleSubmit}>
                    <input
                        className="campaign-name__input"
                        aria-label="Campaign name"
                        value={draft}
                        maxLength={CAMPAIGN_NAME_MAX_LENGTH}
                        autoFocus
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => e.key === 'Escape' && setEditing(false)}
                    />
                    <button type="submit" className="setting-button" disabled={saving || locked}>Save</button>
                    <button type="button" className="setting-button setting-button--quiet" onClick={() => setEditing(false)}>
                        Cancel
                    </button>
                </form>
            ) : (
                <div className="campaign-name__view">
                    <h2>{name ?? "Loading..."}</h2>
                    {name !== null && (
                        <button type="button" className="icon-button" aria-label="Edit campaign name" onClick={startEditing}>
                            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                                <path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5z" fill="none" stroke="currentColor" strokeWidth="1.2" />
                            </svg>
                        </button>
                    )}
                </div>
            )}

            {editing && error && <p className="campaign-name__error">{error}</p>}
        </div>
    )
}
