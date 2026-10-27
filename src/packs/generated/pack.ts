/* Generated from public/schemas/pack.schema.json by scripts/gen-pack-types.mjs. Do not edit. */

export type PackSchema = {
  [k: string]: unknown;
} & {
  id: string;
  name: string;
  version: string;
  license: string;
  attribution?: string;
  providesEffectTypes?: string[];
  provides: (
    | 'classes'
    | 'subclasses'
    | 'spells'
    | 'species'
    | 'origins'
    | 'feats'
    | 'equipment'
    | 'skills'
    | 'conditions'
    | 'tools'
    | 'languages'
    | 'creatures'
    | 'rules'
    | 'magic-items'
  )[];
  modifications?: string;
  characterCreation?: {
    languages?: {
      items?: string[];
      choose?: ProficiencyGrant;
    };
  };
};
export type ProficiencyGrant = {
  id?: string;
  items?: (
    | string
    | {
        id: string;
        variant: string;
      }
  )[];
  count?: number;
  from?: (
    | string
    | {
        id: string;
        variant: string;
      }
  )[];
  /**
   * @minItems 1
   */
  fromTypes?: [
    (
      | 'skill'
      | 'tool'
      | 'spell'
      | 'feat'
      | 'class'
      | 'subclass'
      | 'species'
      | 'origin'
      | 'condition'
      | 'language'
      | 'equipment'
      | 'creature'
      | 'rule'
      | 'magicItem'
    ),
    ...(
      | 'skill'
      | 'tool'
      | 'spell'
      | 'feat'
      | 'class'
      | 'subclass'
      | 'species'
      | 'origin'
      | 'condition'
      | 'language'
      | 'equipment'
      | 'creature'
      | 'rule'
      | 'magicItem'
    )[]
  ];
  qualifiers?: Qualifier[];
} & {
  [k: string]: unknown;
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
