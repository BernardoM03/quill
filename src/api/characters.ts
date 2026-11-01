import { apiClient } from "./client";

export const CHARACTER_NAME_MAX_LENGTH = 64;

export interface createdCharacter {
    id: string,
    name: string,
    // True when this is the player's first character in the campaign.
    isActive: boolean,
}

// Choice id -> the picked option's key (a list of keys where a choice takes more than one).
export type choicePicks = Record<string, string | string[]>

// What the creation wizard has collected so far.
export interface characterDraft {
    name: string,
    species: string | null,
    speciesChoices: choicePicks,
    // Character Sandbox only: the origin rules the player picked (a campaign's GM sets them).
    originRules: Partial<originRules>,
    background: string | null,
    backgroundChoices: choicePicks,
    class: string | null,
    classChoices: choicePicks,
    // null: the campaign's only method (see abilityRules).
    abilityMethod: abilityMethod | null,
    // Base scores by ability code ("STR"), before the background's increases.
    abilityScores: Record<string, number>,
    hpMethod: hpMethod | null,
    // The hit die rolled at each level after the first, for the manual method.
    hpRolls: number[],
    details: characterDetails,
}

// A character's description; every field optional. Limits: server/rules/details.py.
export interface characterDetails {
    alignment?: string, faith?: string, lifestyle?: string,
    gender?: string, age?: string, height?: string, weight?: string,
    hair?: string, eyes?: string, skin?: string, appearance?: string,
    personalityTraits?: string, ideals?: string, bonds?: string, flaws?: string,
    organizations?: string, allies?: string, enemies?: string, backstory?: string, other?: string,
}

export interface originRules {
    // The increases may go to any ability, and the skills and tool are picked.
    customizeOrigin: boolean,
    // background: the background's own feat; any: any Origin feat.
    originFeat: 'background' | 'any',
    // choice: the player picks a package; equipment / gold: that package for everyone.
    startingEquipment: 'choice' | 'equipment' | 'gold',
}

export type abilityMethod = 'standardArray' | 'pointBuy' | 'roll' | 'manual' | 'sharedManual'
export type hpMethod = 'automatic' | 'manual'

// How ability scores and hit points may be set: the campaign's methods (every method in
// the Character Sandbox) and the numbers each uses.
export interface abilityRules {
    // Every method, so the wizard can show them all; allowed* are the ones that may be used.
    methods: abilityMethod[],
    allowedMethods: abilityMethod[],
    hpMethods: hpMethod[],
    allowedHpMethods: hpMethod[],
    standardArray: number[],
    pointBuyBudget: number,
    // Score ("8".."15") -> its point cost.
    pointCosts: Record<string, number>,
    sharedScores: number[],
    manualRange: { min: number, max: number },
}

// One of the six ability rolls the server makes: 4d6, the lowest dropped.
export interface abilityRoll {
    dice: number[],
    total: number,
}

// A feature an option brings with it, e.g. the spells of an elven lineage.
export interface grantedFeature {
    name: string,
    description: string,
}

export interface choiceOption {
    // What gets stored when it's picked.
    key: string,
    label: string,
    description?: string,
    grants?: grantedFeature[],
}

// Something the player decides, already narrowed by the server to what the campaign allows.
export interface characterChoice {
    id: string,
    prompt: string,
    count: number,
    options: choiceOption[],
    // Expertise-style: only skills the character is already proficient in count.
    proficientOnly?: boolean,
    // Only asked once this option of that choice is picked (Thaumaturge -> an extra cantrip).
    condition?: { choice: string, option: string },
    // 'abilityIncrease': a background's increases, shown as one box per ability. Then
    // abilities (codes like "WIS") may be raised, points are spent in all, at most max on one.
    kind?: 'abilityIncrease',
    abilities?: string[],
    points?: number,
    max?: number,
}

export interface speciesTrait {
    id: string,
    name: string,
    shortDescription: string,
    description: string,
    choices: characterChoice[],
}

// A species the wizard may offer, with everything its card shows.
export interface speciesOption {
    id: string,
    name: string,
    creatureType: string | null,
    // The fixed sizes; empty when the player chooses one (then it's among choices).
    size: string[],
    speed: number | null,
    // Choices of the species itself rather than of a trait, e.g. Human size.
    choices: characterChoice[],
    traits: speciesTrait[],
}

// An Origin feat, with what it does.
export interface featDetail {
    id: string,
    name: string,
    effects: { name: string, description: string }[],
}

export interface equipmentPackage {
    // "A", "B": what's stored when it's picked.
    label: string,
    items: string[],
}

// A background (the packs' "origins") and the choices it asks for, as the campaign's rules have them.
export interface backgroundOption {
    id: string,
    name: string,
    description: string,
    // The abilities its increases go to (any ability when the campaign customizes origins).
    abilityScores: string[],
    // Given outright, by name.
    skills: string[],
    tools: string[],
    languages: string[],
    // The background's own feat; null when the player picks any Origin feat instead.
    feat: featDetail | null,
    // When the player picks: every Origin feat on offer, to show the one picked.
    originFeats: featDetail[],
    equipment: equipmentPackage[],
    // The package the campaign gives everyone; null when the player picks one.
    givenEquipment: string | null,
    // Ability increases, tool, Origin feat, equipment and languages, where they're picked.
    choices: characterChoice[],
    // The Origin feat's own choices (Magic Initiate's spells).
    featChoices: characterChoice[],
}

export interface classSummary {
    id: string,
    name: string,
    hitDie: number | null,
}

