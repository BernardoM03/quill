import { useCollection } from '../../packs/usePacks';
import React from 'react';
import './CampaignSettings.css';

// allowed: the saved species ids, or null for "all species".
export function SpeciesSettings({ allowed, onChange }: { allowed: string[] | null; onChange: (ids: string[]) => void }) {
  const { data: species, error, loading } = useCollection('species');

  let body;
  if (loading) body = <p>Loading…</p>;
  else if (error) body = <p>Couldn't load species: {error.message}</p>;
  else {
    const options: CheckboxOption[] = [...species!.values()].map(s => ({ id: s.id, label: s.name }));
    const selected = allowed ?? options.map(o => o.id);
    body = <CheckboxList options={options} selectedIds={selected} onChange={ids => onChange(ids as string[])} />;
  }

  return (
    <div className="setting-section">
      <span className="setting-caption">Allowed Species</span>
      {body}
    </div>
  );
}

interface CheckboxOption {
  id: string | number;
  label: string;
}

interface CheckboxListProps {
  options: CheckboxOption[];
  selectedIds: (string | number)[];
  onChange: (selectedIds: (string | number)[]) => void;
}

export const CheckboxList: React.FC<CheckboxListProps> = ({
  options,
  selectedIds,
  onChange,
}) => {
  const handleToggle = (id: string | number) => {
    const exists = selectedIds.includes(id);
    if (exists) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="toggle-grid-wrap">
      <div className="toggle-grid">
      {options.map((option) => (
        <label key={option.id} className="setting-row toggle-row">
          <span>{option.label}</span>
          <input
            type="checkbox"
            role="switch"
            className="toggle-input"
            checked={selectedIds.includes(option.id)}
            onChange={() => handleToggle(option.id)}
          />
          <span className="toggle" aria-hidden="true" />
        </label>
      ))}
      </div>
    </div>
  );
};
