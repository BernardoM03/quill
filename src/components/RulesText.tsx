import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Markdown from 'react-markdown';

import { loadGlossary, termKey, type glossary } from './glossary';
import './RulesText.css';

// Rules text from the packs (features, traits, feats) is Markdown: paragraphs, **bold**
// lead-ins and lists. RulesText renders it, and picks out the words a player scans for:
//   dice        1d10, 2d6 + 3          .rules-dice
//   DCs         DC 15                  .rules-dice
//   distances   15-foot, 30 feet       .rules-measure
//   conditions  Frightened, Prone      .rules-condition
//   terms       Bonus Action, Advantage, Short Rest, saving throw, ...   .rules-term
// Words the pack's glossary defines (glossary.ts) show their definition on hover, focus or
// tap. Raw HTML in the text is never rendered (react-markdown's default).

const CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible',
  'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
];
const TERMS = [
  'Bonus Action', 'Reaction', 'Magic action', 'Attack action', 'Dash action', 'Disengage action', 'Dodge action',
  'Help action', 'Hide action', 'Ready action', 'Search action', 'Study action', 'Utilize action',
  'Advantage', 'Disadvantage', 'Resistance', 'Immunity', 'Vulnerability',
  'Short Rest', 'Long Rest', 'Temporary Hit Points', 'Hit Point maximum', 'Hit Points', 'Hit Point Dice', 'Hit Dice',
  'Proficiency Bonus', 'saving throws?', 'Saving Throws?', 'attack rolls?', 'ability checks?', 'Concentration',
  'Heroic Inspiration', 'Cone', 'Cube', 'Cylinder', 'Emanation', 'Line', 'Sphere', 'Darkvision', 'Blindsight',
  'Tremorsense', 'Truesight', 'Difficult Terrain', 'Unarmed Strike', 'Opportunity Attacks?', 'Critical Hit',
  'Initiative', 'Expertise', 'Bloodied', 'Armor Class', 'Difficulty Class', 'Cover',
];

// The patterns, in the order they're tried at each position; the first group that matches names the class.
const PATTERNS: [string, RegExp][] = [
  ['rules-dice', /\b\d*d(?:4|6|8|10|12|20|100)\b(?:\s?[+−-]\s?\d+\b)?|\bDC \d+\b/],
  ['rules-measure', /\b\d+(?:-foot|-mile|\s(?:feet|foot|miles?))\b/],
  ['rules-condition', new RegExp(`\\b(?:${CONDITIONS.join('|')})\\b`)],
  ['rules-term', new RegExp(`\\b(?:${[...TERMS].sort((a, b) => b.length - a.length).join('|')})\\b`)],
];
const ANY = new RegExp(PATTERNS.map(([, p]) => `(${p.source})`).join('|'), 'g');

// The bits of the HTML tree (hast) this touches; kept local rather than importing its types.
interface textNode { type: 'text'; value: string }
interface elementNode { type: 'element'; tagName: string; properties: Record<string, unknown>; children: treeNode[] }
type treeNode = textNode | elementNode | { type: string; children?: treeNode[] };

// Splits text into plain text and highlighted spans. A span the glossary defines is focusable
// and carries its glossary key, for the popover.
function highlight(text: string, terms: glossary | null): treeNode[] {
  const out: treeNode[] = [];
  let last = 0;
  for (const match of text.matchAll(ANY)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ type: 'text', value: text.slice(last, at) });
    const kind = PATTERNS[match.slice(1).findIndex(Boolean)][0];
    const key = terms && kind !== 'rules-measure' ? termKey(terms, match[0]) : null;
    out.push({
      type: 'element', tagName: 'span',
      properties: key ? { className: [kind, 'rules-defined'], dataTerm: key, tabIndex: 0 } : { className: [kind] },
      children: [{ type: 'text', value: match[0] }],
    });
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

