import { useEffect, useState } from "react";
import { Link } from "react-router";

import { getPendingCharacters, reviewCharacter, type pendingCharacter } from "../api/characters";
import { CharacterPortrait } from "./portrait/CharacterPortrait";
import "./PendingCharacters.css";

function errorMessage(err: unknown, fallback: string): string {
    return (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback
}

// The GM's (and admin's) queue of a campaign's characters waiting for approval. Renders
// nothing for anyone else (the server answers them 404) and nothing while the queue is empty.
export default function PendingCharacters({ campaignId }: { campaignId: string }) {
    const [pending, setPending] = useState<pendingCharacter[] | null>(null)
    // The character whose reject form is open, and the reason typed into it.
    const [rejecting, setRejecting] = useState<string | null>(null)
    const [reason, setReason] = useState('')
    const [busy, setBusy] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        getPendingCharacters(campaignId).then(setPending).catch(() => setPending(null))
    }, [campaignId])

    function review(id: string, decision: 'approve' | 'reject') {
        setBusy(id)
        setError(null)
        reviewCharacter(id, decision, decision === 'reject' ? reason : undefined)
            .then(() => {
                setPending(list => list && list.filter(c => c.id !== id))
                setRejecting(null)
                setReason('')
            })
            .catch(err => setError(errorMessage(err, 'Could not save the review.')))
            .finally(() => setBusy(null))
    }

    if (!pending || pending.length === 0) return null

    return (
        <div className="setting-section pending-characters">
            <span className="setting-caption">Waiting for Approval ({pending.length})</span>
            <ul className="character-list">
                {pending.map(c => (
                    <li key={c.id} className="pending-character">
                        <div className="character-row">
                            <CharacterPortrait characterId={c.id} name={c.name} version={c.portraitVersion} size={40} />
                            <div className="character-row__info">
                                <Link to={`/characters/${c.id}`} className="character-row__name">{c.name}</Link>
                                <span className="character-row__campaign">
                                    {c.ownerName} · submitted {new Date(c.submittedAt).toLocaleDateString()}
                                </span>
                            </div>
                            <div className="pending-character__actions">
                                <button type="button" className="setting-button" disabled={busy === c.id}
                                    onClick={() => review(c.id, 'approve')}>
                                    Approve
                                </button>
                                <button type="button" className="setting-button setting-button--quiet" disabled={busy === c.id}
                                    onClick={() => { setRejecting(rejecting === c.id ? null : c.id); setReason(''); setError(null) }}>
                                    Reject…
                                </button>
                            </div>
                        </div>
                        {rejecting === c.id && (
                            <div className="pending-character__reject">
                                <label className="setting-hint" htmlFor={`reject-${c.id}`}>
                                    Reason (optional): shown to the player so they know what to change.
                                </label>
                                <textarea id={`reject-${c.id}`} rows={3} maxLength={1000} value={reason}
                                    onChange={e => setReason(e.target.value)} />
                                <button type="button" className="setting-button setting-button--danger" disabled={busy === c.id}
                                    onClick={() => review(c.id, 'reject')}>
                                    {busy === c.id ? 'Rejecting…' : 'Reject Character'}
                                </button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
            {error && <p className="setting-error">{error}</p>}
        </div>
    )
}
