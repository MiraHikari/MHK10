import { describe, expect, it } from 'vite-plus/test';
import { ReaderNavigationModel, type ReaderNavigationEntry } from './reader-navigation-model';

const entries: ReaderNavigationEntry[] = [
  {
    id: 'chapter:one',
    label: 'Getting started',
    detail: 'Chapter',
    target: { kind: 'chapter', anchor: 'one' },
  },
  {
    id: 'chapter:two',
    label: '阅读与图片',
    detail: 'Chapter',
    target: { kind: 'chapter', anchor: 'two' },
  },
  {
    id: 'note:one',
    label: 'Review',
    detail: 'Note',
    keywords: 'Getting started with Astro',
    target: { kind: 'note', id: 'one' },
  },
  {
    id: 'command:find',
    label: 'Find in book',
    detail: 'Ctrl+F',
    target: { kind: 'command', command: 'find' },
  },
];

describe('Reader quick navigation', () => {
  it('ranks visible labels before note keywords without confusing equal target ids', () => {
    const navigation = new ReaderNavigationModel();
    navigation.update(entries, 'getting');
    expect(navigation.snapshot().results.map((entry) => entry.id)).toEqual([
      'chapter:one',
      'note:one',
    ]);
    expect(navigation.snapshot().activeId).toBe('chapter:one');
    navigation.update(entries, 'astro note');
    expect(navigation.snapshot().results.map((entry) => entry.target)).toEqual([
      { kind: 'note', id: 'one' },
    ]);
  });

  it('normalizes Unicode queries and matches Chinese titles without regular expressions', () => {
    const navigation = new ReaderNavigationModel();
    navigation.update(entries, ' ＦＩＮＤ ');
    expect(navigation.snapshot().activeId).toBe('command:find');
    navigation.update(entries, '阅读');
    expect(navigation.snapshot().activeId).toBe('chapter:two');
    navigation.update(entries, '[');
    expect(navigation.snapshot()).toEqual({ results: [], activeId: undefined, total: 0 });
    navigation.move(1);
    expect(navigation.snapshot().activeId).toBeUndefined();
  });

  it('wraps keyboard selection and preserves it only while the same query still contains the target', () => {
    const navigation = new ReaderNavigationModel();
    navigation.update(entries);
    navigation.move(-1);
    expect(navigation.snapshot().activeId).toBe('command:find');
    navigation.move(1);
    navigation.move(1);
    expect(navigation.snapshot().activeId).toBe('chapter:two');
    navigation.update(entries.slice(1));
    expect(navigation.snapshot().activeId).toBe('chapter:two');
    navigation.update(entries.slice(2));
    expect(navigation.snapshot().activeId).toBe('note:one');
    navigation.update(entries, 'find');
    expect(navigation.snapshot().activeId).toBe('command:find');
  });

  it('bounds rendered results, deduplicates stable identities and isolates snapshots', () => {
    const many = Array.from({ length: 100 }, (_, index): ReaderNavigationEntry => ({
      id: `chapter:${index}`,
      label: `Chapter ${index}`,
      detail: 'Chapter',
      target: { kind: 'chapter', anchor: String(index) },
    }));
    const navigation = new ReaderNavigationModel();
    navigation.update([...many, ...many]);
    const snapshot = navigation.snapshot();
    expect(snapshot.total).toBe(100);
    expect(snapshot.results).toHaveLength(60);
    snapshot.results[0].label = 'Changed outside the model';
    expect(navigation.snapshot().results[0].label).toBe('Chapter 0');
    navigation.update(many, 'Chapter 99');
    expect(navigation.snapshot().activeId).toBe('chapter:99');
    navigation.update([]);
    expect(navigation.snapshot()).toEqual({ results: [], activeId: undefined, total: 0 });
  });
});
