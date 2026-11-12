import { termKey, type glossary } from './glossary';

// The words RulesText picks out of rules text, and the same search over any other text on
// the page (GlossaryTooltips).

const CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible',
  'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
];
const TERMS = [
  'Bonus Action', 'Reaction', 'Magic action', 'Attack action', 'Dash action', 'Disengage action', 'Dodge action',
  'Help action', 'Hide action', 'Ready action', 'Search action', 'Study action', 'Utilize action',
  'Advantage', 'Disadvantage', 'Resistance', 'Immunity', 'Vulnerability',
  'Short Rest', 'Long Rest', 'Temporary Hit Points', 'Hit Point maximum', 'Hit Points', 'Hit Point Dice', 'Hit Dice',
  'Proficiency Bonus', 'saving throws?', 'Saving Throws?', 'attack rolls?', 'ability checks?', 'Concentration',
  'Heroic Inspiration', 'Cone', 'Cube', 'Cylinder', 'Emanation', 'Line', 'Sphere', 'Darkvision', 'Blindsight',
  'Tremorsense', 'Truesight', 'Difficult Terrain', 'Unarmed Strike', 'Opportunity Attacks?', 'Critical Hit',
  'Initiative', 'Expertise', 'Bloodied', 'Armor Class', 'Difficulty Class', 'Cover',
  // "Action" itself only as a rules phrase; on its own "action" is usually plain English.
  'Action', 'an action',
  // Rolls
  'Ability Checks?', 'Attack Rolls?', 'D20 Tests?', 'Damage Rolls?', 'Death Saving Throws?', 'Spell Attacks?',
  'Weapon Attacks?',
  // Movement and senses
  'Speed', 'Fly Speed', 'Swim Speed', 'Climb Speed', 'Burrow Speed', 'Hover', 'Reach', 'Telepathy', 'Teleportation',
  'Passive Perception',
  // Combat
  'Grappling', 'Surprise', 'Improvised Weapons?', 'Occupied Space', 'Unoccupied Space', 'Area of Effect',
  'Damage Threshold', 'Armor Training',
  // Light, vision and hazards
  'Bright Light', 'Dim Light', 'Darkness', 'Lightly Obscured', 'Heavily Obscured', 'Burning', 'Falling',
  'Suffocation', 'Dehydration', 'Malnutrition',
  // Social
  'Friendly', 'Indifferent', 'Hostile', 'Influence',
  // Magic and creatures
  'Cantrips?', 'Ritual', 'Spellcasting Focus', 'Attunement', 'Shape-Shifting', 'Creature Type', 'Challenge Rating',
  'Experience Points', 'Carrying Capacity', 'Dead', 'Stable',
];

type pattern = [kind: string, source: RegExp];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const longestFirst = (names: string[]) => [...names].sort((a, b) => b.length - a.length);

// Names of one kind: multi-word ones anywhere, one-word ones only before one of nouns
// ("Light cantrip") or after "cast ". Matches the name alone, so it's what gets the link.
function namePattern(names: string[], nouns: string): RegExp | null {
  const multi = longestFirst(names.filter(n => /\s/.test(n))).map(escape);
  const single = longestFirst(names.filter(n => !/\s/.test(n))).map(escape);
  const parts = [];
  if (multi.length) parts.push(`\\b(?:${multi.join('|')})(?![\\w(])`);
  if (single.length) parts.push(`(?:(?<=\\bcast )|\\b)(?:${single.join('|')})(?= (?:${nouns})\\b)`, `(?<=\\bcast )(?:${single.join('|')})\\b`);
  return parts.length ? new RegExp(parts.join('|')) : null;
}

// The patterns, in the order they're tried at each position; the first group that matches
// names the class. Names go before terms, so "Cone of Cold" is a spell rather than "Cone".
const STATIC_BEFORE: pattern[] = [
  ['rules-dice', /\b\d*d(?:4|6|8|10|12|20|100)\b(?:\s?[+−-]\s?\d+\b)?|\bDC \d+\b/],
  ['rules-measure', /\b\d+(?:-foot|-mile|\s(?:feet|foot|miles?))\b/],
];
const STATIC_AFTER: pattern[] = [
  ['rules-condition', new RegExp(`\\b(?:${CONDITIONS.join('|')})\\b`)],
  ['rules-term', new RegExp(`\\b(?:${longestFirst(TERMS).join('|')})\\b`)],
];

export interface compiled { patterns: pattern[]; any: RegExp }
const compile = (patterns: pattern[]): compiled =>
  ({ patterns, any: new RegExp(patterns.map(([, p]) => `(${p.source})`).join('|'), 'g') });
const BASIC = compile([...STATIC_BEFORE, ...STATIC_AFTER]);
// Built once per loaded glossary.
const withNames = new WeakMap<glossary, compiled>();
export function patternsFor(terms: glossary | null): compiled {
  if (!terms) return BASIC;
  let found = withNames.get(terms);
  if (!found) {
    const named: pattern[] = [];
    const add = (kind: string, p: RegExp | null) => p && named.push([kind, p]);
    add('rules-spell', namePattern(terms.spells, 'spell|cantrip|spells'));
    add('rules-feat', namePattern(terms.feats, 'feat'));
    add('rules-language', namePattern(terms.languages, 'language'));
    // Skills are written capitalised ("a Wisdom (Perception) check"), so the name alone is enough.
    if (terms.skills.length) add('rules-skill', new RegExp(`\\b(?:${longestFirst(terms.skills).map(escape).join('|')})\\b`));
    found = compile([...STATIC_BEFORE, ...named, ...STATIC_AFTER]);
    withNames.set(terms, found);
  }
  return found;
}

// The glossary key for a match of a kind, or null.
export function keyFor(terms: glossary, kind: string, text: string): string | null {
  const prefix = { 'rules-spell': 'spell:', 'rules-feat': 'feat:', 'rules-language': 'language:' }[kind];
  if (prefix) return terms.terms.has(prefix + text.toLowerCase()) ? prefix + text.toLowerCase() : null;
  return kind === 'rules-measure' ? null : termKey(terms, text);
}

// Every rule and condition the glossary defines, as the packs name it, with or without a
// plural ending. Case matters: "Cover" the rule, not "cover" the verb.
const byName = new WeakMap<glossary, RegExp | null>();
function namesPattern(terms: glossary): RegExp | null {
  let found = byName.get(terms);
  if (found === undefined) {
    const names = [...terms.terms].filter(([key]) => !key.includes(':')).map(([, d]) => d.name);
    found = names.length ? new RegExp(`\\b(${longestFirst(names).map(escape).join('|')})(?:e?s)?\\b`, 'g') : null;
    byName.set(terms, found);
  }
  return found;
}

export interface termMatch { start: number; end: number; key: string }

// Every stretch of text the glossary defines: what RulesText would underline, then any other
// rule or condition named outright ("Proficiency", "Skill").
export function termsIn(text: string, terms: glossary): termMatch[] {
  const out: termMatch[] = [];
  const { patterns, any } = patternsFor(terms);
  for (const match of text.matchAll(any)) {
    const key = keyFor(terms, patterns[match.slice(1).findIndex(Boolean)][0], match[0]);
    if (key) out.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, key });
  }
  const names = namesPattern(terms);
  for (const match of names ? text.matchAll(names) : []) {
    const start = match.index ?? 0, end = start + match[0].length;
    if (!out.some(m => m.start < end && start < m.end)) out.push({ start, end, key: match[1].toLowerCase() });
  }
  return out;
}
