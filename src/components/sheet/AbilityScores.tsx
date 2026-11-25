import { useState } from 'react';

import { saveScoreAdjustments, type ScoreAdjustment, type SheetAbility } from '../../api/characters';
import './AbilityScores.css';

const ABILITIES: [ScoreAdjustment['ability'], string][] = [
  ['STR', 'Strength'], ['DEX', 'Dexterity'], ['CON', 'Constitution'],
  ['INT', 'Intelligence'], ['WIS', 'Wisdom'], ['CHA', 'Charisma'],
];
const MODES: [ScoreAdjustment['mode'], string][] = [
  ['atLeast', 'Becomes at least'], ['set', 'Becomes exactly'], ['add', 'Changes by'],
];

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

function describe(a: ScoreAdjustment): string {
  if (a.mode === 'add') return `${a.ability} ${signed(a.value)}`;
  return `${a.ability} ${a.mode === 'set' ? '=' : '≥'} ${a.value}`;
}

function errorMessage(err: unknown): string {
  const response = (err as { response?: { data?: { error?: string } } }).response;
  return response?.data?.error ?? 'Couldn’t save. Try again.';
}

// The six ability boxes, each showing the current score with its modifier beneath.
// A box is highlighted while a temporary effect changes it, and hovering explains the score.
export function AbilityBoxes({ abilities }: { abilities: Record<string, SheetAbility> }) {
  return (
    <div className="sheet-abilities" role="group" aria-label="Ability scores">
      {ABILITIES.map(([code, label]) => {
        const ability = abilities[code];
        const changed = ability && ability.current !== ability.total;
        // Where the score comes from, shown on hover: base, then each permanent increase.
        const breakdown = ability && ability.base != null
          ? [changed ? `Own score ${ability.total}` : null, `Base ${ability.base}`,
             ...ability.increases.map(inc => `${signed(inc.amount)} ${inc.source}`)].filter(Boolean).join('\n')
          : undefined;
        return (
          <div key={code} className={changed ? 'sheet-ability sheet-ability--changed' : 'sheet-ability'}
            title={breakdown ? `${label}\n${breakdown}` : label}>
            <span className="sheet-ability__name"><abbr title={label} aria-label={label}>{code}</abbr></span>
            <span className="sheet-ability__score" aria-label="Score">{ability?.current ?? '—'}</span>
            <span className="sheet-ability__mod" aria-label="Modifier">{ability?.currentModifier != null ? signed(ability.currentModifier) : '—'}</span>
          </div>
        );
      })}
    </div>
  );
}

// Temporary effects such as magic items, curses or spells, which change only the current score.
// onChange receives the abilities with the effects applied.
export function TemporaryEffects({ characterId, adjustments, readOnly = false, onChange }: {
  characterId: string;
  adjustments: ScoreAdjustment[];
  // Shows the effects without the add and remove controls (anyone but the owner).
  readOnly?: boolean;
  onChange: (abilities: Record<string, SheetAbility>, adjustments: ScoreAdjustment[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [ability, setAbility] = useState<ScoreAdjustment['ability']>('STR');
  const [mode, setMode] = useState<ScoreAdjustment['mode']>('atLeast');
  const [value, setValue] = useState('19');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save(next: ScoreAdjustment[]) {
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
          <select className="rules-select" aria-label="Ability" value={ability} onChange={e => setAbility(e.target.value as ScoreAdjustment['ability'])}>
            {ABILITIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
          <select className="rules-select" aria-label="How it changes the score" value={mode}
            onChange={e => setMode(e.target.value as ScoreAdjustment['mode'])}>
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
