import { useCollection } from '../../packs/usePacks';
import { GroupedSettings } from './GroupedSettings';
import { classTags } from './spellRules';

const levelName = (level: number) => (level === 0 ? 'Cantrips' : `Level ${level}`);

// Allowed spells, grouped by level. Each spell is tagged with the classes that have it,
// and the class filter narrows to one class's list. A change that leaves an allowed class
// with no cantrips is refused by the server (server/rules/problems.py).
// allowed: the saved ids, or null for "all".
export function SpellSettings({ allowed, onChange }: {
  allowed: string[] | null;
  onChange: (ids: string[]) => void;
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
