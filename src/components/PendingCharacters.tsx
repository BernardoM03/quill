import { useEffect, useState } from "react";
import { Link } from "react-router";

import {
    getPendingCharacters, getPendingSwaps, reviewCharacter, reviewSwap, type PendingCharacter, type PendingSwap,
} from "../api/characters";
import { CharacterPortrait } from "./portrait/CharacterPortrait";
import "./PendingCharacters.css";

function errorMessage(err: unknown, fallback: string): string {
    return (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback
}

// The GM's queues of characters awaiting approval and of requested character swaps.
// Renders nothing for anyone else, or while both are empty.
// onSwapReviewed lets the page reload the party once a swap changes who is active.
export default function PendingCharacters({ campaignId, onSwapReviewed }: { campaignId: string, onSwapReviewed?: () => void }) {
    const [pending, setPending] = useState<PendingCharacter[] | null>(null)
    const [swaps, setSwaps] = useState<PendingSwap[] | null>(null)
    // The character whose reject form is open.
    const [rejecting, setRejecting] = useState<string | null>(null)
    const [reason, setReason] = useState('')
    const [busy, setBusy] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        getPendingCharacters(campaignId).then(setPending).catch(() => setPending(null))
        getPendingSwaps(campaignId).then(setSwaps).catch(() => setSwaps(null))
    }, [campaignId])

    function decideSwap(id: string, decision: 'approve' | 'reject') {
        setBusy(id)
        setError(null)
        reviewSwap(id, decision)
            .then(() => {
                setSwaps(list => list && list.filter(s => s.id !== id))
                onSwapReviewed?.()
            })
            .catch(err => setError(errorMessage(err, 'Could not save the decision.')))
            .finally(() => setBusy(null))
    }

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

    const hasPending = !!pending && pending.length > 0
    const hasSwaps = !!swaps && swaps.length > 0
    if (!hasPending && !hasSwaps) return null

    return (
        <div className="setting-section pending-characters">
            {hasSwaps && <>
                <span className="setting-caption">Waiting to Swap In ({swaps.length})</span>
                <ul className="character-list">
                    {swaps.map(s => (
                        <li key={s.id} className="pending-character">
                            <div className="character-row">
                                <CharacterPortrait characterId={s.id} name={s.name} version={s.portraitVersion} size={40} />
                                <div className="character-row__info">
                                    <Link to={`/characters/${s.id}`} className="character-row__name">{s.name}</Link>
                                    <span className="character-row__campaign">
                                        {s.ownerName}{s.replacesName ? ` · replacing ${s.replacesName}` : ''}
                                        {' '}· asked {new Date(s.requestedAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="pending-character__actions">
                                    <button type="button" className="setting-button" disabled={busy === s.id}
                                        onClick={() => decideSwap(s.id, 'approve')}>
                                        Approve
                                    </button>
                                    <button type="button" className="setting-button setting-button--quiet" disabled={busy === s.id}
                                        onClick={() => decideSwap(s.id, 'reject')}>
                                        Reject
                                    </button>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </>}
            {hasPending && <>
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
            </>}
            {error && <p className="setting-error">{error}</p>}
        </div>
    )
}
