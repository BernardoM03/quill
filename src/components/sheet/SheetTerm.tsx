import { useContext, type ReactNode } from 'react';

import { termKey } from '../glossary';
import { useGlossary } from '../useGlossary';
import { SheetInfoContext } from './sheetInfoContext';
import './Sheet.css';

// A rules word on the character sheet: a box title ("Saving Throws"), a sense, a skill. The
// sheet is too dense for definitions to pop up under the pointer, so clicking the word opens
// its definition (from the packs' glossary) in the panel beside the sheet, where the text's
// own rules words do have tooltips. Clicking it again closes the panel. A word the glossary
// doesn't define is left as plain text.
// term: what to look up, when it isn't what's shown ("Temp" -> "Temporary Hit Points").
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
