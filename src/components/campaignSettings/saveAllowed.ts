// Saves an allowed-content list, rejecting with the server's reason so the section can show it by the toggle.
export type SaveAllowed = (ids: string[]) => Promise<void>;

export function refusalText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Could not save.';
}
