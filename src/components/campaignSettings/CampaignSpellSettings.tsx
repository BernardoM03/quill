import { useCollection } from '../../packs/usePacks';
import { GroupedSettings } from './GroupedSettings';
import type { SaveAllowed } from './saveAllowed';
import { classTags } from './spellRules';

const levelName = (level: number) => (level === 0 ? 'Cantrips' : `Level ${level}`);

// Allowed spells grouped by level and tagged with their classes, with a filter for one class's list.
// The server refuses changes that leave an allowed class without cantrips.
// allowed holds the saved ids, or null for all.
export function SpellSettings({ allowed, onChange }: {
  allowed: string[] | null;
  onChange: SaveAllowed;
}) {
  const spells = useCollection('spells');
  const classes = useCollection('classes');

  if (spells.loading || classes.loading) return <p>Loading…</p>;
  if (spells.error || classes.error) return <p>Couldn't load spells.</p>;

  const all = [...spells.data!.values()].sort((a, b) => a.name.localeCompare(b.name));
  const classList = [...classes.data!.values()];
  // Only classes with spells get tags, so Bard is "B" rather than clashing with Barbarian.
  const casters = classList.filter(c => all.some(s => s.sourceIds?.includes(c.id)));
  const tags = classTags(casters);
  const levels = [...new Set(all.map(s => s.level))].sort((a, b) => a - b);

  return (
    <GroupedSettings
      caption="Allowed Spells"
      noun="spells"
      entries={all.map(s => {
        const own = casters.filter(c => s.sourceIds?.includes(c.id));
        return {
          id: s.id,
          name: s.name,
          group: String(s.level),
          tags: own.map(c => ({ key: c.id, label: tags.get(c.id)!, title: c.name })),
          filters: own.map(c => c.id),
        };
      })}
      groups={levels.map(level => ({ key: String(level), label: levelName(level) }))}
      filters={casters.map(c => ({ key: c.id, label: c.name }))}
      allowed={allowed}
      onChange={onChange}
    />
  );
}
