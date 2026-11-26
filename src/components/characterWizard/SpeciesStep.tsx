import type { ChoicePicks, SpeciesOption, TakenOptions } from '../../api/characters';
import { RulesText } from '../RulesText';
import { ChoiceField, PickCarousel } from './PickCard';

// Choose Species
// Showing one allowed species at a time with its traits and choices.
export function SpeciesStep({ options, selected, choices, taken, onSelect, onChoose, errorsFor }: {
  options: SpeciesOption[];
  selected: string | null;
  choices: ChoicePicks;
  taken: TakenOptions;
  onSelect: (speciesId: string) => void;
  onChoose: (choiceId: string, value: string | string[]) => void;
  errorsFor: (field: string) => string[];
}) {
  if (options.length === 0) {
    return <p className="muted">This campaign doesn’t allow any species yet. Make fun of your GM for being dumb as fuh.</p>;
  }
  const species = selected ? options.find(s => s.id === selected) : options[0];
  if (!species) {
    return (
      <PickCarousel caption="Species" items={options} selected={selected ?? ''} onSelect={onSelect}>
        <p className="setting-error">This character’s species isn’t allowed in this campaign anymore. Choose another.</p>
      </PickCarousel>
    );
  }

  return (
    <>
      <PickCarousel caption="Species" items={options} selected={species.id} onSelect={onSelect}>
        <header className="pick-card__header">
          <h2>{species.name}</h2>
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
                <RulesText>{trait.description || trait.shortDescription}</RulesText>
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
