import { MAX_LEVEL, POINT_BUY_BUDGET_RANGE, SHARED_SCORE_RANGE, type campaignRules } from '../../datatypes/campaignRules';
import { Toggle } from './Toggle';

type BooleanRule = { [K in keyof campaignRules]: campaignRules[K] extends boolean ? K : never }[keyof campaignRules];
type ToggleSpec = { rule: BooleanRule; label: string; hint: string };

const CHARACTER_OPTIONS: ToggleSpec[] = [
  { rule: 'optionalClassFeatures', label: 'Optional Class Features', hint: 'Classes can take their optional features.' },
  { rule: 'customizeOrigin', label: 'Customize Your Origin', hint: 'Players may move their ability score increases and swap origin proficiencies.' },
  { rule: 'featPrerequisites', label: 'Use Prerequisites: Feats', hint: 'Feats require their prerequisites to be met.' },
  { rule: 'allowMulticlass', label: 'Allow Multiclassing', hint: 'Characters can take levels in more than one class.' },
];

const INVENTORY: ToggleSpec[] = [
  { rule: 'encumbrance', label: 'Encumbrance', hint: 'Track carrying capacity and apply encumbered penalties.' },
  { rule: 'ignoreCoinWeight', label: 'Ignore Coin Weight', hint: 'Coins add nothing to carried weight.' },
];

type Props = {
  rules: campaignRules; // already merged with the defaults
  onChange: (changed: Partial<campaignRules>) => void; // only the rules that changed
};

// The campaign's main character creation rules.
export function RulesSettings({ rules, onChange }: Props) {
  const toggle = (t: ToggleSpec, className?: string) => (
    <Toggle key={t.rule} className={className} label={t.label} hint={t.hint} checked={rules[t.rule]} onChange={() => onChange({ [t.rule]: !rules[t.rule] })} />
  );

  return (
    <section className="rules-settings">
      <div className="setting-section">
        <span className="setting-caption">Character Options</span>
        <div className="rules-list">
          {CHARACTER_OPTIONS.map(t => toggle(t))}
          {rules.allowMulticlass && toggle(
            { rule: 'multiclassPrerequisites', label: 'Use Prerequisites: Multiclass', hint: 'Multiclassing requires the ability score minimums.' },
            'rules-subrow',
          )}
        </div>
      </div>

      <div className="setting-section">
        <span className="setting-caption">Ability Scores</span>
        <div className="rules-list">
          <ChoiceRow
            label="Method"
            hint={ABILITY_HINTS[rules.abilityScoreMethod]}
            value={rules.abilityScoreMethod}
            options={[
              { value: 'standardArray', label: 'Standard Array' },
              { value: 'pointBuy', label: 'Point Buy' },
              { value: 'roll', label: 'Roll' },
              { value: 'manual', label: 'Manual' },
              { value: 'sharedManual', label: 'Shared Manual' },
            ]}
            onChange={abilityScoreMethod => onChange({ abilityScoreMethod })}
          />
          {rules.abilityScoreMethod === 'pointBuy' && (
            <NumberRow
              label="Point Budget" hint="Points each player can spend. The standard budget is 27."
              value={rules.pointBuyBudget} min={POINT_BUY_BUDGET_RANGE.min} max={POINT_BUY_BUDGET_RANGE.max}
              onChange={pointBuyBudget => onChange({ pointBuyBudget })}
            />
          )}
          {rules.abilityScoreMethod === 'sharedManual' && (
            <SharedScoresRow scores={rules.sharedScores} onChange={sharedScores => onChange({ sharedScores })} />
          )}
        </div>
      </div>

      <div className="setting-section">
        <span className="setting-caption">Progression</span>
        <div className="rules-list">
          <ChoiceRow
            label="Advancement Type"
            hint={rules.advancement === 'milestone' ? 'The DM sets the party level.' : 'Characters level up from experience points.'}
            value={rules.advancement}
            options={[{ value: 'milestone', label: 'Milestone' }, { value: 'xp', label: 'EXP' }]}
            onChange={advancement => onChange({ advancement })}
          />
          {rules.advancement === 'milestone' && (
            <NumberRow
              label="Current Level" hint="New characters start at this level."
              value={rules.milestoneLevel} min={1} max={MAX_LEVEL}
              onChange={milestoneLevel => onChange({ milestoneLevel })}
            />
          )}
          <ChoiceRow
            label="Hit Point Type"
            hint={rules.hitPoints === 'automatic' ? 'Each level gives the hit die’s fixed average.' : 'Players roll or enter hit points each level.'}
            value={rules.hitPoints}
            options={[{ value: 'manual', label: 'Manual' }, { value: 'automatic', label: 'Automatic' }]}
            onChange={hitPoints => onChange({ hitPoints })}
          />
        </div>
      </div>

      <div className="setting-section">
        <span className="setting-caption">Inventory</span>
        <div className="rules-list">{INVENTORY.map(t => toggle(t))}</div>
      </div>
    </section>
  );
}

