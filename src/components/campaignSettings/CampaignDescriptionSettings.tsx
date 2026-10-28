import { useState } from "react";
import { useParams } from "react-router";
import Markdown from "react-markdown";

import { CAMPAIGN_DESCRIPTION_MAX_LENGTH, updateCampaignDescription } from "../../api/campaigns";
import "./CampaignSettings.css";

// Like a GitHub PR description: rendered Markdown with a pencil, which opens Write/Preview tabs.
// onSaved runs once the save succeeds, with the description as stored (null when empty).
export function CampaignDescriptionSettings({ description, onSaved }: {
    description: string | null;
    onSaved: (description: string | null) => void;
}) {
    const { campaignID } = useParams();
    const [editing, setEditing] = useState(false)
    const [tab, setTab] = useState<'write' | 'preview'>('write')
    const [draft, setDraft] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    function startEditing() {
        setDraft(description ?? '')
        setTab('write')
        setError(null)
        setEditing(true)
    }

    function handleSave() {
        setSaving(true)
        updateCampaignDescription(campaignID as string, draft)
            .then(() => {
                onSaved(draft.trim() || null)
                setEditing(false)
            })
            .catch((err) => setError(err.response?.data?.error ?? 'Could not save description.'))
            .finally(() => setSaving(false))
    }

    if (!editing) {
        return (
            <div className="setting-section campaign-description">
                <div className="campaign-description__header">
                    <span className="setting-caption">Description</span>
                    <button type="button" className="icon-button" aria-label="Edit description" onClick={startEditing}>
                        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                            <path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5z" fill="none" stroke="currentColor" strokeWidth="1.2" />
                        </svg>
                    </button>
                </div>
                <div className="campaign-description__body markdown">
                    {description ? <Markdown>{description}</Markdown> : <p className="muted">No description provided.</p>}
                </div>
            </div>
        )
    }

    return (
        <div className="setting-section campaign-description">
            <span className="setting-caption">Description</span>
            <div className="campaign-description__editor">
                <div className="tabs" role="tablist">
                    <button type="button" role="tab" aria-selected={tab === 'write'} onClick={() => setTab('write')}>Write</button>
                    <button type="button" role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')}>Preview</button>
                </div>

                {tab === 'write' ? (
                    <textarea
                        className="campaign-description__textarea"
                        aria-label="Campaign description"
                        value={draft}
                        maxLength={CAMPAIGN_DESCRIPTION_MAX_LENGTH}
                        placeholder="Markdown is supported."
                        autoFocus
                        onChange={e => setDraft(e.target.value)}
                    />
                ) : (
                    <div className="campaign-description__body markdown">
                        {draft.trim() ? <Markdown>{draft}</Markdown> : <p className="muted">Nothing to preview.</p>}
                    </div>
                )}

                <div className="campaign-description__actions">
                    {error && <p className="campaign-name__error">{error}</p>}
                    <button type="button" className="setting-button setting-button--quiet" onClick={() => setEditing(false)}>
                        Cancel
                    </button>
                    <button type="button" className="setting-button" disabled={saving} onClick={handleSave}>Save</button>
                </div>
            </div>
        </div>
    )
}
