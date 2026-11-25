import type { ChoicePicks, Details, DraftSchema } from "../datatypes/generated/draft";
import type { AbilityRoll, ScoreAdjustment } from "../datatypes/generated/sheet";
import type { CampaignQuestion } from "../datatypes/campaignDetails";
import { apiClient } from "./client";

export type { AbilityRoll, ChoicePicks, ScoreAdjustment };

export const CHARACTER_NAME_MAX_LENGTH = 64;

// draft is saved but unsubmitted, pending awaits the GM, approved is playable, and rejected was sent back.
export type CharacterStatus = 'draft' | 'pending' | 'approved' | 'rejected'

export interface CreatedCharacter {
    id: string,
    name: string,
    // Always false, since a campaign character becomes active only once approved.
    isActive: boolean,
    // Approved in the sandbox, and draft in a campaign until submitted.
    status: CharacterStatus,
}

// Submits or resubmits a campaign character, which becomes pending or approved depending on the campaign.
export function submitCharacter(characterId: string): Promise<{ status: CharacterStatus, isActive: boolean }> {
    return apiClient.post(`/characters/${characterId}/submit`).then(response => response.data);
}

// GM or admin only.
export function reviewCharacter(characterId: string, decision: 'approve' | 'reject', reason?: string):
    Promise<{ status: CharacterStatus, reviewReason: string | null, isActive: boolean }> {
    return apiClient.post(`/characters/${characterId}/review`, { decision, reason }).then(response => response.data);
}

// Makes an approved campaign character the player's active one there.
// Under characterSwapApproval, replacing another active character asks the GM instead (swapRequested).
export function activateCharacter(characterId: string): Promise<{ isActive: boolean, swapRequested: boolean }> {
    return apiClient.post(`/characters/${characterId}/activate`).then(response => response.data);
}

export function cancelSwapRequest(characterId: string): Promise<void> {
    return apiClient.delete(`/characters/${characterId}/swap-request`).then(() => undefined);
}

// The GM's answer to a player's request to swap to this character.
export function reviewSwap(characterId: string, decision: 'approve' | 'reject'): Promise<void> {
    return apiClient.post(`/characters/${characterId}/swap-review`, { decision }).then(() => undefined);
}

export interface PendingSwap {
    id: string,
    name: string,
    ownerName: string,
    requestedAt: string,
    portraitVersion: string | null,
    // The owner's active character it would replace, if any.
    replacesName: string | null,
}

export function getPendingSwaps(campaignId: string): Promise<PendingSwap[]> {
    return apiClient.get(`/campaigns/${campaignId}/characters/swaps`).then(response => response.data);
}

export interface PendingCharacter {
    id: string,
    name: string,
    ownerName: string,
    submittedAt: string,
    portraitVersion: string | null,
}

// GM or admin only, oldest submission first.
export function getPendingCharacters(campaignId: string): Promise<PendingCharacter[]> {
    return apiClient.get(`/campaigns/${campaignId}/characters/pending`).then(response => response.data);
}

// field is 'species', 'background', 'class', 'abilityScores' or '<choices key>:<choice id>'.
// to is null when the pick was cleared.
export interface PickChange {
    field: string,
    from: unknown,
    to: unknown,
}

// A player's edit to an approved character, logged for the GM.
export interface CharacterChange {
    id: string,
    characterId: string,
    characterName: string,
    ownerName: string,
    changes: PickChange[],
    createdAt: string,
    dismissed: boolean,
}

// GM or admin only, newest first, with all including dismissed changes.
export function getCharacterChanges(campaignId: string, all = false): Promise<CharacterChange[]> {
    return apiClient.get(`/campaigns/${campaignId}/character-changes`, { params: all ? { all: 'true' } : {} })
        .then(response => response.data);
}

export function dismissCharacterChange(campaignId: string, changeId: string): Promise<void> {
    return apiClient.post(`/campaigns/${campaignId}/character-changes/${changeId}/dismiss`).then(() => undefined);
}

// What the creation wizard has collected, as defined by schemas/records/draft.schema.json.
// The server adds version when it saves a draft.
export type CharacterDraft = Omit<DraftSchema, 'version'>

export type CharacterDetails = Details

export interface OriginRules {
    // Increases may go to any ability, and skills and the tool are picked.
    customizeOrigin: boolean,
    originFeat: 'background' | 'any',
    // choice lets the player pick a package, while equipment or gold gives everyone that package.
    startingEquipment: 'choice' | 'equipment' | 'gold',
}

