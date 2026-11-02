import { loadCollection } from '../packs/loader';

// Definitions for the rules words RulesText picks out, from the packs: the rules glossary
// ("Advantage", "Bonus Action", "Cone", ...) and the conditions. Loaded once per page.
export interface definition {
  name: string;
  // Markdown, shown with RulesText.
  text: string;
}
export type glossary = Map<string, definition>;

let glossaryPromise: Promise<glossary> | null = null;

export function loadGlossary(): Promise<glossary> {
  if (!glossaryPromise) {
    glossaryPromise = Promise.all([loadCollection('rules'), loadCollection('conditions')]).then(([rules, conditions]) => {
      const terms: glossary = new Map();
      for (const rule of rules.values() as Iterable<{ name: string; description?: string }>) {
        if (rule.description) terms.set(rule.name.toLowerCase(), { name: rule.name, text: rule.description });
      }
      // A condition is defined by its effects: "**Can't See.** You can't see ...", one paragraph each.
      for (const c of conditions.values() as Iterable<{ name: string; effectGroups?: { name: string; description?: string }[] }>) {
        const text = (c.effectGroups ?? []).map(g => `**${g.name}.** ${g.description ?? ''}`).join('\n\n');
        if (text) terms.set(c.name.toLowerCase(), { name: c.name, text });
      }
      return terms;
    });
    glossaryPromise.catch(() => { glossaryPromise = null; });
  }
  return glossaryPromise;
}

// How the text says it -> the glossary entry's name, where they differ.
const ALIASES: Record<string, string> = {
  'proficiency bonus': 'proficiency',
  'hit point maximum': 'hit points',
  'hit dice': 'hit point dice',
  'attack rolls': 'attack roll',
  'saving throws': 'saving throw',
  'ability checks': 'ability check',
};

// The glossary key for a highlighted word, or null if the glossary doesn't define it.
// "Attack action" -> "attack", "saving throws" -> "saving throw", "DC 15" -> "difficulty class".
export function termKey(terms: glossary, text: string): string | null {
  let key = text.toLowerCase();
  if (/^dc \d+$/.test(key)) key = 'difficulty class';
  key = ALIASES[key] ?? key;
  // The whole phrase first ("bonus action"), then without " action" ("attack action" -> "attack").
  for (const candidate of [key, key.replace(/ action$/, '')]) {
    if (terms.has(candidate)) return candidate;
    if (candidate.endsWith('s') && terms.has(candidate.slice(0, -1))) return candidate.slice(0, -1);
  }
  return null;
}
