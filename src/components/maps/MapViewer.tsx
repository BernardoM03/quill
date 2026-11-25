import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  EMPTY_HEX, deleteMap, getMap, mapImageUrl, saveHex, updateMap,
  type CampaignMap, type GmHex, type GmMap, type HexRecord, type MapPatch, type PlayerHex, type PlayerMap,
} from '../../api/maps';
import ConfirmDialog from '../ConfirmDialog';
import { Toggle } from '../campaignSettings/Toggle';
import '../campaignSettings/CampaignSettings.css';
import { HexMap, type HexTooltip } from './HexMap';
import { HexEditor, HexInfo } from './HexPanel';
import { hexKey } from './hexMath';
import { errorMessage, toggleLand, type UpdateGmMap } from './mapActions';
import './Maps.css';

const STATUS_LABEL = { hidden: 'Hidden', scouted: 'Scouted', visited: 'Visited' };

// The GM's settings cog in the map's corner, whose menu closes on Escape or an outside click.
function MapSettings({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Handled here, so a hex panel that's also open stays open.
      e.preventDefault();
      setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    // Capture: ahead of the side panel's own Escape listener.
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <div className="map-settings" ref={ref}>
      {open && <div className="map-settings__menu" role="group" aria-label="Map settings">{children}</div>}
      <button type="button" className="setting-button map-settings__button" aria-label="Map settings" title="Map settings"
        aria-expanded={open} onClick={() => setOpen(on => !on)}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  );
}

