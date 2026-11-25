// What the setup page and the finished map both do to a GM's map.
import { updateMap, type GmMap } from '../../api/maps';

// Updates the page's map from its current copy, so answers arriving close together don't undo each other.
export type UpdateGmMap = (change: (map: GmMap) => GmMap) => void;

export function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback;
}

// Adds or removes a land hex optimistically, then on the server.
// A removed hex keeps its record, which returns if the hex is added back.
export function toggleLand(campaignId: string, mapId: string, update: UpdateGmMap, col: number, row: number, isLand: boolean): Promise<unknown> {
  update(map => ({
    ...map,
    land: isLand ? map.land.filter(([c, r]) => c !== col || r !== row) : [...map.land, [col, row]],
  }));
  return updateMap(campaignId, mapId, { land: isLand ? { remove: [[col, row]] } : { add: [[col, row]] } })
    .then(saved => {
      // A hex put back may have details from before it was taken off.
      const kept = saved.hexes.find(h => h.col === col && h.row === row);
      if (kept) update(map => ({ ...map, hexes: [...map.hexes.filter(h => h.col !== col || h.row !== row), kept] }));
    })
    .catch(err => {
      // Refused: put the page back as it was.
      update(map => ({
        ...map,
        land: isLand ? [...map.land, [col, row]] : map.land.filter(([c, r]) => c !== col || r !== row),
      }));
      throw err;
    });
}