export type AbilityMethod = 'standardArray' | 'pointBuy' | 'roll' | 'manual' | 'sharedManual'
export type HpMethod = 'automatic' | 'manual'

// How ability scores and hit points may be set in this campaign, and the numbers each method uses.
export interface AbilityRules {
    // Every method is listed so the wizard can show them all, while allowed* lists the usable ones.
    methods: AbilityMethod[],
    allowedMethods: AbilityMethod[],
    hpMethods: HpMethod[],
    allowedHpMethods: HpMethod[],
    standardArray: number[],
    pointBuyBudget: number,
    // Score ("8" to "15") mapped to its point cost.
    pointCosts: Record<string, number>,
    sharedScores: number[],
    manualRange: { min: number, max: number },
}

// A feature an option brings with it, such as the spells of an elven lineage.
export interface GrantedFeature {
    name: string,
    description: string,
}

export interface ChoiceOption {
    // The value stored when the option is picked.
    key: string,
    label: string,
    description?: string,
    grants?: GrantedFeature[],
}

// Something the player decides, already narrowed by the server to what the campaign allows.
export interface CharacterChoice {
    id: string,
    prompt: string,
    count: number,
    options: ChoiceOption[],
    // Expertise-style choices count only skills the character is already proficient in.
    proficientOnly?: boolean,
    // Asked only once this option of that choice is picked.
    condition?: { choice: string, option: string },
    // abilityIncrease choices render as one box per ability, spending points with at most max on one.
    kind?: 'abilityIncrease',
    abilities?: string[],
    points?: number,
    max?: number,
    // For a feat's increase, the feat's name and the cap it raises scores to.
    source?: string,
    maximum?: number,
}

export interface SpeciesTrait {
    id: string,
    name: string,
    shortDescription: string,
    description: string,
    choices: CharacterChoice[],
}

export interface SpeciesOption {
    id: string,
    name: string,
    creatureType: string | null,
    // Empty when the player chooses the size among the choices.
    size: string[],
    speed: number | null,
    // Choices of the species itself rather than a trait, such as Human size.
    choices: CharacterChoice[],
    traits: SpeciesTrait[],
}

export interface FeatDetail {
    id: string,
    name: string,
    effects: { name: string, description: string }[],
}

export interface EquipmentPackage {
    // The value stored when picked, such as "A" or "B".
    label: string,
    items: string[],
}

// A background (the packs' "origins") as the campaign's rules shape it.
export interface BackgroundOption {
    id: string,
    name: string,
    description: string,
    abilityScores: string[],
    // Proficiencies given outright, by name.
    skills: string[],
    tools: string[],
    languages: string[],
    // Null when the player picks any Origin feat instead.
    feat: FeatDetail | null,
    // Every Origin feat on offer when the player picks one.
    originFeats: FeatDetail[],
    equipment: EquipmentPackage[],
    // Null when the player picks the package.
    givenEquipment: string | null,
    choices: CharacterChoice[],
    // The Origin feat's own choices, such as Magic Initiate's spells.
    featChoices: CharacterChoice[],
}

export interface ClassSummary {
    id: string,
    name: string,
    hitDie: number | null,
}

// What a new character may be built from, decided by the server.
export interface CharacterOptions {
    // The campaign's milestone level, else 1.
    level: number,
    species: SpeciesOption[],
    backgrounds: BackgroundOption[],
    classes: ClassSummary[],
    abilityRules: AbilityRules,
    originRules: OriginRules,
    // True in a campaign, where the GM's rules are shown but can't be changed.
    rulesLocked: boolean,
    // The GM's custom questions, empty in the sandbox.
    questions: CampaignQuestion[],
    // Null in the sandbox.
    partyVisibility: PartyVisibility | null,
}

// The Character Sandbox's backgrounds under the origin rules the player picked.
export function getBackgroundOptions(campaignId: string | null, rules: OriginRules): Promise<BackgroundOption[]> {
    return apiClient.get("/characters/options/backgrounds", {
        params: { campaign: campaignId ?? 'sandbox', ...rules, customizeOrigin: String(rules.customizeOrigin) },
    }).then(response => response.data);
}

// A null campaignId means the Character Sandbox.
export function getCharacterOptions(campaignId: string | null): Promise<CharacterOptions> {
    return apiClient.get("/characters/options", { params: { campaign: campaignId ?? 'sandbox' } })
        .then(response => response.data);
}

