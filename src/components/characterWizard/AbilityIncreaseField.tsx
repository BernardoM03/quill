import type { characterChoice } from '../../api/characters';

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

// Back to the key the server's options use: the biggest increase first, then STR to CHA.
function format(spread: Record<string, number>): string {
  return ABILITIES.map(([code]) => code)
    .filter(code => spread[code])
    .sort((a, b) => spread[b] - spread[a])
    .map(code => `${code}+${spread[code]}`)
    .join(',');
}

// A background's ability score increases: one box per ability with − and +, spending the
// choice's points (3) with at most max (+2) on one ability. Abilities the background doesn't
// raise are shown but locked. A half-spent spread is saved too; the server says what's missing.
export function AbilityIncreaseField({ choice, value, onChoose, errors }: {
  choice: characterChoice;
  value: string | string[] | undefined;
  onChoose: (choiceId: string, value: string) => void;
  errors: string[];
}) {
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
        Ability score increases
        <span className="setting-hint"> — {points - spent} of {points} points left, at most +{max} to one ability</span>
      </span>
      <div className="ability-boxes">
        {ABILITIES.map(([code, name]) => {
          const amount = spread[code] ?? 0;
          const open = allowed.has(code);
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
            </div>
          );
        })}
      </div>
      {errors.map(message => <p key={message} className="campaign-name__error">{message}</p>)}
    </div>
  );
}
