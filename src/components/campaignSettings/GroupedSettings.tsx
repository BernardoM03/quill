import { useState } from 'react';

import { SectionHeader, type SectionMode } from './SectionHeader';
import { Toggle } from './Toggle';
import { toggleId } from './toggleId';

export type GroupedEntry = {
  id: string;
  name: string;
  group: string; // key of the group it's listed under
  tags?: { key: string; label: string; title: string }[];
  filters?: string[]; // filter keys it matches
};

// A long collection's allowed entries, grouped (spells by level, items by category).
// View mode summarizes each group by what's left out; Edit mode has a search, an optional
// filter row, All/None per group, and a toggle per entry. validate can refuse a change by
// returning a message, which shows where the change came from.
// allowed: the saved ids, or null for "all".
export function GroupedSettings({ caption, noun, entries, groups, filters, validate, allowed, onChange }: {
  caption: string;
  noun: string; // plural, lowercase: "spells"
  entries: GroupedEntry[];
  groups: { key: string; label: string }[]; // in display order
  filters?: { key: string; label: string }[];
  validate?: (next: string[]) => string | null;
  allowed: string[] | null;
  onChange: (ids: string[]) => void;
}) {
  const [mode, setMode] = useState<SectionMode>('view');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const [rule, setRule] = useState<{ at: string; text: string } | null>(null);

  const selected = allowed ?? entries.map(e => e.id);
  const query = search.trim().toLowerCase();
  const pool = filter ? entries.filter(e => e.filters?.includes(filter)) : entries;

  // Every save goes through here, so validate can't be skipped.
  const save = (next: string[], at: string) => {
    const problem = validate?.(next) ?? null;
    if (problem) return setRule({ at, text: problem });
    setRule(null);
    onChange(next);
  };

  return (
    <div className="setting-section setting-section--compact">
      <SectionHeader caption={caption} mode={mode} onModeChange={setMode} />

      <div className="spell-tools">
        {mode === 'edit' && (
          <input
            className="spell-search"
            type="search"
            placeholder={`Search ${noun}`}
            aria-label={`Search ${noun}`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        )}
        {filters && filters.length > 0 && (
          <div className="segmented spell-filter" role="radiogroup" aria-label={`Filter ${noun}`}>
            <button type="button" role="radio" aria-checked={filter === null} onClick={() => setFilter(null)}>All</button>
            {filters.map(f => (
              <button key={f.key} type="button" role="radio" aria-checked={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {groups.map(group => {
        const inGroup = pool.filter(e => e.group === group.key);
        if (inGroup.length === 0) return null;
        const allowedCount = inGroup.filter(e => selected.includes(e.id)).length;

        if (mode === 'view') {
          const left = inGroup.filter(e => !selected.includes(e.id));
          return (
            <div key={group.key} className="spell-level-summary">
              <span className="spell-level-summary__name">{group.label}</span>
              <span className="muted">
                {left.length === 0 ? `All ${inGroup.length} allowed`
                  : allowedCount === 0 ? 'None allowed'
                  : `${allowedCount} of ${inGroup.length} allowed · Not allowed: ${left.map(e => e.name).join(', ')}`}
              </span>
            </div>
          );
        }

        const shown = query ? inGroup.filter(e => e.name.toLowerCase().includes(query)) : inGroup;
        if (shown.length === 0) return null;
        const ids = inGroup.map(e => e.id);
        const groupKey = `group-${group.key}`;
        return (
          <div key={group.key} className="spell-level">
            <div className="spell-level__header">
              <span className="setting-caption">{group.label} · {allowedCount}/{inGroup.length}</span>
              <span className="spell-level__bulk">
                <button type="button" className="setting-button setting-button--quiet"
                  onClick={() => save([...new Set([...selected, ...ids])], groupKey)}>All</button>
                <button type="button" className="setting-button setting-button--quiet"
                  onClick={() => save(selected.filter(id => !ids.includes(id)), groupKey)}>None</button>
              </span>
            </div>
            {rule?.at === groupKey && <p className="setting-error">{rule.text}</p>}
            <div className="toggle-grid-wrap">
              <div className="toggle-grid">
                {shown.map(entry => (
                  <div key={entry.id} className="toggle-cell">
                    <Toggle
                      label={entry.name}
                      checked={selected.includes(entry.id)}
                      onChange={() => save(toggleId(selected, entry.id), entry.id)}
                    />
                    {entry.tags && entry.tags.length > 0 && (
                      <div className="spell-tags">
                        {entry.tags.map(t => <span key={t.key} className="spell-tag" title={t.title}>{t.label}</span>)}
                      </div>
                    )}
                    {rule?.at === entry.id && <p className="setting-error toggle-cell__error">{rule.text}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {mode === 'edit' && query && !pool.some(e => e.name.toLowerCase().includes(query)) && (
        <p className="muted">No {noun} match “{search.trim()}”.</p>
      )}
    </div>
  );
}
