/* Generated from public/schemas/skill.schema.json by scripts/gen-pack-types.mjs. Do not edit. */

/**
 * Skills denote the aspects related to the main SIX ability scores.
 */
export type SkillSchema = {
  /**
   * Namespaced content id for Skills: <packId>:skill/<slug>. The skill-to-ability mapping lives in skills.json, not here — it is game content a pack can extend or change, not schema shape.
   */
  id: string;
  name: string;
  /**
   * The ability a check with this skill is made against.
   */
  ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
  description?: string;
}[];
