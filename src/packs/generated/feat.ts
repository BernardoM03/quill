/* Generated from public/schemas/feat.schema.json by scripts/gen-pack-types.mjs. Do not edit. */

/**
 * One requirement that must be met before the feat can be taken. Discriminated on `type`.
 */
export type Prerequisite =
  | {
      type: 'ability';
      ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
      minimum: number;
    }
  | {
      type: 'level';
      minimum: number;
    }
  | {
      type: 'feat';
      /**
       * Namespaced content id for Feats: <packId>:feat/<slug>
       */
      featId: string;
    }
  | {
      type: 'proficiency';
      proficiency: string;
    }
  | {
      type: 'spellcasting';
      /**
       * Free text, e.g. 'Spellcasting or Pact Magic feature'. Display-only; not evaluated.
       */
      note?: string;
    }
  | {
      type: 'any';
      /**
       * Satisfied when at least one nested prerequisite is met. Covers disjunctions such as Grappler's 'Strength or Dexterity 13+'.
       *
       * @minItems 2
       */
      of: [Prerequisite, Prerequisite, ...Prerequisite[]];
    };
/**
 * Machine-readable half of a feature, feat, or condition. There is no prose field: every clause with a mechanical consequence must be expressible here, because a display-only string is silently dropped by any consumer trying to automate. Direction, scope, and timing are expressed compositionally via `affects`, `qualifiers`, `scaling`, and the owning feature's `duration` — never baked into the type name.
 */
