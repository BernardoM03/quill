import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { loadGlossary, type glossary } from './glossary';
import { RulesText } from './RulesText';
import { termsIn } from './rulesTerms';
import './RulesText.css';

// Definitions for rules words, anywhere in the app. Mounted once (main.tsx), it listens on
// the whole document, so it covers every page and every element:
//   - words RulesText has underlined (they carry data-term): on hover, focus or tap;
//   - any other text naming something the glossary defines ("Saving Throws" on a sheet box,
//     "Short Rest" on a button): when the pointer rests on it for a moment.
// It also draws the switch, fixed in the corner of every page, that turns the hover off
// (remembered on this device). With it off, an underlined word still opens on tap or focus,
// so a definition is never out of reach.

const STORAGE_KEY = 'quill.tooltips';
const POPOVER_WIDTH = 320;
const GAP = 6;
// The least room kept between the popover and the edge of the screen.
const EDGE = 8;
// How long the pointer rests on plain text before its definition shows.
const REST = 350;
// After a failed glossary load (not signed in, offline), how long before trying again.
const RETRY = 30_000;
// Text the pointer search leaves alone: controls that hold text, and anything inside
// data-no-terms unless a nearer data-terms turns it back on (the panel beside the sheet).
const SKIP = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], .rules-popover';

interface opened {
  key: string;
  rect: DOMRect;
  container: HTMLElement;
  // Found under the pointer in plain text, rather than an underlined word.
  auto: boolean;
}

function readEnabled(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
}

const within = (r: DOMRect, x: number, y: number, pad: number) =>
  x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;

const termAt = (target: EventTarget | null) =>
  target instanceof Element ? target.closest<HTMLElement>('[data-term]') : null;

