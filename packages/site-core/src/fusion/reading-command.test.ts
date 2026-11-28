import { describe, expect, it } from 'vite-plus/test';
import {
  applyReadingCommand,
  validateReaderNote,
  type ReadingCommand,
  type ReadingCommandResult,
} from './reading-command';
import { READING_LIMITS } from './reading-limits';
import {
  DEFAULT_READER_PREFERENCES,
  type ReaderDocumentState,
  type ReaderNote,
  type ReaderState,
} from './reading-model';

function document(overrides: Partial<ReaderDocumentState> = {}): ReaderDocumentState {
  return {
    progress: 0.25,
    anchor: 'chapter',
    lastOpened: 10,
    bookmarks: [],
    notes: [],
    ...overrides,
  };
}

function state(overrides: Partial<ReaderDocumentState> = {}): ReaderState {
  return {
    version: 1,
    preferences: { ...DEFAULT_READER_PREFERENCES },
    documents: {
      book: document(overrides),
      other: document({ anchor: '', lastOpened: 0 }),
    },
  };
}

function note(id: string, overrides: Partial<ReaderNote> = {}): ReaderNote {
  return { id, quote: 'Quote', text: '', progress: 0.5, anchor: '', ...overrides };
}

function applied(result: ReadingCommandResult) {
  if (result.status !== 'applied') throw new Error(`Expected applied, got ${result.reason}`);
  return result;
}

const run = (input: ReaderState, command: ReadingCommand, id: string | undefined = 'book') =>
  applyReadingCommand(input, id, command);

