/* Generated from public/schemas/language.schema.json by scripts/gen-pack-types.mjs. Do not edit. */

/**
 * Top-level array of languages. Entities rather than strings so a feature granting 'one language of your choice' can offer every loaded language, including ones a later pack adds.
 */
export type LanguageSchema = {
  /**
   * Namespaced content id for Languages: <packId>:language/<slug>
   */
  id: string;
  name: string;
  /**
   * Which table the language sits on. Character creation offers standard languages; rare ones come from features.
   */
  rarity: 'standard' | 'rare';
  /**
   * The 1d12 result that picks this language on the Standard Languages table. Omitted for Common, which every character knows, and for rare languages.
   */
  roll?: {
    min: number;
    max: number;
  };
  /**
   * Dialects whose speakers can all understand each other, as Primordial's Aquan, Auran, Ignan, and Terran.
   */
  dialects?: string[];
  description?: string;
}[];
