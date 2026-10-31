import { apiClient } from '../api/client';
import type { CollectionName, Entry, PackManifest } from './types';

// Pack data comes from the server (server/routes/packs.py), not from static files: the
// manifests are public, collections need a signed-in user. Each is fetched once per page load.
let manifestsPromise: Promise<PackManifest[]> | null = null;
const collectionPromises = new Map<CollectionName, Promise<Map<string, unknown>>>();

export function loadManifests(): Promise<PackManifest[]> {
  if (!manifestsPromise) {
    manifestsPromise = apiClient.get<PackManifest[]>('/packs').then(response => response.data);
    // Drop a failed load so the next caller retries instead of reusing the error.
    manifestsPromise.catch(() => { manifestsPromise = null; });
  }
  return manifestsPromise;
}

// The server merges the collection across packs and refuses duplicate ids, so this only keys it.
async function fetchCollection<C extends CollectionName>(name: C): Promise<Map<string, Entry<C>>> {
  const response = await apiClient.get<Entry<C>[]>(`/packs/collections/${name}`);
  return new Map(response.data.map(entry => [entry.id, entry]));
}

export function loadCollection<C extends CollectionName>(name: C): Promise<Map<string, Entry<C>>> {
  let promise = collectionPromises.get(name);
  if (!promise) {
    promise = fetchCollection(name);
    promise.catch(() => collectionPromises.delete(name));
    collectionPromises.set(name, promise);
  }
  return promise as Promise<Map<string, Entry<C>>>;
}
