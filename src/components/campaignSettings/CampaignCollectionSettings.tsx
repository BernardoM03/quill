import { useState } from 'react';

import { useCollection } from '../../packs/usePacks';
import type { CollectionName } from '../../packs/types';
import { SectionHeader, type SectionMode } from './SectionHeader';
import { refusalText, type SaveAllowed } from './saveAllowed';
import { Toggle } from './Toggle';
import { toggleId } from './toggleId';

// One collection's allowed entries (species, skills, ...). View mode lists the allowed
// ones; Edit mode shows a toggle for each. requireOne marks collections characters can't do
// without (species): the server refuses turning off the last one, and View warns when none are.
// compact: smaller text and more, narrower columns, for less common settings.
// allowed: the saved ids, or null for "all".
export function CollectionSettings({ collection, caption, noun, requireOne = false, compact = false, allowed, onChange }: {
  collection: CollectionName;
  caption: string;
  noun: string; // plural, lowercase: "species", "skills"
  requireOne?: boolean;
  compact?: boolean;
  allowed: string[] | null;
  onChange: SaveAllowed;
}) {
  const { data: entries, error, loading } = useCollection(collection);
  const [mode, setMode] = useState<SectionMode>('view');

  let body;
  if (loading) body = <p>Loading…</p>;
  else if (error) body = <p>Couldn't load {noun}: {error.message}</p>;
  else {
    const options = [...entries!.values()].map(e => ({ id: e.id, label: e.name }));
    const selected = allowed ?? options.map(o => o.id);
    const allowedOptions = options.filter(o => selected.includes(o.id));
    if (mode === 'edit') body = <ToggleGrid options={options} selectedIds={selected} onChange={onChange} />;
    else body = allowedOptions.length === 0 ? (requireOne
      ? <p className="setting-error">No {noun} allowed. Characters can't be created until one is.</p>
      : <p className="muted">No {noun} allowed.</p>) : (
      <div className="toggle-grid-wrap">
        <div className="toggle-grid">
          {allowedOptions.map(o => <div key={o.id} className="view-cell">{o.label}</div>)}
        </div>
      </div>
    );
  }

  return (
    <div className={`setting-section ${compact ? 'setting-section--compact' : ''}`}>
      <SectionHeader caption={caption} mode={mode} onModeChange={setMode} />
      {body}
    </div>
  );
}

function ToggleGrid({ options, selectedIds, onChange }: {
  options: { id: string; label: string }[];
  selectedIds: string[];
  onChange: SaveAllowed;
}) {
  // The refused toggle's message, shown inside the cell it came from.
  const [rule, setRule] = useState<{ id: string; text: string } | null>(null);

  const toggle = (id: string) => {
    const next = toggleId(selectedIds, id);
    setRule(null);
    onChange(next).catch(err => setRule({ id, text: refusalText(err) }));
  };

  return (
    <div className="toggle-grid-wrap">
      <div className="toggle-grid">
        {options.map(option => (
          <div key={option.id} className="toggle-cell">
            <Toggle
              label={option.label}
              checked={selectedIds.includes(option.id)}
              onChange={() => toggle(option.id)}
            />
            {rule?.id === option.id && <p className="setting-error toggle-cell__error">{rule.text}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
