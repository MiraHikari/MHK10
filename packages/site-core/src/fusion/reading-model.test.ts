import { describe, expect, it } from 'vite-plus/test';
import {
  ReaderModel,
  parseReaderState,
  clampReaderZoom,
  stepReaderZoom,
  DEFAULT_READER_ZOOM,
  DEFAULT_READING_THEME,
} from './reading-model';

describe('reading state independent of authored content', () => {
  it('keeps a bounded recent list with local titles across remounts', () => {
    const reader = new ReaderModel();
    reader.open('article', 10, 'Published article');
    reader.open('file:notes', 20, 'Reading notes.md');
    reader.position(0.5);
    expect(new ReaderModel(reader.serialize()).recent(1)).toEqual([
      { id: 'file:notes', title: 'Reading notes.md', progress: 0.5 },
    ]);
    expect(reader.recent(0)).toEqual([]);
    const recent = reader.recent();
    recent[0].title = 'Changed copy';
    expect(reader.recent()[0].title).toBe('Reading notes.md');
  });
  it('keeps progress stable across repagination and bounds navigation', () => {
    const reader = new ReaderModel();
    reader.open('article:one', 10);
    reader.layout(11);
    reader.goToPage(5);
    expect(reader.snapshot()).toMatchObject({
      page: 5,
      document: { progress: 0.5 },
    });
    reader.layout(21);
    expect(reader.snapshot().page).toBe(10);
    reader.step(100);
    expect(reader.snapshot().document?.progress).toBe(1);
    reader.goToPage(-10);
    expect(reader.snapshot().page).toBe(0);
    reader.layout(NaN);
    expect(reader.snapshot().pages).toBe(1);
  });
  it('persists separate books and clones snapshots so callers cannot mutate notes', () => {
    const reader = new ReaderModel();
    reader.open('one', 1);
    reader.position(0.4, 'chapter-2');
    expect(reader.bookmark('mark', 'Chapter two', 'chapter-2')).toBe(true);
    expect(reader.annotate('note', '原文没有变化', 'My note', 'chapter-2')).toBe(true);
    const snapshot = reader.snapshot();
    snapshot.document!.notes[0].text = 'Changed copy';
    reader.open('two', 2);
    reader.position(0.8);
    const restored = new ReaderModel(reader.serialize());
    restored.open('one', 3);
    expect(restored.snapshot().document).toMatchObject({
      progress: 0.4,
      anchor: 'chapter-2',
      notes: [{ text: 'My note' }],
    });
    restored.removeNote('note');
    restored.removeBookmark('mark');
    expect(restored.snapshot().document).toMatchObject({
      notes: [],
      bookmarks: [],
    });
  });
  it('rejects malformed external records and unsafe identities without changing prototypes', () => {
    const stored: unknown = JSON.parse(
      '{"version":1,"preferences":{"mode":"other","fontSize":15},"documents":{"__proto__":{"progress":1},"book":{"progress":9,"notes":[{"id":"x"}]}}}',
    );
    const parsed = parseReaderState(stored);
    expect(parsed.preferences).toMatchObject({ mode: 'scroll', fontSize: 12 });
    expect(Object.hasOwn(parsed.documents, '__proto__')).toBe(false);
    expect(parsed.documents.book).toMatchObject({ progress: 0, notes: [] });
    expect(() => new ReaderModel().open('__proto__', 1)).toThrow();
  });
  it('rejects duplicate and oversized annotations and bounds preferences', () => {
    const reader = new ReaderModel();
    reader.open('book', 1);
    reader.configure({ mode: 'pages', fontSize: 24, spacing: 'wide' });
    expect(reader.snapshot().preferences).toEqual({
      mode: 'pages',
      fontSize: 24,
      spacing: 'wide',
      zoom: DEFAULT_READER_ZOOM,
      theme: DEFAULT_READING_THEME,
      textRendering: 'pixel',
      width: 'comfortable',
      focus: false,
    });
    expect(reader.annotate('id', 'Quote', '')).toBe(true);
    expect(reader.annotate('id', 'Duplicate', '')).toBe(false);
    expect(reader.annotate('big', 'x'.repeat(3001), 'Note')).toBe(false);
    expect(reader.annotate('empty', '', '')).toBe(false);
  });
  it('retains annotated books when progress-only records must be evicted', () => {
    const reader = new ReaderModel();
    reader.open('important', 0);
    reader.annotate('note', 'Quote', 'Keep this');
    for (let i = 0; i < 99; i++) reader.open(`cached-${i}`, i + 1);
    reader.open('new', 101);
    expect(reader.serialize().documents.important.notes[0].text).toBe('Keep this');
    expect(Object.keys(reader.serialize().documents).length).toBeLessThanOrEqual(100);
  });
  it('delegates admission boundaries to the shared command without changing state on rejection', () => {
    const reader = new ReaderModel();
    reader.open('book', 1);
    reader.position(0.3, 'chapter');
    expect(reader.annotate('i'.repeat(100), 'Quote', '')).toBe(true);
    expect(reader.annotate('text-only', '', 'Text')).toBe(true);
    expect(reader.bookmark('b'.repeat(100), 'l'.repeat(200), 'a'.repeat(300))).toBe(true);
    expect(reader.editNote('i'.repeat(100), 'Edited')).toBe(true);
    const before = reader.serialize();
    expect(reader.annotate('i'.repeat(101), 'Quote', '')).toBe(false);
    expect(reader.annotate('', 'Quote', '')).toBe(false);
    expect(reader.annotate('empty', '', '')).toBe(false);
    expect(reader.annotate('offset', 'Quote', '', '', -1)).toBe(false);
    expect(
      reader.annotate('block', 'Quote', '', '', undefined, { block: -1, start: 0, end: 1 }),
    ).toBe(false);
    expect(reader.bookmark('b'.repeat(101), 'Label')).toBe(false);
    expect(reader.bookmark('label', 'l'.repeat(201))).toBe(false);
    expect(reader.bookmark('anchor', 'Label', 'a'.repeat(301))).toBe(false);
    expect(reader.editNote('text-only', '')).toBe(false);
    expect(reader.serialize()).toEqual(before);
  });
  it('keeps an unopened book transient and never persists its local edits', () => {
    const reader = new ReaderModel();
    for (let i = 0; i < 100; i++) {
      reader.open(`book-${i}`, i);
      reader.annotate(`note-${i}`, 'Quote', 'Keep');
    }
    expect(reader.open('overflow', 200)).toBe(false);
    reader.position(0.5, 'transient');
    expect(reader.bookmark('mark', 'Label')).toBe(false);
    expect(reader.annotate('note', 'Quote', 'Note')).toBe(false);
    expect(reader.snapshot()).toMatchObject({
      tracked: false,
      document: { progress: 0.5, anchor: 'transient', bookmarks: [], notes: [] },
    });
    expect(reader.serialize().documents.overflow).toBeUndefined();
  });
  it('clamps and steps zoom along the fixed ladder', () => {
    expect(clampReaderZoom(1000)).toBe(300);
    expect(clampReaderZoom(0)).toBe(50);
    expect(clampReaderZoom(110)).toBe(100);
    expect(clampReaderZoom(Number.NaN)).toBe(DEFAULT_READER_ZOOM);
    expect(stepReaderZoom(100, 1)).toBe(125);
    expect(stepReaderZoom(100, -1)).toBe(75);
    expect(stepReaderZoom(300, 1)).toBe(300);
    expect(stepReaderZoom(50, -1)).toBe(50);
  });
  it('parses zoom and theme, defaulting malformed values', () => {
    expect(parseReaderState({ version: 1, preferences: {} }).preferences).toMatchObject({
      zoom: DEFAULT_READER_ZOOM,
      theme: DEFAULT_READING_THEME,
    });
    expect(
      parseReaderState({
        version: 1,
        preferences: { zoom: 180, theme: 'night' },
      }).preferences,
    ).toMatchObject({ zoom: 175, theme: 'night' });
    expect(
      parseReaderState({
        version: 1,
        preferences: { zoom: 'huge', theme: 'rainbow' },
      }).preferences,
    ).toMatchObject({
      zoom: DEFAULT_READER_ZOOM,
      theme: DEFAULT_READING_THEME,
    });
  });
  it('round-trips zoom and theme through configure and serialize', () => {
    const reader = new ReaderModel();
    reader.configure({ zoom: 150, theme: 'sepia' });
    expect(reader.snapshot().preferences).toMatchObject({
      zoom: 150,
      theme: 'sepia',
    });
    reader.configure({ zoom: 999 as unknown as 300 });
    expect(reader.snapshot().preferences.zoom).toBe(300);
    const restored = new ReaderModel(reader.serialize());
    expect(restored.snapshot().preferences).toMatchObject({
      zoom: 300,
      theme: 'sepia',
    });
  });
  it('preserves legacy defaults and remembers rendering, width and focus independently of progress', () => {
    const reader = new ReaderModel({ version: 1, preferences: { mode: 'pages' } });
    expect(reader.snapshot().preferences).toMatchObject({
      textRendering: 'pixel',
      width: 'comfortable',
      focus: false,
    });
    reader.open('book', 1);
    reader.position(0.4, 'chapter');
    reader.configure({ textRendering: 'smooth', width: 'narrow', focus: true });
    const restored = new ReaderModel(reader.serialize());
    restored.open('book', 2);
    expect(restored.snapshot()).toMatchObject({
      preferences: { textRendering: 'smooth', width: 'narrow', focus: true },
      document: { progress: 0.4, anchor: 'chapter' },
    });
  });
  it('merges notebook backups without overwriting local notes, position or preferences', () => {
    const source = new ReaderModel();
    source.open('book', 1, 'Book');
    source.position(0.2, 'one');
    source.annotate('note', 'Quote', 'Original');
    source.bookmark('bookmark', 'One', 'one');
    const reader = new ReaderModel(source.serialize());
    reader.open('book', 2);
    reader.editNote('note', 'Locally edited');
    reader.annotate('later', '', 'Later note');
    reader.position(0.7, 'two');
    reader.configure({ textRendering: 'smooth' });
    expect(reader.importNotebook(source.backup())).toEqual({
      ok: true,
      documents: 0,
      notes: 1,
      bookmarks: 0,
      skipped: 1,
    });
    expect(reader.snapshot().document).toMatchObject({
      progress: 0.7,
      anchor: 'two',
      notes: [{ text: 'Locally edited' }, { text: 'Later note' }, { text: 'Original' }],
    });
    expect(reader.snapshot().preferences.textRendering).toBe('smooth');
    expect(reader.importNotebook(source.backup())).toMatchObject({
      ok: true,
      notes: 0,
      bookmarks: 0,
      skipped: 2,
    });
    const restored = new ReaderModel();
    expect(restored.importNotebook(reader.backup())).toMatchObject({
      ok: true,
      documents: 1,
      notes: 3,
      bookmarks: 1,
    });
    expect(restored.serialize().documents.book.notes).toHaveLength(3);
  });
  it('rejects malformed and over-capacity backups atomically', () => {
    const reader = new ReaderModel();
    reader.open('book', 1);
    reader.annotate('original', '', 'Keep');
    const before = reader.serialize();
    const invalid = reader.backup();
    invalid.documents.book.notes[0].text = 'x'.repeat(4001);
    for (const input of [
      null,
      {},
      { ...invalid, format: 'other' },
      invalid,
      { ...reader.backup(), documents: JSON.parse('{"__proto__":{}}') },
    ]) {
      expect(reader.importNotebook(input)).toMatchObject({ ok: false });
      expect(reader.serialize()).toEqual(before);
    }
    const large = new ReaderModel();
    large.open('book', 1);
    for (let i = 0; i < 128; i++) large.annotate(`new-${i}`, '', `New ${i}`);
    expect(reader.importNotebook(large.backup())).toMatchObject({ ok: false });
    expect(reader.serialize()).toEqual(before);
  });
});