export type Effect = {
  [k: string]: unknown;
} & {
  /**
   * A core effect type, or a namespaced id declared by the pack that introduces it (`homebrew:effect/soul-burn`). The schema validates the form; the loader verifies that any namespaced type was declared in some loaded pack's `providesEffectTypes`. This is what lets a third-party pack introduce mechanics without editing these schemas.
   */
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
  /**
   * What the effect applies to: a damage type, a speed type, a roll, a stat, or a content id. Stat names are camelCase (armorClass, hitPointMaximum, baseSpeed). Use `modifier` to adjust a stat and `grantSpeed` to set a speed outright; the two are different operations, not duplicates. An array where the effect applies to a set, as `loseSense` does. Deliberately untyped here, since the allOf pairs narrow it per effect type and a base `type` would make an array target unsatisfiable.
   */
  target?: {
    [k: string]: unknown;
  };
  /**
   * Shape depends on `type`; see the allOf constraints below. Unconstrained for effect types that do not yet have an if/then pair.
   */
  value?: {
    [k: string]: unknown;
  };
  /**
   * Scales `value` when it is a derived quantity. `value: "$derived:exhaustionLevel"` with `multiplier: -2` is 'reduced by 2 times your Exhaustion level'. Omit when `value` is already the final amount. Also doubles a derived value outright, as Relentless Rage's Hit Points equal to twice your Barbarian level.
   */
  multiplier?: number;
  /**
   * WHO performs the affected roll. Defaults to `self` when absent. This axis answers only 'whose roll is it'; restrict WHOM the roll is against with a `targetRelation` qualifier instead. Keeping the two axes separate is deliberate — compounding them ('selfAgainstAffector') multiplies enum values and cannot express exclusions like 'against any target other than the grappler'. `target` is whoever the spell or feature targets, as Bless's targets adding 1d4 to their own rolls. `affector` is the creature that caused the effect: the source of a condition, or the creature whose action fired a trigger, as Multiattack Defense's attacker. `summon` is a creature you summoned with the spell or feature named by a `spell` or `sourceFeature` qualifier, as Investment of the Chain Master's familiar.
   */
  affects?: 'self' | 'affector' | 'others' | 'target' | 'summon';
  /**
   * Machine-readable narrowings, ANDed together. Every restriction on when this effect applies must appear here.
   */
  qualifiers?: Qualifier[];
  /**
   * The effect's value at each character level, when it grows. Stated explicitly per level rather than as a formula, matching the class progression tables.
   */
  scaling?: ScalingRow[];
  /**
   * True when the effect applies to a single roll of the triggering event rather than every roll, e.g. 'add your Charisma modifier to one damage roll of that spell'.
   */
  appliesOnce?: boolean;
  castingOverrides?: CastingOverrides;
  reroll?: RerollSpec;
  /**
   * The region(s) the effect fills. More than one entry means the shape is picked at the moment of use, as in Breath Weapon's 'either a 15-foot Cone or a 30-foot Line ... (choose the shape each time)'. Deliberately not a `choice`: a choice is settled once when the feature is gained, this is re-answered on every use.
   *
   * @minItems 1
   */
  area?: [AreaOfEffect, ...AreaOfEffect[]];
  save?: SavingThrow;
  /**
   * The event that fires the effect, or a list where any of several events fires it, as Spirit Guardians' damage when a creature enters the Emanation or ends its turn there.
   */
  trigger?: Trigger | [Trigger, Trigger, ...Trigger[]];
  /**
   * How often the effect can apply. Frenzy hits only the first target you hit on your turn: `perTurn`. Defaults to `unlimited`.
   */
  frequency?: 'unlimited' | 'perTurn' | 'perRound';
  /**
   * What applying this one effect spends, when the rest of the feature is free. Disciplined Survivor's proficiency costs nothing; its reroll costs 1 Focus Point.
   */
  cost?: ResourceCost;
  /**
   * How the effect grows when its spell is cast with a higher-level slot. `perSlot` is added to `value` for each slot level above the spell's, as Fireball's 1d6.
   */
  upcast?: {
    perSlot?: DiceExpression | number;
    /**
     * Feet added to the area's size for each slot level above the spell's, as Fog Cloud's 20.
     */
    area?: number;
    /**
     * The value from a slot level up, for growth that jumps rather than adding per slot: Magic Weapon is +2 from level 3 and +3 from level 6.
     *
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
  /**
   * How long this one effect lasts when it outlives, or differs from, its spell or feature: Ray of Frost is instantaneous but its slow lasts until the start of your next turn (1 round).
   */
  duration?: Duration;
  uses?: Uses;
  /**
   * The effect grows each time it fires before `resetOn`, and skips the first `freeUses` uses. Overchannel's backlash is nothing the first time, then 2d12 per slot level, then 1d12 more per level each time after.
   */
  increasePerUse?: {
    amount: number | string | DiceExpression;
    /**
     *  `dusk` is the Robe of Stars' daily return of stars.
     */
    resetOn: 'short' | 'long' | 'dawn' | 'none' | 'dusk';
    freeUses?: number;
  };
  /**
   * Defenses this damage passes through, as Overchannel's backlash ignoring Resistance and Immunity, or Wish's stress damage that can't be reduced.
   *
   * @minItems 1
   */
  ignores?: ['resistance' | 'immunity' | 'reduction', ...('resistance' | 'immunity' | 'reduction')[]];
  /**
   * Healing stops once the creature reaches this share of its Hit Point maximum, as Preserve Life's half.
   */
  hitPointCap?: {
    fraction: number;
  };
  /**
   * An ability check you must pass before the effect happens, as Use Magic Device's Intelligence (Arcana) check to cast a higher-level scroll. `onFailure: consume` loses the item anyway.
   */
  check?: {
    ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
    /**
     * @minItems 1
     */
    skills?: [string, ...string[]];
    dc: SaveDc;
    onFailure?: 'fail' | 'consume';
  };
  /**
   * How many targets this one effect picks, when it differs from its spell, as Storm of Vengeance's six lightning bolts on the third turn.
   */
  targets?: Targets;
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
/**
 * How damage dice are re-rolled or floored. Covers both shapes because they express the same intent — suppress low damage rolls — and consumers apply them at the same moment: after the dice land, before the total is used. `mode: reroll` rolls again; `mode: minimum` leaves the die alone and treats anything below the floor as the floor. Narrow WHICH damage this applies to with qualifiers (damageType, spellSource, ...), not with fields here.
 */
export type RerollSpec = {
  [k: string]: unknown;
} & {
  /**
   * `reroll` rolls the die again. `minimum` never rerolls; a rolled value below `minimum` counts as `minimum`. `explode` rolls one more die and adds it whenever a die shows a `triggerValues` result, up to `dice` extra dice, as Sorcerous Burst.
   */
  mode: 'reroll' | 'minimum' | 'explode';
  /**
   * Rolled values that qualify, e.g. [1, 2]. Omit to mean any value qualifies.
   *
   * @minItems 1
   */
  triggerValues?: [number, ...number[]];
  /**
   * How many dice are affected. `each` treats every qualifying die independently. `all` rerolls the whole damage roll as a set, so `keep` compares totals rather than single dice. A number or $derived: value caps how many may be chosen.
   */
  dice?: ('each' | 'all') | number | string;
  /**
   * `new` forces the second result. `best` lets the roller choose the higher result. Only meaningful when mode is `reroll`. `either` lets whoever forced the reroll pick which result stands, as Wish's Roll Redo.
   */
  keep?: 'new' | 'best' | 'either';
  /**
   * The floor a qualifying die counts as. Only meaningful when mode is `minimum`.
   */
  minimum?: number;
  /**
   * How often the allowance refreshes. Defaults to `unlimited`, i.e. every qualifying die every time.
   */
  frequency?: 'unlimited' | 'perAttack' | 'perCast' | 'perTurn' | 'perRound';
  /**
   * Added to the new roll, as Indomitable's bonus equal to your Fighter level.
   */
  bonus?: number | string;
};
/**
 * How a DC is computed. The SRD writes these as a formula - 'DC 8 plus your Constitution modifier and Proficiency Bonus' - so it is stored as one, letting a sheet recompute the DC as the character levels instead of freezing a number that silently goes stale. `fixed` is the other form: a DC belonging to the content itself, such as a trap, which no character stat feeds.
 */
export type SaveDc = {
  base?: number;
  /**
   * Ability modifier added to `base`. Accepts a $derived: sentinel for the spellcasting ability, which varies by the class doing the casting.
   */
  ability?: ('STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA') | string;
  /**
   * Add the Proficiency Bonus.
   */
  proficiency?: boolean;
  /**
   * A flat DC independent of the character.
   */
  fixed?: number;
  /**
   * A DC that climbs each time the feature is used and resets on a rest, as Relentless Rage's DC 10 plus 5 per use.
   */
  increasePerUse?: {
    amount: number;
    /**
     * @minItems 1
     */
    resetOn: ['short' | 'long' | 'dawn' | 'none' | 'dusk', ...('short' | 'long' | 'dawn' | 'none' | 'dusk')[]];
  };
  /**
   * Added to `base`, as Use Magic Device's 'DC 10 plus the spell's level' with `$derived:spellLevel`.
   */
  modifier?: number | string;
} & {
  [k: string]: unknown;
};
/**
 * What using a feature spends. Exactly one of `featureId` (spend that feature's `uses`, as Tactical Mind spends Second Wind) or `resource` (a class resource id from the class's `resources`, as Sorcery Points).
 */
export type ResourceCost = {
  featureId?: string;
  /**
   * A class resource id, `spellSlot` for an expended spell slot, `hitPointDice` for a spent Hit Point Die, as Lifedrinker, or `attack` for one attack forgone from the Attack action, as Quivering Palm. `charges` spends the magic item's own charges, as a Wand of Fireballs.
   */
  resource?: string;
  /**
   * How much is spent. 0 waives a cost the thing would otherwise have, as Arcane Apotheosis using one Metamagic option per turn for free.
   */
  amount: number | string;
  /**
   * True where the SRD says the use isn't expended if the attempt still fails, as with Tactical Mind.
   */
  refundOnFailure?: boolean;
  /**
   * `uses` (the default) spends the feature's uses or the resource's points. `dice` forgoes that many of the feature's damage dice, as a Cunning Strike option forgoing Sneak Attack d6s.
   */
  unit?: 'uses' | 'dice';
  /**
   * The slot level spent, when `resource` is spellSlot, as Holy Nimbus restored by a level 5 slot.
   */
  slotLevel?: number;
  /**
   * The spent use stays spent for this many rests, as Greater Divine Intervention's 2d4 Long Rests.
   */
  recoverAfter?: {
    rests: number | DiceExpression;
    /**
     *  `dusk` is the Robe of Stars' daily return of stars.
     */
    rest: 'short' | 'long' | 'dawn' | 'none' | 'dusk';
  };
  /**
   * The most that can be spent at once, from `amount` up to this, as a Ring of the Ram's 1 to 3 charges. `$derived:chargesSpent` reads what was spent.
   */
  maxAmount?: number | string;
} & {
  [k: string]: unknown;
};
/**
 * A decision the player makes when this feature is gained.
 */
export type Choice = {
  id: string;
  prompt?: string;
  /**
   * How many to pick. `$scaling` where the count grows with level, as Weapon Mastery's 3 to 6.
   */
  count: number | string;
  /**
   * Either a list id to resolve, or a literal set of options. An option is a bare string when what the player reads is also what the mechanics consume, and a {value,label} pair when they differ: Draconic Ancestry offers ten dragons that collapse to five damage types, so the label names the dragon while the value carries the type an effect picks up through $choice:. Without the pair that mapping would have to live inside a consumer, and the dragon would stop being data.
   */
  from?:
    | string
    | (
        | string
        | {
            /**
             * What $choice: resolves to.
             */
            value: string;
            /**
             * What the player is shown.
             */
            label: string;
            /**
             * Features this option confers, by id, resolved against the grantor's `subFeatures`. This is how an option carries a BUNDLE rather than a scalar: Elven Lineage's Drow grants a level 1 feature, a level 3 spell and a level 5 spell. Features are reused wholesale instead of inlining effects here, so level gating, `uses`, `activation` and nested choices all keep working inside an option.
             *
             * @minItems 1
             */
            grants?: [string, ...string[]];
          }
      )[];
  /**
   * Any loaded entity of these kinds is selectable. Use for open pools such as Skilled's 'any skill or tool'.
   *
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
  /**
   * Narrows the pool, ANDed. Reuses the effect qualifier vocabulary so a cantrip-only pick is `from` the class list plus a spellLevel qualifier — the filter is stated once, on the choice, rather than duplicated onto the effect that consumes it.
   */
  qualifiers?: Qualifier[];
  /**
   * When picks may be changed afterwards, and how many at a time. Fighting Style swaps one on gaining a Fighter level; Weapon Mastery swaps one on a Long Rest.
   */
  swap?: {
    trigger: Trigger;
    count: number;
  };
  /**
   * `gain` (the default): picked when the feature is gained, and kept until `swap` allows a change. `use`: picked fresh each time the effect is used, as Primal Strike's damage type or Natural Recovery's spell. Spell choices are always per cast.
   */
  when?: 'gain' | 'use';
} & {
  [k: string]: unknown;
};
/**
 * Feats are special perks that represent an speciality or expertise for an ability.
 */
export type FeatSchema = {
  /**
   * Namespaced content id for Feats: <packId>:feat/<slug>
   */
  id: string;
  name: string;
  /**
   * Markdown prose rendered by the UI.
   */
  description?: string;
  /**
   * Governs where the feat may be taken from: origin feats come only from a background, epic boons only at level 19+, fighting styles only from features that grant them.
   */
  category: 'origin' | 'general' | 'fightingStyle' | 'epicBoon';
  /**
   * All entries must be satisfied. An empty array means the feat has no prerequisites.
   */
  prerequisites?: Prerequisite[];
  /**
   * Whether the feat may be taken more than once. Defaults to false when absent.
   */
  repeatable: boolean;
  abilityScoreIncrease?: AbilityScoreIncrease | null;
  /**
   * Feats are written as named sub-bullets rather than one prose block. Each benefit may carry its own mechanical effects.
   */
  effectGroups: EffectGroupCore[];
  activation?: Activation;
  uses?: Uses1;
  choices?: Choice[];
  tags: string[];
  options?: OptionList;
}[];

/**
 * The '+1 to one ability score of your choice, to a maximum of 20' clause most General feats carry.
 */
export interface AbilityScoreIncrease {
  /**
   * Abilities eligible for the increase.
   *
   * @minItems 1
   */
  from: ['STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA', ...('STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA')[]];
  amount: number;
  /**
   * Cap the score may be raised to. Normally 20, but a derived value where another feature raises the ceiling.
   */
  maximum?: number | string;
}
/**
 * The fields every named block of rules shares: a condition's bullet, a feat's bullet, a class feature. `effectGroup` is this alone; `feature` adds identity and timing on top, so the two cannot drift apart.
 */
export interface EffectGroupCore {
  name: string;
  /**
   * Markdown prose rendered by the UI.
   */
  description: string;
  effects?: Effect[];
}
/**
 * Level-keyed values for features that grow (Sneak Attack dice, Martial Arts die).
 */
export interface ScalingRow {
  level: number;
  /**
   * The value at this level. A dice expression where the thing that grows is dice - Breath Weapon's 1d10 through 4d10 - so a row states the whole quantity and a consumer never has to pair it with a die size held somewhere else.
   */
  value: (number | string) | DiceExpression;
  /**
   * Which of the feature's growing numbers this row belongs to, read by `$scaling:<key>`. Omit when the feature has only one.
   */
  key?: string;
}
/**
 * A rolled quantity, e.g. Bardic Inspiration's 1d6.
 */
export interface DiceExpression {
  /**
   * How many dice. A deferred value where the count is itself a number from the sheet, as Frenzy's d6s equal to your Rage Damage bonus.
   */
  count: number | string;
  /**
   * The die. A deferred value where a class column holds it, as the Martial Arts die.
   */
  die: ('d3' | 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100') | string;
  /**
   * A flat or derived amount added to the rolled total, as in Stone's Endurance's '1d12 plus your Constitution modifier'. Carried here rather than as a sibling effect because it is part of one quantity - splitting it would let a consumer apply the dice and drop the modifier.
   */
  modifier?: number | string | [number | string, number | string, ...(number | string)[]];
  /**
   * Lowest total, as Wholeness of Body's 'minimum of 1 Hit Point'.
   */
  minimum?: number;
  /**
   * Floor on a deferred `count`, as Sear Undead's 'minimum of 1d8'.
   */
  minimumCount?: number;
  /**
   * Cap on a deferred `count`, as Falling's 20d6.
   */
  maximumCount?: number;
  /**
   * Multiplies a deferred `count`, as a Ring of the Ram's 2d10 per charge spent: `{count: "$derived:chargesSpent", countMultiplier: 2, die: "d10"}`.
   */
  countMultiplier?: number;
}
/**
 * Modifications to HOW a granted spell may be cast. Distinct from qualifiers, which narrow WHEN an effect applies.
 */
export interface CastingOverrides {
  ignoreMaterialComponent?: boolean;
  alwaysPrepared?: boolean;
  /**
   * Casts allowed without expending a spell slot.
   */
  freeCasts?: {
    /**
     * How many free casts. A derived quantity where the SRD ties it to the character, as Forest Gnome's Speak with Animals does to the Proficiency Bonus. `atWill` for no limit, as Spell Mastery.
     */
    count: number | string | 'atWill';
    /**
     *  `dusk` is the Robe of Stars' daily return of stars.
     */
    recharge: 'short' | 'long' | 'dawn' | 'none' | 'dusk';
  };
  /**
   * The spell goes into your spellbook for free rather than being prepared, as Evocation Savant.
   */
  addToSpellbook?: boolean;
  /**
   * Cast without Concentration, as Dragon Companion's Summon Dragon.
   */
  ignoreConcentration?: boolean;
  /**
   * The spell's duration when cast this way, as Dragon Companion's 1 minute.
   */
  duration?: Duration;
  /**
   * The level the spell is cast at, as a Wand of Fireballs' level 3 version.
   */
  castLevel?: number;
  /**
   * A fixed save DC, as a Crystal Ball's 'Scrying (save DC 17)'.
   */
  saveDc?: number;
  /**
   * A fixed spell attack bonus, as a Circlet of Blasting's '+5 to hit'.
   */
  attackBonus?: number;
  /**
   * Cast with your own spellcasting ability and save DC, as a Staff of Power.
   */
  useOwnAbility?: boolean;
  /**
   * Each spell level above `castLevel` costs this much more, up to `maxLevel`, as a Wand of Fireballs' 1 charge per level.
   */
  upcastCost?: {
    perLevel: number;
    maxLevel?: number;
  };
}
export interface Duration {
  /**
   * A deferred value where the length scales, as Quivering Palm's days equal to your Monk level. Dice where the length is rolled, as Dust of Disappearance's 2d4 minutes.
   */
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
  /**
   * With `untilRest`, the rest that ends it, as created spell slots vanishing on a Long Rest. `value` is 0.
   */
  rest?: 'short' | 'long' | 'dawn' | 'none' | 'dusk';
}
/**
 * A templated region an effect fills. `size` is the defining dimension in feet - a Cone's or Line's length, a Sphere's, Cylinder's or Emanation's radius, a Cube's edge - so one field covers every shape rather than a differently named dimension per shape. A `wall`'s size is its length and a `ringWall`'s its diameter; both take `height` and `width` (thickness).
 */
export interface AreaOfEffect {
  shape: 'cone' | 'line' | 'sphere' | 'cube' | 'cylinder' | 'emanation' | 'wall' | 'ringWall';
  /**
   * The defining dimension in feet. `$scaling` where it grows, as Aura of Protection's 10 feet becoming 30.
   */
  size: number | string;
  /**
   * Line width in feet.
   */
  width?: number;
  /**
   * Cylinder height in feet.
   */
  height?: number;
}
/**
 * A save made against an effect by whoever the effect is aimed at. Distinct from the `savingThrow` rollTarget, which is the character's own save being modified.
 */
export interface SavingThrow {
  /**
   * The save's ability, or a list the target picks from, as a Grapple's 'Strength or Dexterity saving throw (its choice)'.
   */
  ability:
    | ('STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA')
    | [
        'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA',
        'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA',
        ...('STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA')[]
      ];
  dc: SaveDc;
  /**
   * What a successful save does. `half` halves the damage, `negate` prevents the effect entirely, `none` means success alone changes nothing.
   */
  onSuccess: 'half' | 'negate' | 'none';
  /**
   * When the affected creature repeats the save to end the effect, as Intimidating Presence's 'at the end of each of the Frightened creature's turns'. A list where several events prompt it, as Hideous Laughter's end of turn and on taking damage.
   */
  repeat?: Trigger | [Trigger, Trigger, ...Trigger[]];
  /**
   * Events that end the effect without a save, as Knock Out's 'or until it takes any damage'.
   *
   * @minItems 1
   */
  endsOn?: [Trigger, ...Trigger[]];
  /**
   * Half and Three-Quarters Cover give no bonus to this save, as Sacred Flame.
   */
  ignoresCover?: boolean;
  /**
   * An ability check that also ends the effect, taken as an action by the target or a creature next to it, against the same DC. Entangle's Strength (Athletics) check.
   */
  escape?: {
    ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
    /**
     * @minItems 1
     */
    skills?: [string, ...string[]];
    /**
     * A creature within reach of the target can make the check for it.
     */
    byOthers?: boolean;
  };
}
/**
 * The event that fires an effect. Three-way distinction worth holding onto: `activation` is what the character SPENDS to use a feature, `qualifiers` narrow when an already-live effect applies, and a trigger means the effect does not exist at all until the event happens. Fire's Burn is not a passive damage bonus narrowed to attacks - it is nothing until you hit.
 */
export interface Trigger {
  /**
   * Something that happens to or around the character, which an effect hangs off. `hitWithAttack` is you hitting; `hitByAttack` is you being hit, as Uncanny Dodge. `enterArea` and `endTurnInArea` fire for a creature entering, or ending its turn in, the effect's area, as Spirit Guardians. `moveInArea` fires for each 5 feet a creature moves into or within the area, as Spike Growth. `effectEnds` fires when the spell or feature carrying the effect ends, as Haste's lethargy. `restoreHitPoints` fires when your spell or feature restores Hit Points, as Disciple of Life. `reduceEnemyToZero` fires when you reduce an enemy to 0 Hit Points, as Dark One's Blessing. `dealDamage` fires when you deal damage, as Sanctuary ending. `expendCharges` fires when you use a magic item property that spends charges, as Use Magic Device. `dayEnds` fires at the end of each day, as Dehydration and Malnutrition. `leaveReach` fires when a creature you can see leaves your reach, as an Opportunity Attack. `timePasses` fires each time `trigger.every` elapses, as a Ring of Regeneration's 1d6 every 10 minutes. `spendHitPointDie` fires when you roll a Hit Point Die to heal, as the Periapt of Wound Closure.
   */
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
  /**
   *  `dusk` is the Robe of Stars' daily return of stars.
   */
  rest?: 'short' | 'long' | 'dawn' | 'none' | 'dusk';
  /**
   * An action named by the rules, as opposed to `actionType` which is what such an action COSTS. Adrenaline Rush needs both at once - the Dash action (this) taken as a Bonus Action (that) - which is why they cannot be one enum. A pack adding an action names it by `ruleId`; the core actions keep their short names, and each is defined by the rule whose `term` matches.
   */
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
  /**
   * True where the SRD says 'you can' rather than 'you do', so the player decides whether to spend the trigger.
   */
  optional?: boolean;
  /**
   * Which roll, when event is failRoll or criticalHit. A missed attack is a failed attackRoll.
   */
  roll?:
    | 'd20Test'
    | 'attackRoll'
    | 'damageRoll'
    | 'savingThrow'
    | 'abilityCheck'
    | 'initiative'
    | 'deathSave'
    | 'concentration';
  /**
   * Which feature, when event is useFeature. Tactical Shift hangs off Second Wind this way.
   */
  featureId?: string;
  /**
   * Which action type, when event is takeAction and the rule names a cost rather than an action, as Rage's 'take a Bonus Action to extend your Rage'.
   */
  actionType?: 'action' | 'bonusAction' | 'reaction';
  /**
   * Which spell, when event is castSpell, as Smite of Protection on casting Divine Smite.
   */
  spellId?: string;
  /**
   * Whose event it is. Defaults to you. `target` is the creature your spell targets, as Warding Bond's 'each time it takes damage'.
   */
  subject?: 'self' | 'target' | 'summon';
  /**
   * With `timePasses`, how often it fires.
   */
  every?: Duration;
}
/**
 * A limit on this one effect when the rest of the feature is unlimited or limited differently. Wild Resurgence trades a spell slot for Wild Shape once per turn, but a Wild Shape use for a slot only once per Long Rest; the second effect carries `uses`. Prefer the feature's own `uses` when every effect shares the limit.
 */
export interface Uses {
  /**
   * A fixed number, or a deferred value: `$derived:proficiencyBonus`, or `$scaling` for a count that grows with level.
   */
  max: number | string;
  /**
   *  `dusk` is the Robe of Stars' daily return of stars.
   */
  recharge: 'short' | 'long' | 'dawn' | 'none' | 'dusk';
  /**
   * A partial refill on a shorter rest, on top of the full refill named by `recharge`. Second Wind regains one use on a Short Rest and all on a Long Rest.
   */
  recover?: {
    /**
     *  `dusk` is the Robe of Stars' daily return of stars.
     */
    rest: 'short' | 'long' | 'dawn' | 'none' | 'dusk';
    amount: number;
  };
  /**
   * Most uses spendable in one turn, as Action Surge's 'only once on a turn'.
   */
  perTurn?: number;
  /**
   * What you can spend to use the feature when no uses remain, as Intimidating Presence restored by a use of Rage.
   */
  alternativeCost?: ResourceCost;
  /**
   * Floor on a deferred `max`, as Wholeness of Body's 'minimum of once'.
   */
  minimum?: number;
  /**
   * Scales a deferred `max`, as Lay On Hands' pool of five times your Paladin level.
   */
  multiplier?: number;
  /**
   * The uses are points spent in any amount rather than one at a time, as Lay On Hands' pool of healing.
   */
  pool?: boolean;
}
/**
 * How many targets a spell or feature picks, and what kind.
 */
export interface Targets {
  count: number | string;
  /**
   * Floor on a deferred count, as Abjure Foes' 'minimum of one creature'.
   */
  minimum?: number;
  kind: 'creature' | 'object' | 'creatureOrObject' | 'point';
}
/**
 * What it costs to use a feature: the action it takes, and any resource it spends.
 */
export interface Activation {
  type: 'action' | 'bonusAction' | 'reaction' | 'free' | 'passive' | 'ritual' | 'special';
  /**
   * Required when type is reaction: what the reaction responds to.
   */
  trigger?: string;
  cost?: ResourceCost;
  /**
   * Qualifiers that must hold for you to use the feature at all, as Rage's 'if you aren't wearing Heavy armor'.
   */
  requires?: Qualifier[];
}
/**
 * A bounded pool of uses attached to a single feature.
 */
export interface Uses1 {
  /**
   * A fixed number, or a deferred value: `$derived:proficiencyBonus`, or `$scaling` for a count that grows with level.
   */
  max: number | string;
  /**
   *  `dusk` is the Robe of Stars' daily return of stars.
   */
  recharge: 'short' | 'long' | 'dawn' | 'none' | 'dusk';
  /**
   * A partial refill on a shorter rest, on top of the full refill named by `recharge`. Second Wind regains one use on a Short Rest and all on a Long Rest.
   */
  recover?: {
    /**
     *  `dusk` is the Robe of Stars' daily return of stars.
     */
    rest: 'short' | 'long' | 'dawn' | 'none' | 'dusk';
    amount: number;
  };
  /**
   * Most uses spendable in one turn, as Action Surge's 'only once on a turn'.
   */
  perTurn?: number;
  /**
   * What you can spend to use the feature when no uses remain, as Intimidating Presence restored by a use of Rage.
   */
  alternativeCost?: ResourceCost;
  /**
   * Floor on a deferred `max`, as Wholeness of Body's 'minimum of once'.
   */
  minimum?: number;
  /**
   * Scales a deferred `max`, as Lay On Hands' pool of five times your Paladin level.
   */
  multiplier?: number;
  /**
   * The uses are points spent in any amount rather than one at a time, as Lay On Hands' pool of healing.
   */
  pool?: boolean;
}
/**
 * Options a feature adds to a catalog. `list` is the catalog id, shared by every feature that adds to or draws from it.
 */
export interface OptionList {
  list: string;
  /**
   * @minItems 1
   */
  items: [Option, ...Option[]];
  /**
   * Set when the catalog is a table you roll on instead of picking from, as Prismatic Spray's d8 or Teleport's d100.
   */
  die?: 'd3' | 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';
  /**
   * A `$choice:` naming which row of a rolled table applies, as Teleport's familiarity.
   */
  row?: string;
}
/**
 * One entry in an option catalog: a Brutal Strike effect, a Metamagic option, an Eldritch Invocation. Options live on the feature that introduces them and join the catalog named by that feature's `options.list`, so a later feature or another pack adds options without editing the first.
 */
export interface Option {
  id: string;
  name: string;
  description: string;
  cost?: ResourceCost;
  effects: Effect[];
  duration?: Duration;
  /**
   * Qualifiers that must hold to pick or use this option: a Poisoner's Kit for Poison, Warlock level 5 and Pact of the Blade (`knowsOption`) for Eldritch Smite.
   */
  requires?: Qualifier[];
  /**
   * The option can be picked more than once, as Agonizing Blast.
   */
  repeatable?: boolean;
  /**
   * Picks this option needs, as Agonizing Blast's cantrip. A repeatable option makes the pick again each time it is taken.
   */
  choices?: Choice[];
  /**
   * The die results that select this option when the catalog is rolled on, as Confusion's 2-6.
   */
  roll?:
    | {
        min: number;
        max: number;
      }
    | [
        {
          row: string;
          min: number;
          max: number;
        },
        ...{
          row: string;
          min: number;
          max: number;
        }[]
      ];
}
