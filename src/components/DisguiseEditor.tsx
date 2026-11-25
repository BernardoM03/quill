import type { CharacterDisguise } from "../api/characters";

// The false name, species and class the party sees under 'misleading' visibility, edited on the wizard's Details step.
// Blank fields show the real value. Species and class come from what the campaign allows.
export function DisguiseEditor({ disguise, realName, realSpecies, realClass, species, classes, onChange }: {
    disguise: CharacterDisguise,
    realName: string,
    realSpecies: string | null,
    realClass: string | null,
    // Names of the species and classes the campaign allows.
    species: string[],
    classes: string[],
    onChange: (disguise: CharacterDisguise) => void,
}) {
    const set = (key: keyof CharacterDisguise, value: string) => onChange({ ...disguise, [key]: value || undefined })

    // A saved pick the campaign no longer allows stays listed, so it isn't lost without the player noticing.
    const select = (key: 'species' | 'className', label: string, allowed: string[], real: string | null) => {
        const current = disguise[key]
        const names = current && !allowed.includes(current) ? [current, ...allowed] : allowed
        return (
            <label className="details-field">
                <span className="setting-caption">{label}</span>
                <select className="rules-select" value={current ?? ''} onChange={e => set(key, e.target.value)}>
                    <option value="">{real ? `Real ${label.toLowerCase()} (${real})` : `Real ${label.toLowerCase()}`}</option>
                    {names.map(n => (
                        <option key={n} value={n}>{allowed.includes(n) ? n : `${n} (no longer allowed)`}</option>
                    ))}
                </select>
            </label>
        )
    }

    return (
        <div role="group" aria-labelledby="disguise-title" className="details-field details-field--wide details-field--required">
            <span id="disguise-title" className="setting-caption">What the party sees</span>
            <p className="muted disguise__note">
                This campaign lets you mislead the rest of the party. They’ll see these instead of your
                character’s real name, species and class.
            </p>
            <div className="details-grid">
                <label className="details-field">
                    <span className="setting-caption">Name</span>
                    <input className="details-input" value={disguise.name ?? ''} maxLength={64}
                        placeholder={realName || 'Real name'} onChange={e => set('name', e.target.value)} />
                </label>
                {select('species', 'Species', species, realSpecies)}
                {select('className', 'Class', classes, realClass)}
            </div>
        </div>
    )
}
