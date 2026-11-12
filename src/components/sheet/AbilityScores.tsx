import { useState } from 'react';

import { saveScoreAdjustments, type scoreAdjustment, type sheetAbility } from '../../api/characters';
import './AbilityScores.css';

const ABILITIES: [scoreAdjustment['ability'], string][] = [
  ['STR', 'Strength'], ['DEX', 'Dexterity'], ['CON', 'Constitution'],
  ['INT', 'Intelligence'], ['WIS', 'Wisdom'], ['CHA', 'Charisma'],
];
const MODES: [scoreAdjustment['mode'], string][] = [
  ['atLeast', 'Becomes at least'], ['set', 'Becomes exactly'], ['add', 'Changes by'],
];

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

function describe(a: scoreAdjustment): string {
  if (a.mode === 'add') return `${a.ability} ${signed(a.value)}`;
  return `${a.ability} ${a.mode === 'set' ? '=' : '≥'} ${a.value}`;
}

function errorMessage(err: unknown): string {
  const response = (err as { response?: { data?: { error?: string } } }).response;
  return response?.data?.error ?? 'Couldn’t save. Try again.';
}

// The sheet's six abilities, one box each: the current score large, its modifier (what's
// rolled with) in the small box beneath. Highlighted while a temporary effect changes it; hovering shows the
// character's own score and where it comes from.
export function AbilityBoxes({ abilities }: { abilities: Record<string, sheetAbility> }) {
  return (
    <div className="sheet-abilities" role="group" aria-label="Ability scores">
      {ABILITIES.map(([code, label]) => {
        const a = abilities[code];
        const changed = a && a.current !== a.total;
        // Where the score comes from, shown on hover: base, then each permanent increase.
        const breakdown = a && a.base != null
          ? [changed ? `Own score ${a.total}` : null, `Base ${a.base}`,
             ...a.increases.map(inc => `${signed(inc.amount)} ${inc.source}`)].filter(Boolean).join('\n')
          : undefined;
        return (
          <div key={code} className={changed ? 'sheet-ability sheet-ability--changed' : 'sheet-ability'}
            title={breakdown ? `${label}\n${breakdown}` : label}>
            <span className="sheet-ability__name"><abbr title={label} aria-label={label}>{code}</abbr></span>
            <span className="sheet-ability__score" aria-label="Score">{a?.current ?? '—'}</span>
            <span className="sheet-ability__mod" aria-label="Modifier">{a?.currentModifier != null ? signed(a.currentModifier) : '—'}</span>
          </div>
        );
      })}
    </div>
  );
}

// Temporary effects (a magic item, a curse, a spell): they change the current score only,
// and are added and removed here. onChange gets the abilities with the effects applied.
export function TemporaryEffects({ characterId, adjustments, readOnly = false, onChange }: {
  characterId: string;
  adjustments: scoreAdjustment[];
  // Shows the effects without the add and remove controls (anyone but the owner).
  readOnly?: boolean;
  onChange: (abilities: Record<string, sheetAbility>, adjustments: scoreAdjustment[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [ability, setAbility] = useState<scoreAdjustment['ability']>('STR');
  const [mode, setMode] = useState<scoreAdjustment['mode']>('atLeast');
  const [value, setValue] = useState('19');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save(next: scoreAdjustment[]) {
    setSaving(true);
    setError(null);
    return saveScoreAdjustments(characterId, next)
      .then(r => { if (r.abilities) onChange(r.abilities, r.scoreAdjustments); return true; })
      .catch(err => { setError(errorMessage(err)); return false; })
      .finally(() => setSaving(false));
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now());
    save([...adjustments, { id, name: name.trim(), ability, mode, value: Number(value) }]).then(ok => {
      if (ok) { setAdding(false); setName(''); }
    });
  }

  return (
    <div className="sheet-tracker">
      <span className="sheet-tracker__title">Temporary Effects</span>
      <p className="sheet-box__note">
        Magic items, curses and spells that change a score for now. They change the current score only;
        the character’s own score stays as it is.
      </p>
      {adjustments.length > 0 && (
        <ul className="sheet-effects">
          {adjustments.map(a => (
            <li key={a.id}>
              <span><strong>{a.name}</strong> <span className="muted">{describe(a)}</span></span>
              {!readOnly && (
                <button type="button" className="setting-button setting-button--quiet" disabled={saving}
                  onClick={() => save(adjustments.filter(x => x.id !== a.id))}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {readOnly ? (
        adjustments.length === 0 && <p className="muted">None</p>
      ) : adding ? (
        <form className="sheet-effects__form" onSubmit={handleAdd}>
          <input className="sheet-effects__name" aria-label="Effect name" placeholder="Belt of Hill Giant Strength"
            value={name} maxLength={60} required autoFocus onChange={e => setName(e.target.value)} />
          <select className="rules-select" aria-label="Ability" value={ability} onChange={e => setAbility(e.target.value as scoreAdjustment['ability'])}>
            {ABILITIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
          <select className="rules-select" aria-label="How it changes the score" value={mode}
            onChange={e => setMode(e.target.value as scoreAdjustment['mode'])}>
            {MODES.map(([m, label]) => <option key={m} value={m}>{label}</option>)}
          </select>
          <input className="sheet-effects__value" type="number" aria-label="Value" required
            min={mode === 'add' ? -30 : 1} max={30} value={value} onChange={e => setValue(e.target.value)} />
          <button type="submit" className="setting-button" disabled={saving}>Add</button>
          <button type="button" className="setting-button setting-button--quiet" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      ) : (
        <button type="button" className="setting-button setting-button--quiet" onClick={() => { setError(null); setAdding(true); }}>
          Add Temporary Effect
        </button>
      )}
      {error && <p className="setting-error">{error}</p>}
    </div>
  );
}
