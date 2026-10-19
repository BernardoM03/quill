export interface pack {
  id: string,
  name: string,
  version: string,
  license: string,
  attribution?: string,
  modifications?: string,
  provides: string[]
}

// Ids of every installed pack: each folder in public/packs that holds a pack.json.
// The index is built from the folders themselves (see the pack index plugin in
// vite.config.ts), so a shipped pack can't be left off and its license notice missed.
export async function fetchInstalledPackIds(): Promise<string[]> {
  const response = await fetch('/packs/index.json')
  return response.json() as Promise<string[]>
}

export async function fetchPackManifests(): Promise<pack[]> {
  const ids = await fetchInstalledPackIds()
  return Promise.all(
    ids.map(id =>
      fetch(`/packs/${id}/pack.json`).then(response => response.json() as Promise<pack>)
    )
  )
}
