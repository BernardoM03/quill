import { useEffect, useState } from "react";
import { Link } from "react-router";

import { dismissCharacterChange, getCharacterChanges, type characterChange, type pickChange } from "../api/characters";
import "./PendingCharacters.css";

const FIELD_LABELS: Record<string, string> = {
    species: 'Species',
    background: 'Background',
    class: 'Class',
    abilityScores: 'Ability scores',
    speciesChoices: 'Species choice',
    backgroundChoices: 'Background choice',
    classChoices: 'Class choice',
}

// "srd-5.2:species/high-elf" -> "High Elf": the readable end of a pack id or option key.
function readable(id: string): string {
    const tail = id.split(/[/:]/).pop() || id
    return tail.replace(/[-_]+/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())
}

function describeValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return 'nothing'
    if (Array.isArray(value)) return value.length ? value.map(v => typeof v === 'string' ? readable(v) : String(v)).join(', ') : 'nothing'
    if (typeof value === 'string') return readable(value)
    if (typeof value === 'object') return Object.entries(value).map(([k, v]) => `${k} ${v}`).join(', ')
    return String(value)
}

function describeChange(change: pickChange): string {
    const [key, choice] = change.field.split(/:(.*)/s)
    const label = (FIELD_LABELS[key] ?? key) + (choice ? ` (${readable(choice)})` : '')
    return `${label}: ${describeValue(change.from)} → ${describeValue(change.to)}`
}

// The GM's log of changes players made to approved characters, newest first. Renders
// nothing for anyone else (the server answers them 404).
export default function CharacterChangeLog({ campaignId }: { campaignId: string }) {
    const [entries, setEntries] = useState<characterChange[] | null>(null)
    const [showAll, setShowAll] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        getCharacterChanges(campaignId, showAll).then(setEntries).catch(() => setEntries(null))
    }, [campaignId, showAll])

    function dismiss(id: string) {
        setError(null)
        dismissCharacterChange(campaignId, id)
            .then(() => setEntries(list => list && (showAll
                ? list.map(e => e.id === id ? { ...e, dismissed: true } : e)
                : list.filter(e => e.id !== id))))
            .catch(() => setError('Could not dismiss that change.'))
    }

    if (entries === null) return null
    // Nothing new and not browsing the history: stay out of the way.
    if (entries.length === 0 && !showAll) return null

    return (
        <div className="setting-section pending-characters">
            <span className="setting-caption">Character Changes</span>
            <p className="setting-hint">Players changed picks you’d already approved. The characters stay approved.</p>
            {entries.length === 0 && <p className="muted">No changes logged yet.</p>}
            <ul className="change-log">
                {entries.map(entry => (
                    <li key={entry.id} className={`change-log__entry${entry.dismissed ? ' change-log__entry--dismissed' : ''}`}>
                        <div className="change-log__head">
                            <span>
                                <Link to={`/characters/${entry.characterId}`}>{entry.characterName}</Link>
                                <span className="muted"> · {entry.ownerName} · {new Date(entry.createdAt).toLocaleString()}</span>
                            </span>
                            {!entry.dismissed && (
                                <button type="button" className="setting-button setting-button--quiet" onClick={() => dismiss(entry.id)}>
                                    Dismiss
                                </button>
                            )}
                        </div>
                        <ul className="change-log__changes">
                            {entry.changes.map((c, i) => <li key={i}>{describeChange(c)}</li>)}
                        </ul>
                    </li>
                ))}
            </ul>
            <button type="button" className="setting-button setting-button--quiet" onClick={() => setShowAll(a => !a)}>
                {showAll ? 'Hide dismissed' : 'Show dismissed'}
            </button>
            {error && <p className="setting-error">{error}</p>}
        </div>
    )
}