export interface ClassFeature {
    id: string,
    name: string,
    level: number,
    shortDescription: string,
    description: string,
    choices: CharacterChoice[],
}

export interface SubclassDetail {
    id: string,
    name: string,
    description: string,
    features: ClassFeature[],
}

// A class at the starting level, with every choice resolved for the campaign.
export interface ClassDetail {
    id: string,
    name: string,
    level: number,
    hitDie: number | null,
    primaryAbility: string[],
    savingThrows: string[],
    armor: string[],
    weapons: string[],
    tools: string[],
    subclassLevel: number | null,
    // Skill and tool proficiencies to pick.
    choices: CharacterChoice[],
    features: ClassFeature[],
    // Null until the level reaches the subclass.
    subclassChoice: CharacterChoice | null,
    subclasses: SubclassDetail[],
}

// Pass level to see the class at that level when editing a character.
export function getClassOption(campaignId: string | null, classId: string, level?: number): Promise<ClassDetail> {
    return apiClient.get(`/characters/options/classes/${classId}`, { params: { campaign: campaignId ?? 'sandbox', level } })
        .then(response => response.data);
}

// field names the draft part, such as 'species', 'choice:<id>', 'backgroundChoice:<id>' or 'name'.
export interface DraftError {
    field: string,
    message: string,
    // True when it only means something hasn't been filled in yet, rather than that something is wrong.
    incomplete?: boolean,
}

// Option key mapped to the field of the choice that picked it, so other choices can leave it out.
export type TakenOptions = Record<string, string>

export interface AbilitySummary {
    // Null until the score is set.
    base: number | null,
    // Permanent increases in the order gained, with the draft field each came from (such as 'classChoice:<id>').
    increases: { source: string, amount: number, field?: string | null }[],
    bonus: number,
    // base plus increases.
    total: number | null,
    modifier: number | null,
}

// An ability on a saved character, including temporary effects.
export interface SheetAbility extends AbilitySummary {
    current: number | null,
    currentModifier: number | null,
    // Ids of the score adjustments that touch this ability.
    adjustments: string[],
}

export interface HitPointSummary {
    max: number,
    // Hit points gained at each level, Constitution included.
    perLevel: number[],
    conModifier: number,
    bonuses: { name: string, amount: number }[],
}

export interface DraftCheck {
    // Empty when the draft can be created.
    errors: DraftError[],
    taken: TakenOptions,
    summary: { abilities: Record<string, AbilitySummary>, hitPoints: HitPointSummary | null },
}

// Checks without saving, using draftId's rolls or checking an edit of characterId instead.
export function validateCharacter(campaignId: string | null, draft: CharacterDraft, draftId?: string | null,
                                  characterId?: string | null): Promise<DraftCheck> {
    return apiClient.post("/characters/validate", { campaignId, draftId, characterId, ...draft })
        .then(response => response.data);
}

// Refused with errors unless everything fits the character's campaign as it is now.
export function updateCharacter(characterId: string, draft: CharacterDraft): Promise<void> {
    return apiClient.put(`/characters/${characterId}`, draft).then(() => undefined);
}

// Rolls scores for a character switched to the roll method while being edited.
export function rollCharacterAbilities(characterId: string): Promise<AbilityRoll[]> {
    return apiClient.post(`/characters/${characterId}/roll`).then(response => response.data.rolls);
}

// The saved draft named by draftId is deleted with the save.
export function createSandboxCharacter(draft: CharacterDraft & { draftId?: string }): Promise<CreatedCharacter> {
    return apiClient.post("/sandbox/characters", draft).then(response => response.data);
}

export function createCharacter(campaignId: string, draft: CharacterDraft & { draftId?: string }): Promise<CreatedCharacter> {
    return apiClient.post(`/campaigns/${campaignId}/characters`, draft).then(response => response.data);
}

// owner can do everything, gm can change play state, and party can only read.
export type SheetAccess = 'owner' | 'gm' | 'party'

export interface SheetStat {
    ability: string,
    proficient: boolean,
    // Null until the ability has a score.
    modifier: number | null,
}

