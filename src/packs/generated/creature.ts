/* Generated from schemas/creature.schema.json by scripts/gen-pack-types.mjs. Do not edit. */

export type Effect = {
  [k: string]: unknown;
} & {
  type:
    | (
        | 'grantProficiency'
        | 'grantExpertise'
        | 'modifier'
        | 'setBaseAc'
        | 'grantResistance'
        | 'grantImmunity'
        | 'grantVulnerability'
        | 'grantAdvantage'
        | 'grantDisadvantage'
        | 'autoFail'
        | 'rollBonus'
        | 'cannotTarget'
        | 'cannotApproach'
        | 'preventIncrease'
        | 'loseSense'
        | 'concealFrom'
        | 'grantSpeed'
        | 'grantSpells'
        | 'applyCondition'
        | 'grantFeature'
        | 'loseAction'
        | 'loseConcentration'
        | 'autoCrit'
        | 'dropHeldItem'
        | 'initiativeSwap'
        | 'rerollDamage'
        | 'setSpellcastingAbility'
        | 'loseComponent'
        | 'grantSense'
        | 'dealDamage'
        | 'grantTemporaryHitPoints'
        | 'grantInspiration'
        | 'reduceDamage'
        | 'teleport'
        | 'setSize'
        | 'countAsSize'
        | 'setHitPointFloor'
        | 'grantAction'
        | 'moveThroughOccupiedSpace'
        | 'setRestDuration'
        | 'rerollD20'
        | 'heal'
        | 'setAttackCount'
        | 'extraAction'
        | 'grantMovement'
        | 'grantMastery'
        | 'substituteMastery'
        | 'setCritThreshold'
        | 'preventSpellcasting'
        | 'substituteAbility'
        | 'restoreUses'
        | 'overrideFeature'
        | 'loseAdvantage'
        | 'forcedMovement'
        | 'rollFloor'
        | 'increaseAbilityScore'
        | 'endCondition'
        | 'grantAttack'
        | 'chooseOptions'
        | 'grantLanguage'
        | 'saveOutcome'
        | 'limitActions'
        | 'keepCondition'
        | 'extraTurn'
        | 'replaceDamageDice'
        | 'changeDamageType'
        | 'traverseTerrain'
        | 'triggerFeature'
        | 'interruptSpell'
        | 'summon'
        | 'transform'
        | 'retarget'
        | 'emitLight'
        | 'preventHealing'
        | 'stabilize'
        | 'suppressCondition'
        | 'detect'
        | 'createZone'
        | 'waterBreathing'
        | 'maximizeDice'
        | 'dispel'
        | 'revive'
        | 'removeCurse'
        | 'autoSucceed'
        | 'addTargets'
        | 'ignoreResistance'
        | 'swapPreparedSpells'
        | 'grantCover'
        | 'restrictMovement'
        | 'shareSenses'
        | 'setAbilityScore'
        | 'setSpecies'
        | 'overrideItem'
      )
    | string;
  target?: unknown;
  value?: unknown;
  multiplier?: number;
  affects?: 'self' | 'affector' | 'others' | 'target' | 'summon';
  qualifiers?: Qualifier[];
  scaling?: ScalingRow[];
  appliesOnce?: boolean;
  castingOverrides?: CastingOverrides;
  reroll?: RerollSpec;
  /**
   * @minItems 1
   */
  area?: [AreaOfEffect, ...AreaOfEffect[]];
  save?: SavingThrow;
  trigger?: Trigger | [Trigger, Trigger, ...Trigger[]];
  frequency?: 'unlimited' | 'perTurn' | 'perRound';
  cost?: ResourceCost;
  upcast?: {
    perSlot?: DiceExpression | number;
    area?: number;
    /**
     * @minItems 1
     */
    steps?: [
      {
        minSlot: number;
        value: number | DiceExpression;
      },
      ...{
        minSlot: number;
        value: number | DiceExpression;
      }[]
    ];
  };
  duration?: Duration;
  uses?: Uses;
  increasePerUse?: {
    amount: number | string | DiceExpression;
    resetOn: 'short' | 'long' | 'dawn' | 'none' | 'dusk';
    freeUses?: number;
  };
  /**
   * @minItems 1
   */
  ignores?: ['resistance' | 'immunity' | 'reduction', ...('resistance' | 'immunity' | 'reduction')[]];
  hitPointCap?: {
    fraction: number;
  };
  check?: {
    ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
    /**
     * @minItems 1
     */
    skills?: [string, ...string[]];
    dc: SaveDc;
    onFailure?: 'fail' | 'consume';
  };
  targets?: Targets;
};
export type Qualifier =
  | {
      type: 'sense';
      negate?: boolean;
      /**
       * @minItems 1
       */
      senses: [
        'sight' | 'hearing' | 'smell' | 'touch' | 'taste',
        ...('sight' | 'hearing' | 'smell' | 'touch' | 'taste')[]
      ];
    }
  | {
      type: 'creatureType';
      /**
       * @minItems 1
       */
      creatureTypes: [
        (
          | (
              | 'aberration'
              | 'beast'
              | 'celestial'
              | 'construct'
              | 'dragon'
              | 'elemental'
              | 'fey'
              | 'fiend'
              | 'giant'
              | 'humanoid'
              | 'monstrosity'
              | 'ooze'
              | 'plant'
              | 'undead'
            )
          | string
        ),
        ...(
          | (
              | 'aberration'
              | 'beast'
              | 'celestial'
              | 'construct'
              | 'dragon'
              | 'elemental'
              | 'fey'
              | 'fiend'
              | 'giant'
              | 'humanoid'
              | 'monstrosity'
              | 'ooze'
              | 'plant'
              | 'undead'
            )
          | string
        )[]
      ];
      negate?: boolean;
    }
  | {
      type: 'ability';
      /**
       * @minItems 1
       */
      abilities: [
        ('STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA') | string,
        ...(('STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA') | string)[]
      ];
      negate?: boolean;
    }
  | {
      type: 'range';
      within: number;
      unit: 'feet' | 'miles';
      negate?: boolean;
    }
  | {
      type: 'targetCondition';
      conditionId: string;
      source?:
        | 'self'
        | 'others'
        | 'conditionSource'
        | 'ally'
        | 'enemy'
        | 'triggerCreature'
        | 'target'
        | 'selfOrAlly'
        | 'random';
      negate?: boolean;
    }
  | {
      type: 'againstCondition';
      conditionId: string;
      negate?: boolean;
    }
  | {
      type: 'targetRelation';
      relation:
        | 'self'
        | 'others'
        | 'conditionSource'
        | 'ally'
        | 'enemy'
        | 'triggerCreature'
        | 'target'
        | 'selfOrAlly'
        | 'random';
      negate?: boolean;
    }
  | {
      type: 'situationType';
      negate?: boolean;
      /**
       * @minItems 1
       */
      situationTypes: ['combat' | 'social' | 'travel', ...('combat' | 'social' | 'travel')[]];
    }
  | {
      type: 'terrain';
      material: 'stone' | 'earth' | 'sand' | 'snow' | 'ice' | 'water' | 'wood' | 'metal';
      negate?: boolean;
    }
  | {
      [k: string]: unknown;
    }
  | {
      type: 'spellSource';
      sourceId: string;
      negate?: boolean;
    }
  | {
      type: 'spellLevel';
      negate?: boolean;
      /**
       * @minItems 1
       */
      spellLevels: [number, ...number[]];
    }
  | {
      type: 'damageType';
      negate?: boolean;
      /**
       * @minItems 1
       */
      damageTypes: [
        (
          | (
              | 'acid'
              | 'bludgeoning'
              | 'cold'
              | 'fire'
              | 'force'
              | 'lightning'
              | 'necrotic'
              | 'piercing'
              | 'poison'
              | 'psychic'
              | 'radiant'
              | 'slashing'
              | 'thunder'
            )
          | string
        ),
        ...(
          | (
              | 'acid'
              | 'bludgeoning'
              | 'cold'
              | 'fire'
              | 'force'
              | 'lightning'
              | 'necrotic'
              | 'piercing'
              | 'poison'
              | 'psychic'
              | 'radiant'
              | 'slashing'
              | 'thunder'
            )
          | string
        )[]
      ];
    }
  | {
      type: 'equipment';
      /**
       * @minItems 1
       */
      equipment: [
        'armor' | 'lightArmor' | 'mediumArmor' | 'heavyArmor' | 'shield' | 'weapon',
        ...('armor' | 'lightArmor' | 'mediumArmor' | 'heavyArmor' | 'shield' | 'weapon')[]
      ];
      negate?: boolean;
    }
  | {
      type: 'conditionLevel';
      atLeast: number;
      negate?: boolean;
    }
  | {
      type: 'weaponProperty';
      /**
       * @minItems 1
       */
      weaponProperties: [
        (
          | 'ammunition'
          | 'finesse'
          | 'heavy'
          | 'light'
          | 'loading'
          | 'range'
          | 'reach'
          | 'thrown'
          | 'twoHanded'
          | 'versatile'
        ),
        ...(
          | 'ammunition'
          | 'finesse'
          | 'heavy'
          | 'light'
          | 'loading'
          | 'range'
          | 'reach'
          | 'thrown'
          | 'twoHanded'
          | 'versatile'
        )[]
      ];
      negate?: boolean;
    }
  | {
      type: 'attackRange';
      negate?: boolean;
      /**
       * @minItems 1
       */
      attackRanges: ['melee' | 'ranged', ...('melee' | 'ranged')[]];
    }
  | {
      type: 'featCategory';
      negate?: boolean;
      /**
       * @minItems 1
       */
      featCategories: [
        'origin' | 'general' | 'fightingStyle' | 'epicBoon',
        ...('origin' | 'general' | 'fightingStyle' | 'epicBoon')[]
      ];
    }
  | {
      type: 'attackSource';
      negate?: boolean;
      /**
       * @minItems 1
       */
      attackSources: ['weapon' | 'spell' | 'unarmed', ...('weapon' | 'spell' | 'unarmed')[]];
    }
  | {
      type: 'skill';
      /**
       * @minItems 1
       */
      skills: [string | string, ...(string | string)[]];
      negate?: boolean;
    }
  | {
      type: 'namedAction';
      /**
       * @minItems 1
       */
      actions: [
        (
          | (
              | 'attack'
              | 'dash'
              | 'disengage'
              | 'dodge'
              | 'help'
              | 'hide'
              | 'influence'
              | 'magic'
              | 'ready'
              | 'search'
              | 'study'
              | 'utilize'
            )
          | string
        ),
        ...(
          | (
              | 'attack'
              | 'dash'
              | 'disengage'
              | 'dodge'
              | 'help'
              | 'hide'
              | 'influence'
              | 'magic'
              | 'ready'
              | 'search'
              | 'study'
              | 'utilize'
            )
          | string
        )[]
      ];
      negate?: boolean;
    }
  | {
      type: 'hitPoints';
      bloodied?: boolean;
      minimum?: number;
      negate?: boolean;
      subject?: 'self' | 'target';
      atMaximum?: boolean;
    }
  | {
      type: 'anyOf';
      /**
       * @minItems 2
       */
      qualifiers: [Qualifier, Qualifier, ...Qualifier[]];
      negate?: boolean;
    }
  | {
      type: 'allOf';
      /**
       * @minItems 2
       */
      qualifiers: [Qualifier, Qualifier, ...Qualifier[]];
      negate?: boolean;
    }
  | {
      type: 'rollMode';
      mode: 'advantage' | 'disadvantage';
      negate?: boolean;
    }
  | {
      type: 'nearbyCreature';
      relation:
        | 'self'
        | 'others'
        | 'conditionSource'
        | 'ally'
        | 'enemy'
        | 'triggerCreature'
        | 'target'
        | 'selfOrAlly'
        | 'random';
      within: number;
      around: 'self' | 'target';
      withoutCondition?: string;
      negate?: boolean;
    }
  | {
      type: 'movedThisTurn';
      negate?: boolean;
    }
  | {
      type: 'proficient';
      negate?: boolean;
    }
  | {
      type: 'cover';
      atLeast: 'half' | 'threeQuarters' | 'total';
      negate?: boolean;
      subject?: 'self' | 'target';
    }
  | {
      type: 'weaponCategory';
      /**
       * @minItems 1
       */
      categories: ['simple' | 'martial', ...('simple' | 'martial')[]];
      negate?: boolean;
    }
  | {
      type: 'classLevel';
      atLeast: number;
      negate?: boolean;
    }
  | {
      type: 'saveResult';
      result: 'success' | 'failure';
      negate?: boolean;
    }
  | {
      type: 'weaponKind';
      /**
       * @minItems 1
       */
      itemIds: [string, ...string[]];
      negate?: boolean;
    }
  | {
      type: 'environment';
      /**
       * @minItems 1
       */
      hazards: [
        'extremeCold' | 'extremeHeat' | 'strongWind' | 'heavyPrecipitation' | 'highAltitude' | 'deepWater',
        ...('extremeCold' | 'extremeHeat' | 'strongWind' | 'heavyPrecipitation' | 'highAltitude' | 'deepWater')[]
      ];
      negate?: boolean;
    }
  | {
      type: 'spell';
      /**
       * @minItems 1
       */
      spellIds: [string | string, ...(string | string)[]];
      negate?: boolean;
    }
  | {
      type: 'affectedBy';
      /**
       * @minItems 1
       */
      spellIds: [string, ...string[]];
      negate?: boolean;
    }
  | {
      type: 'opportunityAttack';
      negate?: boolean;
    }
  | {
      type: 'lightLevel';
      /**
       * @minItems 1
       */
      levels: ['bright' | 'dim' | 'darkness', ...('bright' | 'dim' | 'darkness')[]];
      negate?: boolean;
    }
  | {
      type: 'spellSchool';
      /**
       * @minItems 1
       */
      schools: [
        (
          | 'abjuration'
          | 'conjuration'
          | 'divination'
          | 'enchantment'
          | 'evocation'
          | 'illusion'
          | 'necromancy'
          | 'transmutation'
        ),
        ...(
          | 'abjuration'
          | 'conjuration'
          | 'divination'
          | 'enchantment'
          | 'evocation'
          | 'illusion'
          | 'necromancy'
          | 'transmutation'
        )[]
      ];
      negate?: boolean;
    }
  | {
      type: 'knowsOption';
      optionId: string;
      negate?: boolean;
    }
  | {
      type: 'bondedWeapon';
      negate?: boolean;
    }
  | {
      type: 'challengeRating';
      atMost: number | string;
      negate?: boolean;
    }
  | {
      type: 'hasSpeed';
      /**
       * @minItems 1
       */
      speeds: [
        'base' | 'walk' | 'fly' | 'swim' | 'climb' | 'burrow',
        ...('base' | 'walk' | 'fly' | 'swim' | 'climb' | 'burrow')[]
      ];
      negate?: boolean;
    }
  | {
      type: 'damageRemaining';
      atMost: number;
      negate?: boolean;
    }
  | {
      type: 'usedFeature';
      featureId: string;
      negate?: boolean;
    }
  | {
      type: 'spellMaterial';
      costly?: boolean;
      consumed?: boolean;
      negate?: boolean;
    }
  | {
      type: 'elapsedRounds';
      atLeast?: number;
      atMost?: number;
      negate?: boolean;
    }
  | {
      type: 'rollPurpose';
      /**
       * @minItems 1
       */
      purposes: ['remainMounted', ...'remainMounted'[]];
      negate?: boolean;
    }
  | {
      type: 'usingItem';
      /**
       * @minItems 1
       */
      kinds: ['magicItem' | 'spellScroll', ...('magicItem' | 'spellScroll')[]];
      negate?: boolean;
    }
  | {
      type: 'thisItem';
      negate?: boolean;
    }
  | {
      type: 'species';
      /**
       * @minItems 1
       */
      speciesIds: [string, ...string[]];
      negate?: boolean;
    }
  | {
      type: 'magicalSource';
      /**
       * @minItems 1
       */
      kinds: ['spell' | 'magicalEffect', ...('spell' | 'magicalEffect')[]];
      negate?: boolean;
    }
  | {
      type: 'poolRemaining';
      pool: string;
      atLeast: number;
      negate?: boolean;
    };
