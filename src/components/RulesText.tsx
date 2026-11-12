import { useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { glossary } from './glossary';
import { useGlossary } from './useGlossary';
import { keyFor, patternsFor } from './rulesTerms';
import './RulesText.css';


// Rules text from the packs (features, traits, feats) is Markdown: paragraphs, **bold**
// lead-ins and lists. RulesText renders it, and picks out the words a player scans for:
//   dice        1d10, 2d6 + 3          .rules-dice
//   DCs         DC 15                  .rules-dice
//   distances   15-foot, 30 feet       .rules-measure
//   conditions  Frightened, Prone      .rules-condition
//   terms       Bonus Action, Advantage, Short Rest, saving throw, ...   .rules-term
//   skills      Perception, Sleight of Hand                               .rules-skill
//   spells      Find Familiar, the Light cantrip                          .rules-spell
//   feats       Magic Initiate, the Alert feat                            .rules-feat
//   languages   the Draconic language                                     .rules-language
// Spell, feat and language names come from the packs once loaded. A multi-word name matches
// anywhere; a one-word name (Light, Shield, Alert) only where the text says what it is
// ("the Light cantrip", "cast Shield", "the Alert feat"), since it's usually an ordinary word.
// Words the packs define (glossary.ts) show their definition on hover, focus or tap. Tables
// (the glossary's Damage Types, Conditions, ...) are GitHub-flavoured Markdown. Raw HTML in the
// text is never rendered (react-markdown's default).

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

const REMARK = [remarkGfm];

// A word the glossary defines carries its key (data-term); GlossaryTooltips, mounted once for
// the whole app, shows the definition for it.
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
  const Wrapper = inline ? 'span' : 'div';
  return (
    <Wrapper className={['rules-text', className].filter(Boolean).join(' ')}>
      <Markdown remarkPlugins={REMARK} rehypePlugins={plugins} components={inline ? INLINE : undefined}>{children}</Markdown>
    </Wrapper>
  );
}
