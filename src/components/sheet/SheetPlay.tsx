import { useState } from 'react';

import type { PlayState, SheetStats, StatePatch } from '../../api/characters';
import { defenseRows, type DefenseEntry } from './defenses';
import { useCollection } from '../../packs/usePacks';
import { SheetBox } from './SheetStats';
import { SheetTerm } from './SheetTerm';
import '../RulesText.css';
import './Sheet.css';


// The change to show now, and the PATCH body that saves it.
export type PlayChange = (next: Partial<PlayState>, patch: StatePatch) => void;

interface PlayProps {
  state: PlayState,
  // True for the owner, admin or GM, while the party sees everything read-only.
  canEdit: boolean,
  onChange: PlayChange,
}

// A number input that saves on blur or Enter and reverts anything invalid or out of range.
function NumberField({ label, value, min, max, className, onCommit }: {
  label: string, value: number, min: number, max: number, className?: string, onCommit: (n: number) => void,
}) {
  const [text, setText] = useState<string | null>(null);
  function commit() {
    if (text === null) return;
    const parsed = Number(text);
    setText(null);
    if (text.trim() !== '' && Number.isInteger(parsed) && parsed >= min && parsed <= max && parsed !== value) onCommit(parsed);
  }
  return (
    <input className={`sheet-number${className ? ` ${className}` : ''}`} type="number" inputMode="numeric"
      aria-label={label} min={min} max={max} value={text ?? value}
      onChange={e => setText(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

// A row of `total` boxes with the first `filled` ticked.
// Clicking a box ticks up to it, or unticks it and those after if it was ticked.
export function Pips({ label, total, filled, disabled, tone, onChange }: {
  label: string, total: number, filled: number, disabled: boolean, tone?: 'danger' | 'good',
  onChange: (filled: number) => void,
}) {
  return (
    <span className="sheet-pips" role="group" aria-label={`${label}: ${filled} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <button key={i} type="button" disabled={disabled}
          className={`sheet-pip${i < filled ? ' sheet-pip--filled' : ''}${tone ? ` sheet-pip--${tone}` : ''}`}
          aria-pressed={i < filled} aria-label={`${label} ${i + 1}`}
          onClick={() => onChange(i < filled ? i : i + 1)} />
      ))}
    </span>
  );
}

// Heal and Damage buttons around an amount field, where Enter heals.
// Damage comes off temporary hit points first, and healing stops at the maximum.
function HealDamage({ currentHp, maxHp, tempHp, onChange }: {
  currentHp: number, maxHp: number, tempHp: number, onChange: PlayChange,
}) {
  const [amount, setAmount] = useState('');
  const points = Math.floor(Number(amount));
  const valid = amount.trim() !== '' && Number.isFinite(points) && points > 0;

  function heal() {
    if (!valid) return;
    const next = Math.min(maxHp, currentHp + points);
    onChange({ currentHp: next }, { currentHp: next });
    setAmount('');
  }

  function damage() {
    if (!valid) return;
    const fromTemp = Math.min(tempHp, points);
    const next = { tempHp: tempHp - fromTemp, currentHp: Math.max(0, currentHp - (points - fromTemp)) };
    onChange(next, next);
    setAmount('');
  }

  return (
    <div className="sheet-hp__adjust">
      <button type="button" className="sheet-hp__heal" disabled={!valid || currentHp >= maxHp} onClick={heal}>Heal</button>
      <input className="sheet-hp__amount" type="number" inputMode="numeric" min={1} max={999} aria-label="Amount to heal or damage"
        value={amount} onChange={e => setAmount(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') heal(); }} />
      <button type="button" className="sheet-hp__damage" disabled={!valid} onClick={damage}>Damage</button>
    </div>
  );
}

// Hit points with heal and damage controls, then current over max and temporary.
// Current and temporary are editable, while the maximum is derived.
export function HitPointsBox({ state, canEdit, onChange }: PlayProps) {
  const { currentHp, maxHp } = state;
  if (currentHp == null || maxHp == null) {
    return (
      <SheetBox area="hp" title="Hit Points">
        <p className="sheet-box__note">Worked out once the class and Constitution are set.</p>
      </SheetBox>
    );
  }
  const overridden = state.maxHpOverride != null;
  return (
    <section className="sheet-box sheet-box--hp" aria-label="Hit Points">
      <div className="sheet-hp">
        {canEdit && <HealDamage currentHp={currentHp} maxHp={maxHp} tempHp={state.tempHp} onChange={onChange} />}
        <div className="sheet-hp__numbers">
          <h2 className="sheet-hp__title"><SheetTerm term="Hit Points">Hit Points</SheetTerm></h2>
          <div className="sheet-hp__part">
            <span className="sheet-hp__label">Current</span>
            {canEdit
              ? <NumberField label="Current hit points" value={currentHp} min={0} max={maxHp} className="sheet-hp__input"
                  onCommit={n => onChange({ currentHp: n }, { currentHp: n })} />
              : <span className="sheet-hp__value">{currentHp}</span>}
          </div>
          <span className="sheet-hp__slash" aria-hidden="true">/</span>
          <div className="sheet-hp__part">
            <span className="sheet-hp__label" title={overridden ? `Set by hand; worked out it’s ${state.workedOutMaxHp}` : 'Worked out from class and Constitution'}>
              Max{overridden && '*'}
            </span>
            <span className="sheet-hp__value">{maxHp}</span>
          </div>
          <div className="sheet-hp__part sheet-hp__part--temp">
            <span className="sheet-hp__label"><SheetTerm term="Temporary Hit Points">Temp</SheetTerm></span>
            {canEdit
              ? <NumberField label="Temporary hit points" value={state.tempHp} min={0} max={999}
                  className="sheet-hp__input sheet-hp__input--plain" onCommit={n => onChange({ tempHp: n }, { tempHp: n })} />
              : <span className="sheet-hp__value">{state.tempHp || '--'}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

// Items each half of the Defenses / Conditions box shows before collapsing the rest into "+N more".
const VISIBLE_LIMIT = 2;

// The items to show, keeping one slot free for the "+N more" link when they don't all fit.
function shown<T>(items: T[]): { visible: T[], more: number } {
  if (items.length <= VISIBLE_LIMIT) return { visible: items, more: 0 };
  return { visible: items.slice(0, VISIBLE_LIMIT - 1), more: items.length - VISIBLE_LIMIT + 1 };
}

// A box split into resistances and immunities on the left and current conditions on the right.
// A * marks a defense that needs an active feature, named on hover.
// Each half shows a couple of items, and "+N more" or clicking the half opens the full list.
export function DefensesConditionsBox({ state, canEdit, defenses, onOpenConditions, onOpenDefenses }: PlayProps & {
  defenses: SheetStats['defenses'] | null,
  // Open the Conditions / Defenses panels beside the sheet.
  onOpenConditions: () => void,
  onOpenDefenses: () => void,
}) {
  const conditions = useCollection('conditions').data;
  const name = (id: string) => conditions?.get(id)?.name ?? id.split('/').pop() ?? id;
  const active = [...state.conditions.map(name), ...(state.exhaustion ? [`Exhaustion ${state.exhaustion}`] : [])];
  const rows = defenseRows(defenses);
  const defenseList = shown(rows);
  const conditionList = shown(active);

  return (
    <section className="sheet-box sheet-box--conditions sheet-defenses" aria-label="Defenses and Conditions">
      <div className="sheet-defenses__half">
        <h2 className="sheet-box__title">
          <button type="button" className="sheet-term" aria-haspopup="dialog" onClick={onOpenDefenses}>Defenses</button>
        </h2>
        {rows.length === 0 ? <span className="sheet-defenses__empty">None</span> : (
          <ul className="sheet-defenses__list">
            {defenseList.visible.map(d => <DefenseRow key={d.kind + d.name} row={d} plain />)}
            {defenseList.more > 0 && (
              <li><button type="button" className="sheet-defenses__more" onClick={onOpenDefenses}>+{defenseList.more} more</button></li>
            )}
          </ul>
        )}
      </div>
      <button type="button" className="sheet-defenses__half sheet-defenses__conditions" onClick={onOpenConditions}
        aria-haspopup="dialog">
        <span className="sheet-box__title">Conditions</span>
        {active.length === 0
          ? <span className="sheet-defenses__empty">{canEdit ? 'Add Active Conditions' : 'None'}</span>
          : (
            <span className="sheet-defenses__active">
              {conditionList.visible.map(c => <span key={c}>{c}</span>)}
              {conditionList.more > 0 && <span className="sheet-defenses__more">+{conditionList.more} more</span>}
            </span>
          )}
      </button>
    </section>
  );
}

// One resistance or immunity whose R / I tag and name are rules words with tooltips.
// The * names the feature that must be active.
// plain renders bare text for the sheet itself, where rules open in the side panel instead of on hover.
export function DefenseRow({ row, plain = false }: { row: DefenseEntry, plain?: boolean }) {
  const conditions = useCollection('conditions').data;
  const name = row.name.toLowerCase();
  const isCondition = !!conditions && [...conditions.values()].some(c => c.name.toLowerCase() === name);
  const star = row.condition && <sup title={`${row.label} while ${row.condition} is active`}>*</sup>;
  if (plain) {
    return (
      <li>
        <span className={`sheet-defenses__tag sheet-defenses__tag--${row.kind}`} aria-label={row.label}>{row.kind}</span>
        <span>{row.name}</span>
        {star}
      </li>
    );
  }
  return (
    <li>
      <span className={`sheet-defenses__tag sheet-defenses__tag--${row.kind}`} aria-label={row.label}
        data-term={row.label.toLowerCase()} tabIndex={0}>{row.kind}</span>
      <span className="rules-defined" data-term={isCondition ? name : 'damage types'} tabIndex={0}>{row.name}</span>
      {star}
    </li>
  );
}