export type RerollSpec = {
  [k: string]: unknown;
} & {
  mode: 'reroll' | 'minimum' | 'explode';
  /**
   * @minItems 1
   */
  triggerValues?: [number, ...number[]];
  dice?: ('each' | 'all') | number | string;
  keep?: 'new' | 'best' | 'either';
  minimum?: number;
  frequency?: 'unlimited' | 'perAttack' | 'perCast' | 'perTurn' | 'perRound';
  bonus?: number | string;
};
export type SaveDc = {
  base?: number;
  ability?: ('STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA') | string;
  proficiency?: boolean;
  fixed?: number;
  increasePerUse?: {
    amount: number;
    /**
     * @minItems 1
     */
    resetOn: ['short' | 'long' | 'dawn' | 'none' | 'dusk', ...('short' | 'long' | 'dawn' | 'none' | 'dusk')[]];
  };
  modifier?: number | string;
} & {
  [k: string]: unknown;
};
export type ResourceCost = {
  featureId?: string;
  resource?: string;
  amount: number | string;
  refundOnFailure?: boolean;
  unit?: 'uses' | 'dice';
  slotLevel?: number;
  recoverAfter?: {
    rests: number | DiceExpression;
    rest: 'short' | 'long' | 'dawn' | 'none' | 'dusk';
  };
  maxAmount?: number | string;
} & {
  [k: string]: unknown;
};
export type CreatureSchema = Creature[];