// A finalized hex map, where hovering shows a hex's name and clicking opens the side panel.
// The panel is the hex editor for the GM and what's known of the hex for a player.
export function MapViewer({ campaignId, map, update, onDeleted }: {
  campaignId: string,
  map: CampaignMap,
  // Only used for a GM's map (map.canEdit).
  update: UpdateGmMap,
  onDeleted: () => void,
}) {
  const [selected, setSelected] = useState<string | null>(null);
  // GM only: the uploaded drawing behind the hexes, and clicking hexes on and off.
  const [drawing, setDrawing] = useState(true);
  const [editingShape, setEditingShape] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // GM only: the map as the server would send it to a player, while See Player View is on.
  const [playerView, setPlayerView] = useState<PlayerMap | null>(null);
  const wantsPlayerView = useRef(false);
  // What's on screen: the player's copy while the GM is looking at that, else the map itself.
  const view: CampaignMap = playerView ?? map;

  const hexes = useMemo(() => {
    const byKey = new Map<string, GmHex | PlayerHex>();
    view.hexes.forEach(h => byKey.set(hexKey(h.col, h.row), h));
    return byKey;
  }, [view.hexes]);

  const classes = useMemo(() => {
    const byKey = new Map<string, string>();
    view.hexes.forEach(h => { if (h.status !== 'hidden') byKey.set(hexKey(h.col, h.row), `hexmap__hex--${h.status}`); });
    return byKey;
  }, [view.hexes]);

  // The GM's marker for hexes with something waiting in them.
  const dots = useMemo(() => {
    const keys = new Set<string>();
    if (view.canEdit) {
      view.hexes.forEach(h => {
        if (h.encounters.some(e => !e.resolved) || h.randomEncounters.length > 0) keys.add(hexKey(h.col, h.row));
      });
    }
    return keys;
  }, [view]);

  const landKeys = useMemo(() => new Set(view.land.map(([col, row]) => hexKey(col, row))), [view.land]);

  function tooltip(col: number, row: number, isLand: boolean): HexTooltip | null {
    if (editingShape) {
      return isLand ? { title: 'On the map', text: 'Click to take it off.' } : { title: 'Not on the map', text: 'Click to add it.' };
    }
    if (!isLand) return null;
    const hex = hexes.get(hexKey(col, row));
    if (view.canEdit) {
      const status = STATUS_LABEL[hex?.status ?? 'hidden'];
      return { title: hex?.name || 'Unnamed hex', text: hex?.description ? `${status}. ${hex.description}` : status };
    }
    if (!hex) return { title: 'Unexplored' };
    return { title: hex.name || 'Unnamed place', text: hex.description || undefined };
  }

  function handleHexClick(col: number, row: number, isLand: boolean) {
    if (editingShape && view.canEdit) {
      setError(null);
      toggleLand(campaignId, map.id, update, col, row, isLand)
        .catch(err => setError(errorMessage(err, 'Could not change the map’s shape.')));
    } else if (isLand) {
      setSelected(hexKey(col, row));
    }
  }

  // Fetches the player's copy from the server, so the preview is exactly what players receive.
  function loadPlayerView() {
    return getMap(campaignId, map.id, true)
      // Unless the GM has switched back while this was on its way.
      .then(loaded => { if (!loaded.canEdit && wantsPlayerView.current) setPlayerView(loaded); })
      .catch(err => setError(errorMessage(err, 'Could not load the player view.')));
  }

  function togglePlayerView() {
    setError(null);
    setSelected(null);
    wantsPlayerView.current = !playerView;
    if (playerView) {
      setPlayerView(null);
    } else {
      setEditingShape(false);
      loadPlayerView();
    }
  }

  function patch(change: MapPatch, apply: (map: GmMap, saved: GmMap) => GmMap) {
    setError(null);
    updateMap(campaignId, map.id, change)
      .then(saved => {
        update(current => apply(current, saved));
        // A setting that changes what players see: show the player view as it now is.
        if (playerView) return loadPlayerView();
      })
      .catch(err => setError(errorMessage(err, 'Could not save the change.')));
  }

  function save(col: number, row: number, record: HexRecord) {
    return saveHex(campaignId, map.id, col, row, record).then(saved => update(current => ({
      ...current,
      hexes: [...current.hexes.filter(h => h.col !== col || h.row !== row), saved],
    })));
  }

  // The hex record without its position, since it is saved back whole and the server rejects extra fields.
  function recordOf(key: string): HexRecord {
    const hex = hexes.get(key) as GmHex | undefined;
    if (!hex) return EMPTY_HEX;
    const { status, name, description, notes, encounters, randomEncounters } = hex;
    return { status, name, description, notes, encounters, randomEncounters };
  }

  // The open hex, unless it has since left the map.
  const open = selected && landKeys.has(selected) ? selected.split(',').map(Number) as [number, number] : null;

  const settings = map.canEdit && (
    <MapSettings>
      <Toggle label="Make Map Public" checked={map.visibility === 'public'}
        hint={map.visibility === 'public' ? 'Everyone in the campaign can open this map.' : 'Only you can see this map.'}
        onChange={() => patch(
          { visibility: map.visibility === 'public' ? 'private' : 'public' },
          (current, saved) => ({ ...current, visibility: saved.visibility }),
        )} />
      <Toggle label="Show Players Unexplored Land" checked={map.showOutline}
        hint={map.showOutline
          ? 'Players see the whole outline, with hidden hexes left blank.'
          : 'Players see only scouted and visited hexes.'}
        onChange={() => patch({ showOutline: !map.showOutline }, (current, saved) => ({ ...current, showOutline: saved.showOutline }))} />
      <Toggle label="See Player View" checked={playerView !== null}
        hint={playerView ? 'You’re seeing the map as your players do.' : 'See the map as your players do.'}
        onChange={togglePlayerView} />
      {/* Not part of what players see, so not offered while looking at their view. */}
      {!playerView && (
        <>
          <Toggle label="Show My Drawing" checked={drawing} hint="Your uploaded image, behind the hexes. Only you see it."
            onChange={() => setDrawing(on => !on)} />
          <Toggle label="Edit Shape" checked={editingShape} hint="Click hexes to add them to the map or take them off."
            onChange={() => { setEditingShape(on => !on); setSelected(null); }} />
          <div className="map-settings__danger">
            <button type="button" className="setting-button setting-button--danger" onClick={() => setDeleting(true)}>
              Delete Map
            </button>
          </div>
        </>
      )}
    </MapSettings>
  );

  return (
    <>
      <p className="map-readout">
        {editingShape
          ? 'Click a hex to add it to the map or take it off. A hex taken off keeps its details in case you put it back.'
          : `Each hex is ${view.hexSize} ${view.unit} across. ${view.canEdit ? 'Click a hex to edit it.' : 'Click a hex to read about it.'}`}
      </p>
      {playerView && (
        <p className="map-preview" role="status">
          Player view: this is what your players see.
          {map.visibility === 'private' && ' The map is private, so they can’t open it until you make it public.'}
          {' '}
          <button type="button" className="setting-button" onClick={togglePlayerView}>Back to GM View</button>
        </p>
      )}
      {error && <p className="setting-error" role="alert">{error}</p>}
      <div className="map-view">
        <HexMap grid={view.grid} land={view.land} classes={classes} dots={dots} label={view.name}
          seaClickable={editingShape}
          image={view.canEdit && drawing
            ? { url: mapImageUrl(campaignId, map.id), width: view.image.width, height: view.image.height, opacity: 0.7 }
            : undefined}
          selected={open ? selected : null} tooltip={tooltip} onHexClick={handleHexClick} corner={settings} />
        {open && view.canEdit && (
          <HexEditor key={selected} col={open[0]} row={open[1]} hex={recordOf(selected!)}
            onSave={record => save(open[0], open[1], record)} onClose={() => setSelected(null)} />
        )}
        {open && !view.canEdit && (
          <HexInfo key={selected} col={open[0]} row={open[1]} hex={hexes.get(selected!) as PlayerHex | undefined}
            onClose={() => setSelected(null)} />
        )}
      </div>
      <ul className="map-legend" aria-label="Legend">
        <li><span className="map-legend__swatch" />{view.canEdit ? 'Hidden' : 'Unexplored'}</li>
        <li><span className="map-legend__swatch map-legend__swatch--scouted" />Scouted</li>
        <li><span className="map-legend__swatch map-legend__swatch--visited" />Visited</li>
        {view.canEdit && <li><span className="map-legend__dot" />Has encounters</li>}
      </ul>
      {deleting && (
        <ConfirmDialog title="Delete this map?" confirmLabel="Delete" busyLabel="Deleting…" danger
          onConfirm={() => deleteMap(campaignId, map.id).then(onDeleted)}
          onClose={() => setDeleting(false)}>
          <p>{map.name}, its image and everything recorded for its hexes will be gone.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
