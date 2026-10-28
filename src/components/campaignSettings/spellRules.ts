type Named = { id: string; name: string };
type Spell = Named & { level: number; sourceIds?: string[] };

// Short class tags for spell lists: the first letter, or the first two when classes share
// one (Warlock "Wa", Wizard "Wi"). Built from whatever classes the packs provide.
export function classTags(classes: Named[]): Map<string, string> {
  const firstLetters = classes.map(c => c.name[0]);
  return new Map(classes.map(c => {
    const shared = firstLetters.filter(l => l === c.name[0]).length > 1;
    return [c.id, shared ? c.name.slice(0, 2) : c.name[0]];
  }));
}

// Names of allowed classes that have cantrips on their list but none of them allowed.
// A class with no cantrips at all (Paladin, Ranger) is fine.
export function classesWithoutCantrips(spells: Spell[], classes: Named[], allowedClassIds: string[], allowedSpellIds: string[]): string[] {
  const cantrips = spells.filter(s => s.level === 0);
  return classes
    .filter(c => allowedClassIds.includes(c.id))
    .filter(c => {
      const own = cantrips.filter(s => s.sourceIds?.includes(c.id));
      return own.length > 0 && !own.some(s => allowedSpellIds.includes(s.id));
    })
    .map(c => c.name);
}
