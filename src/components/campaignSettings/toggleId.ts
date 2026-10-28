// Returns ids with id added or removed.
export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id];
}
