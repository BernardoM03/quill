import { useEffect, useMemo, useRef, useState } from 'react';

import {
  ENCOUNTER_NOTES_MAX_LENGTH, ENCOUNTER_TITLE_MAX_LENGTH, HEX_DESCRIPTION_MAX_LENGTH, HEX_NOTES_MAX_LENGTH,
  MAP_NAME_MAX_LENGTH, MAX_ENCOUNTER_CREATURES, MAX_RANDOM_ENCOUNTERS, MAX_SET_ENCOUNTERS,
  type encounterCreature, type encounterKind, type hexRecord, type hexStatus, type playerHex,
} from '../../api/maps';
import type { Entry } from '../../packs/types';
import { useCollection } from '../../packs/usePacks';
import { SidePanel } from '../sheet/SidePanel';
import '../DeleteCampaignDialog.css';
import { hexLabel } from './hexMath';
import './Maps.css';

const STATUSES: { value: hexStatus, label: string }[] = [
  { value: 'hidden', label: 'Hidden' },
  { value: 'scouted', label: 'Scouted' },
  { value: 'visited', label: 'Visited' },
];

const KINDS: { value: encounterKind, label: string }[] = [
  { value: 'combat', label: 'Combat' },
  { value: 'social', label: 'Social' },
  { value: 'treasure', label: 'Treasure' },
  { value: 'hazard', label: 'Hazard' },
  { value: 'exploration', label: 'Exploration' },
];
const kindLabel = (kind: encounterKind) => KINDS.find(k => k.value === kind)?.label ?? kind;

type creatureIndex = Map<string, Entry<'creatures'>> | null;

// A Challenge Rating as the rules print it: fractions below 1.
function challenge(rating: number): string {
  return ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' } as Record<number, string>)[rating] ?? String(rating);
}

// "2 × Air Elemental, 1 × Goblin Boss", then the XP they're worth together when known.
function creatureSummary(list: encounterCreature[], creatures: creatureIndex): string {
  const names = list.map(c => `${c.count} × ${creatures?.get(c.creature)?.name ?? c.creature}`).join(', ');
  const xp = list.reduce((sum, c) => sum + c.count * (creatures?.get(c.creature)?.xp ?? 0), 0);
  return xp > 0 ? `${names} (${xp.toLocaleString()} XP)` : names;
}

// An encounter while it's being written. Both lists use it; a set encounter keeps resolved
// and a random one weight.
interface encounterDraft {
  kind: encounterKind,
  title: string,
  notes: string,
  creatures: encounterCreature[],
  resolved: boolean,
  weight: number,
}

type storedEncounter = Omit<encounterDraft, 'resolved' | 'weight'> & { resolved?: boolean, weight?: number };

const NEW_ENCOUNTER: encounterDraft = { kind: 'combat', title: '', notes: '', creatures: [], resolved: false, weight: 1 };

