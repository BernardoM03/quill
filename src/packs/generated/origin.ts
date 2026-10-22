/* Generated from public/schemas/origin.schema.json by scripts/gen-pack-types.mjs. Do not edit. */

/**
 * Either a flat grant (`items`) or a pick (`count` plus `from` or `fromTypes`). The pick form is a `choice` minus the prompt: `from` is a fixed list, `fromTypes` an open pool of every loaded entity of those kinds, narrowed by `qualifiers`, so the Bard's 'any three skills' sees skills a later pack adds. `id` names the pick so `$choice:` can read it, as Soldier's starting Gaming Set matching its proficiency. Items and `from` entries are ids, or `{id, variant}` for one form of a tool.
 */
export type ProficiencyGrant = {
  id?: string;
  items?: (
    | string
    | {
        /**
         * Namespaced content id for Tools: <packId>:tool/<slug>
         */
        id: string;
        variant: string;
      }
  )[];
  count?: number;
  from?: (
    | string
    | {
        /**
         * Namespaced content id for Tools: <packId>:tool/<slug>
         */
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
/**
 * A machine-readable narrowing of when an effect applies. Qualifiers compose: an effect carrying both a `sense` and a `creatureType` qualifier applies only when both hold. Each axis is its own entry rather than a combined enum value, so 'sight' and 'against Fiends' never need a merged 'sightAgainstFiends' spelling. Every branch accepts `negate`, which inverts that one qualifier — this is what expresses 'against any target other than the grappler' without a second enum value for every exclusion.
 */
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
       * Matches if the creature is ANY of these. Set membership is an OR within this one axis, while separate qualifiers still AND across axes — so 'Fiends and Undead' is one qualifier, not two effects.
       *
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
       * Matches if the roll uses ANY of these abilities
       *
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
      /**
       * Applies only against creatures that have this condition, e.g. a creature you are Grappling.
       */
      conditionId: string;
      /**
       * Who inflicted the condition. `self` means 'Grappled by you'. Omit to match the condition regardless of who caused it. Kept on this qualifier rather than as a separate targetRelation so the binding to THIS condition is unambiguous when an effect carries more than one.
       */
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
      /**
       * Applies only to a roll made to avoid or shake off this condition - Dwarven Resilience's Advantage on 'saving throws you make to avoid or end the Poisoned condition'. The mirror of `targetCondition`, and the reason both exist: that one asks whether the creature you are rolling AGAINST already carries the condition, this one asks whether the roll itself is your attempt to escape it. Collapsing them would make the direction of a save ambiguous.
       */
      conditionId: string;
      negate?: boolean;
    }
  | {
      type: 'targetRelation';
      /**
       * How a creature relates to the character carrying the effect. `conditionSource` is the creature that caused the condition — the grappler for Grappled, the charmer for Charmed, the source of fear for Frightened. `others` is any creature that is not you, used when a rule turns on what someone else can do or perceive. `triggerCreature` is the creature involved in the event that fired the effect - the one you missed, for Studied Attacks. `target` is the creature the spell or feature targets, as Hunter's Mark's quarry. `selfOrAlly` is you or any ally, as an aura's 'you and your allies'. `random` is a creature picked at random from those eligible, as Confusion's lash-out against a random creature within reach.
       */
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
      /**
       * The surface the character must be in physical contact with. Stonecunning's 'on a stone surface or touching a stone surface' is one requirement written two ways, so contact is the whole of what this qualifier tests - there is no separate on/touching axis to choose between. Nor does it distinguish natural stone from worked, which the SRD explicitly declines to do.
       */
      material: 'stone' | 'earth' | 'sand' | 'snow' | 'ice' | 'water' | 'wood' | 'metal';
      negate?: boolean;
    }
  | {
      [k: string]: unknown;
    }
  | {
      type: 'spellSource';
      /**
       * Applies only to spells on this class's or subclass's list.
       */
      sourceId: string;
      negate?: boolean;
    }
  | {
      type: 'spellLevel';
      negate?: boolean;
      /**
       * Matches a spell of ANY listed level. 0 means cantrip.
       *
       * @minItems 1
       */
      spellLevels: [number, ...number[]];
    }
  | {
      type: 'damageType';
      negate?: boolean;
      /**
       * Matches damage of ANY of these types, as Deflect Attacks' Bludgeoning, Piercing, or Slashing.
       *
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
      /**
       * Applies only once the owning condition has reached this level. Covers thresholds that are not linear, such as Exhaustion level 6.
       */
      atLeast: number;
      negate?: boolean;
    }
  | {
      type: 'weaponProperty';
      /**
       * Matches if the weapon has ANY of these properties, so 'Two-Handed or Versatile' is one qualifier. Combine with an attackOrigin qualifier to pin melee vs ranged. This tests the weapon's static properties only. How the weapon is currently held is runtime state, not content: Great Weapon Fighting requires a two-handed grip, and the sheet or VTT checks that against the live equipment state. Same division as the range qualifier.
       *
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
       * Narrows a feat pool to ANY of these categories. Human's Versatile names origin; a class's Ability Score Improvement negates origin, leaving every feat you could qualify for.
       *
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
       * Matches if the attack comes from ANY of these sources, so Improved Critical's 'weapons and Unarmed Strikes' is one qualifier.
       *
       * @minItems 1
       */
      attackSources: ['weapon' | 'spell' | 'unarmed', ...('weapon' | 'spell' | 'unarmed')[]];
    }
  | {
      type: 'skill';
      /**
       * Matches an ability check that uses ANY of these skills.
       *
       * @minItems 1
       */
      skills: [string | string, ...(string | string)[]];
      negate?: boolean;
    }
  | {
      type: 'namedAction';
      /**
       * Matches when the action taken is ANY of these. Action Surge's 'except the Magic action' is this negated.
       *
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
      /**
       * True: at half your Hit Point maximum or lower.
       */
      bloodied?: boolean;
      /**
       * At least this many Hit Points.
       */
      minimum?: number;
      negate?: boolean;
      /**
       * Whose Hit Points. Defaults to you.
       */
      subject?: 'self' | 'target';
      /**
       * At the Hit Point maximum. False is Colossus Slayer's 'missing any of its Hit Points'.
       */
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
      /**
       * How a creature relates to the character carrying the effect. `conditionSource` is the creature that caused the condition — the grappler for Grappled, the charmer for Charmed, the source of fear for Frightened. `others` is any creature that is not you, used when a rule turns on what someone else can do or perceive. `triggerCreature` is the creature involved in the event that fired the effect - the one you missed, for Studied Attacks. `target` is the creature the spell or feature targets, as Hunter's Mark's quarry. `selfOrAlly` is you or any ally, as an aura's 'you and your allies'. `random` is a creature picked at random from those eligible, as Confusion's lash-out against a random creature within reach.
       */
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
      /**
       * Whose position the distance is measured from.
       */
      around: 'self' | 'target';
      /**
       * The nearby creature must not have this condition.
       */
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
      /**
       * Who is behind cover. Defaults to you.
       */
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
export type OriginSchema = {
  /**
   * Namespaced content id for Origins: <packId>:origin/<slug>
   */
  id: string;
  name: string;
  description?: string;
  /**
   * The abilities this origin may improve.
   */
  abilityScores?: ('STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA')[];
  /**
   * The origin feat this background grants. Resolved against feats.json at load.
   */
  featId?: string;
  skillProficiencies?: ProficiencyGrant;
  toolProficiencies?: ProficiencyGrant;
  startingEquipment?: StartingEquipment;
}[];

/**
 * Mutually exclusive kits offered at character creation. Shared by classes and origins, which print them the same way: option A is a list of items plus pocket gold, option B is gold alone.
 */
export interface StartingEquipment {
  options: {
    label: string;
    items?: EquipmentGrant[];
    gold?: number;
  }[];
}
/**
 * Some number of one item, as listed in starting equipment or a pack's contents. `variant` names an itemVariant slug; leave it off an item that has variants and the player picks the form.
 */
export interface EquipmentGrant {
  id: string;
  quantity?: number;
  /**
   * An itemVariant slug, or `$choice:` naming a proficiency pick, as Soldier's Gaming Set of the same kind as its proficiency.
   */
  variant?: string;
  /**
   * Display-only detail with no mechanical result, as in Acolyte's 'Book (prayers)'.
   */
  note?: string;
}
