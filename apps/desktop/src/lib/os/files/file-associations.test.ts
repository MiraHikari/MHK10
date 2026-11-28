import { describe, expect, it } from 'vite-plus/test';
import { fileHandlers } from './file-types';
import {
  ASSOCIATIONS_STORAGE_KEY,
  defaultHandler,
  parseAssociations,
  serializeAssociations,
  withDefault,
  createFileAssociationStore,
} from './file-associations';

const KNOWN: readonly string[] = [
  'notepad',
  'blog',
  'sound-recorder',
  'acdsee',
  'media-player',
  'pixel',
];

describe('file associations', () => {
  it('parses valid stored associations and names its legacy storage slot', () => {
    expect(ASSOCIATIONS_STORAGE_KEY).toBe('doom95.associations.v1');
    expect(
      parseAssociations(
        {
          '.txt': 'notepad',
          '.md': 'blog',
          '.snd.txt': 'sound-recorder',
          '.abcdefghijklmno': 'pixel',
        },
        KNOWN,
      ),
    ).toEqual({
      ok: true,
      associations: {
        '.txt': 'notepad',
        '.md': 'blog',
        '.snd.txt': 'sound-recorder',
        '.abcdefghijklmno': 'pixel',
      },
      dropped: 0,
    });
  });
  it('rejects non-object payloads without throwing', () => {
    for (const junk of [null, undefined, 42, 'notepad', true, [], ['.txt']]) {
      expect(parseAssociations(junk, KNOWN)).toEqual({
        ok: false,
        associations: {},
        dropped: 0,
      });
    }
  });
  it('drops junk keys, unknown handlers and nested values while counting them', () => {
    const parsed = parseAssociations(
      {
        txt: 'notepad',
        '.TXT': 'notepad',
        '.t-t': 'notepad',
        '.abcdefghijklmnop': 'notepad',
        '.png': 'solitaire',
        '.wav': 7,
        '.md': { app: 'blog' },
        '.pixel': ['pixel'],
        '.txt ': 'notepad',
      },
      KNOWN,
    );
    expect(parsed).toEqual({ ok: true, associations: {}, dropped: 9 });
  });
  it('cannot be poisoned through __proto__ entries', () => {
    const parsed = parseAssociations(JSON.parse('{"__proto__":"notepad",".txt":"notepad"}'), KNOWN);
    expect(parsed).toEqual({ ok: true, associations: { '.txt': 'notepad' }, dropped: 1 });
    expect(({} as Record<string, unknown>).notepad).toBeUndefined();
  });
  it('prefers the stored association over the catalog default', () => {
    const associations = withDefault(withDefault({}, '.txt', 'blog'), '.md', 'notepad');
    expect(defaultHandler(associations, 'Notes.txt', fileHandlers('Notes.txt'))).toBe('blog');
    expect(defaultHandler(associations, 'readme.md', fileHandlers('readme.md'))).toBe('notepad');
  });
  it('falls back to the first candidate when no usable association exists', () => {
    expect(defaultHandler({}, 'Notes.txt', ['notepad', 'blog'])).toBe('notepad');
    expect(defaultHandler({}, 'photo.png', [])).toBeUndefined();
    const stale = withDefault({}, '.txt', 'media-player');
    expect(defaultHandler(stale, 'Notes.txt', ['notepad', 'blog'])).toBe('notepad');
    expect(parseAssociations({ '.txt': 'media-player' }, ['notepad', 'blog']).dropped).toBe(1);
  });
  it('resolves envelopes with the same longest-suffix rule as file types', () => {
    const candidates = fileHandlers('voice.SND.txt');
    expect(candidates).toEqual(['sound-recorder']);
    expect(defaultHandler(withDefault({}, '.txt', 'blog'), 'voice.SND.txt', candidates)).toBe(
      'sound-recorder',
    );
    expect(defaultHandler(withDefault({}, '.snd.txt', 'blog'), 'voice.snd.txt', candidates)).toBe(
      'sound-recorder',
    );
  });
  it('round-trips withDefault through serialize and parse', () => {
    const associations = withDefault(withDefault({}, '.txt', 'blog'), '.md', 'notepad');
    const parsed = parseAssociations(JSON.parse(serializeAssociations(associations)), KNOWN);
    expect(parsed).toEqual({ ok: true, associations, dropped: 0 });
    expect(parseAssociations(JSON.parse(serializeAssociations({})), KNOWN)).toEqual({
      ok: true,
      associations: {},
      dropped: 0,
    });
  });
  it('updates immutably, normalizing case and ignoring malformed extensions', () => {
    const base = withDefault({}, '.txt', 'notepad');
    const updated = withDefault(base, '.md', 'blog');
    expect(base).toEqual({ '.txt': 'notepad' });
    expect(updated).toEqual({ '.txt': 'notepad', '.md': 'blog' });
    expect(withDefault(updated, 'TXT', 'blog')).toBe(updated);
    expect(withDefault(updated, '.TXT', 'blog')).toEqual({ '.txt': 'blog', '.md': 'blog' });
  });
  it('persists defaults across reconstructed stores and clears only the chosen extension', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const store = createFileAssociationStore(storage, KNOWN);
    expect(store.setDefault('BOOK.TXT', 'blog')).toEqual({ ok: true, persisted: true });
    store.setDefault('notes.md', 'notepad');
    const restored = createFileAssociationStore(storage, KNOWN);
    expect(restored.snapshot()).toEqual({ '.txt': 'blog', '.md': 'notepad' });
    expect(restored.clear('book.txt')).toEqual({ ok: true, persisted: true });
    expect(createFileAssociationStore(storage, KNOWN).snapshot()).toEqual({ '.md': 'notepad' });
  });
  it('reports session-only defaults when durable storage fails', () => {
    const store = createFileAssociationStore(
      {
        getItem: () => '{broken',
        setItem: () => {
          throw new Error('Quota');
        },
      },
      KNOWN,
    );
    expect(store.setDefault('Notes.txt', 'blog')).toEqual({ ok: true, persisted: false });
    expect(defaultHandler(store.snapshot(), 'Notes.txt', fileHandlers('Notes.txt'))).toBe('blog');
    expect(store.setDefault('README', 'blog')).toMatchObject({ ok: false });
    expect(createFileAssociationStore(null, KNOWN).setDefault('Notes.txt', 'blog')).toEqual({
      ok: true,
      persisted: false,
    });
    expect(
      createFileAssociationStore(null, ['notepad']).setDefault('Notes.txt', 'blog'),
    ).toMatchObject({ ok: false });
  });
});
