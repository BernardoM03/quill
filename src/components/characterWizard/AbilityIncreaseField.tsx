import type { AbilitySummary, CharacterChoice } from '../../api/characters';
import { useAbilitySummary } from './abilitySummaryContext';

const ABILITIES: [string, string][] = [
  ['STR', 'Strength'], ['DEX', 'Dexterity'], ['CON', 'Constitution'],
  ['INT', 'Intelligence'], ['WIS', 'Wisdom'], ['CHA', 'Charisma'],
];

// "WIS+2,CHA+1" -> { WIS: 2, CHA: 1 }.
function parse(value: string | string[] | undefined): Record<string, number> {
  const spread: Record<string, number> = {};
  if (typeof value !== 'string') return spread;
  for (const part of value.split(',')) {
    const [ability, amount] = part.split('+');
    if (ability && Number(amount) > 0) spread[ability] = Number(amount);
  }
  return spread;
}

function format(spread: Record<string, number>): string {
  return ABILITIES.map(([code]) => code)
    .filter(code => spread[code])
    .sort((a, b) => spread[b] - spread[a])
    .map(code => `${code}+${spread[code]}`)
    .join(',');
}

// What the character's other picks add to one ability, totalled per source, such as "Background +2".
function otherIncreases(ability: AbilitySummary | undefined, field: string): [string, number][] {
  const bySource = new Map<string, number>();
  for (const increase of ability?.increases ?? []) {
    if (increase.field === field) continue;
    bySource.set(increase.source, (bySource.get(increase.source) ?? 0) + increase.amount);
  }
  return [...bySource];
}

// Ability increases from a background or feat as one − / + box per ability, with ineligible abilities locked.
// Each box also notes what the rest of the wizard adds to that ability (other increases) and the score it comes to.
// field is this pick's draft field, such as 'backgroundChoice:<id>' or 'classChoice:<id>'.
export function AbilityIncreaseField({ choice, field, value, onChoose, errors }: {
  choice: CharacterChoice;
  field: string;
  value: string | string[] | undefined;
  onChoose: (choiceId: string, value: string) => void;
  errors: string[];
}) {
  const summary = useAbilitySummary();
  const points = choice.points ?? 3;
  const max = choice.max ?? 2;
  const allowed = new Set(choice.abilities ?? []);
  const spread = parse(value);
  const spent = Object.values(spread).reduce((sum, n) => sum + n, 0);

  function change(code: string, by: number) {
    const next = { ...spread, [code]: (spread[code] ?? 0) + by };
    if (next[code] <= 0) delete next[code];
    onChoose(choice.id, format(next));
  }

  return (
    <div className="pick-choice">
      <span className="pick-choice__prompt">
        {choice.source ? `${choice.source}: ability score increase` : 'Ability score increases'}
      </span>
      <div className="ability-boxes">
        {ABILITIES.map(([code, name]) => {
          const amount = spread[code] ?? 0;
          const open = allowed.has(code);
          const ability = summary?.[code];
          const others = otherIncreases(ability, field);
          const fromOthers = others.reduce((sum, [, n]) => sum + n, 0);
          // Worked out here with this box's own amount, so it keeps up before the server's next check.
          const score = ability?.base != null ? Math.min(choice.maximum ?? 20, ability.base + fromOthers + amount) : null;
          const breakdown = [
            ability?.base != null && `Base ${ability.base}`,
            ...others.map(([source, n]) => `${source} +${n}`),
            amount > 0 && `This pick +${amount}`,
          ].filter(Boolean).join(', ');
          return (
            <div key={code} className={open ? 'ability-box' : 'ability-box ability-box--locked'}>
              <span className="ability-box__code" title={name}>{code}</span>
              <span className="ability-box__amount">{amount > 0 ? `+${amount}` : '—'}</span>
              <div className="ability-box__buttons">
                <button type="button" aria-label={`Lower ${name}`} disabled={!open || amount === 0}
                  onClick={() => change(code, -1)}>−</button>
                <button type="button" aria-label={`Raise ${name}`} disabled={!open || amount >= max || spent >= points}
                  onClick={() => change(code, 1)}>+</button>
              </div>
              {(fromOthers > 0 || score != null) && (
                <span className="ability-box__note" title={breakdown}>
                  {fromOthers > 0 && <span className="ability-box__others">+{fromOthers} elsewhere</span>}
                  {score != null && <span>Score {score}</span>}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {errors.map(message => <p key={message} className="campaign-name__error">{message}</p>)}
    </div>
  );
}
