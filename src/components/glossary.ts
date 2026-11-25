import { loadCollection } from '../packs/loader';

// Definitions for highlighted words, built from the packs' rules, conditions, skills, spells, feats and languages.
// The glossary is loaded once per page.
export interface Definition {
  name: string;
  // A line under the name, such as a spell's level, school and casting time.
  meta?: string;
  // Markdown rendered with RulesText.
  text: string;
}

export interface Glossary {
  // Keyed by lowercase name, with prefixes like "spell:" so a spell named like a rule (Darkness) doesn't replace it.
  terms: Map<string, Definition>;
  // Names to look for in rules text, by kind.
  skills: string[];
  spells: string[];
  feats: string[];
  languages: string[];
}

interface RuleEntry { name: string; description?: string }
interface ConditionEntry { name: string; effectGroups?: { name: string; description?: string }[] }
interface SpellEntry {
  name: string; level: number; school?: string; castingTime?: { type?: string; value?: number; unit?: string };
  range?: { type?: string; distance?: number; unit?: string }; components?: string[]; concentration?: boolean;
  ritual?: boolean; duration?: { value?: number; unit?: string }; description?: string; shortDescription?: string;
}
interface FeatEntry { name: string; category?: string; effectGroups?: { name: string; description?: string }[] }
interface SkillEntry { name: string; ability: string; description?: string; uses?: string }
interface LanguageEntry { name: string; rarity?: string; description?: string }

const ABILITIES: Record<string, string> = {
  STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma',
};

// "bonusAction" becomes "Bonus Action".
const titleCase = (camelCase: string) => camelCase.replace(/([A-Z])/g, ' $1').replace(/^./, first => first.toUpperCase()).trim();
// 1st, 2nd, 3rd, 4th and so on, with 11th to 13th as exceptions.
const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n / 10) === 1 ? 0 : n % 10]}`;

// For example "2nd-level Evocation · Action · 90 feet · V, S, M · Instantaneous".
function spellMeta(spell: SpellEntry): string {
  const school = titleCase(spell.school ?? '');
  const parts = [spell.level === 0 ? `${school} cantrip` : `${ordinal(spell.level)}-level ${school}`];
  const time = spell.castingTime;
  if (time?.type) parts.push(time.value ? `${time.value} ${time.unit ?? titleCase(time.type)}` : titleCase(time.type));
  const range = spell.range;
  if (range?.distance) parts.push(`${range.distance} ${range.unit ?? 'feet'}`);
  else if (range?.type) parts.push(titleCase(range.type));
  if (spell.components?.length) parts.push(spell.components.map(component => component[0].toUpperCase()).join(', '));
  const duration = spell.duration;
  if (duration?.unit) {
    const length = duration.value ? `${duration.value} ${duration.unit}` : titleCase(duration.unit);
    parts.push(`${spell.concentration ? 'Concentration, ' : ''}${length}`);
  }
  if (spell.ritual) parts.push('Ritual');
  return parts.join(' · ');
}

const groupsText = (groups: { name: string; description?: string }[] = []) =>
  groups.map(group => `**${group.name}.** ${group.description ?? ''}`).join('\n\n');

let glossaryPromise: Promise<Glossary> | null = null;

export function loadGlossary(): Promise<Glossary> {
  if (!glossaryPromise) {
    glossaryPromise = Promise.all([
      loadCollection('rules'), loadCollection('conditions'), loadCollection('spells'),
      loadCollection('feats'), loadCollection('languages'), loadCollection('skills'),
    ]).then(([rules, conditions, spells, feats, languages, skills]) => {
      const terms = new Map<string, Definition>();
      for (const rule of rules.values() as Iterable<RuleEntry>) {
        if (rule.description) terms.set(rule.name.toLowerCase(), { name: rule.name, text: rule.description });
      }
      // A condition is defined by its effects, one bold-led paragraph each.
      for (const condition of conditions.values() as Iterable<ConditionEntry>) {
        const text = groupsText(condition.effectGroups);
        if (text) terms.set(condition.name.toLowerCase(), { name: condition.name, text });
      }
      const skillNames: string[] = [];
      for (const skill of skills.values() as Iterable<SkillEntry>) {
        const text = [skill.description, skill.uses && `**Example uses.** ${skill.uses}`].filter(Boolean).join('\n\n');
        if (!text) continue;
        terms.set(skill.name.toLowerCase(), { name: skill.name, meta: `${ABILITIES[skill.ability] ?? skill.ability} skill`, text });
        skillNames.push(skill.name);
      }
      const spellNames: string[] = [];
      for (const spell of spells.values() as Iterable<SpellEntry>) {
        terms.set(`spell:${spell.name.toLowerCase()}`, { name: spell.name, meta: spellMeta(spell), text: spell.shortDescription || spell.description || '' });
        spellNames.push(spell.name);
      }
      const featNames: string[] = [];
      for (const feat of feats.values() as Iterable<FeatEntry>) {
        terms.set(`feat:${feat.name.toLowerCase()}`, {
          name: feat.name, meta: feat.category ? `${titleCase(feat.category)} feat` : 'Feat', text: groupsText(feat.effectGroups),
        });
        featNames.push(feat.name);
      }
      const languageNames: string[] = [];
      for (const language of languages.values() as Iterable<LanguageEntry>) {
        if (!language.description) continue;
        terms.set(`language:${language.name.toLowerCase()}`, {
          name: language.name, meta: language.rarity ? `${titleCase(language.rarity)} language` : 'Language', text: language.description,
        });
        languageNames.push(language.name);
      }
      return { terms, skills: skillNames, spells: spellNames, feats: featNames, languages: languageNames };
    });
    // A failed load is forgotten so the next call retries.
    glossaryPromise.catch(() => { glossaryPromise = null; });
  }
  return glossaryPromise;
}

// Phrases in rules text mapped to the glossary entry they mean, where the names differ.
const ALIASES: Record<string, string> = {
  'proficiency bonus': 'proficiency',
  'hit point maximum': 'hit points',
  'hit dice': 'hit point dice',
  'an action': 'action',
};

// The glossary key for a highlighted rules word, or null if it isn't defined.
// For example "Attack action" gives "attack", "saving throws" gives "saving throw" and "DC 15" gives "difficulty class".
export function termKey(glossary: Glossary, text: string): string | null {
  let key = text.toLowerCase();
  if (/^dc \d+$/.test(key)) key = 'difficulty class';
  key = ALIASES[key] ?? key;
  // Try the whole phrase first, then without a trailing " action", each also without a plural s.
  for (const candidate of [key, key.replace(/ action$/, '')]) {
    if (glossary.terms.has(candidate)) return candidate;
    if (candidate.endsWith('s') && glossary.terms.has(candidate.slice(0, -1))) return candidate.slice(0, -1);
  }
  return null;
}
