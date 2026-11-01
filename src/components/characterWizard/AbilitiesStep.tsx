import { useEffect, useState } from 'react';

import type {
  abilityMethod, abilityRoll, abilityRules, characterDraft, draftCheck, hpMethod,
} from '../../api/characters';
import { RuleSwitch } from './RuleSwitch';

const ABILITIES: [string, string][] = [
  ['STR', 'Strength'], ['DEX', 'Dexterity'], ['CON', 'Constitution'],
  ['INT', 'Intelligence'], ['WIS', 'Wisdom'], ['CHA', 'Charisma'],
];

const METHOD_LABELS: Record<abilityMethod, string> = {
  standardArray: 'Standard Array',
  pointBuy: 'Point Buy',
  roll: 'Roll',
  manual: 'Manual',
  sharedManual: 'GM’s Scores',
};

const METHOD_HINTS: Record<abilityMethod, string> = {
  standardArray: 'Assign 15, 14, 13, 12, 10 and 8, one to each ability.',
  pointBuy: 'Every score starts at 8. Spend points to raise them, up to 15.',
  roll: 'Roll 4d6 six times, dropping the lowest die each time, then assign the totals.',
  manual: 'Enter each score.',
  sharedManual: 'Assign the six scores your GM set, one to each ability.',
};

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

type abilityFields = Pick<characterDraft, 'abilityMethod' | 'abilityScores' | 'hpMethod' | 'hpRolls'>;

