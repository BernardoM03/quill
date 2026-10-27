import { useEffect, useState } from 'react';

import { loadCollection, loadManifests } from './loader';
import type { CollectionName, Entry } from './types';

type LoadState<T> = { data: T | null; error: Error | null };

function useLoad<T>(key: string, load: () => Promise<T>): LoadState<T> & { loading: boolean } {
  const [state, setState] = useState<LoadState<T> & { key: string | null }>({ key: null, data: null, error: null });

  useEffect(() => {
    let current = true;
    load()
      .then(data => current && setState({ key, data, error: null }))
      .catch((error: Error) => current && setState({ key, data: null, error }));
    return () => { current = false; };
  }, [key]);

  // A result for a previous key is stale: report loading until the new one lands.
  if (state.key !== key) return { data: null, error: null, loading: true };
  return { data: state.data, error: state.error, loading: false };
}

export function usePackManifests() {
  return useLoad('manifests', loadManifests);
}

// All entries in a collection across installed packs, keyed by id.
export function useCollection<C extends CollectionName>(name: C) {
  return useLoad<Map<string, Entry<C>>>(name, () => loadCollection(name));
}

// One entry by id, e.g. useEntry('spells', 'srd-5.2:spell/acid-arrow').
export function useEntry<C extends CollectionName>(name: C, id: string) {
  const { data, error, loading } = useCollection(name);
  return { entry: data?.get(id) ?? null, error, loading };
}
