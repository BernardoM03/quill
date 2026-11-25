import type { ReactNode } from 'react';

import type { CharacterChoice, TakenOptions } from '../../api/characters';
import { RulesText } from '../RulesText';
import './PickCard.css';

// Picks one item from a list with a dropdown plus one card at a time and arrows, where the card showing is the pick.
// A selected id missing from items (no longer allowed by the campaign) shows nothing as picked, and children explain.
export function PickCarousel({ caption, items, selected, onSelect, extra, children }: {
  caption: string;
  items: { id: string; name: string }[];
  selected: string;
  onSelect: (id: string) => void;
  // Shown beside the dropdown, e.g. "Level 3".
  extra?: ReactNode;
  children: ReactNode;
}) {
  const index = items.findIndex(i => i.id === selected);
  const step = (by: number) => onSelect(index < 0
    ? items[by > 0 ? 0 : items.length - 1].id
    : items[(index + by + items.length) % items.length].id);
  const several = items.length > 1;

  return (
    <div className="pick-step">
      <div className="pick-step__picker">
        <label className="pick-step__select">
          <span className="setting-caption">{caption}</span>
          <select className="rules-select" value={index < 0 ? '' : items[index].id} onChange={e => onSelect(e.target.value)}>
            {index < 0 && <option value="" disabled>Choose…</option>}
            {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        {several && index >= 0 && <span className="setting-hint">{index + 1} of {items.length}</span>}
        {extra}
      </div>
      <div className="pick-card-row">
        {several && (
          <button type="button" className="pick-card-row__arrow" aria-label={`Previous ${caption.toLowerCase()}`} onClick={() => step(-1)}>‹</button>
        )}
        <article className="pick-card" aria-live="polite">{children}</article>
        {several && (
          <button type="button" className="pick-card-row__arrow" aria-label={`Next ${caption.toLowerCase()}`} onClick={() => step(1)}>›</button>
        )}
      </div>
    </div>
  );
}

// A picked option's name and rules text. Text in several parts, such as a feat's benefits,
// starts below the name with each part on its own line; a single sentence follows the name.
function OptionNote({ name, text }: { name: string; text: string }) {
  if (/\n\s*\n/.test(text)) {
    return (
      <div className="pick-choice__option-note">
        <strong>{name}.</strong>
        <RulesText className="pick-choice__option-parts">{text}</RulesText>
      </div>
    );
  }
  return <div className="pick-choice__option-note"><strong>{name}.</strong> <RulesText inline>{text}</RulesText></div>;
}

// One choice rendered as count dropdowns, each leaving out what the others already took.
// A picked option's description or granted features show beneath it.
// field is the choice's draft field, such as 'choice:<id>' or 'classChoice:<id>'.
// taken lists proficiencies other choices already picked, which are hidden here except in Expertise-style choices that offer only those.
export function ChoiceField({ choice, field, value, taken, onChoose, errors }: {
  choice: CharacterChoice;
  field: string;
  value: string | string[] | undefined;
  taken: TakenOptions;
  onChoose: (choiceId: string, value: string | string[]) => void;
  errors: string[];
}) {
  const picked = Array.isArray(value) ? value : value ? [value] : [];
  const offered = choice.options.filter(o => picked.includes(o.key) || (choice.proficientOnly
    ? taken[o.key] !== undefined
    : taken[o.key] === undefined || taken[o.key] === field));
  const chosen = choice.options.filter(o => picked.includes(o.key));
  const slots = Array.from({ length: choice.count }, (_, i) => picked[i] ?? '');

  function setSlot(slot: number, key: string) {
    if (choice.count === 1) return onChoose(choice.id, key);
    const next = [...slots];
    next[slot] = key;
    onChoose(choice.id, next.filter(Boolean));
  }

  return (
    <div className="pick-choice">
      <span className="pick-choice__prompt">
        {choice.prompt}
        {choice.count > 1 && <span className="setting-hint"> (choose {choice.count})</span>}
        {choice.proficientOnly && <span className="setting-hint"> — from skills you’re proficient in</span>}
      </span>
      <div className="pick-choice__selects">
        {slots.map((current, slot) => (
          <select key={slot} className="rules-select" value={current} aria-label={`${choice.prompt} ${slot + 1}`}
            onChange={e => setSlot(slot, e.target.value)}>
            <option value="">Choose…</option>
            {offered
              .filter(o => o.key === current || !picked.includes(o.key))
              .map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        ))}
      </div>
      {chosen.map(o => (
        <div key={o.key}>
          {o.description && choice.options.some(x => x.description) && <OptionNote name={o.label} text={o.description} />}
          {(o.grants ?? []).map(g => <OptionNote key={g.name} name={g.name} text={g.description} />)}
        </div>
      ))}
      {errors.map(message => <p key={message} className="campaign-name__error">{message}</p>)}
    </div>
  );
}
