/* Generated from schemas/skill.schema.json by scripts/gen-pack-types.mjs. Do not edit. */

export type SkillSchema = {
  id: string;
  name: string;
  ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
  description?: string;
}[];
