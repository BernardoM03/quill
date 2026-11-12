import { useState, type ReactNode } from 'react';

import type { sheetStats } from '../../api/characters';
import { SheetTerm } from './SheetTerm';
import './Sheet.css';

const signed = (n: number | null) => (n == null ? '—' : n >= 0 ? `+${n}` : `${n}`);
const plain = (n: number | null) => (n == null ? '—' : String(n));

const ABILITY_LABELS: Record<string, string> = {
  STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma',
};

// One labelled box on the sheet. area: its place in the sheet's grid (Sheet.css). The title
// opens its rules beside the sheet when the glossary defines it (term: what to look up, when
// that isn't the title).
export function SheetBox({ area, title, term, className, children }: {
  area: string, title: string, term?: string, className?: string, children: ReactNode,
}) {
  return (
    <section className={`sheet-box sheet-box--${area}${className ? ` ${className}` : ''}`} aria-label={title}>
      <h2 className="sheet-box__title"><SheetTerm term={term ?? title}>{title}</SheetTerm></h2>
      {children}
    </section>
  );
}

// A small box with one big number: proficiency, speed, initiative, armor class.
export function StatBox({ area, title, value, note }: { area: string, title: string, value: string, note?: string }) {
  return (
    <SheetBox area={area} title={title} className="sheet-box--stat">
      <span className="sheet-stat-box__value" title={note}>{value}{note && <sup>*</sup>}</span>
    </SheetBox>
  );
}

const SPEED_NAMES: Record<string, string> = {
  walk: 'Walking', fly: 'Flying', swim: 'Swimming', climb: 'Climbing', burrow: 'Burrowing',
};

// The glossary's entry for each kind of speed.
const SPEED_TERMS: Record<string, string> = {
  walk: 'Speed', fly: 'Fly Speed', swim: 'Swim Speed', climb: 'Climb Speed', burrow: 'Burrow Speed',
};

const SPEED_TYPES = ['walk', 'fly', 'swim', 'climb', 'burrow'] as const;

// Speed, with arrows either side to step through every kind of speed: walking, flying,
// swimming, climbing, burrowing. One the character doesn't have shows "—".
function SpeedBox({ stats }: { stats: sheetStats }) {
  const [index, setIndex] = useState(0);
  const type = SPEED_TYPES[index];
  const speed = stats.speeds.find(s => s.type === type)
    ?? (type === 'walk' && stats.speed != null ? { type, value: stats.speed, condition: null } : null);
  const step = (by: number) => setIndex((index + by + SPEED_TYPES.length) % SPEED_TYPES.length);
  return (
    <SheetBox area="speed" title={`${SPEED_NAMES[type]} Speed`} term={SPEED_TERMS[type]} className="sheet-box--stat sheet-speed">
      <button type="button" className="sheet-speed__arrow sheet-speed__arrow--prev" aria-label="Previous speed type"
        onClick={() => step(-1)}>‹</button>
      <span className={`sheet-stat-box__value${speed ? '' : ' sheet-speed__none'}`} aria-live="polite"
        title={speed?.condition ? `While ${speed.condition} is active` : speed ? undefined : `No ${SPEED_NAMES[type].toLowerCase()} speed`}>
        {speed ? <>{speed.value} ft{speed.condition && <sup>*</sup>}</> : '—'}
      </span>
      <button type="button" className="sheet-speed__arrow sheet-speed__arrow--next" aria-label="Next speed type"
        onClick={() => step(1)}>›</button>
    </SheetBox>
  );
}

// The small number boxes beside the ability scores and under them.
export function HeadlineStats({ stats }: { stats: sheetStats }) {
  return (
    <>
      <StatBox area="proficiency" title="Proficiency" value={signed(stats.proficiencyBonus)} />
      <SpeedBox stats={stats} />
      <StatBox area="initiative" title="Initiative" value={signed(stats.initiative)} />
      <StatBox area="armor" title="Armor Class" value={plain(stats.armorClass)}
        note="Without armor or a shield: equipment isn’t tracked yet." />
    </>
  );
}

