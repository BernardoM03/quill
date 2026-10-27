import { fetchInstalledPackIds } from '../datatypes/pack';
import type { CollectionName, Entry, PackManifest } from './types';

let manifestsPromise: Promise<PackManifest[]> | null = null;
const collectionPromises = new Map<CollectionName, Promise<Map<string, unknown>>>();

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  return response.json() as Promise<T>;
}

export function loadManifests(): Promise<PackManifest[]> {
  manifestsPromise ??= fetchInstalledPackIds().then(ids =>
    Promise.all(ids.map(id => fetchJson<PackManifest>(`/packs/${id}/pack.json`)))
  );
  return manifestsPromise;
}

async function fetchCollection<C extends CollectionName>(name: C): Promise<Map<string, Entry<C>>> {
  const manifests = await loadManifests();
  const providers = manifests.filter(manifest => manifest.provides.includes(name));
  const files = await Promise.all(
    providers.map(manifest => fetchJson<Entry<C>[]>(`/packs/${manifest.id}/${name}.json`))
  );

  const entries = new Map<string, Entry<C>>();
  files.forEach((file, i) => {
    for (const entry of file) {
      // Ids are namespaced by pack ("srd-5.2:spell/..."), so a clash means a
      // pack reused another pack's namespace — fail loudly rather than shadow.
      if (entries.has(entry.id)) {
        throw new Error(`Duplicate ${name} id "${entry.id}" in pack ${providers[i].id}`);
      }
      entries.set(entry.id, entry);
    }
  });
  return entries;
}

export function loadCollection<C extends CollectionName>(name: C): Promise<Map<string, Entry<C>>> {
  let promise = collectionPromises.get(name);
  if (!promise) {
    promise = fetchCollection(name);
    // Drop a failed load so the next caller retries instead of reusing the error.
    promise.catch(() => collectionPromises.delete(name));
    collectionPromises.set(name, promise);
  }
  return promise as Promise<Map<string, Entry<C>>>;
}
