import { useState } from 'react';

import { useCollection } from '../../packs/usePacks';
import { SectionHeader, type SectionMode } from './SectionHeader';
import { Toggle } from './Toggle';
import { toggleId } from './toggleId';

// View mode lists the allowed species; 
// Edit mode shows a toggle for each.
export function SpeciesSettings({ allowed, onChange }: { allowed: string[] | null; onChange: (ids: string[]) => void }) {
  const { data: species, error, loading } = useCollection('species');
  const [mode, setMode] = useState<SectionMode>('view');

  let body;
  if (loading) body = <p>Loading…</p>;
  else if (error) body = <p>Couldn't load species: {error.message}</p>;
  else {
    const options = [...species!.values()].map(s => ({ id: s.id, label: s.name }));
    const selected = allowed ?? options.map(o => o.id);
    const allowedOptions = options.filter(o => selected.includes(o.id));
    if (mode === 'edit') body = <ToggleGrid options={options} selectedIds={selected} onChange={onChange} />;
    else body = allowedOptions.length === 0 ? <p className="muted">No species allowed.</p> : (
      <div className="toggle-grid-wrap">
        <div className="toggle-grid">
          {allowedOptions.map(o => <div key={o.id} className="view-cell">{o.label}</div>)}
        </div>
      </div>
    );
  }

  return (
    <div className="setting-section">
      <SectionHeader caption="Allowed Species" mode={mode} onModeChange={setMode} />
      {body}
    </div>
  );
}

function ToggleGrid({ options, selectedIds, onChange }: {
  options: { id: string; label: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="toggle-grid-wrap">
      <div className="toggle-grid">
        {options.map(option => (
          <Toggle
            key={option.id}
            label={option.label}
            checked={selectedIds.includes(option.id)}
            onChange={() => onChange(toggleId(selectedIds, option.id))}
          />
        ))}
      </div>
    </div>
  );
}
