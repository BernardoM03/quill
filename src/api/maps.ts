import { apiClient } from "./client";
import type { HexSchema } from "../datatypes/generated/hex";

export type {
    EncounterCreature, EncounterKind, RandomEncounter,
    SetEncounter,
} from "../datatypes/generated/hex";

// What the GM records for a hex, as defined by schemas/records/hex.schema.json.
export type HexRecord = HexSchema;
export type HexStatus = HexSchema['status'];
export type MapUnit = 'mi' | 'km';

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

// An untouched hex, whose record is removed when saved back to this.
export const EMPTY_HEX: HexRecord = { status: 'hidden', name: '', description: '', notes: '', encounters: [], randomEncounters: [] };

// A map as the campaign page lists it.
export interface MapSummary {
    id: string,
    name: string,
    // Only 'hex' can be made for now.
    kind: 'hex' | 'battle' | 'world',
    // Private maps are visible only to the GM.
    visibility: 'private' | 'public',
    // Players never see a draft, which the GM is still scaling.
    status: 'draft' | 'ready',
    updatedAt: string,
}

// A hex as the GM sees it, with its position and everything recorded.
export type GmHex = HexRecord & { col: number, row: number };

// A hex as a player sees it, sent only once scouted or visited.
export interface PlayerHex {
    col: number,
    row: number,
    status: 'scouted' | 'visited',
    name: string,
    description: string,
}

interface MapBase extends MapSummary {
    unit: MapUnit,
    // Distance between neighbouring hex centres, in unit.
    hexSize: number,
    // Distance the image's width covers, in unit.
    mapWidth: number,
    grid: { cols: number, rows: number },
    // The map's hexes as [col, row], limited for players to what the outline setting reveals.
    land: [number, number][],
}

export interface GmMap extends MapBase {
    canEdit: true,
    // When on, players see hidden hexes as blanks instead of not at all.
    showOutline: boolean,
    // The uploaded image's size in hex radii, the unit the map is drawn in.
    image: { width: number, height: number },
    // Only the hexes the GM has changed.
    hexes: GmHex[],
}

export interface PlayerMap extends MapBase {
    canEdit: false,
    hexes: PlayerHex[],
}

export type CampaignMap = GmMap | PlayerMap;

export function listMaps(campaignId: string): Promise<MapSummary[]> {
    return apiClient.get(`/campaigns/${campaignId}/maps`).then(response => response.data);
}

// Uploads the image as a new private draft and resolves with the map's id.
export function createMap(campaignId: string, name: string, kind: MapSummary['kind'], image: Blob): Promise<string> {
    const form = new FormData();
    form.append('name', name);
    form.append('kind', kind);
    form.append('image', image, 'map');
    return apiClient.post(`/campaigns/${campaignId}/maps`, form).then(response => response.data.id);
}

// asPlayer lets a GM preview exactly what players are sent, even for a private map.
export function getMap(campaignId: string, mapId: string, asPlayer = false): Promise<CampaignMap> {
    return apiClient.get(`/campaigns/${campaignId}/maps/${mapId}`, { params: asPlayer ? { view: 'player' } : undefined })
        .then(response => response.data);
}

// Only the GM can load the uploaded image.
export function mapImageUrl(campaignId: string, mapId: string): string {
    return `/api/campaigns/${campaignId}/maps/${mapId}/image`;
}

export interface MapPatch {
    name?: string,
    visibility?: 'private' | 'public',
    showOutline?: boolean,
    // Scale changes are allowed only on drafts, and the server recomputes the land.
    unit?: MapUnit,
    hexSize?: number,
    mapWidth?: number,
    // Hexes to put on or take off the map.
    land?: { add?: [number, number][], remove?: [number, number][] },
    // Finalizing is permanent.
    status?: 'ready',
}

// Resolves with the map as it now is.
export function updateMap(campaignId: string, mapId: string, patch: MapPatch): Promise<GmMap> {
    return apiClient.patch(`/campaigns/${campaignId}/maps/${mapId}`, patch).then(response => response.data);
}

// Deletes the map with its image and every hex.
export function deleteMap(campaignId: string, mapId: string): Promise<void> {
    return apiClient.delete(`/campaigns/${campaignId}/maps/${mapId}`).then(() => undefined);
}

// Replaces a hex's record and resolves with the hex as saved.
export function saveHex(campaignId: string, mapId: string, col: number, row: number, hex: HexRecord): Promise<GmHex> {
    return apiClient.put(`/campaigns/${campaignId}/maps/${mapId}/hexes/${col}/${row}`, hex).then(response => response.data);
}
