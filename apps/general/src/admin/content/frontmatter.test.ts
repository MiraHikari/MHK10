import { describe, expect, it } from 'vite-plus/test';
import {
  serializeDocument,
  splitFrontmatter,
  type MarkdownDocument,
} from '@/admin/content/frontmatter';

const DOC = (data: Record<string, unknown>, body: string): MarkdownDocument => ({
  data,
  body,
});

describe('splitFrontmatter', () => {
  it('解析嵌套 updates 数组、CJK 字符串与行内 tags 数组', () => {
    const raw = [
      '---',
      "title: '使用中文标题的测试'",
      'tags:',
      '  - astro',
      '  - react',
      'updates:',
      '  - version: 1.0.0',
      '    date: 2026-07-11',
      '    summary: 初始发布',
      '  - version: 1.1.0',
      '    date: 2026-07-26',
      '    summary: 支持夜间模式',
      '---',
      '正文开始。',
    ].join('\n');

    expect(splitFrontmatter(raw)).toEqual(
      DOC(
        {
          title: '使用中文标题的测试',
          tags: ['astro', 'react'],
          updates: [
            { version: '1.0.0', date: '2026-07-11', summary: '初始发布' },
            { version: '1.1.0', date: '2026-07-26', summary: '支持夜间模式' },
          ],
        },
        '正文开始。',
      ),
    );
  });

  it('将 publishDate 保持为 YYYY-MM-DD 字符串，而不是 Date 对象', () => {
    const raw = '---\npublishDate: 2026-07-11\n---\n正文';
    const parsed = splitFrontmatter(raw);

    expect(parsed.data.publishDate).toBe('2026-07-11');
    expect(parsed.data.publishDate).not.toBeInstanceOf(Date);
  });

  it('无 frontmatter 时返回空 data 并原样保留 body', () => {
    const raw = '这是没有 frontmatter 的\n\n正文。';

    expect(splitFrontmatter(raw)).toEqual(DOC({}, raw));
  });

  it('body 逐字保留，包括首尾空白与空行（frontmatter 终止换行不计入 body）', () => {
    const body = '\nhello\n\n\nworld\n';
    const raw = `---\ntitle: x\n---\n${body}`;

    expect(splitFrontmatter(raw)).toEqual(DOC({ title: 'x' }, body));
  });

  it('tolerates a leading UTF-8 BOM before the opening fence', () => {
    const raw = `\uFEFF---\ntitle: bom\n---\nbody`;
    expect(splitFrontmatter(raw)).toEqual(DOC({ title: 'bom' }, 'body'));
  });
});

describe('serializeDocument', () => {
  it('frontmatter 与 body 之间恰好一个换行，且文末恰好一个换行', () => {
    const serialized = serializeDocument({ title: 'x' }, 'hello');

    expect(serialized).toBe('---\ntitle: x\n---\nhello\n');
    expect(serialized.endsWith('\n')).toBe(true);
    expect(serialized.endsWith('\n\n')).toBe(false);
  });

  it('Date 对象在序列化前被转回 YYYY-MM-DD', () => {
    const serialized = serializeDocument({ publishDate: new Date('2026-07-11T00:00:00.000Z') }, '');

    expect(serialized).toContain('publishDate: 2026-07-11');
  });

  it('保持键顺序', () => {
    const data = { zebra: 1, apple: 2, mango: 3 };
    const serialized = serializeDocument(data, '');
    const keys = [...serialized.matchAll(/^([a-z]+):/gm)].map((m) => m[1]);

    expect(keys).toEqual(['zebra', 'apple', 'mango']);
  });

  it('split → serialize 往返后日期仍是 YYYY-MM-DD', () => {
    const raw = '---\npublishDate: 2026-07-11\ncategory: note\n---\n正文内容';
    const parsed = splitFrontmatter(raw);
    const serialized = serializeDocument(parsed.data, parsed.body);

    expect(serialized).toContain('publishDate: 2026-07-11');
    expect(serialized).toBe(raw + '\n');
  });
});
