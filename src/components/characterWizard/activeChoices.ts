import type { characterChoice, choicePicks } from '../../api/characters';

// The choices that apply given the picks so far: a conditional choice (Thaumaturge's extra
// cantrip, a subclass's features) shows once what it depends on is picked. The server
// works out the conditions; this only reads them.
export function activeChoices(choices: characterChoice[], picks: choicePicks): characterChoice[] {
  return choices.filter(c => {
    if (!c.condition) return true;
    const picked = picks[c.condition.choice];
    return picked === c.condition.option || (Array.isArray(picked) && picked.includes(c.condition.option));
  });
}
