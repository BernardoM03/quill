// Entry types for each pack collection, derived from the generated schema types.
// Regenerate with `npm run gen-types` after editing public/schemas.
import type { ClassSchema } from './generated/class';
import type { ConditionsSchema } from './generated/conditions';
import type { CreatureSchema } from './generated/creature';
import type { EquipmentSchema } from './generated/equipment';
import type { FeatSchema } from './generated/feat';
import type { LanguageSchema } from './generated/language';
import type { MagicItemSchema } from './generated/magic-item';
import type { OriginSchema } from './generated/origin';
import type { PackSchema } from './generated/pack';
import type { RuleSchema } from './generated/rule';
import type { SkillSchema } from './generated/skill';
import type { SpeciesSchema } from './generated/species';
import type { SpellSchema } from './generated/spell';
import type { SubclassSchema } from './generated/subclass';
import type { ToolSchema } from './generated/tool';

export type PackManifest = PackSchema;

// Keyed by the collection names a pack.json lists in `provides`
// the collection file names (`magic-items` -> magic-items.json).
export interface CollectionEntries {
  classes: ClassSchema[number];
  subclasses: SubclassSchema[number];
  spells: SpellSchema[number];
  species: SpeciesSchema[number];
  origins: OriginSchema[number];
  feats: FeatSchema[number];
  equipment: EquipmentSchema[number];
  conditions: ConditionsSchema[number];
  skills: SkillSchema[number];
  tools: ToolSchema[number];
  languages: LanguageSchema[number];
  creatures: CreatureSchema[number];
  rules: RuleSchema[number];
  'magic-items': MagicItemSchema[number];
}

export type CollectionName = keyof CollectionEntries;
export type Entry<C extends CollectionName> = CollectionEntries[C];
