import { describe, expect, it } from 'vite-plus/test';
import { SkillBrowser, type SkillCategory } from './skill-browser-model';
const groups: SkillCategory[] = [
  {
    id: 'web',
    title: 'Web',
    description: 'Interfaces',
    icon: 'code',
    skills: [
      {
        name: 'TypeScript',
        category: 'Web',
        note: '类型与界面',
        years: 3,
        level: 80,
        keywords: ['types'],
      },
      { name: 'React', category: 'Web', note: 'Components', years: 2, level: 70, keywords: ['ui'] },
    ],
  },
  {
    id: 'systems',
    title: 'Systems',
    description: 'Native tools',
    icon: 'chip',
    skills: [
      {
        name: 'Rust',
        category: 'Systems',
        note: '桌面工具',
        years: 1,
        level: 60,
        keywords: ['ownership'],
      },
    ],
  },
];

describe('Device Manager browsing interface', () => {
  it('navigates a category tree while properties follow only real selected records', () => {
    const browser = new SkillBrowser(groups);
    expect(browser.snapshot()).toMatchObject({
      expanded: ['web'],
      selected: { name: 'TypeScript' },
      total: 3,
    });
    browser.move('ArrowLeft');
    expect(browser.snapshot()).toMatchObject({ focused: 'group:web', selected: undefined });
    browser.move('ArrowLeft');
    expect(browser.snapshot().expanded).toEqual([]);
    browser.move('ArrowDown');
    browser.move('ArrowRight');
    browser.move('ArrowRight');
    expect(browser.snapshot()).toMatchObject({ focused: 'skill:Rust', selected: { name: 'Rust' } });
    browser.move('Home');
    expect(browser.snapshot().focused).toBe('group:web');
    browser.move('End');
    expect(browser.snapshot().focused).toBe('skill:Rust');
  });
  it('searches all records including collapsed groups, descriptions and keywords', () => {
    const browser = new SkillBrowser(groups);
    browser.search('  OWNERSHIP  ');
    expect(browser.snapshot()).toMatchObject({
      matches: 1,
      total: 3,
      selected: { name: 'Rust' },
      expanded: ['systems'],
    });
    browser.search('Interfaces');
    expect(browser.snapshot().matches).toBe(2);
    browser.search('桌面');
    expect(browser.snapshot().selected?.name).toBe('Rust');
  });
  it('restores the exact pre-search selection and expanded categories when clearing', () => {
    const browser = new SkillBrowser(groups);
    browser.select('skill:React');
    browser.search('Rust');
    browser.collapseAll();
    browser.search('no such record');
    expect(browser.snapshot()).toMatchObject({
      rows: [],
      matches: 0,
      selected: undefined,
      focused: undefined,
    });
    browser.search('');
    expect(browser.snapshot()).toMatchObject({
      expanded: ['web'],
      focused: 'skill:React',
      selected: { name: 'React' },
    });
  });
  it('ignores invalid selection and makes collapse focus a visible category', () => {
    const browser = new SkillBrowser(groups);
    expect(browser.select('skill:Missing')).toBe(false);
    browser.toggle('missing');
    expect(browser.snapshot().selected?.name).toBe('TypeScript');
    browser.expandAll();
    browser.select('skill:Rust');
    browser.collapseAll();
    expect(browser.snapshot()).toMatchObject({
      expanded: [],
      focused: 'group:systems',
      selected: undefined,
    });
  });
  it('has no phantom focus for empty catalogs or leading empty categories', () => {
    const empty = new SkillBrowser([]);
    empty.move('ArrowDown');
    empty.search('Rust');
    empty.search('');
    expect(empty.snapshot()).toMatchObject({
      rows: [],
      total: 0,
      focused: undefined,
      selected: undefined,
    });
    const browser = new SkillBrowser([{ ...groups[0], id: 'empty', skills: [] }, groups[1]]);
    expect(browser.snapshot().selected?.name).toBe('Rust');
  });
});
