// Saving an allowed-content list. Resolves once saved; rejects with an Error whose message
// is the server's reason when it refuses the change (e.g. a class left with no cantrips),
// so each section can show it beside the toggle that caused it.
export type SaveAllowed = (ids: string[]) => Promise<void>;

export function refusalText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Could not save.';
}
