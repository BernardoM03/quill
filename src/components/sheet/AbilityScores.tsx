import { useState } from 'react';

import { saveScoreAdjustments, type scoreAdjustment, type sheetAbility } from '../../api/characters';
import './AbilityScores.css';

const ABILITIES: [string, string][] = [
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

// The sheet's six abilities. Each shows its current score (what's rolled with) and modifier;
// below, the character's own score and where it comes from: base, then each permanent
// increase. Temporary effects (a magic item, a curse, a spell) change current only, and are
// added and removed here.
export function AbilityScores({ characterId, abilities, adjustments, onChange }: {
  characterId: string;
  abilities: Record<string, sheetAbility>;
  adjustments: scoreAdjustment[];
  onChange: (abilities: Record<string, sheetAbility>, adjustments: scoreAdjustment[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [ability, setAbility] = useState('STR');
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
    <div className="setting-section">
      <span className="setting-caption">Ability Scores</span>
      <div className="sheet-abilities">
        {ABILITIES.map(([code, label]) => {
          const a = abilities[code];
          const changed = a && a.current !== a.total;
          return (
            <div key={code} className={changed ? 'sheet-ability sheet-ability--changed' : 'sheet-ability'}>
              <span className="sheet-ability__name">{label}</span>
              <span className="sheet-ability__mod">{a?.currentModifier != null ? signed(a.currentModifier) : '—'}</span>
              <span className="sheet-ability__current" title="Current score">{a?.current ?? '—'}</span>
              {a && a.base != null && (
                <span className="sheet-ability__breakdown">
                  {changed && <span className="sheet-ability__own">Score {a.total}</span>}
                  <span>Base {a.base}</span>
                  {a.increases.map((inc, i) => <span key={i}>{signed(inc.amount)} {inc.source}</span>)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <span className="setting-label sheet-effects__title">Temporary effects</span>
      <p className="setting-hint">
        Magic items, curses and spells that change a score for now. They change the current score only;
        the character’s own score stays as it is.
      </p>
      {adjustments.length > 0 && (
        <ul className="sheet-effects">
          {adjustments.map(a => (
            <li key={a.id}>
              <span><strong>{a.name}</strong> <span className="muted">{describe(a)}</span></span>
              <button type="button" className="setting-button setting-button--quiet" disabled={saving}
                onClick={() => save(adjustments.filter(x => x.id !== a.id))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form className="sheet-effects__form" onSubmit={handleAdd}>
          <input className="sheet-effects__name" aria-label="Effect name" placeholder="Belt of Hill Giant Strength"
            value={name} maxLength={60} required autoFocus onChange={e => setName(e.target.value)} />
          <select className="rules-select" aria-label="Ability" value={ability} onChange={e => setAbility(e.target.value)}>
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
