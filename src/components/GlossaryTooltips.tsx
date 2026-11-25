import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { loadGlossary, type Glossary } from './glossary';
import { RulesText } from './RulesText';
import { termsIn } from './rulesTerms';
import './RulesText.css';

// App-wide rules definitions, mounted once and listening on the whole document.
// Words RulesText marked (data-term) open on hover, focus or tap.
// Other text naming a defined term opens once the pointer rests on it.
// A corner switch turns hover off for this device, while tap and focus keep working.

const STORAGE_KEY = 'quill.tooltips';
const POPOVER_WIDTH = 320;
const POPOVER_GAP = 6;
// Minimum room kept between the popover and the screen edge.
const EDGE_MARGIN = 8;
const MIN_POPOVER_HEIGHT = 80;
const MAX_POPOVER_SCREEN_SHARE = 0.6;
// How long the pointer rests on plain text before its definition shows.
const REST_DELAY_MS = 350;
// Delay before closing, so the pointer can cross into the popover to scroll it.
const CLOSE_DELAY_MS = 150;
// Wait after a failed glossary load (signed out or offline) before trying again.
const RETRY_DELAY_MS = 30_000;
// Text nodes longer than this aren't searched under the pointer.
const MAX_SEARCHED_TEXT = 5000;
// Elements whose text the pointer search ignores.
// data-no-terms also opts a subtree out unless a nearer data-terms opts it back in.
const SKIPPED_ELEMENTS = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], .rules-popover';

interface Opened {
  key: string;
  rect: DOMRect;
  container: HTMLElement;
  // True when found under the pointer in plain text rather than on a marked word.
  auto: boolean;
}

function readEnabled(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
}

const isWithin = (rect: DOMRect, x: number, y: number, padding: number) =>
  x >= rect.left - padding && x <= rect.right + padding && y >= rect.top - padding && y <= rect.bottom + padding;

const termElementOf = (target: EventTarget | null) =>
  target instanceof Element ? target.closest<HTMLElement>('[data-term]') : null;

// Places the popover on the side of the word with more room (below on a tie), capped to fit on screen.
function popoverPosition(rect: DOMRect) {
  const left = Math.max(EDGE_MARGIN, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - EDGE_MARGIN));
  const spaceBelow = window.innerHeight - rect.bottom - POPOVER_GAP - EDGE_MARGIN;
  const spaceAbove = rect.top - POPOVER_GAP - EDGE_MARGIN;
  const below = spaceBelow >= spaceAbove;
  const maxHeight = Math.max(MIN_POPOVER_HEIGHT, Math.min(window.innerHeight * MAX_POPOVER_SCREEN_SHARE, below ? spaceBelow : spaceAbove));
  const vertical = below
    ? { top: rect.bottom + POPOVER_GAP }
    : { bottom: window.innerHeight - rect.top + POPOVER_GAP };
  return { left, width: POPOVER_WIDTH, maxHeight, ...vertical };
}

