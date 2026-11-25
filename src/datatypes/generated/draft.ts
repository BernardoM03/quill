/* Generated from schemas/records/draft.schema.json by scripts/gen-pack-types.mjs. Do not edit. */

export interface DraftSchema {
  version: 1;
  name: string;
  species: string | null;
  speciesChoices: ChoicePicks;
  originRules: OriginRules;
  background: string | null;
  backgroundChoices: ChoicePicks;
  class: string | null;
  classChoices: ChoicePicks;
  abilityMethod: ('standardArray' | 'pointBuy' | 'roll' | 'manual' | 'sharedManual') | null;
  abilityScores: AbilityScores;
  hpMethod: ('automatic' | 'manual') | null;
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
