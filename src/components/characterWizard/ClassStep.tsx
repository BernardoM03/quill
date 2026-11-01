import { useEffect, useState } from 'react';

import {
  getClassOption, type characterChoice, type choicePicks, type classDetail, type classFeature, type classSummary,
  type takenOptions,
} from '../../api/characters';
import { activeChoices } from './activeChoices';
import { ChoiceField, PickCarousel } from './PickCard';

// The class step: every class the campaign allows, one card at a time, as it is at the
// campaign's starting level. The card loads that class's details from the server: its
// proficiencies, each feature up to the level, the subclass once the level reaches it,
// and every choice those bring, made right here.
// errorsFor(field): the server's messages for a field ('class', 'classChoice:<id>').
export function ClassStep({ campaignId, level, classes, selected, choices, taken, onSelect, onChoose, errorsFor }: {
  campaignId: string | null;
  level: number;
  classes: classSummary[];
  selected: string | null;
  choices: choicePicks;
  taken: takenOptions;
  onSelect: (classId: string) => void;
  onChoose: (choiceId: string, value: string | string[]) => void;
  errorsFor: (field: string) => string[];
}) {
  // Loaded class details, by id, so stepping back and forth doesn't fetch again.
  const [details, setDetails] = useState<Record<string, classDetail | 'failed'>>({});
  const current = classes.find(c => c.id === selected) ?? classes[0];

  useEffect(() => {
    if (!current || details[current.id]) return;
    let live = true;
    getClassOption(campaignId, current.id)
      .then(d => live && setDetails(all => ({ ...all, [current.id]: d })))
      .catch(() => live && setDetails(all => ({ ...all, [current.id]: 'failed' })));
    return () => { live = false; };
  }, [campaignId, current, details]);

  if (classes.length === 0) {
    return <p className="muted">This campaign doesn’t allow any classes yet. Ask your GM.</p>;
  }
  const detail = details[current.id];

  const field = (choice: characterChoice) => (
    <ChoiceField key={choice.id} choice={choice} field={`classChoice:${choice.id}`} value={choices[choice.id]}
      taken={taken} onChoose={onChoose}
      errors={errorsFor(`classChoice:${choice.id}`)} />
  );
  const featureList = (features: classFeature[]) => (
    <dl className="pick-card__entries">
      {features.map(feature => (
        <div key={`${feature.id}@${feature.level}`} className="pick-entry">
          <dt>{feature.name}<span className="pick-entry__level">Level {feature.level}</span></dt>
          <dd>
            <p>{feature.description || feature.shortDescription}</p>
            {activeChoices(feature.choices, choices).map(field)}
          </dd>
        </div>
      ))}
    </dl>
  );

  const subclass = detail && detail !== 'failed'
    ? detail.subclasses.find(s => s.id === choices[detail.subclassChoice?.id ?? '']) : undefined;

  return (
    <>
      <PickCarousel caption="Class" items={classes} selected={current.id} onSelect={onSelect}>
        <header className="pick-card__header">
          <h2>{current.name}</h2>
          <span className="setting-hint">Level {level}{current.hitDie ? ` · Hit Die d${current.hitDie}` : ''}</span>
        </header>

        {!detail && <p className="muted">Loading…</p>}
        {detail === 'failed' && <p className="setting-error">Couldn’t load this class. Try again.</p>}
        {detail && detail !== 'failed' && (
          <>
            <dl className="pick-card__facts">
              <dt>Primary ability</dt><dd>{detail.primaryAbility.join(' or ') || '—'}</dd>
              <dt>Saving throws</dt><dd>{detail.savingThrows.join(', ') || '—'}</dd>
              <dt>Armor</dt><dd>{detail.armor.join(', ') || 'None'}</dd>
              <dt>Weapons</dt><dd>{detail.weapons.join(', ') || 'None'}</dd>
              {detail.tools.length > 0 && <><dt>Tools</dt><dd>{detail.tools.join(', ')}</dd></>}
            </dl>

            {detail.choices.map(field)}

            <h3 className="pick-card__section-title">Features</h3>
            {featureList(detail.features)}

            {detail.subclassChoice ? (
              <>
                <h3 className="pick-card__section-title">Subclass</h3>
                {field(detail.subclassChoice)}
                {subclass && (
                  <>
                    {subclass.description && <p className="setting-hint">{subclass.description}</p>}
                    {featureList(subclass.features)}
                  </>
                )}
              </>
            ) : detail.subclassLevel && (
              <p className="setting-hint">You choose a subclass at level {detail.subclassLevel}.</p>
            )}
          </>
        )}
      </PickCarousel>
      {errorsFor('class').map(message => <p key={message} className="campaign-name__error">{message}</p>)}
    </>
  );
}
