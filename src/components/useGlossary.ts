import { useEffect, useState } from 'react';

import { loadGlossary, type Glossary } from './glossary';

// Null until the glossary loads, and forever if it can't.
export function useGlossary(): Glossary | null {
  const [terms, setTerms] = useState<Glossary | null>(null);
  useEffect(() => {
    let mounted = true;
    loadGlossary().then(glossary => mounted && setTerms(glossary)).catch(() => {});
    return () => { mounted = false; };
  }, []);
  return terms;
}
