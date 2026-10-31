// Display helpers for spell lists. The spell rules themselves (e.g. a class left with no
// cantrips) live on the server, in server/rules/spells.py.
type Named = { id: string; name: string };

// Short class tags for spell lists: the first letter, or the first two when classes share
// one (Warlock "Wa", Wizard "Wi"). Built from whatever classes the packs provide.
export function classTags(classes: Named[]): Map<string, string> {
  const firstLetters = classes.map(c => c.name[0]);
  return new Map(classes.map(c => {
    const shared = firstLetters.filter(l => l === c.name[0]).length > 1;
    return [c.id, shared ? c.name.slice(0, 2) : c.name[0]];
  }));
}
