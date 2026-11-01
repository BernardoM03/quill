import type {
  backgroundOption, characterChoice, choicePicks, featDetail, originRules, takenOptions,
} from '../../api/characters';
import { AbilityIncreaseField } from './AbilityIncreaseField';
import { activeChoices } from './activeChoices';
import { ChoiceField, PickCarousel } from './PickCard';
import { RuleSwitch } from './RuleSwitch';

// Choice ids the server gives these, so the card can show them in their own sections.
const FEAT_CHOICE = 'origin-feat';
const EQUIPMENT_CHOICE = 'starting-equipment';

// The background step: every background the campaign allows, one card at a time. The card
// shows what the background gives and asks for every choice it brings: ability score
// increases, its Origin feat (and that feat's own choices), equipment and languages.
// errorsFor(field): the server's messages for a field ('background', 'backgroundChoice:<id>').
// rules: the origin rules in force; locked in a campaign (the GM's), the player's in the sandbox.
export function BackgroundStep({ rules, locked, onRuleChange, options, selected, choices, taken, onSelect, onChoose, errorsFor }: {
  rules: originRules;
  locked: boolean;
  onRuleChange: (changes: Partial<originRules>) => void;
  options: backgroundOption[];
  selected: string | null;
  choices: choicePicks;
  taken: takenOptions;
  onSelect: (backgroundId: string) => void;
  onChoose: (choiceId: string, value: string | string[]) => void;
  errorsFor: (field: string) => string[];
}) {
  const only = <T extends string>(value: T) => (locked ? [value] : undefined);
  const switches = (
    <div className="rule-switches">
      <RuleSwitch label="Ability increases & proficiencies" value={rules.customizeOrigin ? 'custom' : 'background'}
        allowed={only(rules.customizeOrigin ? 'custom' : 'background')}
        options={[{ value: 'background', label: 'Background’s' }, { value: 'custom', label: 'Customize' }]}
        onChange={v => onRuleChange({ customizeOrigin: v === 'custom' })} />
      <RuleSwitch label="Origin feat" value={rules.originFeat} allowed={only(rules.originFeat)}
        options={[{ value: 'background', label: 'Background’s' }, { value: 'any', label: 'Any Origin Feat' }]}
        onChange={originFeat => onRuleChange({ originFeat })} />
      <RuleSwitch label="Starting equipment" value={rules.startingEquipment} allowed={only(rules.startingEquipment)}
        options={[{ value: 'choice', label: 'Choose' }, { value: 'equipment', label: 'Equipment' }, { value: 'gold', label: 'Gold' }]}
        onChange={startingEquipment => onRuleChange({ startingEquipment })} />
    </div>
  );
  if (options.length === 0) {
    return <>{switches}<p className="muted">This campaign doesn’t allow any backgrounds yet. Ask your GM.</p></>;
  }
  const background = options.find(b => b.id === selected) ?? options[0];
  const byId = (id: string) => background.choices.find(c => c.id === id);
  const featChoice = byId(FEAT_CHOICE);
  const equipmentChoice = byId(EQUIPMENT_CHOICE);
  const general = background.choices.filter(c => c !== featChoice && c !== equipmentChoice);
  const feat = background.feat ?? background.originFeats.find(f => f.id === choices[FEAT_CHOICE]);
  const given = background.equipment.find(p => p.label === background.givenEquipment);

  const field = (choice: characterChoice) => choice.kind === 'abilityIncrease' ? (
    <AbilityIncreaseField key={choice.id} choice={choice} value={choices[choice.id]} onChoose={onChoose}
      errors={errorsFor(`backgroundChoice:${choice.id}`)} />
  ) : (
    <ChoiceField key={choice.id} choice={choice} field={`backgroundChoice:${choice.id}`} value={choices[choice.id]}
      taken={taken} onChoose={onChoose} errors={errorsFor(`backgroundChoice:${choice.id}`)} />
  );
  const featEffects = (f: featDetail) => (
    <dl className="pick-card__entries">
      {f.effects.map(e => (
        <div key={e.name} className="pick-entry">
          <dt>{e.name}</dt>
          <dd><p>{e.description}</p></dd>
        </div>
      ))}
    </dl>
  );

  return (
    <>
      {switches}
      <PickCarousel caption="Background" items={options} selected={background.id} onSelect={onSelect}>
        <header className="pick-card__header">
          <h2>{background.name}</h2>
        </header>
        {background.description && <p>{background.description}</p>}

        <dl className="pick-card__facts">
          <dt>Ability scores</dt><dd>{background.abilityScores.join(', ')}</dd>
          {background.skills.length > 0 && <><dt>Skills</dt><dd>{background.skills.join(', ')}</dd></>}
          {background.tools.length > 0 && <><dt>Tools</dt><dd>{background.tools.join(', ')}</dd></>}
          {background.languages.length > 0 && <><dt>Languages</dt><dd>{background.languages.join(', ')}</dd></>}
        </dl>

        {general.map(field)}

        <h3 className="pick-card__section-title">Origin Feat{background.feat ? `: ${background.feat.name}` : ''}</h3>
        {featChoice && field(featChoice)}
        {feat && featEffects(feat)}
        {activeChoices(background.featChoices, choices).map(field)}

        <h3 className="pick-card__section-title">Starting Equipment</h3>
        {equipmentChoice ? field(equipmentChoice) : given && (
          <p>{given.items.join(', ')}</p>
        )}
      </PickCarousel>
      {errorsFor('background').map(message => <p key={message} className="campaign-name__error">{message}</p>)}
    </>
  );
}
