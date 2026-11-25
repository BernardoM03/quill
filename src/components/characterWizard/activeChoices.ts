import type { CharacterChoice, ChoicePicks } from '../../api/characters';

// The choices that apply given the picks so far, where conditional ones appear once their trigger is picked.
// The server sets the conditions, and this only reads them.
export function activeChoices(choices: CharacterChoice[], picks: ChoicePicks): CharacterChoice[] {
  return choices.filter(c => {
    if (!c.condition) return true;
    const picked = picks[c.condition.choice];
    return picked === c.condition.option || (Array.isArray(picked) && picked.includes(c.condition.option));
  });
}