export function GlossaryTooltips() {
  const [enabled, setEnabled] = useState(readEnabled);
  const [terms, setTerms] = useState<glossary | null>(null);
  const [open, setOpen] = useState<opened | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // Tapped open: stays until tapped again or elsewhere.
  const pinned = useRef(false);
  // The latest values, for the document listeners (added once).
  const live = useRef({ enabled, terms, open });
  useEffect(() => { live.current = { enabled, terms, open }; });

  // Leaving the word waits a moment, so the pointer can cross into the popover to scroll it.
  const closeTimer = useRef<number | undefined>(undefined);
  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const closeSoon = () => { cancelClose(); closeTimer.current = window.setTimeout(() => setOpen(null), 150); };

  useEffect(() => {
    let restTimer: number | undefined;
    let lastTry = -RETRY;
    let alive = true;
    // The glossary needs a signed-in user, so a load can fail (the login page); try again later.
    const ensureGlossary = () => {
      if (live.current.terms || performance.now() - lastTry < RETRY) return;
      lastTry = performance.now();
      loadGlossary().then(t => alive && setTerms(t)).catch(() => {});
    };
    ensureGlossary();

    // The popover goes in the open modal <dialog> the word is in, if any: a modal sits in the
    // browser's top layer, above anything in the page however high its z-index.
    // Nothing for the word a panel is itself about (data-own-term): the Long Rest panel already
    // says what a Long Rest is, so a tooltip there would say it twice.
    const show = (key: string, rect: DOMRect, from: Element, auto: boolean) => {
      const own = from.closest<HTMLElement>('[data-own-term]')?.dataset.ownTerm;
      if (own && (own === key || own === `${key}s`)) return;
      window.clearTimeout(closeTimer.current);
      setOpen({ key, rect, auto, container: from.closest<HTMLElement>('dialog[open]') ?? document.body });
    };
    const showTerm = (el: HTMLElement) => show(el.dataset.term ?? '', el.getBoundingClientRect(), el, false);
    const inPopover = (target: EventTarget | null) => target instanceof Node && !!popRef.current?.contains(target);

    // The defined word under the pointer in target's own text, if there is one. Only target's
    // direct text is searched: text inside a child element would have had that child as target.
    const search = (target: Element, x: number, y: number) => {
      const glossary = live.current.terms;
      if (!glossary) { ensureGlossary(); return; }
      if (!target.isConnected || target.closest(SKIP) || target.closest('[data-no-terms], [data-terms]')?.hasAttribute('data-no-terms')) return;
      const range = document.createRange();
      for (const node of target.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const text = (node as Text).data;
        if (text.length > 5000 || !text.trim()) continue;
        for (const match of termsIn(text, glossary)) {
          range.setStart(node, match.start);
          range.setEnd(node, match.end);
          for (const rect of range.getClientRects()) {
            if (within(rect, x, y, 1)) { show(match.key, rect, target, true); return; }
          }
        }
      }
    };

    const onOver = (e: MouseEvent) => {
      const el = termAt(e.target);
      if (!el || !live.current.enabled || pinned.current || inPopover(el)) return;
      window.clearTimeout(restTimer);
      showTerm(el);
    };
    const onOut = (e: MouseEvent) => {
      if (termAt(e.target) && !pinned.current) closeSoon();
    };
    const onMove = (e: MouseEvent) => {
      window.clearTimeout(restTimer);
      if (!live.current.enabled || pinned.current) return;
      const target = e.target;
      if (!(target instanceof Element) || inPopover(target) || termAt(target)) return;
      const { open: current } = live.current;
      if (current?.auto) {
        if (within(current.rect, e.clientX, e.clientY, 3)) { window.clearTimeout(closeTimer.current); return; }
        closeSoon();
      }
      // Not while dragging (selecting text, moving a slider).
      if (e.buttons) return;
      const { clientX, clientY } = e;
      restTimer = window.setTimeout(() => search(target, clientX, clientY), REST);
    };
    const onLeave = () => { window.clearTimeout(restTimer); if (!pinned.current) closeSoon(); };
    const onFocus = (e: FocusEvent) => { const el = termAt(e.target); if (el) showTerm(el); };
    const onBlur = (e: FocusEvent) => { if (termAt(e.target)) { pinned.current = false; setOpen(null); } };
    // A tap (no hover on touch screens) keeps it open until tapped again or elsewhere.
    const onClick = (e: MouseEvent) => {
      const el = termAt(e.target);
      if (!el) {
        if (pinned.current && !inPopover(e.target)) { pinned.current = false; setOpen(null); }
        return;
      }
      e.preventDefault();
      pinned.current = !(pinned.current && live.current.open?.key === el.dataset.term);
      if (pinned.current) showTerm(el); else setOpen(null);
    };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    document.addEventListener('mousemove', onMove);
    document.documentElement.addEventListener('mouseleave', onLeave);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    document.addEventListener('click', onClick);
    return () => {
      alive = false;
      window.clearTimeout(restTimer);
      window.clearTimeout(closeTimer.current);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onBlur);
      document.removeEventListener('click', onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- added once; reads live.current
  }, []);

  // A popover is placed for where the word was; scrolling or Escape closes it.
  useEffect(() => {
    if (!open) return;
    const close = () => { pinned.current = false; setOpen(null); };
    // Scrolling the popover itself keeps it open; scrolling the page closes it.
    const onScroll = (e: Event) => { if (!popRef.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    try { localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off'); } catch { /* private mode: lasts for this visit */ }
    if (!next && !pinned.current) setOpen(null);
  }

  const entry = open && terms?.terms.get(open.key);
  let popover = null;
  if (open && entry && open.container.isConnected) {
    const left = Math.max(EDGE, Math.min(open.rect.left, window.innerWidth - POPOVER_WIDTH - EDGE));
    // On whichever side of the word has more room in the view (below on a tie), and no taller
    // than that room (or 60% of the screen), so it never runs off the edge. A long definition
    // scrolls inside.
    const spaceBelow = window.innerHeight - open.rect.bottom - GAP - EDGE;
    const spaceAbove = open.rect.top - GAP - EDGE;
    const below = spaceBelow >= spaceAbove;
    const maxHeight = Math.max(80, Math.min(window.innerHeight * 0.6, below ? spaceBelow : spaceAbove));
    const position = below
      ? { top: open.rect.bottom + GAP, maxHeight }
      : { bottom: window.innerHeight - open.rect.top + GAP, maxHeight };
    popover = createPortal(
      <div
        ref={popRef}
        className="rules-popover"
        role="tooltip"
        onMouseEnter={cancelClose}
        onMouseLeave={() => { if (!pinned.current) closeSoon(); }}
        style={{ left, width: POPOVER_WIDTH, ...position }}>
        <strong className="rules-popover__name">{entry.name}</strong>
        {entry.meta && <span className="rules-popover__meta">{entry.meta}</span>}
        <RulesText definitions={false}>{entry.text}</RulesText>
      </div>,
      open.container,
    );
  }

  return (
    <>
      <button type="button" className="tooltip-toggle" data-no-terms aria-pressed={enabled} onClick={toggle}
        title={enabled
          ? 'Rules words show their definition when you hover over them. Click to turn that off.'
          : 'Hovering over rules words does nothing. Click to show their definitions again.'}>
        Tooltips <span className="tooltip-toggle__state">{enabled ? 'On' : 'Off'}</span>
      </button>
      {popover}
    </>
  );
}
