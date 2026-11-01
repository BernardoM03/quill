import type { choicePicks, speciesOption, takenOptions } from '../../api/characters';
import { ChoiceField, PickCarousel } from './PickCard';

const titleCase = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

function details(species: speciesOption): string {
  const parts: string[] = [];
  if (species.creatureType) parts.push(titleCase(species.creatureType));
  parts.push(species.size.length > 0 ? species.size.map(titleCase).join(' or ') : 'Size of your choice');
  if (species.speed) parts.push(`Speed ${species.speed} ft`);
  return parts.join(' · ');
}

// The species step: every species the campaign allows, one card at a time. The card shows
// everything about the species and every choice it asks for, made right here.
// errorsFor(field): the server's messages to show for a field ('species', 'choice:<id>').
export function SpeciesStep({ options, selected, choices, taken, onSelect, onChoose, errorsFor }: {
  options: speciesOption[];
  selected: string | null;
  choices: choicePicks;
  taken: takenOptions;
  onSelect: (speciesId: string) => void;
  onChoose: (choiceId: string, value: string | string[]) => void;
  errorsFor: (field: string) => string[];
}) {
  if (options.length === 0) {
    return <p className="muted">This campaign doesn’t allow any species yet. Ask your GM.</p>;
  }
  const species = options.find(s => s.id === selected) ?? options[0];

  return (
    <>
      <PickCarousel caption="Species" items={options} selected={species.id} onSelect={onSelect}>
        <header className="pick-card__header">
          <h2>{species.name}</h2>
          <span className="setting-hint">{details(species)}</span>
        </header>

        {species.choices.map(choice => (
          <ChoiceField key={choice.id} choice={choice} field={`choice:${choice.id}`} value={choices[choice.id]}
            taken={taken} onChoose={onChoose}
            errors={errorsFor(`choice:${choice.id}`)} />
        ))}

        <dl className="pick-card__entries">
          {species.traits.map(trait => (
            <div key={trait.id} className="pick-entry">
              <dt>{trait.name}</dt>
              <dd>
                <p>{trait.description || trait.shortDescription}</p>
                {trait.choices.map(choice => (
                  <ChoiceField key={choice.id} choice={choice} field={`choice:${choice.id}`} value={choices[choice.id]}
                    taken={taken} onChoose={onChoose}
                    errors={errorsFor(`choice:${choice.id}`)} />
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </PickCarousel>
      {errorsFor('species').map(message => <p key={message} className="campaign-name__error">{message}</p>)}
    </>
  );
}
