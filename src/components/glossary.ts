import { loadCollection } from '../packs/loader';

// Definitions for the words RulesText picks out, from the packs: the rules glossary
// ("Advantage", "Bonus Action", "Cone", ...), the conditions, the skills, and the spells,
// feats and languages named in rules text. Loaded once per page.
export interface definition {
  name: string;
  // A line under the name: a spell's level, school, casting time, ...
  meta?: string;
  // Markdown, shown with RulesText.
  text: string;
}

export interface glossary {
  // Keyed by lowercase name; spells, feats and languages as "spell:find familiar" and so on,
  // so a spell named like a rule (Darkness) doesn't replace the rule.
  terms: Map<string, definition>;
  // Names to look for in rules text, by kind.
  skills: string[];
  spells: string[];
  feats: string[];
  languages: string[];
}

interface ruleEntry { name: string; description?: string }
interface conditionEntry { name: string; effectGroups?: { name: string; description?: string }[] }
interface spellEntry {
  name: string; level: number; school?: string; castingTime?: { type?: string; value?: number; unit?: string };
  range?: { type?: string; distance?: number; unit?: string }; components?: string[]; concentration?: boolean;
  ritual?: boolean; duration?: { value?: number; unit?: string }; description?: string; shortDescription?: string;
}
interface featEntry { name: string; category?: string; effectGroups?: { name: string; description?: string }[] }
interface skillEntry { name: string; ability: string; description?: string; uses?: string }
interface languageEntry { name: string; rarity?: string; description?: string }

const ABILITIES: Record<string, string> = {
  STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma',
};

const titleCase = (s: string) => s.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n / 10) === 1 ? 0 : n % 10]}`;

// "Level 2 Evocation · Action · 90 feet · V, S, M · Instantaneous"
function spellMeta(s: spellEntry): string {
  const parts = [s.level === 0 ? `${titleCase(s.school ?? '')} cantrip` : `${ordinal(s.level)}-level ${titleCase(s.school ?? '')}`];
  const time = s.castingTime;
  if (time?.type) parts.push(time.value ? `${time.value} ${time.unit ?? titleCase(time.type)}` : titleCase(time.type));
  const range = s.range;
  if (range?.distance) parts.push(`${range.distance} ${range.unit ?? 'feet'}`);
  else if (range?.type) parts.push(titleCase(range.type));
  if (s.components?.length) parts.push(s.components.map(c => c[0].toUpperCase()).join(', '));
  const d = s.duration;
  if (d?.unit) parts.push(`${s.concentration ? 'Concentration, ' : ''}${d.value ? `${d.value} ${d.unit}` : titleCase(d.unit)}`);
  if (s.ritual) parts.push('Ritual');
  return parts.join(' · ');
}

const groupsText = (groups: { name: string; description?: string }[] = []) =>
  groups.map(g => `**${g.name}.** ${g.description ?? ''}`).join('\n\n');

let glossaryPromise: Promise<glossary> | null = null;

export function loadGlossary(): Promise<glossary> {
  if (!glossaryPromise) {
    glossaryPromise = Promise.all([
      loadCollection('rules'), loadCollection('conditions'), loadCollection('spells'),
      loadCollection('feats'), loadCollection('languages'), loadCollection('skills'),
    ]).then(([rules, conditions, spells, feats, languages, skills]) => {
      const terms = new Map<string, definition>();
      for (const r of rules.values() as Iterable<ruleEntry>) {
        if (r.description) terms.set(r.name.toLowerCase(), { name: r.name, text: r.description });
      }
      // A condition is defined by its effects: "**Can't See.** You can't see ...", one paragraph each.
      for (const c of conditions.values() as Iterable<conditionEntry>) {
        const text = groupsText(c.effectGroups);
        if (text) terms.set(c.name.toLowerCase(), { name: c.name, text });
      }
      // A skill: the ability it goes with, then what the pack says about it and its example uses.
      const skillNames: string[] = [];
      for (const s of skills.values() as Iterable<skillEntry>) {
        const text = [s.description, s.uses && `**Example uses.** ${s.uses}`].filter(Boolean).join('\n\n');
        if (!text) continue;
        terms.set(s.name.toLowerCase(), { name: s.name, meta: `${ABILITIES[s.ability] ?? s.ability} skill`, text });
        skillNames.push(s.name);
      }
      const spellNames: string[] = [];
      for (const s of spells.values() as Iterable<spellEntry>) {
        terms.set(`spell:${s.name.toLowerCase()}`, { name: s.name, meta: spellMeta(s), text: s.shortDescription || s.description || '' });
        spellNames.push(s.name);
      }
      const featNames: string[] = [];
      for (const f of feats.values() as Iterable<featEntry>) {
        terms.set(`feat:${f.name.toLowerCase()}`, {
          name: f.name, meta: f.category ? `${titleCase(f.category)} feat` : 'Feat', text: groupsText(f.effectGroups),
        });
        featNames.push(f.name);
      }
      const languageNames: string[] = [];
      for (const l of languages.values() as Iterable<languageEntry>) {
        if (!l.description) continue;
        terms.set(`language:${l.name.toLowerCase()}`, {
          name: l.name, meta: l.rarity ? `${titleCase(l.rarity)} language` : 'Language', text: l.description,
        });
        languageNames.push(l.name);
      }
      return { terms, skills: skillNames, spells: spellNames, feats: featNames, languages: languageNames };
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
  'an action': 'action',
};

// The glossary key for a highlighted rules word, or null if the glossary doesn't define it.
// "Attack action" -> "attack", "saving throws" -> "saving throw", "DC 15" -> "difficulty class".
export function termKey(g: glossary, text: string): string | null {
  let key = text.toLowerCase();
  if (/^dc \d+$/.test(key)) key = 'difficulty class';
  key = ALIASES[key] ?? key;
  // The whole phrase first ("bonus action"), then without " action" ("attack action" -> "attack").
  for (const candidate of [key, key.replace(/ action$/, '')]) {
    if (g.terms.has(candidate)) return candidate;
    if (candidate.endsWith('s') && g.terms.has(candidate.slice(0, -1))) return candidate.slice(0, -1);
  }
  return null;
}
