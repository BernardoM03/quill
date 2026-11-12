import { useEffect, useState } from 'react';

import { loadGlossary, type glossary } from './glossary';

// The glossary, once loaded; null until then (and if it can't be), when nothing is defined.
export function useGlossary(): glossary | null {
  const [terms, setTerms] = useState<glossary | null>(null);
  useEffect(() => {
    let live = true;
    loadGlossary().then(t => live && setTerms(t)).catch(() => {});
    return () => { live = false; };
  }, []);
  return terms;
}