// Derived from the build on every read.
export interface SheetStats {
    identity: { species: string | null, class: string | null, subclass: string | null, background: string | null },
    senses: {
        passivePerception: number | null,
        passiveInsight: number | null,
        passiveInvestigation: number | null,
        // Range in feet.
        darkvision: number | null,
    },
    proficiencies: { armor: string[], weapons: string[], tools: string[], languages: string[] },
    proficiencyBonus: number,
    initiative: number | null,
    // Unarmored, since equipment isn't tracked yet.
    armorClass: number | null,
    speed: number | null,
    // Walking first, where condition names a feature that must be active (Draconic Flight).
    speeds: { type: 'walk' | 'fly' | 'swim' | 'climb' | 'burrow', value: number, condition: string | null }[],
    // condition names a feature that must be active (Rage), or null when always on.
    defenses: {
        resistances: { name: string, condition: string | null }[],
        immunities: { name: string, condition: string | null }[],
    },
    passivePerception: number | null,
    savingThrows: SheetStat[],
    skills: (SheetStat & { id: string, name: string })[],
    spellcasting: { ability: string, saveDc: number | null, attackBonus: number | null } | null,
    hitDie: number | null,
}

// What changes at the table, with every field filled in.
export interface PlayState {
    // Null until hit points can be worked out.
    currentHp: number | null,
    maxHp: number | null,
    workedOutMaxHp: number | null,
    // A hand-set maximum, or null to use the worked-out one.
    maxHpOverride: number | null,
    tempHp: number,
    // Slot level ("1" to "9") mapped to slots, for the levels the class has.
    spellSlots: Record<string, { total: number, spent: number }>,
    pactSlots: { total: number, slotLevel: number, spent: number } | null,
    // Pack condition ids, with exhaustion tracked separately.
    conditions: string[],
    exhaustion: number,
    hitDice: { total: number, spent: number },
    deathSaves: { successes: number, failures: number },
    // Feature id mapped to uses spent.
    featureUses: Record<string, number>,
}

export interface SheetFeature {
    id: string,
    name: string,
    source: 'species' | 'class' | 'subclass' | 'feat',
    // The level gained, for class and subclass features.
    level: number | null,
    activation: 'action' | 'bonusAction' | 'reaction' | 'free' | 'special' | 'passive',
    // Rules text in Markdown.
    description: string,
    // shortRecover is how many uses a short rest returns for a feature that recharges on a long rest.
    uses: { max: number, recharge: string | null, pool: boolean, shortRecover: number | null } | null,
}

export interface SheetSpell {
    id: string,
    name: string,
    level: number,
    school: string | null,
    castingTime: string | null,
    range: string | null,
    duration: string | null,
    concentration: boolean,
    ritual: boolean,
    description: string,
}

// Only the fields that changed, with spentSlots and featureUses merged by key.
export interface StatePatch {
    currentHp?: number,
    maxHpOverride?: number | null,
    tempHp?: number,
    spentSlots?: Record<string, number>,
    spentPactSlots?: number,
    conditions?: string[],
    exhaustion?: number,
    spentHitDice?: number,
    deathSaves?: { successes: number, failures: number },
    featureUses?: Record<string, number>,
}

// Resolves with the whole play state after the change.
export function patchCharacterState(characterId: string, patch: StatePatch): Promise<PlayState> {
    return apiClient.patch(`/characters/${characterId}/state`, patch).then(response => response.data);
}

// A short rest's rolls are the Hit Point Dice the server rolled.
export type RestResult =
    | { kind: 'long', hitDiceRecovered: number, healed: number }
    // applied is false when the player rolled without healing.
    | { kind: 'short', rolls: number[], conModifier: number, healed: number, applied: boolean }

// resetMaxHp drops a hand-set maximum, and applyHealing (default true) heals by the roll.
// hitDiceRecovery (default 'all') recovers all spent Hit Point Dice (2024 rules) or half (2014).
export type RestRequest =
    | { type: 'short', hitDice: number, applyHealing?: boolean, resetMaxHp?: boolean }
    | { type: 'long', hitDiceRecovery?: 'all' | 'half', resetMaxHp?: boolean }

// The server rolls the dice, so a rest's result can't be shown in advance.
export function takeRest(characterId: string, rest: RestRequest):
    Promise<{ state: PlayState, rest: RestResult }> {
    return apiClient.post(`/characters/${characterId}/rest`, rest).then(response => response.data);
}

