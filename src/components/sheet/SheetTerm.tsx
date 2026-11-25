import { useContext, type ReactNode } from 'react';

import { termKey } from '../glossary';
import { useGlossary } from '../useGlossary';
import { SheetInfoContext } from './sheetInfoContext';
import './Sheet.css';

// A rules word on the sheet that toggles its definition in the side panel, since hover popups are too busy there.
// Words the glossary doesn't define stay plain text.
// term is what to look up when it differs from the text shown, such as "Temporary Hit Points" for "Temp".
export function SheetTerm({ term, children }: { term: string, children: ReactNode }) {
  const glossary = useGlossary();
  const actions = useContext(SheetInfoContext);
  const key = glossary && termKey(glossary, term);
  const entry = key ? glossary.terms.get(key) : undefined;
  if (!actions || !key || !entry) return <>{children}</>;
  const id = `term:${key}`;
  const open = actions.openInfo === id;
  return (
    <button type="button" className={`sheet-term${open ? ' sheet-term--on' : ''}`} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => actions.onInfo(open ? null : { id, title: entry.name, meta: entry.meta, text: entry.text })}>
      {children}
    </button>
  );
}