export interface Creature {
  id: string;
  name: string;
  size:
    | ('tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan')
    | [
        'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan',
        'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan',
        ...('tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan')[]
      ];
  creatureType:
    | 'aberration'
    | 'beast'
    | 'celestial'
    | 'construct'
    | 'dragon'
    | 'elemental'
    | 'fey'
    | 'fiend'
    | 'giant'
    | 'humanoid'
    | 'monstrosity'
    | 'ooze'
    | 'plant'
    | 'undead';
  tags?: string[];
  alignment?: string;
  armorClass: number;
  hitPoints: {
    average: number;
    dice: DiceExpression;
  };
  speed: {
    walk?: number;
    fly?: number;
    swim?: number;
    climb?: number;
    burrow?: number;
    hover?: boolean;
  };
  initiative?: {
    modifier: number;
    score: number;
  };
  abilities: {
    STR: {
      score: number;
      modifier: number;
      save: number;
    };
    DEX: {
      score: number;
      modifier: number;
      save: number;
    };
    CON: {
      score: number;
      modifier: number;
      save: number;
    };
    INT: {
      score: number;
      modifier: number;
      save: number;
    };
    WIS: {
      score: number;
      modifier: number;
      save: number;
    };
    CHA: {
      score: number;
      modifier: number;
      save: number;
    };
  };
  skills?: {
    skillId: string;
    bonus: number;
  }[];
  resistances?: {
    damage?: (
      | 'acid'
      | 'bludgeoning'
      | 'cold'
      | 'fire'
      | 'force'
      | 'lightning'
      | 'necrotic'
      | 'piercing'
      | 'poison'
      | 'psychic'
      | 'radiant'
      | 'slashing'
      | 'thunder'
    )[];
    conditions?: string[];
  };
  vulnerabilities?: {
    damage?: (
      | 'acid'
      | 'bludgeoning'
      | 'cold'
      | 'fire'
      | 'force'
      | 'lightning'
      | 'necrotic'
      | 'piercing'
      | 'poison'
      | 'psychic'
      | 'radiant'
      | 'slashing'
      | 'thunder'
    )[];
    conditions?: string[];
  };
  immunities?: {
    damage?: (
      | 'acid'
      | 'bludgeoning'
      | 'cold'
      | 'fire'
      | 'force'
      | 'lightning'
      | 'necrotic'
      | 'piercing'
      | 'poison'
      | 'psychic'
      | 'radiant'
      | 'slashing'
      | 'thunder'
    )[];
    conditions?: string[];
  };
  senses?: {
    sense: 'darkvision' | 'blindsight' | 'tremorsense' | 'truesight';
    range: number;
  }[];
  passivePerception?: number;
  languages?: string;
  challengeRating: number;
  xp?: number;
  proficiencyBonus?: number;
  traits?: Action[];
  actions?: Action[];
  bonusActions?: Action[];
  reactions?: Action[];
  legendaryActions?: Action[];
}
export interface DiceExpression {
  count: number | string;
  die: ('d3' | 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100') | string;
  modifier?: number | string | [number | string, number | string, ...(number | string)[]];
  minimum?: number;
  minimumCount?: number;
  maximumCount?: number;
  countMultiplier?: number;
}
export interface Action {
  name: string;
  description: string;
  attack?: {
    kind: 'melee' | 'ranged' | 'meleeOrRanged';
    toHit: number;
    reach?: number;
    range?: {
      normal: number;
      long: number;
    };
  };
  damage?: {
    average: number;
    dice: DiceExpression;
    damageType:
      | 'acid'
      | 'bludgeoning'
      | 'cold'
      | 'fire'
      | 'force'
      | 'lightning'
      | 'necrotic'
      | 'piercing'
      | 'poison'
      | 'psychic'
      | 'radiant'
      | 'slashing'
      | 'thunder';
  }[];
  save?: {
    ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
    dc: number;
  };
  effects?: Effect[];
  escapeDc?: number;
}
export interface ScalingRow {
  level: number;
  value: (number | string) | DiceExpression;
  key?: string;
}
export interface CastingOverrides {
  ignoreMaterialComponent?: boolean;
  alwaysPrepared?: boolean;
  freeCasts?: {
    count: number | string | 'atWill';
    recharge: 'short' | 'long' | 'dawn' | 'none' | 'dusk';
  };
  addToSpellbook?: boolean;
  ignoreConcentration?: boolean;
  duration?: Duration;
  castLevel?: number;
  saveDc?: number;
  attackBonus?: number;
  useOwnAbility?: boolean;
  upcastCost?: {
    perLevel: number;
    maxLevel?: number;
  };
}
export interface Duration {
  value: number | string | DiceExpression;
  unit:
    | 'round'
    | 'minute'
    | 'hour'
    | 'day'
    | 'instantaneous'
    | 'untilDispelled'
    | 'special'
    | 'year'
    | 'untilRest'
    | 'permanent';
  rest?: 'short' | 'long' | 'dawn' | 'none' | 'dusk';
}
export interface AreaOfEffect {
  shape: 'cone' | 'line' | 'sphere' | 'cube' | 'cylinder' | 'emanation' | 'wall' | 'ringWall';
  size: number | string;
  width?: number;
  height?: number;
}
export interface SavingThrow {
  ability:
    | ('STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA')
    | [
        'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA',
        'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA',
        ...('STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA')[]
      ];
  dc: SaveDc;
  onSuccess: 'half' | 'negate' | 'none';
  repeat?: Trigger | [Trigger, Trigger, ...Trigger[]];
  /**
   * @minItems 1
   */
  endsOn?: [Trigger, ...Trigger[]];
  ignoresCover?: boolean;
  escape?: {
    ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
    /**
     * @minItems 1
     */
    skills?: [string, ...string[]];
    byOthers?: boolean;
  };
}
export interface Trigger {
  event:
    | 'hitWithAttack'
    | 'takeDamage'
    | 'reducedToZeroHitPoints'
    | 'finishRest'
    | 'takeAction'
    | 'startTurn'
    | 'endTurn'
    | 'failRoll'
    | 'criticalHit'
    | 'useFeature'
    | 'gainLevel'
    | 'makeAttackRoll'
    | 'forceSave'
    | 'rollInitiative'
    | 'hitByAttack'
    | 'fall'
    | 'enterArea'
    | 'endTurnInArea'
    | 'moveInArea'
    | 'effectEnds'
    | 'castSpell'
    | 'restoreHitPoints'
    | 'reduceEnemyToZero'
    | 'dealDamage'
    | 'expendCharges'
    | 'dayEnds'
    | 'leaveReach'
    | 'timePasses'
    | 'spendHitPointDie';
  rest?: 'short' | 'long' | 'dawn' | 'none' | 'dusk';
  action?:
    | (
        | 'attack'
        | 'dash'
        | 'disengage'
        | 'dodge'
        | 'help'
        | 'hide'
        | 'influence'
        | 'magic'
        | 'ready'
        | 'search'
        | 'study'
        | 'utilize'
      )
    | string;
  optional?: boolean;
  roll?:
    | 'd20Test'
    | 'attackRoll'
    | 'damageRoll'
    | 'savingThrow'
    | 'abilityCheck'
    | 'initiative'
    | 'deathSave'
    | 'concentration';
  featureId?: string;
  actionType?: 'action' | 'bonusAction' | 'reaction';
  spellId?: string;
  subject?: 'self' | 'target' | 'summon';
  every?: Duration;
}
export interface Uses {
  max: number | string;
  recharge: 'short' | 'long' | 'dawn' | 'none' | 'dusk';
  recover?: {
    rest: 'short' | 'long' | 'dawn' | 'none' | 'dusk';
    amount: number;
  };
  perTurn?: number;
  alternativeCost?: ResourceCost;
  minimum?: number;
  multiplier?: number;
  pool?: boolean;
}
export interface Targets {
  count: number | string;
  minimum?: number;
  kind: 'creature' | 'object' | 'creatureOrObject' | 'point';
}
