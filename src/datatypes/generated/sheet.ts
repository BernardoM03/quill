/* Generated from schemas/records/sheet.schema.json by scripts/gen-pack-types.mjs. Do not edit. */

/**
 * @minItems 6
 * @maxItems 6
 */
export type AbilityRolls = [AbilityRoll, AbilityRoll, AbilityRoll, AbilityRoll, AbilityRoll, AbilityRoll];

export interface SheetSchema {
  version: 1;
  level: number;
  build: Build;
  rolls: AbilityRolls | null;
  play: Play;
}
export interface Build {
  species: string;
  speciesChoices: ChoicePicks;
  originRules: OriginRules;
  background: string;
  backgroundChoices: ChoicePicks;
  class: string;
  classChoices: ChoicePicks;
  abilityMethod: 'standardArray' | 'pointBuy' | 'roll' | 'manual' | 'sharedManual';
  abilityScores: AbilityScores;
  hpMethod: 'automatic' | 'manual';
  /**
   * @maxItems 19
   */
  hpRolls: number[];
  details: Details;
  answers?: Answers;
}
export interface ChoicePicks {
  [k: string]: string | [string, ...string[]];
}
export interface OriginRules {
  customizeOrigin?: boolean;
  originFeat?: 'background' | 'any';
  startingEquipment?: 'choice' | 'equipment' | 'gold';
}
export interface AbilityScores {
  [k: string]: number;
}
export interface Details {
  alignment?:
    | ''
    | 'Lawful Good'
    | 'Neutral Good'
    | 'Chaotic Good'
    | 'Lawful Neutral'
    | 'Neutral'
    | 'Chaotic Neutral'
    | 'Lawful Evil'
    | 'Neutral Evil'
    | 'Chaotic Evil';
  faith?: string;
  lifestyle?: string;
  gender?: string;
  age?: string;
  height?: string;
  weight?: string;
  hair?: string;
  eyes?: string;
  skin?: string;
  appearance?: string;
  personalityTraits?: string;
  ideals?: string;
  bonds?: string;
  flaws?: string;
  organizations?: string;
  allies?: string;
  enemies?: string;
  backstory?: string;
  other?: string;
}
export interface Answers {
  [k: string]: string;
}
export interface AbilityRoll {
  /**
   * @maxItems 4
   */
  dice: [] | [number] | [number, number] | [number, number, number] | [number, number, number, number];
  total: number;
}
export interface Play {
  /**
   * @maxItems 20
   */
  scoreAdjustments?: ScoreAdjustment[];
}
export interface ScoreAdjustment {
  id: string;
  name: string;
  ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
  mode: 'set' | 'atLeast' | 'add';
  value: number;
}
