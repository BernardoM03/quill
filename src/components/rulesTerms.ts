import { termKey, type Glossary } from './glossary';

// The words RulesText highlights in rules text, and the same search GlossaryTooltips runs over other page text.

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
  // Lowercase "action" is usually plain English, so only these forms count.
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

type Pattern = [kind: string, source: RegExp];

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Longer names first, so "Hit Point Dice" wins over "Hit Points".
const longestFirst = (names: string[]) => [...names].sort((a, b) => b.length - a.length);

// Multi-word names match anywhere, but one-word names (Light, Shield) only before a noun like "cantrip" or after "cast ".
// Only the name itself is matched, so it is what gets highlighted.
function namePattern(names: string[], nouns: string): RegExp | null {
  const multiWord = longestFirst(names.filter(name => /\s/.test(name))).map(escapeRegExp);
  const singleWord = longestFirst(names.filter(name => !/\s/.test(name))).map(escapeRegExp);
  const alternatives = [];
  if (multiWord.length) alternatives.push(`\\b(?:${multiWord.join('|')})(?![\\w(])`);
  if (singleWord.length) {
    alternatives.push(
      `(?:(?<=\\bcast )|\\b)(?:${singleWord.join('|')})(?= (?:${nouns})\\b)`,
      `(?<=\\bcast )(?:${singleWord.join('|')})\\b`,
    );
  }
  return alternatives.length ? new RegExp(alternatives.join('|')) : null;
}

// Patterns are tried in order at each position, and names precede terms so "Cone of Cold" is a spell, not "Cone".
const STATIC_BEFORE: Pattern[] = [
  ['rules-dice', /\b\d*d(?:4|6|8|10|12|20|100)\b(?:\s?[+−-]\s?\d+\b)?|\bDC \d+\b/],
  ['rules-measure', /\b\d+(?:-foot|-mile|\s(?:feet|foot|miles?))\b/],
];
const STATIC_AFTER: Pattern[] = [
  ['rules-condition', new RegExp(`\\b(?:${CONDITIONS.join('|')})\\b`)],
  ['rules-term', new RegExp(`\\b(?:${longestFirst(TERMS).join('|')})\\b`)],
];

// The patterns plus one global regex with a capture group per pattern.
export interface Compiled { patterns: Pattern[]; any: RegExp }

const compile = (patterns: Pattern[]): Compiled =>
  ({ patterns, any: new RegExp(patterns.map(([, pattern]) => `(${pattern.source})`).join('|'), 'g') });

const BASIC = compile([...STATIC_BEFORE, ...STATIC_AFTER]);
// Compiled once per loaded glossary.
const compiledByGlossary = new WeakMap<Glossary, Compiled>();

export function patternsFor(terms: Glossary | null): Compiled {
  if (!terms) return BASIC;
  let compiled = compiledByGlossary.get(terms);
  if (!compiled) {
    const named: Pattern[] = [];
    const add = (kind: string, pattern: RegExp | null) => pattern && named.push([kind, pattern]);
    add('rules-spell', namePattern(terms.spells, 'spell|cantrip|spells'));
    add('rules-feat', namePattern(terms.feats, 'feat'));
    add('rules-language', namePattern(terms.languages, 'language'));
    // Skills are always capitalised ("a Wisdom (Perception) check"), so the bare name is enough.
    if (terms.skills.length) add('rules-skill', new RegExp(`\\b(?:${longestFirst(terms.skills).map(escapeRegExp).join('|')})\\b`));
    compiled = compile([...STATIC_BEFORE, ...named, ...STATIC_AFTER]);
    compiledByGlossary.set(terms, compiled);
  }
  return compiled;
}

// The kind of the pattern whose capture group produced this match of a Compiled regex.
export function kindOfMatch(patterns: Pattern[], match: RegExpMatchArray): string {
  return patterns[match.slice(1).findIndex(Boolean)][0];
}

// The glossary key for a match of the given kind, or null.
export function keyFor(terms: Glossary, kind: string, text: string): string | null {
  const prefix = { 'rules-spell': 'spell:', 'rules-feat': 'feat:', 'rules-language': 'language:' }[kind];
  if (prefix) return terms.terms.has(prefix + text.toLowerCase()) ? prefix + text.toLowerCase() : null;
  return kind === 'rules-measure' ? null : termKey(terms, text);
}

// Every rule and condition name the glossary defines, optionally plural.
// Case matters, so "Cover" the rule matches but "cover" the verb doesn't.
const namesPatternByGlossary = new WeakMap<Glossary, RegExp | null>();
function namesPattern(terms: Glossary): RegExp | null {
  let pattern = namesPatternByGlossary.get(terms);
  if (pattern === undefined) {
    const names = [...terms.terms].filter(([key]) => !key.includes(':')).map(([, definition]) => definition.name);
    pattern = names.length ? new RegExp(`\\b(${longestFirst(names).map(escapeRegExp).join('|')})(?:e?s)?\\b`, 'g') : null;
    namesPatternByGlossary.set(terms, pattern);
  }
  return pattern;
}

export interface TermMatch { start: number; end: number; key: string }

// Every defined stretch of text: what RulesText would highlight, then any other rule or condition named outright.
export function termsIn(text: string, terms: Glossary): TermMatch[] {
  const matches: TermMatch[] = [];
  const { patterns, any } = patternsFor(terms);
  for (const match of text.matchAll(any)) {
    const key = keyFor(terms, kindOfMatch(patterns, match), match[0]);
    if (key) matches.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, key });
  }
  const names = namesPattern(terms);
  for (const match of names ? text.matchAll(names) : []) {
    const start = match.index ?? 0, end = start + match[0].length;
    const overlaps = matches.some(existing => existing.start < end && start < existing.end);
    if (!overlaps) matches.push({ start, end, key: match[1].toLowerCase() });
  }
  return matches;
}
