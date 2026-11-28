import { describe, expect, it } from 'vite-plus/test';
import {
  parseMarkdown,
  slugify,
  sanitiseHref,
  isMarkdownName,
  type InlineNode,
  type MarkdownBlock,
} from './markdown';

const inlineText = (nodes: InlineNode[]): string =>
  nodes
    .map((node) =>
      node.type === 'text' || node.type === 'code' ? node.value : inlineText(node.children),
    )
    .join('');

const findBlock = <T extends MarkdownBlock['type']>(
  blocks: MarkdownBlock[],
  type: T,
): Extract<MarkdownBlock, { type: T }> =>
  blocks.find((block): block is Extract<MarkdownBlock, { type: T }> => block.type === type)!;

describe('markdown parsing stays bounded and safe', () => {
  it('derives unique slugs from headings', () => {
    const { headings } = parseMarkdown('# Hello World\n\n## Hello World\n\n### 你好 World');
    expect(headings.map((heading) => heading.slug)).toEqual([
      'hello-world',
      'hello-world-2',
      '你好-world',
    ]);
    expect(slugify('  Spaced  Out!  ')).toBe('spaced-out');
  });
  it('parses basic inline emphasis, code and links', () => {
    const { blocks } = parseMarkdown(
      'Some **bold** and *italic* with `code` and [label](https://example.com).',
    );
    const paragraph = findBlock(blocks, 'paragraph');
    const types = paragraph.children.map((node) => node.type);
    expect(types).toContain('strong');
    expect(types).toContain('em');
    expect(types).toContain('code');
    const link = paragraph.children.find((node) => node.type === 'link');
    expect(link).toMatchObject({ type: 'link', href: 'https://example.com' });
  });
  it('captures code fences verbatim without parsing their contents', () => {
    const { blocks } = parseMarkdown('```ts\nconst a = **1**;\n```');
    const code = findBlock(blocks, 'code');
    expect(code).toMatchObject({ lang: 'ts', value: 'const a = **1**;' });
  });
  it('parses ordered and unordered lists', () => {
    const unordered = parseMarkdown('- one\n- two');
    expect(findBlock(unordered.blocks, 'list')).toMatchObject({
      ordered: false,
    });
    expect(findBlock(unordered.blocks, 'list').items).toHaveLength(2);
    const ordered = parseMarkdown('1. first\n2. second');
    expect(findBlock(ordered.blocks, 'list')).toMatchObject({ ordered: true });
  });
  it('escapes raw HTML so no injection survives', () => {
    const { blocks } = parseMarkdown('<script>alert(1)</script> and <b>bold</b>');
    const paragraph = findBlock(blocks, 'paragraph');
    // Angle brackets remain plain text; no element nodes are produced.
    expect(inlineText(paragraph.children)).toContain('<script>alert(1)</script>');
    expect(paragraph.children.every((node) => node.type === 'text')).toBe(true);
  });
  it('rejects dangerous link schemes but keeps http(s) and relative targets', () => {
    expect(sanitiseHref('javascript:alert(1)')).toBe('');
    expect(sanitiseHref('data:text/html,x')).toBe('');
    expect(sanitiseHref('//evil.example')).toBe('');
    expect(sanitiseHref('\\\\evil.example')).toBe('');
    expect(sanitiseHref('java\nscript:alert(1)')).toBe('');
    expect(sanitiseHref('https://example.com')).toBe('https://example.com');
    expect(sanitiseHref('/local/path')).toBe('/local/path');
    const { blocks } = parseMarkdown('[x](javascript:alert)');
    const paragraph = findBlock(blocks, 'paragraph');
    expect(paragraph.children.some((node) => node.type === 'link')).toBe(false);
    expect(inlineText(paragraph.children)).toBe('x');
  });
  it('recognises markdown file names', () => {
    expect(isMarkdownName('notes.md')).toBe(true);
    expect(isMarkdownName('README.MARKDOWN')).toBe(true);
    expect(isMarkdownName('image.png')).toBe(false);
  });
  it('consumes malformed fence openers and preserves shorter fences inside longer code blocks', () => {
    const malformed = parseMarkdown('```odd`marker\nAfter').blocks;
    expect(malformed).toHaveLength(2);
    expect(malformed[1]).toEqual({
      type: 'paragraph',
      children: [{ type: 'text', value: 'After' }],
    });
    expect(findBlock(parseMarkdown('````ts\none\n```\ntwo\n````').blocks, 'code').value).toBe(
      'one\n```\ntwo',
    );
  });
});
