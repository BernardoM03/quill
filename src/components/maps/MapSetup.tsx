import { useEffect, useRef, useState } from 'react';

import {
  MAP_NAME_MAX_LENGTH, MAX_HEX_SIZE, MAX_MAP_WIDTH, deleteMap, mapImageUrl, updateMap,
  type GmMap, type MapUnit,
} from '../../api/maps';
import ConfirmDialog from '../ConfirmDialog';
import { HexMap, type HexTooltip } from './HexMap';
import { MAX_HEXES, MAX_LINE, gridFor } from './hexMath';
import { errorMessage, toggleLand, type UpdateGmMap } from './mapActions';
import './Maps.css';

const KM_PER_MILE = 1.609344;
// How long after the last keystroke the new scale is sent.
const RESCALE_DELAY = 400;

const whole = (text: string, max: number) => {
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= max ? parsed : null;
};

// Why a scale can't be used, or null, mirroring the server's grid_problem.
function scaleProblem(aspect: number, hexSize: number | null, mapWidth: number | null): string | null {
  if (hexSize === null) return `Hex size must be a whole number from 1 to ${MAX_HEX_SIZE}.`;
  if (mapWidth === null) return `Map width must be a whole number from 1 to ${MAX_MAP_WIDTH.toLocaleString()}.`;
  const { cols, rows } = gridFor(aspect, hexSize, mapWidth);
  if (cols < 2 || rows < 2) return 'That leaves fewer than two hexes across. Use smaller hexes or a wider map.';
  if (cols > MAX_LINE || rows > MAX_LINE || cols * rows > MAX_HEXES) return 'That makes too many hexes. Use larger hexes or a narrower map.';
  return null;
}

const setupTooltip = (_col: number, _row: number, isLand: boolean): HexTooltip =>
  isLand ? { title: 'On the map', text: 'Click to take it off.' } : { title: 'Not on the map', text: 'Click to add it.' };