describe('shared reading commands', () => {
  it('pins the shared limits table', () => {
    expect(READING_LIMITS).toEqual({
      books: 100,
      bookmarks: 64,
      notes: 128,
      id: 100,
      label: 200,
      documentId: 200,
      title: 200,
      quote: 3000,
      noteText: 4000,
      anchor: 300,
      blockIndex: 100000,
      offset: 2_000_000,
      blockEnd: 2_000_000,
    });
  });
  describe('position', () => {
    it('clamps progress, applies valid anchors and ignores an oversized anchor', () => {
      const input = state();
      const high = applied(run(input, { type: 'position', progress: 2, anchor: 'x'.repeat(301) }));
      expect(high.changed).toBe(true);
      expect(high.state.documents.book).toMatchObject({ progress: 1, anchor: 'chapter' });
      expect(input.documents.book).toMatchObject({ progress: 0.25, anchor: 'chapter' });
      expect(high.state.documents.book).not.toBe(input.documents.book);
      expect(high.state.documents.other).toBe(input.documents.other);

      const low = applied(run(input, { type: 'position', progress: -1, anchor: 'a'.repeat(300) }));
      expect(low.state.documents.book).toMatchObject({ progress: 0, anchor: 'a'.repeat(300) });

      const unchanged = applied(run(input, { type: 'position', progress: 0.25 }));
      expect(unchanged.changed).toBe(false);
      expect(unchanged.state).toBe(input);
    });
    it('rejects non-finite progress and documents that do not exist', () => {
      for (const progress of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])
        expect(run(state(), { type: 'position', progress })).toEqual({
          status: 'rejected',
          reason: 'invalid',
        });
      expect(applyReadingCommand(state(), undefined, { type: 'position', progress: 0.5 })).toEqual({
        status: 'rejected',
        reason: 'no-document',
      });
      expect(run(state(), { type: 'position', progress: 0.5 }, 'missing')).toEqual({
        status: 'rejected',
        reason: 'no-document',
      });
    });
  });

  describe('bookmarks', () => {
    it('admits one record at each boundary with the current reading position', () => {
      const input = state();
      const result = applied(
        run(input, {
          type: 'add-bookmark',
          id: 'i'.repeat(READING_LIMITS.id),
          label: 'l'.repeat(READING_LIMITS.label),
          anchor: 'a'.repeat(READING_LIMITS.anchor),
        }),
      );
      expect(result.state.documents.book.bookmarks).toEqual([
        {
          id: 'i'.repeat(READING_LIMITS.id),
          label: 'l'.repeat(READING_LIMITS.label),
          anchor: 'a'.repeat(READING_LIMITS.anchor),
          progress: 0.25,
        },
      ]);
      expect(input.documents.book.bookmarks).toEqual([]);
      expect(result.state.documents.other).toBe(input.documents.other);
    });
    it('rejects invalid, duplicate and over-capacity records', () => {
      const invalid = [
        { id: '', label: 'Label' },
        { id: 'i'.repeat(READING_LIMITS.id + 1), label: 'Label' },
        { id: 'id', label: 'l'.repeat(READING_LIMITS.label + 1) },
        { id: 'id', label: 'Label', anchor: 'a'.repeat(READING_LIMITS.anchor + 1) },
      ];
      for (const bookmark of invalid)
        expect(run(state(), { type: 'add-bookmark', ...bookmark })).toEqual({
          status: 'rejected',
          reason: 'invalid',
        });

      const full = Array.from({ length: READING_LIMITS.bookmarks }, (_, index) => ({
        id: `b-${index}`,
        label: '',
        anchor: '',
        progress: 0,
      }));
      const fullState = state({ bookmarks: full });
      expect(run(fullState, { type: 'add-bookmark', id: 'new', label: '' })).toEqual({
        status: 'rejected',
        reason: 'capacity',
      });
      expect(fullState.documents.book.bookmarks).toBe(full);
      expect(fullState.documents.book.bookmarks).toEqual(full);
      expect(full).toHaveLength(READING_LIMITS.bookmarks);

      const duplicate = applied(run(state(), { type: 'add-bookmark', id: 'same', label: 'One' }));
      const bookmarks = duplicate.state.documents.book.bookmarks;
      expect(run(duplicate.state, { type: 'add-bookmark', id: 'same', label: 'Two' })).toEqual({
        status: 'rejected',
        reason: 'duplicate',
      });
      expect(duplicate.state.documents.book.bookmarks).toBe(bookmarks);
      expect(duplicate.state.documents.book.bookmarks).toEqual([
        { id: 'same', label: 'One', anchor: '', progress: 0.25 },
      ]);
    });
    it('removes one bookmark, reports no-ops and keeps the input intact', () => {
      const inserted = applied(
        run(state(), { type: 'add-bookmark', id: 'mark', label: 'One', anchor: 'here' }),
      );
      const removed = applied(run(inserted.state, { type: 'remove-bookmark', id: 'mark' }));
      expect(removed.changed).toBe(true);
      expect(removed.state.documents.book.bookmarks).toEqual([]);
      expect(inserted.state.documents.book.bookmarks).toHaveLength(1);

      const unchanged = applied(run(inserted.state, { type: 'remove-bookmark', id: 'missing' }));
      expect(unchanged.changed).toBe(false);
      expect(unchanged.state).toBe(inserted.state);
      expect(run(state(), { type: 'remove-bookmark', id: 'mark' }, 'missing')).toEqual({
        status: 'rejected',
        reason: 'no-document',
      });
    });
  });

  describe('notes', () => {
    it('admits quote-only, text-only and fully anchored notes', () => {
      const quoteOnly = applied(
        run(state(), { type: 'add-note', id: 'quote', quote: 'Quote', text: '' }),
      );
      expect(quoteOnly.state.documents.book.notes[0]).toEqual({
        id: 'quote',
        quote: 'Quote',
        text: '',
        progress: 0.25,
        anchor: '',
      });
      expect(quoteOnly.state.documents.book.notes[0]).not.toHaveProperty('offset');
      expect(quoteOnly.state.documents.book.notes[0]).not.toHaveProperty('block');

      const textOnly = applied(
        run(state(), { type: 'add-note', id: 'text', quote: '', text: 'My note' }),
      );
      expect(textOnly.state.documents.book.notes[0]).toMatchObject({ quote: '', text: 'My note' });

      const anchored = applied(
        run(state(), {
          type: 'add-note',
          id: 'anchored',
          quote: 'Quote',
          text: 'Note',
          anchor: 'a'.repeat(READING_LIMITS.anchor),
          offset: READING_LIMITS.offset,
          block: { block: READING_LIMITS.blockIndex, start: 0, end: READING_LIMITS.blockEnd },
        }),
      );
      expect(anchored.state.documents.book.notes[0]).toMatchObject({
        anchor: 'a'.repeat(READING_LIMITS.anchor),
        offset: READING_LIMITS.offset,
        block: { block: READING_LIMITS.blockIndex, start: 0, end: READING_LIMITS.blockEnd },
      });
    });
    it('keeps the pre-refactor note key order', () => {
      const result = applied(
        run(state(), {
          type: 'add-note',
          id: 'order',
          quote: 'Quote',
          text: 'Note',
          anchor: '',
          offset: 0,
          block: { block: 0, start: 0, end: 5 },
        }),
      );
      expect(Object.keys(result.state.documents.book.notes[0])).toEqual([
        'id',
        'quote',
        'text',
        'anchor',
        'progress',
        'offset',
        'block',
      ]);
    });
    it('accepts every field at its exact limit and rejects one past it', () => {
      const valid = applied(
        run(state(), {
          type: 'add-note',
          id: 'i'.repeat(READING_LIMITS.id),
          quote: 'q'.repeat(READING_LIMITS.quote),
          text: 't'.repeat(READING_LIMITS.noteText),
          anchor: 'a'.repeat(READING_LIMITS.anchor),
        }),
      );
      expect(valid.state.documents.book.notes[0]).toMatchObject({
        id: 'i'.repeat(READING_LIMITS.id),
        quote: 'q'.repeat(READING_LIMITS.quote),
        text: 't'.repeat(READING_LIMITS.noteText),
      });

      const invalid = [
        { id: 'i'.repeat(READING_LIMITS.id + 1), quote: 'Quote', text: '' },
        { id: 'id', quote: 'q'.repeat(READING_LIMITS.quote + 1), text: '' },
        { id: 'id', quote: '', text: 't'.repeat(READING_LIMITS.noteText + 1) },
        { id: 'id', quote: '', text: '' },
        { id: 'id', quote: 'Quote', text: '', anchor: 'a'.repeat(READING_LIMITS.anchor + 1) },
        { id: '', quote: 'Quote', text: '' },
      ];
      for (const candidate of invalid)
        expect(run(state(), { type: 'add-note', ...candidate })).toEqual({
          status: 'rejected',
          reason: 'invalid',
        });

      const invalidOptional = [
        { offset: -1 },
        { offset: READING_LIMITS.offset + 1 },
        { offset: 1.5 },
        { block: { block: READING_LIMITS.blockIndex + 1, start: 0, end: 1 } },
        { block: { block: 0, start: 0, end: READING_LIMITS.blockEnd + 1 } },
        { block: { block: 0, start: 5, end: 5 } },
        { block: { block: 0, start: -1, end: 5 } },
        { block: { block: 0, start: 0, end: 5, extra: true } },
      ];
      for (const optional of invalidOptional)
        expect(
          run(state(), { type: 'add-note', id: 'id', quote: 'Quote', text: '', ...optional }),
        ).toEqual({ status: 'rejected', reason: 'invalid' });

      expect(
        run(state(), { type: 'add-note', id: 'id', quote: 'Quote', text: '', offset: 0 }),
      ).toMatchObject({ status: 'applied' });
      expect(
        run(state(), {
          type: 'add-note',
          id: 'id',
          quote: 'Quote',
          text: '',
          offset: READING_LIMITS.offset,
        }),
      ).toMatchObject({ status: 'applied' });

      // `add-note` takes progress from the document, so the shared validator is
      // the only reachable admission for a malformed record progress.
      expect(validateReaderNote({ ...note('id'), progress: 1.5 })).toBeUndefined();
      expect(validateReaderNote({ ...note('id'), progress: 0.5 })).toMatchObject({ id: 'id' });
    });
    it('rejects duplicate ids and capacity without truncating existing notes', () => {
      const duplicate = applied(
        run(state(), { type: 'add-note', id: 'same', quote: 'Q', text: '' }),
      );
      const notes = duplicate.state.documents.book.notes;
      expect(run(duplicate.state, { type: 'add-note', id: 'same', quote: 'Q', text: '' })).toEqual({
        status: 'rejected',
        reason: 'duplicate',
      });
      expect(duplicate.state.documents.book.notes).toBe(notes);
      expect(duplicate.state.documents.book.notes).toHaveLength(1);

      const full = Array.from({ length: READING_LIMITS.notes }, (_, index) => note(`n-${index}`));
      const fullState = state({ notes: full });
      expect(run(fullState, { type: 'add-note', id: 'new', quote: 'Q', text: '' })).toEqual({
        status: 'rejected',
        reason: 'capacity',
      });
      expect(fullState.documents.book.notes).toBe(full);
      expect(fullState.documents.book.notes).toEqual(full);
      expect(full).toHaveLength(READING_LIMITS.notes);
      expect(
        run(state({ notes: full.slice(1) }), {
          type: 'add-note',
          id: 'new',
          quote: 'Q',
          text: '',
        }),
      ).toMatchObject({ status: 'applied' });

      const existing = state({ notes: [note('keep')] });
      const existingNotes = existing.documents.book.notes;
      expect(run(existing, { type: 'add-note', id: 'id', quote: '', text: '' })).toEqual({
        status: 'rejected',
        reason: 'invalid',
      });
      expect(existing.documents.book.notes).toBe(existingNotes);
      expect(existing.documents.book.notes).toEqual([note('keep')]);
    });
    it('edits and removes one note without touching the others or the input', () => {
      const input = state({ notes: [note('one'), note('two', { quote: '', text: 'Text only' })] });
      const edited = applied(run(input, { type: 'edit-note', id: 'one', text: 'Edited' }));
      expect(edited.state.documents.book.notes[0]).toMatchObject({ text: 'Edited' });
      expect(edited.state.documents.book.notes[1]).toBe(input.documents.book.notes[1]);
      expect(input.documents.book.notes[0].text).toBe('');

      const cleared = applied(run(input, { type: 'edit-note', id: 'one', text: '' }));
      expect(cleared.state.documents.book.notes[0].text).toBe('');
      expect(cleared.changed).toBe(false);
      expect(run(input, { type: 'edit-note', id: 'two', text: '' })).toEqual({
        status: 'rejected',
        reason: 'invalid',
      });
      expect(run(input, { type: 'edit-note', id: 'missing', text: 'x' })).toEqual({
        status: 'rejected',
        reason: 'invalid',
      });
      expect(run(input, { type: 'edit-note', id: 'one', text: 't'.repeat(4001) })).toEqual({
        status: 'rejected',
        reason: 'invalid',
      });

      const removed = applied(run(input, { type: 'remove-note', id: 'one' }));
      expect(removed.state.documents.book.notes.map((item) => item.id)).toEqual(['two']);
      expect(applied(run(input, { type: 'remove-note', id: 'missing' })).changed).toBe(false);
    });
    it('requires an existing document for every note command', () => {
      for (const command of [
        { type: 'add-note' as const, id: 'id', quote: 'Q', text: '' },
        { type: 'edit-note' as const, id: 'id', text: 'x' },
        { type: 'remove-note' as const, id: 'id' },
      ])
        expect(run(state(), command, 'missing')).toEqual({
          status: 'rejected',
          reason: 'no-document',
        });
    });
  });
});
