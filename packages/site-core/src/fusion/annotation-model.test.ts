import { describe, expect, it } from 'vite-plus/test';
import {
  locateNote,
  removeAnnotation,
  resolveNoteOffset,
  sameAnnotations,
} from './annotation-model';
import { ReaderModel, parseReaderState, type ReaderNote } from './reading-model';
import { mergeReaderStates, parseStoredReaderState } from './reading-storage-model';

const note = (id = 'note'): ReaderNote => ({
  id,
  quote: 'Quote',
  text: '',
  progress: 0.4,
  anchor: '',
});

describe('shared annotation anchors and incremental edits', () => {
  it('verifies block text before locating repeated quotes and falls back from stale anchors', () => {
    const annotated = { ...note(), block: { block: 1, start: 2, end: 7 } };
    expect(locateNote(annotated, ['Quote', 'a Quote'])).toEqual({ block: 1, start: 2, end: 7 });
    expect(locateNote(annotated, ['Quote', 'different'])).toEqual({ block: 0, start: 0, end: 5 });
    expect(locateNote({ ...note(), quote: '' }, ['Quote'])).toBeNull();
    expect(locateNote({ ...note(), quote: 'one two' }, ['one', 'two'])).toBeNull();
  });
  it('resolves global UTF-16 offsets and falls back when legacy offsets point elsewhere', () => {
    const text = '😀 Quote and Quote';
    expect(resolveNoteOffset({ ...note(), offset: 13 }, text)).toBe(13);
    expect(resolveNoteOffset({ ...note(), offset: 0 }, text)).toBe(3);
    expect(resolveNoteOffset({ ...note(), quote: '' }, text)).toBe(-1);
    expect(resolveNoteOffset({ ...note(), quote: 'missing', offset: 3 }, text)).toBe(-1);
  });
  it('removes one record without rebuilding or reordering the other annotations', () => {
    const protectedNotes = [
      { ...note('long'), quote: 'x'.repeat(2500) },
      { ...note('text'), quote: '', text: 'Text only' },
      { ...note('cross'), quote: 'one two' },
      { ...note('stale'), block: { block: 999, start: 0, end: 5 } },
    ];
    const remaining = removeAnnotation([...protectedNotes, note()], 'note');
    expect(remaining).toEqual(protectedNotes);
    expect(remaining[0]).toBe(protectedNotes[0]);
    expect(removeAnnotation(protectedNotes, 'missing')).toEqual(protectedNotes);
  });
  it('round-trips valid block anchors and retains notes with invalid optional anchors', () => {
    const model = new ReaderModel();
    model.open('book', 1);
    expect(
      model.annotate('note', 'Quote', '', '', undefined, { block: 2, start: 5, end: 10 }),
    ).toBe(true);
    const saved = model.serialize();
    expect(parseReaderState(saved).documents.book.notes[0].block).toEqual({
      block: 2,
      start: 5,
      end: 10,
    });
    const damagedAnchor = structuredClone(saved) as unknown as {
      documents: Record<string, { notes: { block: unknown }[] }>;
    };
    damagedAnchor.documents.book.notes[0].block = { block: -1, start: 5, end: 10 };
    const parsed = parseStoredReaderState(damagedAnchor);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.state.documents.book.notes).toEqual([{ ...note(), progress: 0 }]);
  });
  it('merges anchor repair and notebook text edits independently', () => {
    const model = new ReaderModel();
    model.open('book', 1);
    model.annotate('note', 'Quote', 'Original');
    const baseline = model.serialize();
    const local = structuredClone(baseline);
    const remote = structuredClone(baseline);
    local.documents.book.notes[0].block = { block: 1, start: 0, end: 5 };
    remote.documents.book.notes[0].text = 'Edited remotely';
    const merged = mergeReaderStates(baseline, local, remote);
    expect(merged.ok).toBe(true);
    if (merged.ok)
      expect(merged.state.documents.book.notes[0]).toMatchObject({
        text: 'Edited remotely',
        block: { block: 1, start: 0, end: 5 },
      });
    expect(
      sameAnnotations(local.documents.book.notes, structuredClone(local.documents.book.notes)),
    ).toBe(true);
    expect(sameAnnotations(local.documents.book.notes, remote.documents.book.notes)).toBe(false);
  });
});
