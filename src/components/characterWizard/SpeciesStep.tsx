import type { characterChoice, speciesOption } from '../../api/characters';
import './SpeciesStep.css';

const titleCase = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

function details(species: speciesOption): string {
  const parts: string[] = [];
  if (species.creatureType) parts.push(titleCase(species.creatureType));
  parts.push(species.size.length > 0 ? species.size.map(titleCase).join(' or ') : 'Size of your choice');
  if (species.speed) parts.push(`Speed ${species.speed} ft`);
  return parts.join(' · ');
}

// The species step: a dropdown to jump to any species the campaign allows, and one card
// at a time with arrows to step through them. The card shows everything about the species
// and every choice it asks for, made right here. Whatever card is showing is the pick.
// errorsFor(field): the server's messages to show for a field ('species', 'choice:<id>').
export function SpeciesStep({ options, selected, choices, onSelect, onChoose, errorsFor }: {
  options: speciesOption[];
  selected: string | null;
  choices: Record<string, string | string[]>;
  onSelect: (speciesId: string) => void;
  onChoose: (choiceId: string, value: string | string[]) => void;
  errorsFor: (field: string) => string[];
}) {
  if (options.length === 0) {
    return <p className="muted">This campaign doesn’t allow any species yet. Ask your GM.</p>;
  }
  const index = Math.max(0, options.findIndex(s => s.id === selected));
  const species = options[index];
  const step = (by: number) => onSelect(options[(index + by + options.length) % options.length].id);

  return (
    <div className="species-step">
      <div className="species-step__picker">
        <label className="species-step__select">
          <span className="setting-caption">Species</span>
          <select className="rules-select" value={species.id} onChange={e => onSelect(e.target.value)}>
            {options.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {options.length > 1 && <span className="setting-hint">{index + 1} of {options.length}</span>}
      </div>

      <div className="species-card-row">
        {options.length > 1 && (
          <button type="button" className="species-card-row__arrow" aria-label="Previous species" onClick={() => step(-1)}>‹</button>
        )}
        <article className="species-card" aria-live="polite">
          <header className="species-card__header">
            <h2>{species.name}</h2>
            <span className="setting-hint">{details(species)}</span>
          </header>

          {species.choices.map(choice => (
            <ChoiceField key={choice.id} choice={choice} value={choices[choice.id]} onChoose={onChoose}
              errors={errorsFor(`choice:${choice.id}`)} />
          ))}

          <dl className="species-card__traits">
            {species.traits.map(trait => (
              <div key={trait.id} className="species-trait">
                <dt>{trait.name}</dt>
                <dd>
                  <p>{trait.description || trait.shortDescription}</p>
                  {trait.choices.map(choice => (
                    <ChoiceField key={choice.id} choice={choice} value={choices[choice.id]} onChoose={onChoose}
                      errors={errorsFor(`choice:${choice.id}`)} />
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </article>
        {options.length > 1 && (
          <button type="button" className="species-card-row__arrow" aria-label="Next species" onClick={() => step(1)}>›</button>
        )}
      </div>
      {errorsFor('species').map(message => <p key={message} className="campaign-name__error">{message}</p>)}
    </div>
  );
}

// One choice: a dropdown for a single pick, checkboxes when it takes several. An option
// that brings features (a lineage's spells) shows them once picked.
function ChoiceField({ choice, value, onChoose, errors }: {
  choice: characterChoice;
  value: string | string[] | undefined;
  onChoose: (choiceId: string, value: string | string[]) => void;
  errors: string[];
}) {
  const picked = Array.isArray(value) ? value : value ? [value] : [];
  const chosen = choice.options.filter(o => picked.includes(o.key));

  return (
    <div className="species-choice">
      {choice.count === 1 ? (
        <label className="species-choice__single">
          <span>{choice.prompt}</span>
          <select className="rules-select" value={picked[0] ?? ''} onChange={e => onChoose(choice.id, e.target.value)}>
            <option value="" disabled>Choose…</option>
            {choice.options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
      ) : (
        <fieldset className="species-choice__many">
          <legend>{choice.prompt} <span className="setting-hint">(choose {choice.count})</span></legend>
          {choice.options.map(o => (
            <label key={o.key}>
              <input type="checkbox" checked={picked.includes(o.key)}
                disabled={!picked.includes(o.key) && picked.length >= choice.count}
                onChange={e => onChoose(choice.id, e.target.checked ? [...picked, o.key] : picked.filter(k => k !== o.key))} />
              {o.label}
            </label>
          ))}
        </fieldset>
      )}
      {chosen.flatMap(o => o.grants ?? []).map(g => (
        <div key={g.name} className="species-choice__grant">
          <strong>{g.name}.</strong> {g.description}
        </div>
      ))}
      {errors.map(message => <p key={message} className="campaign-name__error">{message}</p>)}
    </div>
  );
}
