import { useState } from "react";

import { saveDisguise, type CharacterDisguise } from "../api/characters";

const FIELDS: { key: keyof CharacterDisguise, label: string, placeholder: (name: string) => string }[] = [
    { key: 'name', label: 'Name', placeholder: name => name },
    { key: 'species', label: 'Species', placeholder: () => 'Your disguise species' },
    { key: 'className', label: 'Class', placeholder: () => 'Your disguise class' },
]

// Edits the false name, species and class the party sees under 'misleading' visibility.
// Blank fields show the real value.
export function DisguiseEditor({ characterId, name, disguise, onSaved }: {
    characterId: string,
    name: string,
    disguise: CharacterDisguise | null,
    onSaved: (disguise: CharacterDisguise | null) => void,
}) {
    const [values, setValues] = useState<CharacterDisguise>(disguise ?? {})
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState<{ error: boolean, text: string } | null>(null)

    function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault()
        setBusy(true)
        setMessage(null)
        saveDisguise(characterId, values)
            .then(saved => {
                setValues(saved ?? {})
                onSaved(saved)
                setMessage({ error: false, text: 'Saved.' })
            })
            .catch(err => setMessage({ error: true, text: err.response?.data?.error ?? 'Could not save the disguise.' }))
            .finally(() => setBusy(false))
    }

    return (
        <form className="character-flag character-flag--pending disguise" onSubmit={handleSubmit}>
            <strong>What the party sees</strong>
            <p>
                This campaign lets you mislead the rest of the party. They’ll see these instead of your
                character’s real name, species and class; the GM always sees the truth. Leave a field blank
                to show the real one.
            </p>
            <div className="disguise__fields">
                {FIELDS.map(f => (
                    <label key={f.key} className="disguise__field">
                        <span>{f.label}</span>
                        <input value={values[f.key] ?? ''} maxLength={64} placeholder={f.placeholder(name)}
                            onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} />
                    </label>
                ))}
            </div>
            <button type="submit" className="setting-button" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            {message && <p className={message.error ? 'setting-error' : 'muted'}>{message.text}</p>}
        </form>
    )
}
