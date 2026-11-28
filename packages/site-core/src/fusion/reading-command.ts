import { READING_LIMITS, type ReadingLimits } from './reading-limits';
import type {
  ReaderDocumentState,
  ReaderNote,
  ReaderNoteBlock,
  ReaderState,
} from './reading-model';

/**
 * Notebook commands are pure: they never mutate their inputs and never touch
 * storage or the DOM. Both the desktop reader model and the general-site
 * annotation store admit records through this one implementation.
 *
 * `configure` stays in `ReaderModel` because it normalizes preferences through
 * the reader parser. `go-to-page` and `step` are layout commands: they need the
 * page count, so the model computes them into a `position` command. Commands
 * never acquire layout state.
 */
export type ReadingCommand =
  | { type: 'position'; progress: number; anchor?: string }
  | { type: 'add-bookmark'; id: string; label: string; anchor?: string }
  | { type: 'remove-bookmark'; id: string }
  | {
      type: 'add-note';
      id: string;
      quote: string;
      text: string;
      anchor?: string;
      offset?: number;
      block?: ReaderNoteBlock;
    }
  | { type: 'edit-note'; id: string; text: string }
  | { type: 'remove-note'; id: string };

export type ReadingCommandResult =
  | { status: 'applied'; state: ReaderState; changed: boolean }
  | { status: 'rejected'; reason: 'invalid' | 'duplicate' | 'capacity' | 'no-document' };

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const identity = (value: unknown, max: number): value is string =>
  typeof value === 'string' && !!value && value.length <= max;

const bounded = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;

const progress = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

const offset = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;

/** Parse a general-site presentation anchor; any unknown key invalidates the record. */
export function parseReaderNoteBlock(
  value: unknown,
  limits: ReadingLimits = READING_LIMITS,
): ReaderNoteBlock | undefined {
  if (!object(value)) return;
  const { block, start, end } = value;
  if (
    typeof block !== 'number' ||
    !Number.isSafeInteger(block) ||
    block < 0 ||
    block > limits.blockIndex ||
    typeof start !== 'number' ||
    !Number.isSafeInteger(start) ||
    start < 0 ||
    typeof end !== 'number' ||
    !Number.isSafeInteger(end) ||
    end <= start ||
    end > limits.blockEnd ||
    Object.keys(value).some((key) => !['block', 'start', 'end'].includes(key))
  )
    return;
  return { block, start, end };
}

function parseNote(value: unknown, limits: ReadingLimits): ReaderNote | undefined {
  if (!object(value)) return;
  const { id, quote, text, anchor } = value;
  if (
    !identity(id, limits.id) ||
    !bounded(quote, limits.quote) ||
    !bounded(text, limits.noteText) ||
    (!quote && !text) ||
    !progress(value.progress) ||
    !bounded(anchor, limits.anchor)
  )
    return;
  if (value.offset !== undefined && !offset(value.offset, limits.offset)) return;
  const block = value.block === undefined ? undefined : parseReaderNoteBlock(value.block, limits);
  if (value.block !== undefined && block === undefined) return;
  return {
    id,
    quote,
    text,
    anchor,
    progress: value.progress,
    ...(value.offset === undefined ? {} : { offset: value.offset }),
    ...(block === undefined ? {} : { block }),
  };
}

/**
 * Validate one complete note record through the same admission used by
 * `add-note`. Callers use it to reject malformed input before touching storage,
 * without granting the note a different admission path.
 */
export function validateReaderNote(
  value: unknown,
  limits: ReadingLimits = READING_LIMITS,
): ReaderNote | undefined {
  return parseNote(value, limits);
}

function snapshot(state: ReaderState, id: string, document: ReaderDocumentState): ReaderState {
  return { ...state, documents: { ...state.documents, [id]: document } };
}

function applied(state: ReaderState, changed: boolean): ReadingCommandResult {
  return { status: 'applied', state, changed };
}

const rejected = (reason: 'invalid' | 'duplicate' | 'capacity' | 'no-document') =>
  ({ status: 'rejected', reason }) as const;

/**
 * Apply one notebook command to the selected document. Removed commands are
 * no-ops on the caller side; the model/store decide whether a rejection is a
 * boolean false or a failed write.
 */
export function applyReadingCommand(
  state: ReaderState,
  documentId: string | undefined,
  command: ReadingCommand,
  limits: ReadingLimits = READING_LIMITS,
): ReadingCommandResult {
  if (!documentId || !Object.hasOwn(state.documents, documentId)) return rejected('no-document');
  const document = state.documents[documentId];

  switch (command.type) {
    case 'position': {
      if (!Number.isFinite(command.progress)) return rejected('invalid');
      const nextProgress = Math.max(0, Math.min(1, command.progress));
      const anchor =
        command.anchor === undefined
          ? undefined
          : bounded(command.anchor, limits.anchor)
            ? command.anchor
            : undefined;
      if (
        nextProgress === document.progress &&
        (anchor === undefined || anchor === document.anchor)
      )
        return applied(state, false);
      const next = { ...document, progress: nextProgress };
      if (anchor !== undefined) next.anchor = anchor;
      return applied(snapshot(state, documentId, next), true);
    }
    case 'add-bookmark': {
      const anchor = command.anchor ?? '';
      if (
        !identity(command.id, limits.id) ||
        !bounded(command.label, limits.label) ||
        !bounded(anchor, limits.anchor)
      )
        return rejected('invalid');
      if (document.bookmarks.some((item) => item.id === command.id)) return rejected('duplicate');
      if (document.bookmarks.length >= limits.bookmarks) return rejected('capacity');
      return applied(
        snapshot(state, documentId, {
          ...document,
          bookmarks: [
            ...document.bookmarks,
            { id: command.id, label: command.label, anchor, progress: document.progress },
          ],
        }),
        true,
      );
    }
    case 'remove-bookmark': {
      const bookmarks = document.bookmarks.filter((item) => item.id !== command.id);
      if (bookmarks.length === document.bookmarks.length) return applied(state, false);
      return applied(snapshot(state, documentId, { ...document, bookmarks }), true);
    }
    case 'add-note': {
      const anchor = command.anchor ?? '';
      const note = parseNote(
        {
          id: command.id,
          quote: command.quote,
          text: command.text,
          progress: document.progress,
          anchor,
          offset: command.offset,
          block: command.block,
        },
        limits,
      );
      if (!note) return rejected('invalid');
      if (document.notes.some((item) => item.id === note.id)) return rejected('duplicate');
      if (document.notes.length >= limits.notes) return rejected('capacity');
      return applied(
        snapshot(state, documentId, { ...document, notes: [...document.notes, note] }),
        true,
      );
    }
    case 'edit-note': {
      const note = document.notes.find((item) => item.id === command.id);
      if (!note || !bounded(command.text, limits.noteText) || (!command.text && !note.quote))
        return rejected('invalid');
      if (note.text === command.text) return applied(state, false);
      return applied(
        snapshot(state, documentId, {
          ...document,
          notes: document.notes.map((item) =>
            item.id === note.id ? { ...item, text: command.text } : item,
          ),
        }),
        true,
      );
    }
    case 'remove-note': {
      const notes = document.notes.filter((item) => item.id !== command.id);
      if (notes.length === document.notes.length) return applied(state, false);
      return applied(snapshot(state, documentId, { ...document, notes }), true);
    }
  }
}