// What a new character may be built from: the campaign's allowed content, or everything
// in the Character Sandbox. Decided by the server (server/rules/characters.py).
export interface characterOptions {
    // The level a new character starts at: the campaign's milestone level, else 1.
    level: number,
    species: speciesOption[],
    backgrounds: backgroundOption[],
    classes: classSummary[],
    abilityRules: abilityRules,
    // The origin rules in force: the campaign's, or the sandbox defaults.
    originRules: originRules,
    // True in a campaign: the rules are the GM's, shown but not changeable.
    rulesLocked: boolean,
}

// The Character Sandbox's backgrounds under the origin rules the player picked.
export function getBackgroundOptions(campaignId: string | null, rules: originRules): Promise<backgroundOption[]> {
    return apiClient.get("/characters/options/backgrounds", {
        params: { campaign: campaignId ?? 'sandbox', ...rules, customizeOrigin: String(rules.customizeOrigin) },
    }).then(response => response.data);
}

// campaignId null means the Character Sandbox.
export function getCharacterOptions(campaignId: string | null): Promise<characterOptions> {
    return apiClient.get("/characters/options", { params: { campaign: campaignId ?? 'sandbox' } })
        .then(response => response.data);
}

// A class or subclass feature the character has by the starting level.
export interface classFeature {
    id: string,
    name: string,
    level: number,
    shortDescription: string,
    description: string,
    choices: characterChoice[],
}

export interface subclassDetail {
    id: string,
    name: string,
    description: string,
    features: classFeature[],
}

// A class as it is at the starting level, with every choice resolved for the campaign.
export interface classDetail {
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
    choices: characterChoice[],
    features: classFeature[],
    // The subclass pick, once the level reaches it; null before.
    subclassChoice: characterChoice | null,
    subclasses: subclassDetail[],
}

export function getClassOption(campaignId: string | null, classId: string): Promise<classDetail> {
    return apiClient.get(`/characters/options/classes/${classId}`, { params: { campaign: campaignId ?? 'sandbox' } })
        .then(response => response.data);
}

// field: which part of the draft it's about: 'campaign', 'species', 'choice:<id>' (species
// choices), 'background', 'backgroundChoice:<id>', 'class', 'classChoice:<id>', 'name'.
export interface draftError {
    field: string,
    message: string,
}

// Option key -> the field of the choice that picked it, for each skill, tool and language
// the draft already has. Other choices leave these out.
export type takenOptions = Record<string, string>

export interface abilitySummary {
    // null until the score is set.
    base: number | null,
    // From the background.
    bonus: number,
    total: number | null,
    modifier: number | null,
}

export interface hitPointSummary {
    max: number,
    // Hit points gained at each level, Constitution included.
    perLevel: number[],
    conModifier: number,
    bonuses: { name: string, amount: number }[],
}

export interface draftCheck {
    // Every problem the server finds with the draft; empty when it can be created.
    errors: draftError[],
    taken: takenOptions,
    // The scores with the background's increases, and hit points once they can be worked out.
    summary: { abilities: Record<string, abilitySummary>, hitPoints: hitPointSummary | null },
}

// Saves nothing. draftId: the saved draft, whose ability rolls the roll method checks against.
export function validateCharacter(campaignId: string | null, draft: characterDraft, draftId?: string | null): Promise<draftCheck> {
    return apiClient.post("/characters/validate", { campaignId, draftId, ...draft }).then(response => response.data);
}

// Creates a Character Sandbox character: in no campaign, using all the content the
// server has and the default rules. draftId: the saved draft it came from, deleted with the save.
export function createSandboxCharacter(draft: characterDraft & { draftId?: string }): Promise<createdCharacter> {
    return apiClient.post("/sandbox/characters", draft).then(response => response.data);
}

// Creates a character for the signed-in player in this campaign.
export function createCharacter(campaignId: string, draft: characterDraft & { draftId?: string }): Promise<createdCharacter> {
    return apiClient.post(`/campaigns/${campaignId}/characters`, draft).then(response => response.data);
}

// A character as its owner (or the admin) sees it.
export interface characterSummary {
    id: string,
    name: string,
    isActive: boolean,
    // Both null for a Character Sandbox character.
    campaignId: string | null,
    campaignName: string | null,
    // Changes whenever the portrait does; null when there isn't one.
    portraitVersion: string | null,
}

export function getCharacter(id: string): Promise<characterSummary> {
    return apiClient.get(`/characters/${id}`).then(response => response.data);
}

// The portrait's address. version (from portraitVersion) makes a replaced portrait a new
// URL, so the browser can cache each one without showing an old picture.
export function portraitUrl(characterId: string, version: string): string {
    return `/api/characters/${characterId}/portrait?v=${encodeURIComponent(version)}`;
}

// Uploads an image already cropped and shrunk in the browser (see makePortrait). Resolves
// with the new portraitVersion; rejects with the server's reason if it refuses the image.
export function uploadPortrait(characterId: string, image: Blob): Promise<string> {
    return apiClient.put(`/characters/${characterId}/portrait`, image, { headers: { 'Content-Type': image.type || 'application/octet-stream' } })
        .then(response => response.data.portraitVersion);
}

export function deletePortrait(characterId: string): Promise<void> {
    return apiClient.delete(`/characters/${characterId}/portrait`).then(() => undefined);
}

// Deletes the character and its portrait for good. confirm must be its name.
export function deleteCharacter(characterId: string, confirm: string): Promise<void> {
    return apiClient.delete(`/characters/${characterId}`, { data: { confirm } }).then(() => undefined);
}