// The GM's draft map setup, showing detected hexes over the image with the scale to adjust and hexes to toggle.
// Finalizing locks the scale, since hexes are stored by grid position.
export function MapSetup({ campaignId, map, update, onDeleted }: {
  campaignId: string,
  map: GmMap,
  update: UpdateGmMap,
  onDeleted: () => void,
}) {
  const [name, setName] = useState(map.name);
  const [unit, setUnit] = useState<MapUnit>(map.unit);
  // As typed, so a half-typed number isn't corrected under the GM's fingers.
  const [hexSize, setHexSize] = useState(String(map.hexSize));
  const [mapWidth, setMapWidth] = useState(String(map.mapWidth));
  const [opacity, setOpacity] = useState(0.7);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'finalize' | 'delete' | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // Counts rescales, so an answer that a newer one has overtaken is dropped.
  const latest = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const aspect = map.image.width / map.image.height;

  function rescale(nextUnit: MapUnit, nextHexSize: string, nextMapWidth: string) {
    setUnit(nextUnit);
    setHexSize(nextHexSize);
    setMapWidth(nextMapWidth);
    window.clearTimeout(timer.current);
    const size = whole(nextHexSize, MAX_HEX_SIZE);
    const width = whole(nextMapWidth, MAX_MAP_WIDTH);
    const problem = scaleProblem(aspect, size, width);
    setError(problem);
    if (problem || size === null || width === null) return;
    timer.current = window.setTimeout(() => {
      const mine = ++latest.current;
      updateMap(campaignId, map.id, { unit: nextUnit, hexSize: size, mapWidth: width })
        .then(next => { if (mine === latest.current) update(() => next); })
        .catch(err => { if (mine === latest.current) setError(errorMessage(err, 'Could not change the scale.')); });
    }, RESCALE_DELAY);
  }

  // Switching unit keeps the map the same size on the ground, to the nearest whole number.
  function handleUnit(next: MapUnit) {
    if (next === unit) return;
    const factor = next === 'km' ? KM_PER_MILE : 1 / KM_PER_MILE;
    const convert = (text: string, max: number) => String(Math.min(max, Math.max(1, Math.round(Number(text) * factor) || 1)));
    rescale(next, convert(hexSize, MAX_HEX_SIZE), convert(mapWidth, MAX_MAP_WIDTH));
  }

  function saveName() {
    const cleaned = name.trim().replace(/\s+/g, ' ');
    if (!cleaned) { setName(map.name); return; }
    if (cleaned === map.name) return;
    updateMap(campaignId, map.id, { name: cleaned })
      .then(next => update(current => ({ ...current, name: next.name })))
      .catch(err => setError(errorMessage(err, 'Could not rename the map.')));
  }

  function handleHexClick(col: number, row: number, isLand: boolean) {
    setError(null);
    toggleLand(campaignId, map.id, update, col, row, isLand)
      .catch(err => setError(errorMessage(err, 'Could not change the map’s shape.')));
  }

  const mapHeight = Math.round(map.mapWidth / aspect);

  return (
    <div className="map-setup">
      <p className="map-readout">
        These are the hexes Quill found inside your map’s outline. Set how far across each hex is and how much ground
        the image covers, then click any hex to add it or take it off. Players can’t see the map until it’s finalized.
      </p>
      <div className="map-setup__controls">
        <label className="map-field map-setup__name">
          Name
          <input className="map-input" value={name} maxLength={MAP_NAME_MAX_LENGTH}
            onChange={e => setName(e.target.value)} onBlur={saveName} />
        </label>
        <label className="map-field">
          Unit
          <select className="map-input" value={unit} onChange={e => handleUnit(e.target.value as MapUnit)}>
            <option value="mi">Miles</option>
            <option value="km">Kilometres</option>
          </select>
        </label>
        <label className="map-field">
          Hex size ({unit})
          <input className="map-input map-input--number" type="number" min={1} max={MAX_HEX_SIZE} step={1} value={hexSize}
            onChange={e => rescale(unit, e.target.value, mapWidth)} />
        </label>
        <label className="map-field">
          Map width ({unit})
          <input className="map-input map-input--number" type="number" min={1} max={MAX_MAP_WIDTH} step={1} value={mapWidth}
            onChange={e => rescale(unit, hexSize, e.target.value)} />
        </label>
        <label className="map-opacity">
          Your drawing
          <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={e => setOpacity(Number(e.target.value))} />
        </label>
      </div>
      <p className="map-readout">
        {map.grid.cols} × {map.grid.rows} hexes, {map.land.length.toLocaleString()} on the map.
        Each hex is {map.hexSize} {map.unit} across; the image covers {map.mapWidth.toLocaleString()} × {mapHeight.toLocaleString()} {map.unit}.
      </p>
      {error && <p className="setting-error" role="alert">{error}</p>}
      <HexMap grid={map.grid} land={map.land} seaClickable label={`${map.name}: hexes to keep`}
        image={{ url: mapImageUrl(campaignId, map.id), width: map.image.width, height: map.image.height, opacity }}
        tooltip={setupTooltip} onHexClick={handleHexClick} />
      <div className="map-toolbar" style={{ marginTop: '1rem' }}>
        <button type="button" className="setting-button" disabled={map.land.length === 0 || error !== null}
          onClick={() => setConfirming('finalize')}>
          Finalize Map
        </button>
        <span className="map-toolbar__spacer" />
        <button type="button" className="setting-button setting-button--danger" onClick={() => setConfirming('delete')}>
          Delete Map
        </button>
      </div>
      {confirming === 'finalize' && (
        <ConfirmDialog title="Finalize this map?" confirmLabel="Finalize" busyLabel="Finalizing…"
          onConfirm={() => updateMap(campaignId, map.id, { status: 'ready' }).then(next => update(() => next))}
          onClose={() => setConfirming(null)}>
          <p>
            The hex size and map width can’t change afterwards: each hex’s details are kept by its place in the grid.
            You can still add and remove hexes.
          </p>
          <p>The map stays private until you make it public.</p>
        </ConfirmDialog>
      )}
      {confirming === 'delete' && (
        <ConfirmDialog title="Delete this map?" confirmLabel="Delete" busyLabel="Deleting…" danger
          onConfirm={() => deleteMap(campaignId, map.id).then(onDeleted)}
          onClose={() => setConfirming(null)}>
          <p>{map.name} and its image will be gone.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
