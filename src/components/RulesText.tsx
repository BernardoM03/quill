import Markdown from 'react-markdown';

import './RulesText.css';

// Rules text from the packs (features, traits, feats) is Markdown: paragraphs, **bold**
// lead-ins and lists. RulesText renders it, and picks out the words a player scans for:
//   dice        1d10, 2d6 + 3          .rules-dice
//   DCs         DC 15                  .rules-dice
//   distances   15-foot, 30 feet       .rules-measure
//   conditions  Frightened, Prone      .rules-condition
//   terms       Bonus Action, Advantage, Short Rest, saving throw, ...   .rules-term
// Raw HTML in the text is never rendered (react-markdown's default).

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
  'Tremorsense', 'Truesight', 'Difficult Terrain', 'Unarmed Strike',
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

function highlight(text: string): treeNode[] {
  const out: treeNode[] = [];
  let last = 0;
  for (const match of text.matchAll(ANY)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ type: 'text', value: text.slice(last, at) });
    const kind = PATTERNS[match.slice(1).findIndex(Boolean)][0];
    out.push({ type: 'element', tagName: 'span', properties: { className: [kind] }, children: [{ type: 'text', value: match[0] }] });
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

// A rehype plugin: splits every text node outside code into plain text and highlighted spans.
function rulesKeywords() {
  const walk = (node: treeNode) => {
    if (!('children' in node) || !node.children) return;
    if ((node as elementNode).tagName === 'code') return;
    node.children = node.children.flatMap(child =>
      child.type === 'text' ? highlight((child as textNode).value) : (walk(child), [child]));
  };
  return (tree: treeNode) => walk(tree);
}

const PLUGINS = [rulesKeywords];
// inline: inside a sentence (an option's note after its bold name), so paragraphs become spans.
const INLINE = { p: ({ children }: { children?: React.ReactNode }) => <span>{children}</span> };

export function RulesText({ children, inline = false, className }: {
  children: string;
  inline?: boolean;
  className?: string;
}) {
  const Wrapper = inline ? 'span' : 'div';
  return (
    <Wrapper className={['rules-text', className].filter(Boolean).join(' ')}>
      <Markdown rehypePlugins={PLUGINS} components={inline ? INLINE : undefined}>{children}</Markdown>
    </Wrapper>
  );
}