// Each row, left to right: proficiency dot, the ability (skills only), the bonus, the name.
function StatList({ items }: {
  items: { key: string, proficient: boolean, modifier: number | null, label: ReactNode, ability?: string }[],
}) {
  return (
    <ul className="sheet-stat-list">
      {items.map(item => (
        <li key={item.key} className={item.proficient ? 'sheet-stat--proficient' : undefined}>
          <span className="sheet-stat__dot" role="img" aria-label={item.proficient ? 'Proficient' : 'Not proficient'} />
          {item.ability && (
            <abbr className="sheet-stat__ability" title={ABILITY_LABELS[item.ability]} aria-label={ABILITY_LABELS[item.ability]}>
              {item.ability}
            </abbr>
          )}
          <span className="sheet-stat__value">{signed(item.modifier)}</span>
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

// Two columns of three, STR DEX CON down the left and INT WIS CHA down the right: each
// the proficiency dot, the ability (full name on hover) and the bonus.
export function SavingThrowsBox({ stats }: { stats: sheetStats }) {
  return (
    <SheetBox area="saves" title="Saving Throws">
      <ul className="sheet-saves">
        {stats.savingThrows.map(s => (
          <li key={s.ability} className={`sheet-save${s.proficient ? ' sheet-stat--proficient' : ''}`}>
            <span className="sheet-stat__dot" role="img" aria-label={s.proficient ? 'Proficient' : 'Not proficient'} />
            <abbr className="sheet-save__ability" title={ABILITY_LABELS[s.ability]} aria-label={ABILITY_LABELS[s.ability]}>{s.ability}</abbr>
            <span className="sheet-save__value">{signed(s.modifier)}</span>
          </li>
        ))}
      </ul>
    </SheetBox>
  );
}

export function SkillsBox({ stats }: { stats: sheetStats }) {
  return (
    <SheetBox area="skills" title="Skills">
      <StatList items={stats.skills.map(s => ({ ...s, key: s.id, label: <SheetTerm term={s.name}>{s.name}</SheetTerm> }))} />
    </SheetBox>
  );
}

export function SensesBox({ stats }: { stats: sheetStats }) {
  const { senses, spellcasting } = stats;
  const rows: [string, string][] = [
    ['Passive Perception', plain(senses.passivePerception)],
    ['Passive Insight', plain(senses.passiveInsight)],
    ['Passive Investigation', plain(senses.passiveInvestigation)],
  ];
  if (senses.darkvision) rows.push(['Darkvision', `${senses.darkvision} ft`]);
  if (spellcasting) {
    rows.push(['Spell Save DC', plain(spellcasting.saveDc)]);
    rows.push(['Spell Attack', signed(spellcasting.attackBonus)]);
  }
  return (
    <SheetBox area="senses" title="Senses">
      <dl className="sheet-pairs">
        {rows.map(([label, value]) => (
          <div key={label}><dt><SheetTerm term={label}>{label}</SheetTerm></dt><dd>{value}</dd></div>
        ))}
      </dl>
      {spellcasting && <p className="sheet-box__note">Spellcasting ability: {ABILITY_LABELS[spellcasting.ability]}</p>}
    </SheetBox>
  );
}

export function ProficienciesBox({ stats }: { stats: sheetStats }) {
  const groups: [string, string[]][] = [
    ['Armor', stats.proficiencies.armor],
    ['Weapons', stats.proficiencies.weapons],
    ['Tools', stats.proficiencies.tools],
    ['Languages', stats.proficiencies.languages],
  ];
  return (
    <SheetBox area="training" title="Proficiencies & Training">
      {groups.map(([label, names]) => (
        <div key={label} className="sheet-training">
          <span className="sheet-training__label">{label}</span>
          <span className={names.length ? undefined : 'muted'}>{names.length ? names.join(', ') : 'None'}</span>
        </div>
      ))}
    </SheetBox>
  );
}
