/* Generated from schemas/records/campaign-settings.schema.json by scripts/gen-pack-types.mjs. Do not edit. */

export interface CampaignSettingsSchema {
  rules?: Rules;
  /**
   * @maxItems 20
   */
  questions?: Question[];
}
export interface Rules {
  optionalClassFeatures?: boolean;
  customizeOrigin?: boolean;
  advancement?: 'xp' | 'milestone';
  milestoneLevel?: number;
  hitPoints?: 'automatic' | 'manual';
  featPrerequisites?: boolean;
  allowMulticlass?: boolean;
  multiclassPrerequisites?: boolean;
  encumbrance?: boolean;
  ignoreCoinWeight?: boolean;
  abilityScoreMethod?: 'standardArray' | 'pointBuy' | 'roll' | 'manual' | 'sharedManual';
  pointBuyBudget?: number;
  /**
   * @minItems 6
   * @maxItems 6
   */
  sharedScores?: [number, number, number, number, number, number];
  startingEquipment?: 'choice' | 'equipment' | 'gold';
  originFeat?: 'background' | 'any';
  characterApproval?: boolean;
}
export interface Question {
  id: string;
  prompt: string;
  required: boolean;
}
