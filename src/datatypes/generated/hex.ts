/* Generated from schemas/records/hex.schema.json by scripts/gen-pack-types.mjs. Do not edit. */

export type EncounterKind = 'combat' | 'social' | 'treasure' | 'hazard' | 'exploration';

export interface HexSchema {
  status: 'hidden' | 'scouted' | 'visited';
  name: string;
  description: string;
  notes: string;
  /**
   * @maxItems 20
   */
  encounters: SetEncounter[];
  /**
   * @maxItems 30
   */
  randomEncounters: RandomEncounter[];
}
export interface SetEncounter {
  kind: EncounterKind;
  title: string;
  notes: string;
  /**
   * @maxItems 12
   */
  creatures: EncounterCreature[];
  resolved: boolean;
}
export interface EncounterCreature {
  creature: string;
  count: number;
}
export interface RandomEncounter {
  kind: EncounterKind;
  title: string;
  notes: string;
  /**
   * @maxItems 12
   */
  creatures: EncounterCreature[];
  weight: number;
}
