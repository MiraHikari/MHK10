import { describe, expect, it } from 'vite-plus/test';
import { ReaderModel, type ReaderState } from './reading-model';
import { mergeReaderStates, parseStoredReaderState } from './reading-storage-model';

function notebook(): ReaderState {
  const model = new ReaderModel();
  model.open('article', 1, 'Article');
  model.annotate('note', 'Quote', 'Original');
  return model.serialize();
}
function merged(baseline: ReaderState, local: ReaderState, remote: ReaderState): ReaderState {
  const result = mergeReaderStates(baseline, local, remote);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
describe('Reader storage three-way merge', () => {
  it('keeps unrelated document, preference and annotation fields from both presentations', () => {
    const baseline = notebook(),
      local = structuredClone(baseline),
      remote = structuredClone(baseline);
    local.preferences.width = 'narrow';
    local.documents.article.notes[0].text = 'Edited';
    remote.preferences.focus = true;
    remote.documents.article.notes[0].anchor = 'heading';
    remote.documents.article.progress = 0.5;
    remote.documents.other = { progress: 0.1, anchor: '', lastOpened: 2, bookmarks: [], notes: [] };
    const state = merged(baseline, local, remote);
    expect(state.preferences).toMatchObject({ width: 'narrow', focus: true });
    expect(state.documents.article).toMatchObject({
      progress: 0.5,
      notes: [{ text: 'Edited', anchor: 'heading' }],
    });
    expect(state.documents.other.progress).toBe(0.1);
  });
  it('retains deletions and never resurrects unchanged records from an older tab', () => {
    const baseline = notebook(),
      local = structuredClone(baseline),
      remote = structuredClone(baseline);
    remote.documents.article.notes = [];
    local.preferences.focus = true;
    expect(merged(baseline, local, remote).documents.article.notes).toEqual([]);
    delete remote.documents.article;
    expect(merged(baseline, local, remote).documents.article).toBeUndefined();
    local.documents.article.notes = [];
    remote.documents.article = structuredClone(baseline.documents.article);
    expect(merged(baseline, local, remote).documents.article.notes).toEqual([]);
  });
  it('rejects simultaneous edits and edit/delete conflicts without changing any input', () => {
    const baseline = notebook(),
      local = structuredClone(baseline),
      remote = structuredClone(baseline);
    local.documents.article.notes[0].text = 'Mine';
    remote.documents.article.notes[0].text = 'Theirs';
    expect(mergeReaderStates(baseline, local, remote)).toMatchObject({
      ok: false,
      error: expect.stringContaining('annotation'),
    });
    remote.documents.article.notes = [];
    expect(mergeReaderStates(baseline, local, remote).ok).toBe(false);
    expect(local.documents.article.notes[0].text).toBe('Mine');
    expect(baseline.documents.article.notes[0].text).toBe('Original');
  });
  it('combines independent additions to the same newly opened book', () => {
    const baseline = new ReaderModel().serialize(),
      local = notebook(),
      remote = notebook();
    remote.documents.article.notes[0].id = 'remote-note';
    expect(merged(baseline, local, remote).documents.article.notes.map((note) => note.id)).toEqual([
      'remote-note',
      'note',
    ]);
  });
  it('rejects records that would silently drop annotations or future fields', () => {
    expect(parseStoredReaderState({ ...notebook(), version: 2 }).ok).toBe(false);
    const oversized = notebook();
    oversized.documents.article.notes[0].text = 'x'.repeat(4001);
    expect(parseStoredReaderState(oversized).ok).toBe(false);
    expect(parseStoredReaderState({ ...notebook(), preferences: { zoom: 90 } }).ok).toBe(false);
    const future = {
      ...notebook(),
      documents: { article: { ...notebook().documents.article, future: true } },
    };
    expect(parseStoredReaderState(future).ok).toBe(false);
  });
  it('accepts older version-one preferences with omitted additive fields', () => {
    expect(
      parseStoredReaderState({ version: 1, preferences: { mode: 'pages' }, documents: {} }),
    ).toMatchObject({ ok: true, state: { preferences: { mode: 'pages', zoom: 100 } } });
  });
  it('compares every raw document key and rejects values the parser would normalize', () => {
    const current = notebook();
    expect(parseStoredReaderState(current)).toMatchObject({ ok: true });

    const changedFields: ReaderState[] = [];
    const progress = structuredClone(current);
    progress.documents.article.progress = 9;
    changedFields.push(progress);
    const anchor = structuredClone(current);
    anchor.documents.article.anchor = 'a'.repeat(301);
    changedFields.push(anchor);
    const opened = structuredClone(current);
    opened.documents.article.lastOpened = -1;
    changedFields.push(opened);
    const bookmarks = structuredClone(current);
    bookmarks.documents.article.bookmarks = [{ id: '', label: '', progress: 0, anchor: '' }];
    changedFields.push(bookmarks);
    const notes = structuredClone(current);
    notes.documents.article.notes = [
      { id: 'invalid', quote: '', text: '', progress: 0, anchor: '' },
    ];
    changedFields.push(notes);
    const title = structuredClone(current);
    title.documents.article.title = 't'.repeat(201);
    changedFields.push(title);
    for (const state of changedFields) expect(parseStoredReaderState(state).ok).toBe(false);

    // Strictness validates records; a valid newer value is still a valid record.
    const validChange = structuredClone(current);
    validChange.documents.article.progress = 0.9;
    expect(parseStoredReaderState(validChange).ok).toBe(true);

    const unknown = structuredClone(current);
    (unknown.documents.article as unknown as Record<string, unknown>).future = true;
    expect(parseStoredReaderState(unknown).ok).toBe(false);
  });
  it('keeps parser defaults when an older record omits fields added later', () => {
    const older = structuredClone(notebook()) as unknown as {
      documents: { article: Record<string, unknown> };
    };
    delete older.documents.article.anchor;
    delete older.documents.article.lastOpened;
    expect(parseStoredReaderState(older)).toMatchObject({
      ok: true,
      state: { documents: { article: { anchor: '', lastOpened: 0 } } },
    });
  });
  it('merges document names that overlap inherited object properties', () => {
    const model = new ReaderModel();
    model.open('toString', 1, 'Article');
    const baseline = new ReaderModel().serialize();
    const state = merged(baseline, model.serialize(), baseline);
    expect(Object.hasOwn(state.documents, 'toString')).toBe(true);
    expect(state.documents.toString).toMatchObject({ title: 'Article', notes: [] });
  });
});
