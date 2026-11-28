import { describe, expect, it } from 'vite-plus/test';
import { projects } from '../../../data/profile';
import { ProjectBrowser } from './project-browser-model';

const records = Object.freeze([
  Object.freeze({
    id: 'beta',
    title: 'Beta',
    date: '2024-12-14',
    tags: Object.freeze(['Rust', 'Desktop']),
    description: '跨平台桌面工具',
    summary: 'Firmware debugger',
    highlights: Object.freeze(['串口与固件管理']),
    href: '/projects/beta/',
  }),
  Object.freeze({
    id: 'alpha',
    title: 'Alpha',
    date: '2026-07-26',
    tags: Object.freeze(['TypeScript', 'Web']),
    description: '个人站点与文章',
    summary: 'An accessible reader',
    highlights: Object.freeze(['全文搜索']),
    href: '/projects/alpha/',
  }),
  Object.freeze({
    id: 'alpha-again',
    title: 'ＡＬＰＨＡ',
    date: '2026-07-26',
    tags: Object.freeze(['Rust', 'Web']),
    description: '设备接口',
    summary: 'Protocol tools',
    highlights: Object.freeze(['测试与文档']),
    href: '/projects/alpha-again/',
  }),
]);

describe('ProjectBrowser', () => {
  it('searches authored projects across Chinese content and normalized English terms', () => {
    const browser = new ProjectBrowser(projects);
    browser.configure({ query: '  ＲＵＳＴ　 桌面   ' });
    expect(browser.snapshot().items.map((record) => record.id)).toContain('nearlink-toolbox');
    expect(browser.snapshot().query).toBe('  ＲＵＳＴ　 桌面   ');
    browser.configure({ query: 'Injective 测试网' });
    expect(browser.snapshot().items.map((record) => record.id)).toEqual(['xengine']);
    expect(browser.snapshot().selected?.github).toBe('https://github.com/example-org/xengine');
  });

  it('applies multiword AND search across fields and preserves the raw query', () => {
    const browser = new ProjectBrowser(records);
    const query = '  ＦＩＲＭＷＡＲＥ　 桌面 rUsT  ';
    browser.configure({ query });
    expect(browser.snapshot()).toMatchObject({
      items: [records[0]],
      selected: records[0],
      query,
      total: 3,
    });
    browser.configure({ query: '固件 nonexistent' });
    expect(browser.snapshot()).toMatchObject({ items: [], selected: undefined });
    browser.configure({ query: '  \t　\n ' });
    expect(browser.snapshot().items).toEqual(records);
  });

  it('bounds raw input without splitting Unicode characters or rewriting capitalization', () => {
    const browser = new ProjectBrowser(records);
    const query = 'Ａa😀'.repeat(41);
    browser.configure({ query });
    expect(browser.snapshot().query).toBe('Ａa😀'.repeat(40));
    expect(Array.from(browser.snapshot().query)).toHaveLength(120);
    expect(browser.snapshot().query).not.toContain('\uFFFD');
  });

  it('keeps full tag choices and a matching selection while combining filters', () => {
    const browser = new ProjectBrowser(records);
    expect(browser.snapshot().tags).toEqual(['Rust', 'Desktop', 'TypeScript', 'Web']);
    expect(browser.select('alpha-again')).toBe(true);
    browser.configure({ tag: 'ＲＵＳＴ', query: 'Web' });
    expect(browser.snapshot()).toMatchObject({
      items: [records[2]],
      selected: records[2],
      tag: 'ＲＵＳＴ',
      tags: ['Rust', 'Desktop', 'TypeScript', 'Web'],
      total: 3,
    });
    expect(browser.select('alpha')).toBe(false);
    expect(browser.snapshot().selected).toBe(records[2]);
    browser.configure({ query: '', tag: 'Desktop' });
    expect(browser.snapshot().selected).toBe(records[0]);
    browser.configure({ tag: 'Missing tag' });
    expect(browser.snapshot()).toMatchObject({ items: [], selected: undefined });
  });

  it('sorts stably without changing authored order or selected records', () => {
    const browser = new ProjectBrowser(records);
    const original = browser.snapshot();
    browser.configure({ sort: 'name' });
    expect(browser.snapshot().items).toEqual([records[1], records[2], records[0]]);
    expect(browser.snapshot().selected).toBe(records[0]);
    browser.configure({ sort: 'newest' });
    expect(browser.snapshot().items).toEqual([records[1], records[2], records[0]]);
    browser.configure({ sort: 'curated' });
    expect(browser.snapshot().items).toEqual(records);
    expect(original.items).toEqual(records);
    expect(records.map((record) => record.id)).toEqual(['beta', 'alpha', 'alpha-again']);
    expect(browser.snapshot().selected?.href).toBe('/projects/beta/');
  });

  it('reveals only valid deep links and otherwise preserves the current view', () => {
    const browser = new ProjectBrowser(records);
    browser.configure({ query: 'no results', tag: 'Desktop', sort: 'newest' });
    const before = browser.snapshot();
    expect(browser.reveal('missing')).toBe(false);
    expect(browser.snapshot()).toEqual(before);
    expect(browser.reveal('beta')).toBe(true);
    expect(browser.snapshot()).toMatchObject({
      query: '',
      tag: '',
      sort: 'newest',
      selected: records[0],
      items: [records[1], records[2], records[0]],
    });
  });

  it('moves within visible result boundaries without wrapping', () => {
    const browser = new ProjectBrowser(records);
    browser.move('ArrowUp');
    expect(browser.snapshot().selected).toBe(records[0]);
    browser.move('ArrowDown');
    expect(browser.snapshot().selected).toBe(records[1]);
    browser.move('End');
    browser.move('ArrowDown');
    expect(browser.snapshot().selected).toBe(records[2]);
    browser.configure({ tag: 'Rust' });
    browser.move('Home');
    expect(browser.snapshot().selected).toBe(records[0]);
    browser.move('ArrowDown');
    expect(browser.snapshot().selected).toBe(records[2]);
  });

  it('has no selection for empty catalogs or queries and recovers when results return', () => {
    const empty = new ProjectBrowser([]);
    empty.configure({ query: 'anything', tag: 'Rust', sort: 'name' });
    for (const key of ['ArrowUp', 'ArrowDown', 'Home', 'End'] as const) empty.move(key);
    expect(empty.snapshot()).toMatchObject({ items: [], selected: undefined, tags: [], total: 0 });
    expect(empty.select('missing')).toBe(false);
    expect(empty.reveal('missing')).toBe(false);
    const browser = new ProjectBrowser(records);
    browser.configure({ query: 'anything unavailable' });
    browser.move('End');
    expect(browser.snapshot().selected).toBeUndefined();
    browser.configure({ query: '' });
    expect(browser.snapshot().selected).toBe(records[0]);
  });
});
