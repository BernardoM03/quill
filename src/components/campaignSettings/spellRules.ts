// Display helpers for spell lists, while the spell rules themselves live on the server.
type Named = { id: string; name: string };

// Short class tags using the first letter, or two letters when classes share one (Warlock "Wa", Wizard "Wi").
export function classTags(classes: Named[]): Map<string, string> {
  const firstLetters = classes.map(c => c.name[0]);
  return new Map(classes.map(c => {
    const shared = firstLetters.filter(l => l === c.name[0]).length > 1;
    return [c.id, shared ? c.name.slice(0, 2) : c.name[0]];
  }));
}
