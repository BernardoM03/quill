import { useEffect, useRef, useState } from 'react';

import { MAP_NAME_MAX_LENGTH, createMap, type MapSummary } from '../../api/maps';
import '../DeleteCampaignDialog.css';
import { prepareMapImage } from './makeMapImage';
import './Maps.css';

// Map kinds in the order offered, where only hex maps can be made yet and the rest are previews.
const KINDS: { value: MapSummary['kind'], label: string, available: boolean }[] = [
  { value: 'hex', label: 'Hex map', available: true },
  { value: 'battle', label: 'Battle map', available: false },
  { value: 'world', label: 'World map', available: false },
];

function errorMessage(err: unknown): string {
  const response = (err as { response?: { data?: { error?: string }, status?: number } }).response;
  if (response?.data?.error) return response.data.error;
  if (response?.status === 413) return 'The image is too large to upload.';
  return err instanceof Error && err.message ? err.message : 'Could not add the map.';
}

// Uploads a shrunk image as a new draft map, and onCreated receives the new map's id.
export function AddMapDialog({ campaignId, onCreated, onClose }: {
  campaignId: string,
  onCreated: (mapId: string) => void,
  onClose: () => void,
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<MapSummary['kind']>('hex');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
    setError(null);
    // Start the name from the file's, until the GM types their own.
    if (picked && !name.trim()) setName(picked.name.replace(/\.[^.]+$/, '').slice(0, MAP_NAME_MAX_LENGTH));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !name.trim() || busy) return;
    setBusy(true);
    setError(null);
    prepareMapImage(file)
      .then(image => createMap(campaignId, name.trim(), kind, image))
      .then(onCreated)
      .catch(err => {
        setError(errorMessage(err));
        setBusy(false);
      });
  }

  return (
    <dialog ref={dialogRef} className="delete-dialog add-map" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 className="delete-dialog__title">Add a map</h2>
        <div className="add-map__fields">
          <label className="map-field">
            Image
            <input type="file" accept="image/png,image/jpeg,image/webp" required disabled={busy} onChange={handleFile} />
            <span className="map-hint">
              A PNG, JPEG or WebP. A map drawn as a dark outline on a light page works best: what the outline encloses becomes the map’s hexes.
            </span>
          </label>
          <label className="map-field">
            Name
            <input className="map-input" value={name} maxLength={MAP_NAME_MAX_LENGTH} required disabled={busy}
              onChange={e => setName(e.target.value)} />
          </label>
          <fieldset className="add-map__kinds">
            <legend>Kind</legend>
            {KINDS.map(k => (
              <label key={k.value} className={`add-map__kind${k.available ? '' : ' add-map__kind--later'}`}>
                <input type="radio" name="map-kind" value={k.value} checked={kind === k.value} disabled={!k.available || busy}
                  onChange={() => setKind(k.value)} />
                {k.label}{!k.available && ' (coming later)'}
              </label>
            ))}
          </fieldset>
        </div>
        {error && <p className="delete-dialog__error">{error}</p>}
        <div className="delete-dialog__actions">
          <button type="button" className="setting-button setting-button--quiet" disabled={busy}
            onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="setting-button" disabled={busy || !file || !name.trim()}>
            {busy ? 'Adding…' : 'Add Map'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