// A rehype plugin: highlights every text node outside code.
function rulesKeywords(terms: glossary | null) {
  return () => {
    const walk = (node: treeNode) => {
      if (!('children' in node) || !node.children) return;
      if ((node as elementNode).tagName === 'code') return;
      node.children = node.children.flatMap(child =>
        child.type === 'text' ? highlight((child as textNode).value, terms) : (walk(child), [child]));
    };
    return (tree: treeNode) => walk(tree);
  };
}

// inline: inside a sentence (an option's note after its bold name), so paragraphs become spans.
const INLINE = { p: ({ children }: { children?: React.ReactNode }) => <span>{children}</span> };

// The glossary, once loaded; null until then (and if it can't be), when nothing has a popover.
function useGlossary(): glossary | null {
  const [terms, setTerms] = useState<glossary | null>(null);
  useEffect(() => {
    let live = true;
    loadGlossary().then(t => live && setTerms(t)).catch(() => {});
    return () => { live = false; };
  }, []);
  return terms;
}

const POPOVER_WIDTH = 320;
const GAP = 6;

export function RulesText({ children, inline = false, className, definitions = true }: {
  children: string;
  inline?: boolean;
  className?: string;
  // false inside a popover, so definitions don't open more popovers.
  definitions?: boolean;
}) {
  const loaded = useGlossary();
  const terms = definitions ? loaded : null;
  const plugins = useMemo(() => [rulesKeywords(terms)], [terms]);
  // The word whose definition is showing, and where it is on screen.
  const [open, setOpen] = useState<{ key: string; rect: DOMRect } | null>(null);
  const pinned = useRef(false);

  // A popover is placed for where the word was; scrolling or Escape closes it.
  useEffect(() => {
    if (!open) return;
    const close = () => { pinned.current = false; setOpen(null); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const termAt = (target: EventTarget) => (target as HTMLElement).closest?.<HTMLElement>('[data-term]') ?? null;
  const show = (el: HTMLElement) => setOpen({ key: el.dataset.term ?? '', rect: el.getBoundingClientRect() });
  const handlers = terms && {
    onMouseOver: (e: React.MouseEvent) => { const el = termAt(e.target); if (el && !pinned.current) show(el); },
    onMouseOut: (e: React.MouseEvent) => { if (termAt(e.target) && !pinned.current) setOpen(null); },
    onFocus: (e: React.FocusEvent) => { const el = termAt(e.target); if (el) show(el); },
    onBlur: (e: React.FocusEvent) => { if (termAt(e.target)) { pinned.current = false; setOpen(null); } },
    // A tap (no hover on touch screens) keeps it open until tapped again or elsewhere.
    onClick: (e: React.MouseEvent) => {
      const el = termAt(e.target);
      if (!el) return;
      e.preventDefault();
      pinned.current = !(pinned.current && open?.key === el.dataset.term);
      if (pinned.current) show(el); else setOpen(null);
    },
  };

  const entry = open && terms?.get(open.key);
  let popover = null;
  if (open && entry) {
    const left = Math.max(8, Math.min(open.rect.left, window.innerWidth - POPOVER_WIDTH - 8));
    // Below the word, or above it when there isn't room underneath.
    const below = open.rect.bottom + 240 < window.innerHeight;
    const position = below
      ? { top: open.rect.bottom + GAP }
      : { bottom: window.innerHeight - open.rect.top + GAP };
    popover = createPortal(
      <div className="rules-popover" role="tooltip" style={{ left, width: POPOVER_WIDTH, ...position }}>
        <strong className="rules-popover__name">{entry.name}</strong>
        <RulesText definitions={false}>{entry.text}</RulesText>
      </div>,
      document.body,
    );
  }

  const Wrapper = inline ? 'span' : 'div';
  return (
    <Wrapper className={['rules-text', className].filter(Boolean).join(' ')} {...handlers}>
      <Markdown rehypePlugins={plugins} components={inline ? INLINE : undefined}>{children}</Markdown>
      {popover}
    </Wrapper>
  );
}
