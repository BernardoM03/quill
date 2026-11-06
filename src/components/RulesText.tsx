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
//   spells      Find Familiar, the Light cantrip                          .rules-spell
//   feats       Magic Initiate, the Alert feat                            .rules-feat
//   languages   the Draconic language                                     .rules-language
// Spell, feat and language names come from the packs once loaded. A multi-word name matches
// anywhere; a one-word name (Light, Shield, Alert) only where the text says what it is
// ("the Light cantrip", "cast Shield", "the Alert feat"), since it's usually an ordinary word.
// Words the packs define (glossary.ts) show their definition on hover, focus or tap. Raw HTML
// in the text is never rendered (react-markdown's default).

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
  // "Action" itself only as a rules phrase; on its own "action" is usually plain English.
  'Action', 'an action',
  // Rolls
  'Ability Checks?', 'Attack Rolls?', 'D20 Tests?', 'Damage Rolls?', 'Death Saving Throws?', 'Spell Attacks?',
  'Weapon Attacks?',
  // Movement and senses
  'Speed', 'Fly Speed', 'Swim Speed', 'Climb Speed', 'Burrow Speed', 'Hover', 'Reach', 'Telepathy', 'Teleportation',
  'Passive Perception',
  // Combat
  'Grappling', 'Surprise', 'Improvised Weapons?', 'Occupied Space', 'Unoccupied Space', 'Area of Effect',
  'Damage Threshold', 'Armor Training',
  // Light, vision and hazards
  'Bright Light', 'Dim Light', 'Darkness', 'Lightly Obscured', 'Heavily Obscured', 'Burning', 'Falling',
  'Suffocation', 'Dehydration', 'Malnutrition',
  // Social
  'Friendly', 'Indifferent', 'Hostile', 'Influence',
  // Magic and creatures
  'Cantrips?', 'Ritual', 'Spellcasting Focus', 'Attunement', 'Shape-Shifting', 'Creature Type', 'Challenge Rating',
  'Experience Points', 'Carrying Capacity', 'Dead', 'Stable',
];

type pattern = [kind: string, source: RegExp];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const longestFirst = (names: string[]) => [...names].sort((a, b) => b.length - a.length);

// Names of one kind: multi-word ones anywhere, one-word ones only before one of nouns
// ("Light cantrip") or after "cast ". Matches the name alone, so it's what gets the link.
function namePattern(names: string[], nouns: string): RegExp | null {
  const multi = longestFirst(names.filter(n => /\s/.test(n))).map(escape);
  const single = longestFirst(names.filter(n => !/\s/.test(n))).map(escape);
  const parts = [];
  if (multi.length) parts.push(`\\b(?:${multi.join('|')})(?![\\w(])`);
  if (single.length) parts.push(`(?:(?<=\\bcast )|\\b)(?:${single.join('|')})(?= (?:${nouns})\\b)`, `(?<=\\bcast )(?:${single.join('|')})\\b`);
  return parts.length ? new RegExp(parts.join('|')) : null;
}

// The patterns, in the order they're tried at each position; the first group that matches
// names the class. Names go before terms, so "Cone of Cold" is a spell rather than "Cone".
const STATIC_BEFORE: pattern[] = [
  ['rules-dice', /\b\d*d(?:4|6|8|10|12|20|100)\b(?:\s?[+−-]\s?\d+\b)?|\bDC \d+\b/],
  ['rules-measure', /\b\d+(?:-foot|-mile|\s(?:feet|foot|miles?))\b/],
];
const STATIC_AFTER: pattern[] = [
  ['rules-condition', new RegExp(`\\b(?:${CONDITIONS.join('|')})\\b`)],
  ['rules-term', new RegExp(`\\b(?:${longestFirst(TERMS).join('|')})\\b`)],
];

interface compiled { patterns: pattern[]; any: RegExp }
const compile = (patterns: pattern[]): compiled =>
  ({ patterns, any: new RegExp(patterns.map(([, p]) => `(${p.source})`).join('|'), 'g') });
const BASIC = compile([...STATIC_BEFORE, ...STATIC_AFTER]);
// Built once per loaded glossary.
const withNames = new WeakMap<glossary, compiled>();
function patternsFor(terms: glossary | null): compiled {
  if (!terms) return BASIC;
  let found = withNames.get(terms);
  if (!found) {
    const named: pattern[] = [];
    const add = (kind: string, p: RegExp | null) => p && named.push([kind, p]);
    add('rules-spell', namePattern(terms.spells, 'spell|cantrip|spells'));
    add('rules-feat', namePattern(terms.feats, 'feat'));
    add('rules-language', namePattern(terms.languages, 'language'));
    found = compile([...STATIC_BEFORE, ...named, ...STATIC_AFTER]);
    withNames.set(terms, found);
  }
  return found;
}

// The glossary key for a match of a kind, or null.
function keyFor(terms: glossary, kind: string, text: string): string | null {
  const prefix = { 'rules-spell': 'spell:', 'rules-feat': 'feat:', 'rules-language': 'language:' }[kind];
  if (prefix) return terms.terms.has(prefix + text.toLowerCase()) ? prefix + text.toLowerCase() : null;
  return kind === 'rules-measure' ? null : termKey(terms, text);
}

// The bits of the HTML tree (hast) this touches; kept local rather than importing its types.
interface textNode { type: 'text'; value: string }
interface elementNode { type: 'element'; tagName: string; properties: Record<string, unknown>; children: treeNode[] }
type treeNode = textNode | elementNode | { type: string; children?: treeNode[] };

// Splits text into plain text and highlighted spans. A span the glossary defines is focusable
// and carries its glossary key, for the popover.
function highlight(text: string, terms: glossary | null): treeNode[] {
  const out: treeNode[] = [];
  let last = 0;
  const { patterns, any } = patternsFor(terms);
  for (const match of text.matchAll(any)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ type: 'text', value: text.slice(last, at) });
    const kind = patterns[match.slice(1).findIndex(Boolean)][0];
    const key = terms ? keyFor(terms, kind, match[0]) : null;
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
  const popRef = useRef<HTMLDivElement>(null);
  // Leaving the word waits a moment, so the pointer can cross into the popover to scroll it.
  const closeTimer = useRef<number | undefined>(undefined);
  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const closeSoon = () => { cancelClose(); closeTimer.current = window.setTimeout(() => setOpen(null), 150); };
  useEffect(() => cancelClose, []);

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

  const termAt = (target: EventTarget) => (target as HTMLElement).closest?.<HTMLElement>('[data-term]') ?? null;
  const show = (el: HTMLElement) => setOpen({ key: el.dataset.term ?? '', rect: el.getBoundingClientRect() });
  const handlers = terms && {
    onMouseOver: (e: React.MouseEvent) => { const el = termAt(e.target); if (el && !pinned.current) { cancelClose(); show(el); } },
    onMouseOut: (e: React.MouseEvent) => { if (termAt(e.target) && !pinned.current) closeSoon(); },
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

  const entry = open && terms?.terms.get(open.key);
  let popover = null;
  if (open && entry) {
    const left = Math.max(8, Math.min(open.rect.left, window.innerWidth - POPOVER_WIDTH - 8));
    // Below the word, or above it when there isn't room underneath.
    const below = open.rect.bottom + 240 < window.innerHeight;
    const position = below
      ? { top: open.rect.bottom + GAP }
      : { bottom: window.innerHeight - open.rect.top + GAP };
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
