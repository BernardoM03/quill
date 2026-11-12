import { useEffect, useRef, type ReactNode } from 'react';

import './Sheet.css';

// A panel beside the character sheet, for things that used to be modal dialogs (rests,
// conditions) and for rules text. It isn't modal: the sheet stays usable while it's open. It's
// rendered inside the sheet and placed against it (Sheet.css), so it's exactly the sheet's
// height: in the empty space to the sheet's right where there's room, over its right edge
// where there isn't. Escape or the × closes it; focus moves into it on opening so keyboard
// users land in it. data-terms: rules words in it have tooltips, though the sheet around it
// has them turned off, except for the word the panel is itself about (term; the label unless
// given), which would only repeat the panel.
export function SidePanel({ label, term, onClose, children }: {
  label: string,
  // The glossary key of what the panel explains, when it isn't the label in lower case.
  term?: string,
  onClose: () => void,
  children: ReactNode,
}) {
  const ref = useRef<HTMLElement>(null);
  // The latest onClose, so the Escape listener needn't be re-added on every render.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    // Without scrolling: the panel is as tall as the sheet, so its top may be off screen.
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <aside ref={ref} className="side-panel" data-terms data-own-term={term ?? label.toLowerCase()} role="dialog" aria-modal="false" aria-label={label} tabIndex={-1}>
      {children}
    </aside>
  );
}
