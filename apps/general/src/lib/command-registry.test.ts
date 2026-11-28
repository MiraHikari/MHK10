import { describe, expect, it } from 'vite-plus/test';
import {
  createDynamicCommands,
  createStaticCommands,
  parseQueryPrefix,
  computeCalcInfo,
} from '@/lib/command-registry';
import type { ArticleListItem } from '@/lib/blog/types';
import type { Project } from '@/lib/projects/types';

const article = (
  id: string,
  title: string,
  tags: string[] = [],
  category?: string,
): ArticleListItem => ({
  id,
  title,
  description: `${title} description`,
  publishDate: new Date('2026-01-01'),
  tags,
  category,
  draft: false,
  listed: true,
  featured: false,
  comments: true,
  author: 'Test',
  aiLevel: 'human',
  relatedIds: [],
  readingTime: 1,
  publishedTimeISO: new Date('2026-01-01').toISOString(),
  updates: [],
  headings: [],
  relations: { references: [], backlinks: [], related: [] },
});

const project = (id: string, title: string): Project => ({
  id,
  title,
  description: `${title} description`,
  tags: [],
  date: '2026',
  featured: false,
  order: 0,
});

describe('parseQueryPrefix', () => {
  it('returns null prefix for plain text', () => {
    expect(parseQueryPrefix('hello')).toEqual({ prefix: null, term: 'hello' });
  });

  it('recognises known prefixes', () => {
    expect(parseQueryPrefix(':blog foo')).toEqual({ prefix: 'blog', term: 'foo' });
    expect(parseQueryPrefix(':project test')).toEqual({ prefix: 'project', term: 'test' });
    expect(parseQueryPrefix(':skill ts')).toEqual({ prefix: 'skill', term: 'ts' });
  });

  it('maps :article to :blog', () => {
    expect(parseQueryPrefix(':article foo')).toEqual({ prefix: 'blog', term: 'foo' });
  });

  it('maps bare colon to :cmd', () => {
    expect(parseQueryPrefix(':')).toEqual({ prefix: 'cmd', term: '' });
    expect(parseQueryPrefix(': foo')).toEqual({ prefix: 'cmd', term: 'foo' });
  });

  it('treats unknown prefixes as plain search', () => {
    expect(parseQueryPrefix(':unknown foo')).toEqual({ prefix: null, term: ':unknown foo' });
  });

  it('trims whitespace', () => {
    expect(parseQueryPrefix('  :blog  foo  ')).toEqual({ prefix: 'blog', term: 'foo' });
  });
});

describe('computeCalcInfo', () => {
  it('evaluates = expressions', () => {
    expect(computeCalcInfo('=1+2')).toEqual({ ok: true, value: 3 });
  });

  it('evaluates calc prefix', () => {
    expect(computeCalcInfo('calc 10 * 5')).toEqual({ ok: true, value: 50 });
  });

  it('evaluates 计算 prefix', () => {
    expect(computeCalcInfo('计算 100 / 4')).toEqual({ ok: true, value: 25 });
  });

  it('returns null for non-calc queries', () => {
    expect(computeCalcInfo('hello')).toBeNull();
  });

  it('rejects expressions with illegal characters', () => {
    expect(computeCalcInfo('=1+alert(1)')).toEqual({ ok: false, error: '表达式包含非法字符' });
  });

  it('rejects invalid expressions', () => {
    expect(computeCalcInfo('=1/0')).toEqual({ ok: false, error: '表达式无效' });
  });
});

describe('createDynamicCommands id uniqueness', () => {
  it('keeps recent command identifiers while targeting authored project and skill IDs', () => {
    const { projectCommands, skillCommands } = createDynamicCommands({
      projects: [project('my-app', 'My App')],
      articles: [],
    });
    expect(projectCommands[0]).toMatchObject({ id: 'project-my-app', targetId: 'my-app' });
    for (const command of skillCommands) {
      expect(command.id).toBe(`skill-${command.targetId}`);
    }
    expect(skillCommands.find((command) => command.targetId === 'TanStack Query')).toBeDefined();
  });
  it('produces unique ids across all dynamic command groups', () => {
    const articles: ArticleListItem[] = [
      article('hello-world', 'Hello World', ['astro', 'react'], 'Engineering'),
      article('another-post', 'Another Post', ['astro', 'rust']),
    ];
    const projects: Project[] = [
      project('hello-world', 'Hello World Project'),
      project('my-app', 'My App'),
    ];

    const { projectCommands, tagCommands, skillCommands, honorCommands } = createDynamicCommands({
      projects,
      articles,
    });

    const allIds = new Set<string>();
    const duplicates: string[] = [];
    for (const command of [
      ...projectCommands,
      ...tagCommands,
      ...skillCommands,
      ...honorCommands,
    ]) {
      if (allIds.has(command.id)) {
        duplicates.push(command.id);
      }
      allIds.add(command.id);
    }

    expect(duplicates).toEqual([]);
  });

  it('honor commands use numeric indices regardless of title length', () => {
    const { honorCommands } = createDynamicCommands({
      projects: [],
      articles: [],
    });

    for (let i = 0; i < honorCommands.length; i++) {
      expect(honorCommands[i].id).toBe(`honor-${i}`);
      expect(honorCommands[i].targetId).toBe(`honor-${i}`);
    }
  });
});

describe('createStaticCommands', () => {
  it('includes one nav command per section', () => {
    const commands = createStaticCommands(false);
    const navCommands = commands.filter((c) => c.type === 'nav' && c.group === 'pages');
    expect(navCommands.length).toBeGreaterThan(0);
    expect(navCommands.every((c) => c.path)).toBe(true);
  });

  it('toggles bgm label based on playing state', () => {
    expect(createStaticCommands(true).find((c) => c.id === 'toggle-bgm')?.label).toContain('暂停');
    expect(createStaticCommands(false).find((c) => c.id === 'toggle-bgm')?.label).toContain('播放');
  });

  it('describes the subscribed zen preference', () => {
    expect(
      createStaticCommands(false, false, true).find((command) => command.id === 'zen-mode')?.label,
    ).toContain('退出');
    expect(
      createStaticCommands(false, false, false).find((command) => command.id === 'zen-mode')?.label,
    ).not.toContain('退出');
  });
});
