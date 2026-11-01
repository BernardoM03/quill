import type { ReactNode } from 'react';

import type { characterChoice } from '../../api/characters';
import './PickCard.css';

// A wizard step that picks one thing from a list (species, class): a dropdown to jump to
// any of them, and one card at a time with quiet arrows to step through. Whatever card is
// showing is the pick. children: the card's contents for the current item.
export function PickCarousel({ caption, items, selected, onSelect, extra, children }: {
  caption: string;
  items: { id: string; name: string }[];
  selected: string;
  onSelect: (id: string) => void;
  // Shown beside the dropdown, e.g. "Level 3".
  extra?: ReactNode;
  children: ReactNode;
}) {
  const index = Math.max(0, items.findIndex(i => i.id === selected));
  const step = (by: number) => onSelect(items[(index + by + items.length) % items.length].id);
  const several = items.length > 1;

  return (
    <div className="pick-step">
      <div className="pick-step__picker">
        <label className="pick-step__select">
          <span className="setting-caption">{caption}</span>
          <select className="rules-select" value={items[index].id} onChange={e => onSelect(e.target.value)}>
            {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        {several && <span className="setting-hint">{index + 1} of {items.length}</span>}
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

// One choice. A single pick is a dropdown; a choice of several shows that many dropdowns,
// each leaving out what the others already took. An option that brings features (a
// lineage's spells) or has a description shows it once picked.
export function ChoiceField({ choice, value, onChoose, errors }: {
  choice: characterChoice;
  value: string | string[] | undefined;
  onChoose: (choiceId: string, value: string | string[]) => void;
  errors: string[];
}) {
  const picked = Array.isArray(value) ? value : value ? [value] : [];
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
            {choice.options
              .filter(o => o.key === current || !picked.includes(o.key))
              .map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        ))}
      </div>
      {chosen.map(o => (
        <div key={o.key}>
          {o.description && choice.options.some(x => x.description) && (
            <div className="pick-choice__option-note"><strong>{o.label}.</strong> {o.description}</div>
          )}
          {(o.grants ?? []).map(g => (
            <div key={g.name} className="pick-choice__option-note"><strong>{g.name}.</strong> {g.description}</div>
          ))}
        </div>
      ))}
      {errors.map(message => <p key={message} className="campaign-name__error">{message}</p>)}
    </div>
  );
}
