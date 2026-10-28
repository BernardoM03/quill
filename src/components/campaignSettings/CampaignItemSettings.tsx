import { useCollection } from '../../packs/usePacks';
import { GroupedSettings } from './GroupedSettings';

// "spellcastingFocus" -> "Spellcasting Focus"
const titleCase = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

// Keys in the order they first appear, so groups follow the pack's own ordering.
const keysInOrder = (values: string[]) => [...new Set(values)];

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'veryRare', 'legendary', 'artifact', 'varies'];

type Props = { allowed: string[] | null; onChange: (ids: string[]) => void };

// Mundane equipment, grouped by category (weapons, armor, gear, ...).
export function EquipmentSettings({ allowed, onChange }: Props) {
  const { data, error, loading } = useCollection('equipment');
  if (loading) return <p>Loading…</p>;
  if (error) return <p>Couldn't load equipment: {error.message}</p>;

  const all = [...data!.values()].sort((a, b) => a.name.localeCompare(b.name));
  const categories = keysInOrder([...data!.values()].map(e => e.category));

  return (
    <GroupedSettings
      caption="Allowed Equipment"
      noun="equipment"
      entries={all.map(e => ({ id: e.id, name: e.name, group: e.category }))}
      groups={categories.map(c => ({ key: c, label: titleCase(c) }))}
      allowed={allowed}
      onChange={onChange}
    />
  );
}

// Magic items, grouped by rarity and filterable by category (potions, rings, ...).
export function MagicItemSettings({ allowed, onChange }: Props) {
  const { data, error, loading } = useCollection('magic-items');
  if (loading) return <p>Loading…</p>;
  if (error) return <p>Couldn't load magic items: {error.message}</p>;

  const all = [...data!.values()].sort((a, b) => a.name.localeCompare(b.name));
  const rarities = keysInOrder(all.map(i => i.rarity))
    .sort((a, b) => RARITY_ORDER.indexOf(a) - RARITY_ORDER.indexOf(b));
  const categories = keysInOrder(all.map(i => i.category)).sort();

  return (
    <GroupedSettings
      caption="Allowed Magic Items"
      noun="magic items"
      entries={all.map(i => ({ id: i.id, name: i.name, group: i.rarity, filters: [i.category] }))}
      groups={rarities.map(r => ({ key: r, label: titleCase(r) }))}
      filters={categories.map(c => ({ key: c, label: titleCase(c) }))}
      allowed={allowed}
      onChange={onChange}
    />
  );
}