// A character as its owner (or the admin), its GM or its party sees it.
export interface CharacterSummary {
    access: SheetAccess,
    owner: { name: string, username: string },
    // The owner's private notes, null for anyone else.
    notes: string | null,
    // Null for a character made before the sheet had a build.
    stats: SheetStats | null,
    state: PlayState,
    features: SheetFeature[],
    spells: SheetSpell[],
    id: string,
    name: string,
    isActive: boolean,
    // Waiting for the GM to approve switching to this character.
    swapRequested: boolean,
    status: CharacterStatus,
    reviewReason: string | null,
    // Both null for a Character Sandbox character.
    campaignId: string | null,
    campaignName: string | null,
    // Changes whenever the portrait does.
    portraitVersion: string | null,
    // What no longer fits the campaign, which keeps the old sheet until fixed in the wizard.
    problems: DraftError[],
    draft: CharacterDraft,
    rolls: AbilityRoll[] | null,
    level: number,
    // The level the wizard edits it at: level, or the campaign's milestone level once that is higher.
    editLevel: number,
    // Null for a character made before it had ability scores.
    abilities: Record<string, SheetAbility> | null,
    scoreAdjustments: ScoreAdjustment[],
    // Null in the Character Sandbox.
    partyVisibility: PartyVisibility | null,
    // What the party sees under 'misleading', shown only to the owner, admin and GM.
    disguise: CharacterDisguise | null,
}

export type PartyVisibility = 'full' | 'limited' | 'misleading'

// False details shown to the party under 'misleading', where a missing field shows the real one.
export interface CharacterDisguise {
    name?: string,
    species?: string,
    className?: string,
}

// Blank fields are dropped, and the result is null when nothing remains.
export function saveDisguise(characterId: string, disguise: CharacterDisguise): Promise<CharacterDisguise | null> {
    return apiClient.put(`/characters/${characterId}/disguise`, disguise).then(response => response.data.disguise);
}

// A member's active character as the viewer may see it.
export interface PartyCharacter {
    id: string,
    // For the rest of the party under 'misleading', these show the disguise where set.
    name: string,
    species: string | null,
    className: string | null,
    level: number,
    hitPoints: { current: number | null, max: number | null, temp: number },
    // Condition names, with exhaustion tracked separately.
    conditions: string[],
    exhaustion: number,
    // Null without a portrait, or when the party isn't shown portraits.
    portraitVersion: string | null,
    // The whole character when the viewer may open its sheet.
    sheet: CharacterSummary | null,
    // The disguise, shown only to the owner, GM and admin.
    disguise: CharacterDisguise | null,
}

export interface PartyMember {
    userId: string,
    playerName: string,
    role: 'gm' | 'player',
    // Null when they have no active character.
    character: PartyCharacter | null,
}

export interface CampaignParty {
    visibility: PartyVisibility,
    members: PartyMember[],
    // The viewer's own characters in the campaign, oldest first.
    myCharacters: { id: string, name: string, status: CharacterStatus, isActive: boolean, portraitVersion: string | null, swapRequested: boolean }[],
}

export function getParty(campaignId: string): Promise<CampaignParty> {
    return apiClient.get(`/campaigns/${campaignId}/party`).then(response => response.data);
}

export function getCharacter(id: string): Promise<CharacterSummary> {
    return apiClient.get(`/characters/${id}`).then(response => response.data);
}

// Replaces the temporary ability effects and resolves with the abilities they produce.
export function saveScoreAdjustments(characterId: string, adjustments: ScoreAdjustment[]):
    Promise<{ scoreAdjustments: ScoreAdjustment[], abilities: Record<string, SheetAbility> | null }> {
    return apiClient.put(`/characters/${characterId}/adjustments`, { adjustments }).then(response => response.data);
}

// The version makes a replaced portrait a new URL, so each one can be cached safely.
export function portraitUrl(characterId: string, version: string): string {
    return `/api/characters/${characterId}/portrait?v=${encodeURIComponent(version)}`;
}

// Uploads an image already cropped in the browser and resolves with the new portraitVersion.
export function uploadPortrait(characterId: string, image: Blob): Promise<string> {
    return apiClient.put(`/characters/${characterId}/portrait`, image, { headers: { 'Content-Type': image.type || 'application/octet-stream' } })
        .then(response => response.data.portraitVersion);
}

export function deletePortrait(characterId: string): Promise<void> {
    return apiClient.delete(`/characters/${characterId}/portrait`).then(() => undefined);
}

// confirm must be the character's name.
export function deleteCharacter(characterId: string, confirm: string): Promise<void> {
    return apiClient.delete(`/characters/${characterId}`, { data: { confirm } }).then(() => undefined);
}