function EncounterForm({ random, initial, creatures, onSubmit, onCancel }: {
  random: boolean,
  initial: encounterDraft,
  creatures: creatureIndex,
  onSubmit: (encounter: encounterDraft) => void,
  onCancel: () => void,
}) {
  const [draft, setDraft] = useState(initial);
  // The creature picker: which one, and how many.
  const [pick, setPick] = useState('');
  const [count, setCount] = useState(1);

  const options = useMemo(
    () => [...(creatures?.values() ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [creatures],
  );
  const title = draft.title.trim();
  // Adding more of a creature already listed raises its count instead of taking a new line.
  const full = draft.creatures.length >= MAX_ENCOUNTER_CREATURES && !draft.creatures.some(c => c.creature === pick);

  function addCreature() {
    if (!pick || full) return;
    const many = Math.min(99, Math.max(1, Math.round(count) || 1));
    setDraft(d => ({
      ...d,
      creatures: d.creatures.some(c => c.creature === pick)
        ? d.creatures.map(c => (c.creature === pick ? { ...c, count: Math.min(99, c.count + many) } : c))
        : [...d.creatures, { creature: pick, count: many }],
    }));
    setPick('');
    setCount(1);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title) return;
    onSubmit({ ...draft, title, notes: draft.notes.trim(), weight: Math.min(100, Math.max(1, Math.round(draft.weight) || 1)) });
  }

  return (
    <form className="encounter-form" onSubmit={handleSubmit}>
      <div className="encounter-form__row">
        <label className="map-field">
          Kind
          <select className="map-input" value={draft.kind}
            onChange={e => setDraft(d => ({ ...d, kind: e.target.value as encounterKind }))}>
            {KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
        {random && (
          <label className="map-field encounter-form__narrow" title="An entry of weight 2 comes up twice as often as one of weight 1.">
            Weight
            <input className="map-input" type="number" min={1} max={100} step={1} value={draft.weight}
              onChange={e => setDraft(d => ({ ...d, weight: Number(e.target.value) }))} />
          </label>
        )}
      </div>
      <label className="map-field">
        Title
        <input className="map-input" value={draft.title} maxLength={ENCOUNTER_TITLE_MAX_LENGTH} required autoFocus
          placeholder={random ? 'Wandering merchants' : 'Bandit ambush at the ford'}
          onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
      </label>
      <label className="map-field">
        Notes
        <textarea className="map-input" value={draft.notes} maxLength={ENCOUNTER_NOTES_MAX_LENGTH}
          onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
      </label>
      {draft.creatures.length > 0 && (
        <ul className="encounter-form__creatures">
          {draft.creatures.map(c => (
            <li key={c.creature}>
              <span>{c.count} × {creatures?.get(c.creature)?.name ?? c.creature}</span>
              <button type="button" className="setting-button setting-button--quiet" aria-label="Remove creature"
                onClick={() => setDraft(d => ({ ...d, creatures: d.creatures.filter(x => x.creature !== c.creature) }))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="encounter-form__row">
        <label className="map-field">
          Creature
          <select className="map-input" value={pick} onChange={e => setPick(e.target.value)}>
            <option value="">{creatures ? 'Choose…' : 'Loading…'}</option>
            {options.map(c => <option key={c.id} value={c.id}>{c.name} (CR {challenge(c.challengeRating)})</option>)}
          </select>
        </label>
        <label className="map-field encounter-form__narrow">
          Count
          <input className="map-input" type="number" min={1} max={99} step={1} value={count}
            onChange={e => setCount(Number(e.target.value))} />
        </label>
      </div>
      <div className="encounter-form__actions">
        <button type="button" className="setting-button" disabled={!pick || full} onClick={addCreature}
          style={{ marginRight: 'auto' }}>
          Add Creature
        </button>
        <button type="button" className="setting-button setting-button--quiet" onClick={onCancel}>Cancel</button>
        <button type="submit" className="setting-button" disabled={!title}>Done</button>
      </div>
    </form>
  );
}

// Picks an entry, each as likely as its weight.
function roll<T extends { weight?: number }>(entries: T[]): T {
  let at = Math.random() * entries.reduce((sum, e) => sum + (e.weight ?? 1), 0);
  for (const entry of entries) {
    at -= entry.weight ?? 1;
    if (at < 0) return entry;
  }
  return entries[entries.length - 1];
}

// One of a hex's two encounter lists: the encounters, each with Edit and Remove, and a form
// to add one. The set list can mark an encounter resolved; the random table can be rolled on.
function EncounterSection({ title, random, entries, max, creatures, onChange }: {
  title: string,
  random: boolean,
  entries: storedEncounter[],
  max: number,
  creatures: creatureIndex,
  onChange: (entries: encounterDraft[]) => void,
}) {
  // The entry being edited, by position, or 'new'.
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [rolled, setRolled] = useState<storedEncounter | null>(null);

  const drafts: encounterDraft[] = entries.map(e => ({ ...e, resolved: e.resolved ?? false, weight: e.weight ?? 1 }));
  const totalWeight = drafts.reduce((sum, e) => sum + e.weight, 0);

  function submit(encounter: encounterDraft) {
    onChange(editing === 'new' ? [...drafts, encounter] : drafts.map((e, i) => (i === editing ? encounter : e)));
    setEditing(null);
  }

  return (
    <section className="hex-section">
      <div className="hex-section__head">
        <h3 className="hex-section__title">{title}</h3>
        <div className="hex-section__actions">
          {random && entries.length > 0 && (
            <button type="button" className="setting-button" onClick={() => setRolled(roll(entries))}>Roll</button>
          )}
          {editing === null && entries.length < max && (
            <button type="button" className="setting-button" onClick={() => setEditing('new')}>Add</button>
          )}
        </div>
      </div>
      {entries.length === 0 && editing === null && <p className="map-hint">None yet.</p>}
      <ul className="encounter-list">
        {drafts.map((e, i) => (editing === i ? (
          <li key={i}>
            <EncounterForm random={random} initial={e} creatures={creatures} onSubmit={submit} onCancel={() => setEditing(null)} />
          </li>
        ) : (
          <li key={i} className={`encounter${!random && e.resolved ? ' encounter--resolved' : ''}`}>
            <div className="encounter__head">
              <span className="encounter__title">{e.title}</span>
              {random && <span className="encounter__weight" title="Chance of rolling this entry">{e.weight} in {totalWeight}</span>}
              <span className="encounter__kind">{kindLabel(e.kind)}</span>
            </div>
            {e.creatures.length > 0 && <p className="encounter__creatures">{creatureSummary(e.creatures, creatures)}</p>}
            {e.notes && <p className="encounter__notes">{e.notes}</p>}
            <div className="encounter__foot">
              {!random && (
                <label className="encounter__resolved">
                  <input type="checkbox" checked={e.resolved}
                    onChange={() => onChange(drafts.map((x, j) => (j === i ? { ...x, resolved: !x.resolved } : x)))} />
                  Resolved
                </label>
              )}
              <button type="button" className="setting-button setting-button--quiet" style={random ? { marginLeft: 'auto' } : undefined}
                onClick={() => setEditing(i)}>
                Edit
              </button>
              <button type="button" className="setting-button setting-button--quiet"
                onClick={() => { onChange(drafts.filter((_, j) => j !== i)); setEditing(null); setRolled(null); }}>
                Remove
              </button>
            </div>
          </li>
        )))}
      </ul>
      {editing === 'new' && (
        <EncounterForm random={random} initial={NEW_ENCOUNTER} creatures={creatures} onSubmit={submit} onCancel={() => setEditing(null)} />
      )}
      {rolled && (
        <div className="hex-roll" role="status">
          Rolled: <strong>{rolled.title}</strong> <span className="encounter__kind">{kindLabel(rolled.kind)}</span>
          {rolled.creatures.length > 0 && <p>{creatureSummary(rolled.creatures, creatures)}</p>}
          {rolled.notes && <p>{rolled.notes}</p>}
        </div>
      )}
    </section>
  );
}

function PanelHeader({ title, label, onClose }: { title: string, label: string, onClose: () => void }) {
  return (
    <div>
      <div className="rest-dialog__header">
        <h2 className="delete-dialog__title">{title}</h2>
        <button type="button" className="rest-dialog__close" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <span className="hex-panel__label">{label}</span>
    </div>
  );
}

function errorMessage(err: unknown): string {
  return (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Could not save the hex. Try again.';
}

// How long after the last change a hex is saved.
const SAVE_DELAY = 600;

// The GM's panel for one hex: its status, what players are told, the GM's own notes and its
// encounters. Changes save by themselves a moment after the last one, and at once when the
// panel closes or moves to another hex (give it key={the hex} so it starts afresh).
export function HexEditor({ col, row, hex, onSave, onClose }: {
  col: number,
  row: number,
  hex: hexRecord,
  onSave: (hex: hexRecord) => Promise<unknown>,
  onClose: () => void,
}) {
  const [draft, setDraft] = useState(hex);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const { data: creatures } = useCollection('creatures');
  // The newest change not yet sent, and the timer that will send it.
  const pending = useRef<hexRecord | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const saveRef = useRef(onSave);
  useEffect(() => { saveRef.current = onSave; });

  function flush() {
    const record = pending.current;
    if (!record) return;
    pending.current = null;
    setSaved('saving');
    setError(null);
    saveRef.current(record)
      .then(() => setSaved(pending.current ? 'saving' : 'saved'))
      .catch(err => { setError(errorMessage(err)); setSaved('idle'); });
  }

  function change(patch: Partial<hexRecord>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    pending.current = next;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY);
  }

  // Closing the panel or picking another hex: send what's waiting now.
  useEffect(() => () => {
    window.clearTimeout(timer.current);
    if (pending.current) saveRef.current(pending.current).catch(() => undefined);
    pending.current = null;
  }, []);

  const label = `Hex ${hexLabel(col, row)}`;

  return (
    <SidePanel label={label} onClose={onClose}>
      <div className="hex-panel">
        <PanelHeader title={draft.name.trim() || label} label={draft.name.trim() ? label : 'Unnamed'} onClose={onClose} />
        <fieldset className="hex-status">
          <legend>Status</legend>
          {STATUSES.map(s => (
            <label key={s.value}>
              <input type="radio" name="hex-status" checked={draft.status === s.value} onChange={() => change({ status: s.value })} />
              {s.label}
            </label>
          ))}
        </fieldset>
        <label className="map-field">
          Name
          <input className="map-input" value={draft.name} maxLength={MAP_NAME_MAX_LENGTH} placeholder="The Black Keep"
            onChange={e => change({ name: e.target.value })} />
        </label>
        <label className="map-field">
          Description
          <textarea className="map-input" value={draft.description} maxLength={HEX_DESCRIPTION_MAX_LENGTH}
            onChange={e => change({ description: e.target.value })} />
          <span className="map-hint">
            {draft.status === 'hidden'
              ? 'Players see the name and description once the hex is scouted or visited.'
              : 'Players can see the name and description.'}
          </span>
        </label>
        <label className="map-field">
          GM notes
          <textarea className="map-input" value={draft.notes} maxLength={HEX_NOTES_MAX_LENGTH}
            onChange={e => change({ notes: e.target.value })} />
          <span className="map-hint">Only you see these, and the encounters below.</span>
        </label>
        <EncounterSection title="Encounters" random={false} entries={draft.encounters} max={MAX_SET_ENCOUNTERS} creatures={creatures}
          onChange={entries => change({
            encounters: entries.map(({ kind, title, notes, creatures: list, resolved }) => ({ kind, title, notes, creatures: list, resolved })),
          })} />
        <EncounterSection title="Random encounters" random entries={draft.randomEncounters} max={MAX_RANDOM_ENCOUNTERS} creatures={creatures}
          onChange={entries => change({
            randomEncounters: entries.map(({ kind, title, notes, creatures: list, weight }) => ({ kind, title, notes, creatures: list, weight })),
          })} />
        <p className={`hex-panel__saved${error ? ' hex-panel__saved--error' : ''}`} role="status">
          {error ?? (saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved.' : '')}
        </p>
      </div>
    </SidePanel>
  );
}

// A player's panel for one hex: what the GM has let them know, and nothing to edit.
export function HexInfo({ col, row, hex, onClose }: {
  col: number,
  row: number,
  // Missing for a hex the players haven't scouted or visited.
  hex: playerHex | undefined,
  onClose: () => void,
}) {
  const label = `Hex ${hexLabel(col, row)}`;
  return (
    <SidePanel label={label} onClose={onClose}>
      <div className="hex-panel">
        <PanelHeader title={hex?.name || label}
          label={[hex?.name ? label : null, hex ? (hex.status === 'visited' ? 'Visited' : 'Scouted') : 'Unexplored'].filter(Boolean).join(' · ')}
          onClose={onClose} />
        {hex?.description
          ? <p className="hex-panel__description">{hex.description}</p>
          : <p className="map-hint">{hex ? 'Nothing more is known about this place.' : 'Nobody has been here yet.'}</p>}
      </div>
    </SidePanel>
  );
}