export function GlossaryTooltips() {
  const [enabled, setEnabled] = useState(readEnabled);
  const [terms, setTerms] = useState<Glossary | null>(null);
  const [open, setOpen] = useState<Opened | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // A tapped popover stays open until tapped again or elsewhere.
  const pinned = useRef(false);
  // Latest state for the document listeners, which are added only once.
  const latest = useRef({ enabled, terms, open });
  useEffect(() => { latest.current = { enabled, terms, open }; });

  const closeTimer = useRef<number | undefined>(undefined);
  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const closeSoon = () => { cancelClose(); closeTimer.current = window.setTimeout(() => setOpen(null), CLOSE_DELAY_MS); };

  useEffect(() => {
    let restTimer: number | undefined;
    let lastLoadAttempt = -RETRY_DELAY_MS;
    let mounted = true;
    // Loading fails while signed out, so it is retried after a delay.
    const ensureGlossary = () => {
      if (latest.current.terms || performance.now() - lastLoadAttempt < RETRY_DELAY_MS) return;
      lastLoadAttempt = performance.now();
      loadGlossary().then(glossary => mounted && setTerms(glossary)).catch(() => {});
    };
    ensureGlossary();

    // Inside a modal <dialog> the popover must render in the dialog, which sits in the browser's top layer.
    // A panel about a term (data-own-term) already explains it, so that term gets no tooltip there.
    const show = (key: string, rect: DOMRect, source: Element, auto: boolean) => {
      const ownTerm = source.closest<HTMLElement>('[data-own-term]')?.dataset.ownTerm;
      if (ownTerm && (ownTerm === key || ownTerm === `${key}s`)) return;
      window.clearTimeout(closeTimer.current);
      setOpen({ key, rect, auto, container: source.closest<HTMLElement>('dialog[open]') ?? document.body });
    };
    const showTermElement = (element: HTMLElement) => show(element.dataset.term ?? '', element.getBoundingClientRect(), element, false);
    const isInPopover = (target: EventTarget | null) => target instanceof Node && !!popoverRef.current?.contains(target);
    const isOptedOut = (target: Element) =>
      target.closest(SKIPPED_ELEMENTS) || target.closest('[data-no-terms], [data-terms]')?.hasAttribute('data-no-terms');

    // Shows the defined term under the pointer in target's direct text nodes, if any.
    // Text inside a child element would have made that child the target instead.
    const showTermUnderPointer = (target: Element, x: number, y: number) => {
      const glossary = latest.current.terms;
      if (!glossary) { ensureGlossary(); return; }
      if (!target.isConnected || isOptedOut(target)) return;
      const range = document.createRange();
      for (const node of target.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const text = (node as Text).data;
        if (text.length > MAX_SEARCHED_TEXT || !text.trim()) continue;
        for (const match of termsIn(text, glossary)) {
          range.setStart(node, match.start);
          range.setEnd(node, match.end);
          for (const rect of range.getClientRects()) {
            if (isWithin(rect, x, y, 1)) { show(match.key, rect, target, true); return; }
          }
        }
      }
    };

    const onOver = (e: MouseEvent) => {
      const element = termElementOf(e.target);
      if (!element || !latest.current.enabled || pinned.current || isInPopover(element)) return;
      window.clearTimeout(restTimer);
      showTermElement(element);
    };
    const onOut = (e: MouseEvent) => {
      if (termElementOf(e.target) && !pinned.current) closeSoon();
    };
    const onMove = (e: MouseEvent) => {
      window.clearTimeout(restTimer);
      if (!latest.current.enabled || pinned.current) return;
      const target = e.target;
      if (!(target instanceof Element) || isInPopover(target) || termElementOf(target)) return;
      const current = latest.current.open;
      if (current?.auto) {
        if (isWithin(current.rect, e.clientX, e.clientY, 3)) { window.clearTimeout(closeTimer.current); return; }
        closeSoon();
      }
      // Skip while a button is held, such as when selecting text or dragging a slider.
      if (e.buttons) return;
      const { clientX, clientY } = e;
      restTimer = window.setTimeout(() => showTermUnderPointer(target, clientX, clientY), REST_DELAY_MS);
    };
    const onLeave = () => { window.clearTimeout(restTimer); if (!pinned.current) closeSoon(); };
    const onFocus = (e: FocusEvent) => { const element = termElementOf(e.target); if (element) showTermElement(element); };
    const onBlur = (e: FocusEvent) => { if (termElementOf(e.target)) { pinned.current = false; setOpen(null); } };
    // Touch screens have no hover, so a tap pins the popover open.
    const onClick = (e: MouseEvent) => {
      const element = termElementOf(e.target);
      if (!element) {
        if (pinned.current && !isInPopover(e.target)) { pinned.current = false; setOpen(null); }
        return;
      }
      e.preventDefault();
      pinned.current = !(pinned.current && latest.current.open?.key === element.dataset.term);
      if (pinned.current) showTermElement(element); else setOpen(null);
    };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    document.addEventListener('mousemove', onMove);
    document.documentElement.addEventListener('mouseleave', onLeave);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    document.addEventListener('click', onClick);
    return () => {
      mounted = false;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- added once; reads latest.current
  }, []);

  // The popover is positioned for where the word was, so page scrolling, resizing or Escape closes it.
  useEffect(() => {
    if (!open) return;
    const close = () => { pinned.current = false; setOpen(null); };
    const onScroll = (e: Event) => { if (!popoverRef.current?.contains(e.target as Node)) close(); };
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
    // In private mode storage fails, so the setting lasts only for this visit.
    try { localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off'); } catch { /* ignored */ }
    if (!next && !pinned.current) setOpen(null);
  }

  const definition = open && terms?.terms.get(open.key);
  const popover = open && definition && open.container.isConnected ? createPortal(
    <div
      ref={popoverRef}
      className="rules-popover"
      role="tooltip"
      onMouseEnter={cancelClose}
      onMouseLeave={() => { if (!pinned.current) closeSoon(); }}
      style={popoverPosition(open.rect)}>
      <strong className="rules-popover__name">{definition.name}</strong>
      {definition.meta && <span className="rules-popover__meta">{definition.meta}</span>}
      <RulesText definitions={false}>{definition.text}</RulesText>
    </div>,
    open.container,
  ) : null;

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
