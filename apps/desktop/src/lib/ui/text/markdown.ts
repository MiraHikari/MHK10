// markdown.ts: a small, bounded, DOM-free Markdown parser for the Reader.
// It returns a structured document (blocks + headings with slugs). All text is
// carried as plain string values, so a DOM consumer that assigns via
// textContent cannot be tricked into executing injected HTML. Link targets are
// sanitised here so only http(s) and relative references survive.

/** Inline fragments inside a block; `value` fields are always plain text. */
export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'em'; children: InlineNode[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; children: InlineNode[] };

export interface MarkdownHeading {
  depth: number;
  slug: string;
  text: string;
}

export type MarkdownBlock =
  | {
      type: 'heading';
      depth: number;
      slug: string;
      text: string;
      children: InlineNode[];
    }
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'code'; lang: string; value: string }
  | { type: 'list'; ordered: boolean; items: InlineNode[][] }
  | { type: 'blockquote'; children: InlineNode[] }
  | { type: 'hr' };

export interface MarkdownDocument {
  blocks: MarkdownBlock[];
  headings: MarkdownHeading[];
}

const MAX_INPUT = 2000000;
const MAX_BLOCKS = 20000;
const MAX_INLINE_DEPTH = 6;

/** Collapse heading text to a URL-safe slug, keeping letters and digits only. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/** Keep only http(s) and relative references; reject javascript: and other schemes. */
export function sanitiseHref(href: string): string {
  const value = href.trim();
  if (!value || /[\u0000-\u0020\u007f\\]/.test(value)) return '';
  // A leading scheme (letters/digits/+/-/. then ':') must be http or https.
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  if (scheme) {
    const name = scheme[1].toLowerCase();
    return name === 'http' || name === 'https' ? value : '';
  }
  // Reject protocol-relative URLs that could smuggle a scheme later.
  if (value.startsWith('//')) return '';
  return value;
}

const inlineText = (nodes: InlineNode[]): string =>
  nodes
    .map((node) =>
      node.type === 'text' || node.type === 'code' ? node.value : inlineText(node.children),
    )
    .join('');

function parseInline(input: string, depth = 0): InlineNode[] {
  // Huge unbroken lines remain readable without unbounded delimiter scanning.
  if (input.length > 20000) return [{ type: 'text', value: input }];
  const nodes: InlineNode[] = [];
  let buffer = '';
  const flush = (): void => {
    if (buffer) nodes.push({ type: 'text', value: buffer });
    buffer = '';
  };
  let index = 0;
  while (index < input.length) {
    const rest = input.slice(index);
    // Inline code: `code`
    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      flush();
      nodes.push({ type: 'code', value: code[1] });
      index += code[0].length;
      continue;
    }
    // Links: [label](href)
    const link = /^\[([^\]]*)\]\(([^)\s]*)\)/.exec(rest);
    if (link) {
      const href = sanitiseHref(link[2]);
      const children = depth < MAX_INLINE_DEPTH ? parseInline(link[1], depth + 1) : [];
      flush();
      if (href) nodes.push({ type: 'link', href, children });
      else
        nodes.push(
          ...(children.length ? children : [{ type: 'text', value: link[1] } satisfies InlineNode]),
        );
      index += link[0].length;
      continue;
    }
    // Strong: **text** or __text__
    const strong = /^(\*\*|__)(.+?)\1/.exec(rest);
    if (strong && depth < MAX_INLINE_DEPTH) {
      flush();
      nodes.push({
        type: 'strong',
        children: parseInline(strong[2], depth + 1),
      });
      index += strong[0].length;
      continue;
    }
    // Emphasis: *text* or _text_
    const em = /^(\*|_)([^*_]+?)\1/.exec(rest);
    if (em && depth < MAX_INLINE_DEPTH) {
      flush();
      nodes.push({ type: 'em', children: parseInline(em[2], depth + 1) });
      index += em[0].length;
      continue;
    }
    buffer += input[index];
    index += 1;
  }
  flush();
  return nodes;
}

/** Parse Markdown text into a bounded structure; never emits HTML. */
export function parseMarkdown(source: string): MarkdownDocument {
  const blocks: MarkdownBlock[] = [];
  const headings: MarkdownHeading[] = [];
  const slugs = new Set<string>();
  const assignSlug = (text: string): string => {
    const base = slugify(text) || 'section';
    let slug = base;
    let counter = 2;
    while (slugs.has(slug)) slug = `${base}-${counter++}`;
    slugs.add(slug);
    return slug;
  };
  if (typeof source !== 'string' || !source) return { blocks, headings };
  const lines = source.slice(0, MAX_INPUT).replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && blocks.length < MAX_BLOCKS) {
    const line = lines[i];
    // Blank lines separate blocks.
    if (!line.trim()) {
      i += 1;
      continue;
    }
    // Fenced code: ``` or ~~~
    const fence = /^(```+|~~~+)\s*([^`~]*)$/.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const lang = fence[2].trim().split(/\s+/)[0] ?? '';
      const body: string[] = [];
      i += 1;
      while (
        i < lines.length &&
        !new RegExp(`^${marker}{${fence[1].length},}\\s*$`).test(lines[i])
      ) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // consume closing fence if present
      blocks.push({ type: 'code', lang, value: body.join('\n') });
      continue;
    }
    // ATX heading: # .. ######
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const depth = heading[1].length;
      const children = parseInline(heading[2].replace(/\s+#+\s*$/, '').trim());
      const text = inlineText(children);
      const slug = assignSlug(text);
      headings.push({ depth, slug, text });
      blocks.push({ type: 'heading', depth, slug, text, children });
      i += 1;
      continue;
    }
    // Horizontal rule.
    if (/^(\s*[-*_]){3,}\s*$/.test(line) && /^[\s\-*_]+$/.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }
    // Blockquote: one or more leading '>' lines.
    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push({
        type: 'blockquote',
        children: parseInline(quoted.join(' ').trim()),
      });
      continue;
    }
    // Lists: ordered (1.) or unordered (-, *, +).
    const listItem = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (listItem) {
      const ordered = /\d/.test(listItem[2]);
      const items: InlineNode[][] = [];
      while (i < lines.length) {
        const match = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!match || /\d/.test(match[2]) !== ordered) break;
        items.push(parseInline(match[3].trim()));
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    // Paragraph: gather consecutive non-blank, non-structural lines.
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|```|~~~|\s*>|\s*([-*+]|\d+[.)])\s)/.test(lines[i])
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    if (paragraph.length)
      blocks.push({
        type: 'paragraph',
        children: parseInline(paragraph.join(' ')),
      });
    else {
      // A fence-like line that is not a valid opener must still consume input.
      blocks.push({ type: 'paragraph', children: parseInline(lines[i]) });
      i += 1;
    }
  }
  return { blocks, headings };
}

/** True when a file name denotes Markdown by extension. */
export function isMarkdownName(name: string): boolean {
  return /\.(md|markdown)$/i.test(name.trim());
}
