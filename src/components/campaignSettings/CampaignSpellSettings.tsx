import { useState } from 'react';

import { useCollection } from '../../packs/usePacks';
import { SectionHeader, type SectionMode } from './SectionHeader';
import { Toggle } from './Toggle';
import { toggleId } from './toggleId';
import { classesWithoutCantrips, classTags } from './spellRules';

const levelName = (level: number) => (level === 0 ? 'Cantrips' : `Level ${level}`);

// Allowed spells, grouped by level. There are hundreds, so View mode summarizes each level
// (what's left out, not everything that's in) and Edit mode adds a search and All/None per level.
// Each spell is tagged with the classes that have it; the tags double as a class filter.
// A change that leaves an allowed class with no cantrips is refused.
// allowed / allowedClasses: the saved ids, or null for "all".
export function SpellSettings({ allowed, allowedClasses, onChange }: {
  allowed: string[] | null;
  allowedClasses: string[] | null;
  onChange: (ids: string[]) => void;
}) {
  const spells = useCollection('spells');
  const classes = useCollection('classes');
  const [mode, setMode] = useState<SectionMode>('view');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string | null>(null);
  // The refused change's message, shown where it came from: a spell's cell or a level's header.
  const [rule, setRule] = useState<{ at: string; text: string } | null>(null);

  let body;
  if (spells.loading || classes.loading) body = <p>Loading…</p>;
  else if (spells.error || classes.error) body = <p>Couldn't load spells.</p>;
  else {
    const all = [...spells.data!.values()].sort((a, b) => a.name.localeCompare(b.name));
    const classList = [...classes.data!.values()];
    // Only classes with spells get tags, so Bard is "B" rather than clashing with Barbarian.
    const casters = classList.filter(c => all.some(s => s.sourceIds?.includes(c.id)));
    const tags = classTags(casters);
    const selected = allowed ?? all.map(s => s.id);
    const selectedClasses = allowedClasses ?? classList.map(c => c.id);
    const levels = [...new Set(all.map(s => s.level))].sort((a, b) => a - b);
    const query = search.trim().toLowerCase();
    const pool = classFilter ? all.filter(s => s.sourceIds?.includes(classFilter)) : all;

    // Every save goes through here, so the cantrip rule can't be skipped.
    const save = (next: string[], at: string) => {
      const missing = classesWithoutCantrips(all, classList, selectedClasses, next);
      if (missing.length > 0) {
        return setRule({ at, text: `${missing.join(', ')} would have no cantrips. Each class needs at least one.` });
      }
      setRule(null);
      onChange(next);
    };

    const tagsFor = (sourceIds: string[] | undefined) =>
      (sourceIds ?? []).filter(id => tags.has(id)).map(id => (
        <span key={id} className="spell-tag" title={classes.data!.get(id)!.name}>{tags.get(id)}</span>
      ));

    body = (
      <>
        <div className="spell-tools">
          {mode === 'edit' && (
            <input
              className="spell-search"
              type="search"
              placeholder="Search spells"
              aria-label="Search spells"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          )}
          <div className="segmented spell-filter" role="radiogroup" aria-label="Filter by class">
            <button type="button" role="radio" aria-checked={classFilter === null} onClick={() => setClassFilter(null)}>All</button>
            {casters.map(c => (
              <button key={c.id} type="button" role="radio"
                aria-checked={classFilter === c.id} onClick={() => setClassFilter(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {levels.map(level => {
          const atLevel = pool.filter(s => s.level === level);
          if (atLevel.length === 0) return null;
          const allowedCount = atLevel.filter(s => selected.includes(s.id)).length;

          if (mode === 'view') {
            const left = atLevel.filter(s => !selected.includes(s.id));
            return (
              <div key={level} className="spell-level-summary">
                <span className="spell-level-summary__name">{levelName(level)}</span>
                <span className="muted">
                  {left.length === 0 ? `All ${atLevel.length} allowed`
                    : allowedCount === 0 ? 'None allowed'
                    : `${allowedCount} of ${atLevel.length} allowed · Not allowed: ${left.map(s => s.name).join(', ')}`}
                </span>
              </div>
            );
          }

          const shown = query ? atLevel.filter(s => s.name.toLowerCase().includes(query)) : atLevel;
          if (shown.length === 0) return null;
          const ids = atLevel.map(s => s.id);
          const levelKey = `level-${level}`;
          return (
            <div key={level} className="spell-level">
              <div className="spell-level__header">
                <span className="setting-caption">{levelName(level)} · {allowedCount}/{atLevel.length}</span>
                <span className="spell-level__bulk">
                  <button type="button" className="setting-button setting-button--quiet"
                    onClick={() => save([...new Set([...selected, ...ids])], levelKey)}>All</button>
                  <button type="button" className="setting-button setting-button--quiet"
                    onClick={() => save(selected.filter(id => !ids.includes(id)), levelKey)}>None</button>
                </span>
              </div>
              {rule?.at === levelKey && <p className="setting-error">{rule.text}</p>}
              <div className="toggle-grid-wrap">
                <div className="toggle-grid">
                  {shown.map(spell => (
                    <div key={spell.id} className="toggle-cell">
                      <Toggle
                        label={spell.name}
                        checked={selected.includes(spell.id)}
                        onChange={() => save(toggleId(selected, spell.id), spell.id)}
                      />
                      <div className="spell-tags">{tagsFor(spell.sourceIds)}</div>
                      {rule?.at === spell.id && <p className="setting-error toggle-cell__error">{rule.text}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {mode === 'edit' && query && !pool.some(s => s.name.toLowerCase().includes(query)) && (
          <p className="muted">No spells match “{search.trim()}”.</p>
        )}
      </>
    );
  }

  return (
    <div className="setting-section setting-section--compact">
      <SectionHeader caption="Allowed Spells" mode={mode} onModeChange={setMode} />
      {body}
    </div>
  );
}
