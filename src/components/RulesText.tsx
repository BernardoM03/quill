import { useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { Glossary } from './glossary';
import { useGlossary } from './useGlossary';
import { keyFor, kindOfMatch, patternsFor } from './rulesTerms';
import './RulesText.css';

// Renders pack rules text (Markdown with GFM tables) and highlights dice, distances, conditions, terms and named content.
// Each highlight gets a CSS class such as .rules-dice, .rules-condition or .rules-spell.
// Words the glossary defines become focusable and show their definition through GlossaryTooltips.
// Raw HTML in the text is never rendered, which is react-markdown's default.

// The parts of the HTML tree (hast) this plugin touches, declared locally to avoid importing hast types.
interface TextNode { type: 'text'; value: string }
interface ElementNode { type: 'element'; tagName: string; properties: Record<string, unknown>; children: TreeNode[] }
type TreeNode = TextNode | ElementNode | { type: string; children?: TreeNode[] };

// Splits text into plain text and highlighted spans, marking glossary-defined spans with their key.
function highlight(text: string, terms: Glossary | null): TreeNode[] {
  const nodes: TreeNode[] = [];
  let lastEnd = 0;
  const { patterns, any } = patternsFor(terms);
  for (const match of text.matchAll(any)) {
    const start = match.index ?? 0;
    if (start > lastEnd) nodes.push({ type: 'text', value: text.slice(lastEnd, start) });
    const kind = kindOfMatch(patterns, match);
    const key = terms ? keyFor(terms, kind, match[0]) : null;
    nodes.push({
      type: 'element', tagName: 'span',
      properties: key ? { className: [kind, 'rules-defined'], dataTerm: key, tabIndex: 0 } : { className: [kind] },
      children: [{ type: 'text', value: match[0] }],
    });
    lastEnd = start + match[0].length;
  }
  if (lastEnd < text.length) nodes.push({ type: 'text', value: text.slice(lastEnd) });
  return nodes;
}

// A rehype plugin that highlights every text node outside code.
function rulesKeywords(terms: Glossary | null) {
  return () => {
    const walk = (node: TreeNode) => {
      if (!('children' in node) || !node.children) return;
      if ((node as ElementNode).tagName === 'code') return;
      node.children = node.children.flatMap(child =>
        child.type === 'text' ? highlight((child as TextNode).value, terms) : (walk(child), [child]));
    };
    return (tree: TreeNode) => walk(tree);
  };
}

// Inline text sits inside a sentence, so its paragraphs render as spans.
const INLINE_COMPONENTS = { p: ({ children }: { children?: React.ReactNode }) => <span>{children}</span> };

const REMARK_PLUGINS = [remarkGfm];

export function RulesText({ children, inline = false, className, definitions = true }: {
  children: string;
  inline?: boolean;
  className?: string;
  // False inside a popover, so definitions don't open further popovers.
  definitions?: boolean;
}) {
  const loadedGlossary = useGlossary();
  const terms = definitions ? loadedGlossary : null;
  const rehypePlugins = useMemo(() => [rulesKeywords(terms)], [terms]);
  const Wrapper = inline ? 'span' : 'div';
  return (
    <Wrapper className={['rules-text', className].filter(Boolean).join(' ')}>
      <Markdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={rehypePlugins} components={inline ? INLINE_COMPONENTS : undefined}>{children}</Markdown>
    </Wrapper>
  );
}