const ABILITY_HINTS: Record<campaignRules['abilityScoreMethod'], string> = {
  standardArray: 'Assign 15, 14, 13, 12, 10, 8.',
  pointBuy: 'Spend points on scores from 8 to 15.',
  roll: 'Roll 4d6 and drop the lowest, six times.',
  manual: 'Players enter their scores directly.',
  sharedManual: 'You set six scores; every player assigns them as they like.',
};

const EQUIPMENT_HINTS: Record<campaignRules['startingEquipment'], string> = {
  choice: 'Players pick the equipment or the gold for each class and background.',
  equipment: 'Everyone takes the equipment packages.',
  gold: 'Everyone takes the gold and buys their own gear.',
};

// Less common character creation rules, shown under the main rules.
export function AdvancedRulesSettings({ rules, onChange }: Props) {
  return (
    <div className="setting-section">
      <span className="setting-caption">Character Creation</span>
      <div className="rules-list">
        <ChoiceRow
          label="Starting Equipment"
          hint={EQUIPMENT_HINTS[rules.startingEquipment]}
          value={rules.startingEquipment}
          options={[
            { value: 'choice', label: 'Player’s Choice' },
            { value: 'equipment', label: 'Equipment' },
            { value: 'gold', label: 'Gold' },
          ]}
          onChange={startingEquipment => onChange({ startingEquipment })}
        />
        <ChoiceRow
          label="Origin Feat"
          hint={rules.originFeat === 'background' ? 'Players take the feat their background grants.' : 'Players pick any Origin feat.'}
          value={rules.originFeat}
          options={[{ value: 'background', label: 'From Background' }, { value: 'any', label: 'Any' }]}
          onChange={originFeat => onChange({ originFeat })}
        />
        <Toggle
          label="Character Approval"
          hint="New characters wait for the DM to approve them before they can be played."
          checked={rules.characterApproval}
          onChange={() => onChange({ characterApproval: !rules.characterApproval })}
        />
      </div>
    </div>
  );
}

// A label with a two-or-more-way switch on the right, styled like the View/Edit tabs.
function ChoiceRow<T extends string>({ label, hint, value, options, onChange }: {
  label: string;
  hint: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="setting-row">
      <span className="setting-label">
        <span>{label}</span>
        <span className="setting-hint">{hint}</span>
      </span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map(o => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// An indented row with a dropdown of whole numbers, for a setting that belongs to the row above.
function NumberRow({ label, hint, value, min, max, onChange }: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="setting-row rules-subrow">
      <span className="setting-label">
        <span>{label}</span>
        <span className="setting-hint">{hint}</span>
      </span>
      <select className="rules-select" aria-label={label} value={value} onChange={e => onChange(Number(e.target.value))}>
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );
}

// The six scores every player assigns under Shared Manual, highest first.
function SharedScoresRow({ scores, onChange }: { scores: number[]; onChange: (scores: number[]) => void }) {
  const setScore = (index: number, value: number) =>
    onChange(scores.map((n, i) => (i === index ? value : n)).sort((a, b) => b - a));

  return (
    <div className="setting-row rules-subrow">
      <span className="setting-label">
        <span>Shared Scores</span>
        <span className="setting-hint">Each player assigns these six to their abilities.</span>
      </span>
      <div className="shared-scores">
        {scores.map((score, i) => (
          <select
            key={i}
            className="rules-select"
            aria-label={`Score ${i + 1}`}
            value={score}
            onChange={e => setScore(i, Number(e.target.value))}
          >
            {Array.from({ length: SHARED_SCORE_RANGE.max - SHARED_SCORE_RANGE.min + 1 }, (_, n) => SHARED_SCORE_RANGE.min + n)
              .map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        ))}
      </div>
    </div>
  );
}
