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
    class: string | null,
    classChoices: choicePicks,
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
    classes: classSummary[],
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
// choices), 'class', 'classChoice:<id>', 'name'.
export interface draftError {
    field: string,
    message: string,
}

// Option key -> the field of the choice that picked it, for each skill, tool and language
// the draft already has. Other choices leave these out.
export type takenOptions = Record<string, string>

export interface draftCheck {
    // Every problem the server finds with the draft; empty when it can be created.
    errors: draftError[],
    taken: takenOptions,
}

// Saves nothing.
export function validateCharacter(campaignId: string | null, draft: characterDraft): Promise<draftCheck> {
    return apiClient.post("/characters/validate", { campaignId, ...draft }).then(response => response.data);
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
