/* Generated from schemas/language.schema.json by scripts/gen-pack-types.mjs. Do not edit. */

export type LanguageSchema = {
  id: string;
  name: string;
  rarity: 'standard' | 'rare';
  roll?: {
    min: number;
    max: number;
  };
  dialects?: string[];
  description?: string;
}[];
