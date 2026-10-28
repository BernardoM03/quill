import { useCollection } from '../../packs/usePacks';
import { Toggle } from './Toggle';
import { toggleId } from './toggleId';

// allowed: the saved species ids, or null for "all species".
export function SpeciesSettings({ allowed, onChange }: { allowed: string[] | null; onChange: (ids: string[]) => void }) {
  const { data: species, error, loading } = useCollection('species');

  let body;
  if (loading) body = <p>Loading…</p>;
  else if (error) body = <p>Couldn't load species: {error.message}</p>;
  else {
    const options = [...species!.values()].map(s => ({ id: s.id, label: s.name }));
    const selected = allowed ?? options.map(o => o.id);
    body = <ToggleGrid options={options} selectedIds={selected} onChange={onChange} />;
  }

  return (
    <div className="setting-section">
      <span className="setting-caption">Allowed Species</span>
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
