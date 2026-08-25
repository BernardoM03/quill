export interface pack {
  id: string,
  name: string,
  version: string,
  license: string,
  attribution?: string,
  modifications?: string,
  provides: string[]
}

// Packs whose manifests the Legal page loads. Every pack shipped in public/packs
// belongs here: its license terms are only discharged if its notice is rendered.
export const INSTALLED_PACKS: string[] = ['srd-5.2']

export async function fetchPackManifests(): Promise<pack[]> {
  return Promise.all(
    INSTALLED_PACKS.map(id =>
      fetch(`/packs/${id}/pack.json`).then(response => response.json() as Promise<pack>)
    )
  )
}
