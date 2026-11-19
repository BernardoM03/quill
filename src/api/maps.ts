import { apiClient } from "./client";
import type { HexSchema } from "../datatypes/generated/hex";

export type {
    EncounterCreature as encounterCreature, EncounterKind as encounterKind, RandomEncounter as randomEncounter,
    SetEncounter as setEncounter,
} from "../datatypes/generated/hex";

// What the GM records for a hex. Defined in schemas/records/hex.schema.json.
export type hexRecord = HexSchema;
export type hexStatus = HexSchema['status'];
export type mapUnit = 'mi' | 'km';

export const MAP_NAME_MAX_LENGTH = 64;
export const HEX_DESCRIPTION_MAX_LENGTH = 500;
export const HEX_NOTES_MAX_LENGTH = 5000;
export const ENCOUNTER_TITLE_MAX_LENGTH = 100;
export const ENCOUNTER_NOTES_MAX_LENGTH = 2000;
export const MAX_SET_ENCOUNTERS = 20;
export const MAX_RANDOM_ENCOUNTERS = 30;
export const MAX_ENCOUNTER_CREATURES = 12;
export const MAX_HEX_SIZE = 100;
export const MAX_MAP_WIDTH = 100000;

// A hex nobody has changed.
export const EMPTY_HEX: hexRecord = { status: 'hidden', name: '', description: '', notes: '', encounters: [], randomEncounters: [] };

// A map as the campaign page lists it.
export interface mapSummary {
    id: string,
    name: string,
    // Only 'hex' can be made for now.
    kind: 'hex' | 'battle' | 'world',
    // private: only the GM sees it.
    visibility: 'private' | 'public',
    // draft: the GM is still setting its scale; players never see a draft.
    status: 'draft' | 'ready',
    updatedAt: string,
}

// A hex as the GM has it: its position and everything recorded for it.
export type gmHex = hexRecord & { col: number, row: number };

// A hex as a player has it: sent only for scouted and visited hexes.
export interface playerHex {
    col: number,
    row: number,
    status: 'scouted' | 'visited',
    name: string,
    description: string,
}

interface mapBase extends mapSummary {
    unit: mapUnit,
    // The distance between the centres of neighbouring hexes, in unit.
    hexSize: number,
    // What the image's width covers, in unit.
    mapWidth: number,
    grid: { cols: number, rows: number },
    // The hexes that make up the map, as [col, row]. For a player, only the ones they may
    // know of: all of them when the GM shows the outline, else the scouted and visited.
    land: [number, number][],
}

export interface gmMap extends mapBase {
    canEdit: true,
    // Players see hidden hexes as blanks; off, they see only scouted and visited hexes.
    showOutline: boolean,
    // The uploaded image's size in hex radii, the unit the map is drawn in.
    image: { width: number, height: number },
    // Only the hexes the GM has changed.
    hexes: gmHex[],
}

export interface playerMap extends mapBase {
    canEdit: false,
    hexes: playerHex[],
}

export type campaignMap = gmMap | playerMap;

export function listMaps(campaignId: string): Promise<mapSummary[]> {
    return apiClient.get(`/campaigns/${campaignId}/maps`).then(response => response.data);
}

// Uploads the image and makes a private draft from it. Resolves with the new map's id;
// rejects with the server's reason if it refuses the image.
export function createMap(campaignId: string, name: string, kind: mapSummary['kind'], image: Blob): Promise<string> {
    const form = new FormData();
    form.append('name', name);
    form.append('kind', kind);
    form.append('image', image, 'map');
    return apiClient.post(`/campaigns/${campaignId}/maps`, form).then(response => response.data.id);
}

// asPlayer: for a GM, the map as a player is sent it (even while it's private), to preview.
export function getMap(campaignId: string, mapId: string, asPlayer = false): Promise<campaignMap> {
    return apiClient.get(`/campaigns/${campaignId}/maps/${mapId}`, { params: asPlayer ? { view: 'player' } : undefined })
        .then(response => response.data);
}

// The uploaded image's address. Only the GM can load it.
export function mapImageUrl(campaignId: string, mapId: string): string {
    return `/api/campaigns/${campaignId}/maps/${mapId}/image`;
}

export interface mapPatch {
    name?: string,
    visibility?: 'private' | 'public',
    showOutline?: boolean,
    // The scale: only while the map is a draft. The server works the land out again.
    unit?: mapUnit,
    hexSize?: number,
    mapWidth?: number,
    // Hexes to put on or take off the map.
    land?: { add?: [number, number][], remove?: [number, number][] },
    // Finalize the map. There's no going back to a draft.
    status?: 'ready',
}

// Resolves with the map as it now is.
export function updateMap(campaignId: string, mapId: string, patch: mapPatch): Promise<gmMap> {
    return apiClient.patch(`/campaigns/${campaignId}/maps/${mapId}`, patch).then(response => response.data);
}

// Deletes the map with its image and every hex.
export function deleteMap(campaignId: string, mapId: string): Promise<void> {
    return apiClient.delete(`/campaigns/${campaignId}/maps/${mapId}`).then(() => undefined);
}

// Replaces what's recorded for a hex. Resolves with the hex as saved.
export function saveHex(campaignId: string, mapId: string, col: number, row: number, hex: hexRecord): Promise<gmHex> {
    return apiClient.put(`/campaigns/${campaignId}/maps/${mapId}/hexes/${col}/${row}`, hex).then(response => response.data);
}