// The ability scores and hit points step. The campaign decides the method for each (the
// Character Sandbox offers them all); totals and hit points come from the server's check
// (summary), so what's shown is what will be saved.
// rolls: the server's ability rolls for this draft, or null. canReroll: the sandbox.
export function AbilitiesStep({ rules, level, hitDie, fields, rolls, canReroll, summary, onChange, onRoll, errorsFor }: {
  rules: abilityRules;
  level: number;
  hitDie: number | null;
  fields: abilityFields;
  rolls: abilityRoll[] | null;
  canReroll: boolean;
  summary: draftCheck['summary'] | null;
  onChange: (changes: Partial<abilityFields>, field: string) => void;
  onRoll: () => Promise<unknown>;
  errorsFor: (field: string) => string[];
}) {
  const method = fields.abilityMethod ?? rules.allowedMethods[0];
  const hp = fields.hpMethod ?? rules.allowedHpMethods[0];
  const scores = fields.abilityScores;
  const [rolling, setRolling] = useState(false);
  const [rollError, setRollError] = useState<string | null>(null);

  // Point buy starts every score at 8, the free amount.
  const unset = ABILITIES.some(([code]) => scores[code] === undefined);
  useEffect(() => {
    if (method === 'pointBuy' && unset) {
      onChange({ abilityScores: Object.fromEntries(ABILITIES.map(([code]) => [code, 8])) }, 'abilityScores');
    }
  }, [method, unset, onChange]);

  // The scores to hand out, for methods that assign a fixed set; null when any score goes.
  const pool = method === 'standardArray' ? rules.standardArray
    : method === 'sharedManual' ? rules.sharedScores
    : method === 'roll' ? rolls?.map(r => r.total) ?? null
    : null;

  // What's left of the pool for one ability: each value as many times as the pool has it,
  // less the times other abilities already use it.
  function remaining(code: string): number[] {
    const left = [...(pool ?? [])].sort((a, b) => b - a);
    for (const [other] of ABILITIES) {
      if (other === code || scores[other] === undefined) continue;
      const at = left.indexOf(scores[other]);
      if (at >= 0) left.splice(at, 1);
    }
    return [...new Set(left)];
  }

  const setScore = (code: string, value: number | undefined) => {
    const next = { ...scores };
    if (value === undefined || Number.isNaN(value)) delete next[code];
    else next[code] = value;
    onChange({ abilityScores: next }, 'abilityScores');
  };

  const cost = (score: number) => rules.pointCosts[String(score)] ?? 0;
  const spent = method === 'pointBuy'
    ? ABILITIES.reduce((sum, [code]) => sum + cost(scores[code] ?? 8), 0) : 0;

  function roll() {
    setRolling(true);
    setRollError(null);
    onRoll()
      .catch(err => setRollError(err.response?.data?.error ?? 'Could not roll.'))
      .finally(() => setRolling(false));
  }

  const control = (code: string, name: string) => {
    const value = scores[code];
    if (method === 'pointBuy') {
      const score = value ?? 8;
      const raise = rules.pointCosts[String(score + 1)];
      return (
        <div className="ability-box__buttons">
          <button type="button" aria-label={`Lower ${name}`} disabled={score <= 8} onClick={() => setScore(code, score - 1)}>−</button>
          <span className="ability-box__base">{score}</span>
          <button type="button" aria-label={`Raise ${name}`}
            disabled={raise === undefined || spent - cost(score) + raise > rules.pointBuyBudget}
            onClick={() => setScore(code, score + 1)}>+</button>
        </div>
      );
    }
    if (method === 'manual') {
      return (
        <input className="ability-box__input" type="number" aria-label={name}
          min={rules.manualRange.min} max={rules.manualRange.max} value={value ?? ''}
          onChange={e => setScore(code, e.target.value === '' ? undefined : Number(e.target.value))} />
      );
    }
    return (
      <select className="rules-select ability-box__select" aria-label={name} value={value ?? ''}
        disabled={!pool} onChange={e => setScore(code, e.target.value === '' ? undefined : Number(e.target.value))}>
        <option value="">—</option>
        {remaining(code).map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    );
  };

  const hitPoints = summary?.hitPoints ?? null;
  const hpRolls = fields.hpRolls;
  const setHpRoll = (i: number, value: number | undefined) => {
    const next = Array.from({ length: level - 1 }, (_, j) => hpRolls[j] ?? 0);
    next[i] = value ?? 0;
    onChange({ hpRolls: next }, 'hpRolls');
  };
  const rollDie = () => (hitDie ? 1 + Math.floor(Math.random() * hitDie) : 0);

  return (
    <div className="pick-card abilities-step">
      <h3 className="pick-card__section-title">Ability Scores</h3>
      <div className="rule-switches">
        <RuleSwitch label="Method" value={method} allowed={rules.allowedMethods}
          options={rules.methods.map(m => ({ value: m, label: METHOD_LABELS[m] }))}
          onChange={m => onChange({ abilityMethod: m, abilityScores: {} }, 'abilityMethod')} />
      </div>
      <p className="setting-hint">
        {METHOD_HINTS[method]}
        {method === 'pointBuy' && ` ${rules.pointBuyBudget - spent} of ${rules.pointBuyBudget} points left.`}
        {(method === 'standardArray' || method === 'sharedManual') && pool && ` (${pool.join(', ')})`}
      </p>

      {method === 'roll' && (
        <div className="ability-rolls">
          {rolls ? (
            <span className="setting-hint">
              Your rolls: {rolls.map((r, i) => (
                <span key={i} className="ability-roll" title={`Dice: ${r.dice.join(', ')}`}>{r.total}</span>
              ))}
            </span>
          ) : <span className="setting-hint">You roll once{canReroll ? '' : ' — the result stays with this character'}.</span>}
          {(!rolls || canReroll) && (
            <button type="button" className="setting-button" disabled={rolling}
              onClick={() => { roll(); onChange({ abilityScores: {} }, 'abilityScores'); }}>
              {rolling ? 'Rolling…' : rolls ? 'Roll Again' : 'Roll'}
            </button>
          )}
          {rollError && <p className="campaign-name__error">{rollError}</p>}
        </div>
      )}

      <div className="ability-boxes">
        {ABILITIES.map(([code, name]) => {
          const s = summary?.abilities[code];
          return (
            <div key={code} className="ability-box">
              <span className="ability-box__code" title={name}>{code}</span>
              {control(code, name)}
              <span className="ability-box__total">
                {s?.total != null ? <>{s.total} <span className="muted">({signed(s.modifier ?? 0)})</span></> : '—'}
              </span>
              {s && s.bonus > 0 && <span className="ability-box__bonus">+{s.bonus} background</span>}
            </div>
          );
        })}
      </div>
      {[...errorsFor('abilityMethod'), ...errorsFor('abilityScores')].map(m => <p key={m} className="campaign-name__error">{m}</p>)}

      <h3 className="pick-card__section-title">Hit Points</h3>
      <div className="rule-switches">
        <RuleSwitch<hpMethod> label="After level 1" value={hp} allowed={rules.allowedHpMethods}
          options={rules.hpMethods.map(m => ({ value: m, label: m === 'automatic' ? 'Fixed Average' : 'Roll' }))}
          onChange={m => onChange({ hpMethod: m }, 'hpMethod')} />
      </div>
      {!hitDie ? <p className="muted">Choose a class first.</p> : (
        <>
          <p className="setting-hint">
            Level 1: the full d{hitDie} ({hitDie}).
            {level > 1 && (hp === 'automatic'
              ? ` Each level after: ${hitDie / 2 + 1}, the die’s average.`
              : ` Each level after: roll a d${hitDie}, or enter what you rolled.`)}
            {' '}Every level adds your Constitution modifier.
          </p>
          {hp === 'manual' && level > 1 && (
            <div className="hp-rolls">
              {Array.from({ length: level - 1 }, (_, i) => (
                <label key={i} className="hp-roll">
                  <span className="setting-hint">Level {i + 2}</span>
                  <input className="ability-box__input" type="number" min={1} max={hitDie}
                    value={hpRolls[i] || ''} aria-label={`Hit die roll at level ${i + 2}`}
                    onChange={e => setHpRoll(i, e.target.value === '' ? undefined : Number(e.target.value))} />
                </label>
              ))}
              <button type="button" className="setting-button setting-button--quiet"
                onClick={() => onChange({ hpRolls: Array.from({ length: level - 1 }, rollDie) }, 'hpRolls')}>
                Roll {level - 1}d{hitDie}
              </button>
            </div>
          )}
          {hitPoints ? (
            <p className="hp-total">
              <strong>{hitPoints.max}</strong> hit points
              <span className="setting-hint">
                {' '}— {hitPoints.perLevel.join(' + ')} (Constitution {signed(hitPoints.conModifier)} per level)
                {hitPoints.bonuses.map(b => ` + ${b.amount} ${b.name}`).join('')}
              </span>
            </p>
          ) : <p className="muted">Set your Constitution{hp === 'manual' && level > 1 ? ' and hit die rolls' : ''} to see your hit points.</p>}
        </>
      )}
      {[...errorsFor('hpMethod'), ...errorsFor('hpRolls')].map(m => <p key={m} className="campaign-name__error">{m}</p>)}
    </div>
  );
}
