import { useEffect, useRef, type ReactNode } from 'react';

import './Sheet.css';

// A non-modal panel beside the character sheet for rests, conditions and rules text.
// It renders inside the sheet so it matches the sheet's height, overlapping its right edge on narrow screens.
// Focus moves into it on opening, and Escape or the × closes it.
// Rules words inside get tooltips (data-terms), except the term the panel itself explains.
export function SidePanel({ label, term, onClose, children }: {
  label: string,
  // The glossary key the panel explains, when it isn't the lowercased label.
  term?: string,
  onClose: () => void,
  children: ReactNode,
}) {
  const ref = useRef<HTMLElement>(null);
  // Holds the latest onClose so the Escape listener isn't re-added every render.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    // Don't scroll, since the panel is as tall as the sheet and its top may be off screen.
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
