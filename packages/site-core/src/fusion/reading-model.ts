import {
  applyReadingCommand,
  parseReaderNoteBlock,
  type ReadingCommand,
  type ReadingCommandResult,
} from './reading-command';
import { READING_LIMITS } from './reading-limits';

export { parseReaderNoteBlock };

export type ReadingMode = 'scroll' | 'pages';
export type ReadingSpacing = 'compact' | 'normal' | 'wide';
export type ReaderTextRendering = 'pixel' | 'smooth';
export type ReaderWidth = 'wide' | 'comfortable' | 'narrow';
/** Content colour scheme, drawn only from the desktop theme variables. */
export type ReadingTheme = 'paper' | 'sepia' | 'night' | 'contrast';
/** Continuous zoom in 25% steps; `zoom` is optional in storage so version 1 states parse unchanged. */
export type ReaderZoom = 50 | 75 | 100 | 125 | 150 | 175 | 200 | 225 | 250 | 275 | 300;
export const READER_ZOOM_STEPS: readonly ReaderZoom[] = [
  50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300,
];
export const DEFAULT_READER_ZOOM: ReaderZoom = 100;
export const DEFAULT_READING_THEME: ReadingTheme = 'paper';
export const READING_THEMES: readonly ReadingTheme[] = ['paper', 'sepia', 'night', 'contrast'];
const zoomStep = (value: number): ReaderZoom =>
  READER_ZOOM_STEPS.reduce((best, step) =>
    Math.abs(step - value) < Math.abs(best - value) ? step : best,
  );
/** Any finite zoom input lands on a persisted step; out-of-range values clamp to the ends. */
export function clampReaderZoom(value: number): ReaderZoom {
  if (!Number.isFinite(value)) return DEFAULT_READER_ZOOM;
  return zoomStep(Math.max(READER_ZOOM_STEPS[0], Math.min(READER_ZOOM_STEPS.at(-1)!, value)));
}
/** Step along the fixed zoom ladder without leaving it. */
export function stepReaderZoom(current: number, direction: 1 | -1): ReaderZoom {
  const steps = READER_ZOOM_STEPS;
  const index = steps.indexOf(clampReaderZoom(current) as ReaderZoom);
  return steps[Math.max(0, Math.min(steps.length - 1, index + direction))];
}
export interface ReaderPreferences {
  mode: ReadingMode;
  fontSize: 12 | 24 | 36;
  spacing: ReadingSpacing;
  zoom: ReaderZoom;
  theme: ReadingTheme;
  textRendering: ReaderTextRendering;
  width: ReaderWidth;
  focus: boolean;
}
export interface ReaderBookmark {
  id: string;
  label: string;
  progress: number;
  anchor: string;
}
export interface ReaderNote {
  id: string;
  quote: string;
  text: string;
  progress: number;
  anchor: string;
  /** Global UTF-16 offset in the complete document text, never a block-relative offset. */
  offset?: number;
  /** General-site presentation anchor. Invalid or stale anchors never discard a note. */
  block?: ReaderNoteBlock;
}
export interface ReaderNoteBlock {
  block: number;
  start: number;
  end: number;
}
export interface ReaderDocumentState {
  title?: string;
  progress: number;
  anchor: string;
  lastOpened: number;
  bookmarks: ReaderBookmark[];
  notes: ReaderNote[];
}
export interface ReaderState {
  version: 1;
  preferences: ReaderPreferences;
  documents: Record<string, ReaderDocumentState>;
}
export const DEFAULT_READER_PREFERENCES: Readonly<ReaderPreferences> = Object.freeze({
  mode: 'scroll',
  fontSize: 12,
  spacing: 'normal',
  zoom: DEFAULT_READER_ZOOM,
  theme: DEFAULT_READING_THEME,
  textRendering: 'pixel',
  width: 'comfortable',
  focus: false,
});
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const bounded = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;
const progress = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const blank = (): ReaderDocumentState => ({
  progress: 0,
  anchor: '',
  lastOpened: 0,
  bookmarks: [],
  notes: [],
});

export function parseReaderState(value: unknown): ReaderState {
  const state: ReaderState = {
    version: 1,
    preferences: { ...DEFAULT_READER_PREFERENCES },
    documents: {},
  };
  if (!object(value) || value.version !== 1) return state;
  const preference = value.preferences;
  if (object(preference)) {
    if (preference.mode === 'scroll' || preference.mode === 'pages')
      state.preferences.mode = preference.mode;
    if (preference.fontSize === 12 || preference.fontSize === 24 || preference.fontSize === 36)
      state.preferences.fontSize = preference.fontSize;
    if (
      preference.spacing === 'compact' ||
      preference.spacing === 'normal' ||
      preference.spacing === 'wide'
    )
      state.preferences.spacing = preference.spacing;
    if (typeof preference.zoom === 'number' && Number.isFinite(preference.zoom))
      state.preferences.zoom = clampReaderZoom(preference.zoom);
    if (READING_THEMES.includes(preference.theme as ReadingTheme))
      state.preferences.theme = preference.theme as ReadingTheme;
    if (preference.textRendering === 'pixel' || preference.textRendering === 'smooth')
      state.preferences.textRendering = preference.textRendering;
    if (
      preference.width === 'wide' ||
      preference.width === 'comfortable' ||
      preference.width === 'narrow'
    )
      state.preferences.width = preference.width;
    if (typeof preference.focus === 'boolean') state.preferences.focus = preference.focus;
  }
  if (!object(value.documents)) return state;
  for (const [id, input] of Object.entries(value.documents).slice(0, READING_LIMITS.books)) {
    if (
      !id ||
      id.length > READING_LIMITS.documentId ||
      ['__proto__', 'constructor', 'prototype'].includes(id) ||
      !object(input)
    )
      continue;
    const document = blank();
    if (bounded(input.title, READING_LIMITS.title) && input.title) document.title = input.title;
    if (progress(input.progress)) document.progress = input.progress;
    if (bounded(input.anchor, READING_LIMITS.anchor)) document.anchor = input.anchor;
    if (
      typeof input.lastOpened === 'number' &&
      Number.isSafeInteger(input.lastOpened) &&
      input.lastOpened >= 0
    )
      document.lastOpened = input.lastOpened;
    const ids = new Set<string>();
    if (Array.isArray(input.bookmarks))
      for (const item of input.bookmarks.slice(0, READING_LIMITS.bookmarks)) {
        if (
          !object(item) ||
          !bounded(item.id, READING_LIMITS.id) ||
          !item.id ||
          ids.has(item.id) ||
          !bounded(item.label, READING_LIMITS.label) ||
          !progress(item.progress) ||
          !bounded(item.anchor, READING_LIMITS.anchor)
        )
          continue;
        document.bookmarks.push({
          id: item.id,
          label: item.label,
          progress: item.progress,
          anchor: item.anchor,
        });
        ids.add(item.id);
      }
    ids.clear();
    if (Array.isArray(input.notes))
      for (const item of input.notes.slice(0, READING_LIMITS.notes)) {
        if (
          !object(item) ||
          !bounded(item.id, READING_LIMITS.id) ||
          !item.id ||
          ids.has(item.id) ||
          !bounded(item.quote, READING_LIMITS.quote) ||
          !bounded(item.text, READING_LIMITS.noteText) ||
          (!item.quote && !item.text) ||
          !progress(item.progress) ||
          !bounded(item.anchor, READING_LIMITS.anchor)
        )
          continue;
        const itemOffset =
          typeof item.offset === 'number' &&
          Number.isSafeInteger(item.offset) &&
          item.offset >= 0 &&
          item.offset <= READING_LIMITS.offset
            ? item.offset
            : undefined;
        const block = parseReaderNoteBlock(item.block);
        document.notes.push({
          id: item.id,
          quote: item.quote,
          text: item.text,
          progress: item.progress,
          anchor: item.anchor,
          ...(itemOffset === undefined ? {} : { offset: itemOffset }),
          ...(block === undefined ? {} : { block }),
        });
        ids.add(item.id);
      }
    state.documents[id] = document;
  }
  return state;
}

export interface ReaderNotebookBackup {
  format: 'mhk10-reader-notebook';
  version: 1;
  documents: Record<string, ReaderDocumentState>;
}
export type ReaderImportResult =
  | { ok: true; documents: number; bookmarks: number; notes: number; skipped: number }
  | { ok: false; error: string };

/** Backup imports are strict; malformed records never silently replace a visitor's notebook. */
function parseNotebook(input: unknown): Record<string, ReaderDocumentState> | undefined {
  if (
    !object(input) ||
    input.format !== 'mhk10-reader-notebook' ||
    input.version !== 1 ||
    !object(input.documents)
  )
    return;
  const entries = Object.entries(input.documents);
  if (entries.length > READING_LIMITS.books) return;
  const parsed = parseReaderState({ version: 1, documents: input.documents }).documents;
  for (const [id, value] of entries) {
    const result = parsed[id];
    if (
      !object(value) ||
      !Object.hasOwn(parsed, id) ||
      !result ||
      !progress(value.progress) ||
      !bounded(value.anchor, READING_LIMITS.anchor) ||
      typeof value.lastOpened !== 'number' ||
      !Number.isSafeInteger(value.lastOpened) ||
      value.lastOpened < 0 ||
      (value.title !== undefined && !bounded(value.title, READING_LIMITS.title)) ||
      !Array.isArray(value.bookmarks) ||
      !Array.isArray(value.notes) ||
      value.bookmarks.length !== result.bookmarks.length ||
      value.notes.length !== result.notes.length
    )
      return;
    for (const [index, note] of value.notes.entries())
      if (object(note) && note.offset !== undefined && result.notes[index].offset !== note.offset)
        return;
  }
  return parsed;
}
function mergeAnnotations<T extends ReaderBookmark | ReaderNote>(current: T[], incoming: T[]) {
  const signature = (item: T) =>
    JSON.stringify(
      'quote' in item
        ? [
            item.quote,
            item.text,
            item.anchor,
            item.progress,
            item.offset ?? null,
            item.block ?? null,
          ]
        : [item.label, item.anchor, item.progress],
    );
  const content = new Set(current.map(signature));
  const ids = new Set(current.map((item) => item.id));
  let added = 0,
    skipped = 0;
  for (const item of incoming) {
    const value = signature(item);
    if (content.has(value)) {
      skipped++;
      continue;
    }
    let id = item.id,
      suffix = 1;
    while (ids.has(id)) id = `${item.id.slice(0, 80)}-import-${suffix++}`;
    current.push({ ...item, id });
    ids.add(id);
    content.add(value);
    added++;
  }
  return { added, skipped };
}

/** User reading state only: authored document content never enters or changes in this model. */
export class ReaderModel {
  private state: ReaderState;
  private documentId: string | undefined;
  private transient: ReaderDocumentState | undefined;
  private pages = 1;
  constructor(saved: unknown = undefined) {
    this.state = parseReaderState(saved);
  }
  open(id: string, openedAt: number, title?: string): boolean {
    if (
      !id ||
      id.length > READING_LIMITS.documentId ||
      ['__proto__', 'constructor', 'prototype'].includes(id)
    )
      throw new Error('Invalid reader document identity.');
    this.documentId = id;
    this.transient = undefined;
    if (!Object.hasOwn(this.state.documents, id)) {
      const entries = Object.entries(this.state.documents);
      if (entries.length >= READING_LIMITS.books) {
        const evictable = entries
          .filter(([, item]) => !item.bookmarks.length && !item.notes.length)
          .sort((a, b) => a[1].lastOpened - b[1].lastOpened)[0];
        if (!evictable) {
          this.transient = blank();
          this.pages = 1;
          return false;
        }
        delete this.state.documents[evictable[0]];
      }
      this.state.documents[id] = blank();
    }
    if (Number.isSafeInteger(openedAt) && openedAt >= 0)
      this.state.documents[id].lastOpened = openedAt;
    if (title && title.length <= READING_LIMITS.title) this.state.documents[id].title = title;
    this.pages = 1;
    return true;
  }
  snapshot() {
    const document = this.current();
    return {
      documentId: this.documentId,
      tracked: !!document && !this.transient,
      document: document ? structuredClone(document) : undefined,
      preferences: { ...this.state.preferences },
      pages: this.pages,
      page: Math.round((document?.progress ?? 0) * (this.pages - 1)),
    };
  }
  private current(): ReaderDocumentState | undefined {
    return this.transient ?? (this.documentId ? this.state.documents[this.documentId] : undefined);
  }
  configure(change: Partial<ReaderPreferences>): void {
    this.state.preferences = parseReaderState({
      version: 1,
      preferences: { ...this.state.preferences, ...change },
    }).preferences;
  }
  layout(pageCount: number): void {
    this.pages = Number.isFinite(pageCount) ? Math.max(1, Math.floor(pageCount)) : 1;
  }
  private run(command: ReadingCommand): ReadingCommandResult {
    if (this.transient && this.documentId) {
      const state: ReaderState = {
        ...this.state,
        documents: { ...this.state.documents, [this.documentId]: this.transient },
      };
      const result = applyReadingCommand(state, this.documentId, command);
      if (result.status === 'applied') this.transient = result.state.documents[this.documentId];
      return result;
    }
    const result = applyReadingCommand(this.state, this.documentId, command);
    if (result.status === 'applied') this.state = result.state;
    return result;
  }
  position(value: number, anchor?: string): void {
    this.run({ type: 'position', progress: value, ...(anchor === undefined ? {} : { anchor }) });
  }
  goToPage(page: number): void {
    if (!Number.isFinite(page)) return;
    this.position(
      this.pages <= 1
        ? 0
        : Math.max(0, Math.min(this.pages - 1, Math.round(page))) / (this.pages - 1),
      '',
    );
  }
  step(direction: number): void {
    this.goToPage(this.snapshot().page + direction);
  }
  bookmark(id: string, label: string, anchor = ''): boolean {
    if (this.transient) return false;
    return this.run({ type: 'add-bookmark', id, label, anchor }).status === 'applied';
  }
  annotate(
    id: string,
    quote: string,
    text: string,
    anchor = '',
    offset?: number,
    block?: ReaderNoteBlock,
  ): boolean {
    if (this.transient) return false;
    return (
      this.run({ type: 'add-note', id, quote, text, anchor, offset, block }).status === 'applied'
    );
  }
  editNote(id: string, text: string): boolean {
    return this.run({ type: 'edit-note', id, text }).status === 'applied';
  }
  removeBookmark(id: string): void {
    this.run({ type: 'remove-bookmark', id });
  }
  removeNote(id: string): void {
    this.run({ type: 'remove-note', id });
  }
  serialize(): ReaderState {
    return structuredClone(this.state);
  }
  /** Adopt a validated merged notebook without changing the current book or its layout. */
  replace(state: ReaderState): void {
    this.state = structuredClone(state);
    if (this.documentId && !Object.hasOwn(this.state.documents, this.documentId)) {
      this.transient ??= blank();
    } else {
      this.transient = undefined;
    }
  }
  backup(): ReaderNotebookBackup {
    return {
      format: 'mhk10-reader-notebook',
      version: 1,
      documents: structuredClone(this.state.documents),
    };
  }
  importNotebook(input: unknown): ReaderImportResult {
    const incoming = parseNotebook(input);
    if (!incoming) return { ok: false, error: 'This is not a valid MHK10 Reader notebook backup.' };
    const merged = structuredClone(this.state.documents);
    const result = { ok: true as const, documents: 0, bookmarks: 0, notes: 0, skipped: 0 };
    for (const [id, document] of Object.entries(incoming)) {
      if (!Object.hasOwn(merged, id)) {
        merged[id] = structuredClone(document);
        result.documents++;
        result.bookmarks += document.bookmarks.length;
        result.notes += document.notes.length;
        continue;
      }
      const bookmarks = mergeAnnotations(merged[id].bookmarks, document.bookmarks);
      const notes = mergeAnnotations(merged[id].notes, document.notes);
      result.bookmarks += bookmarks.added;
      result.notes += notes.added;
      result.skipped += bookmarks.skipped + notes.skipped;
      if (
        merged[id].bookmarks.length > READING_LIMITS.bookmarks ||
        merged[id].notes.length > READING_LIMITS.notes
      )
        return {
          ok: false,
          error: 'This backup exceeds a book’s annotation capacity. Existing notes were kept.',
        };
    }
    if (Object.keys(merged).length > READING_LIMITS.books)
      return {
        ok: false,
        error: 'This backup exceeds the notebook’s 100-book capacity. Existing notes were kept.',
      };
    this.state.documents = merged;
    return result;
  }
  recent(limit = 8): { id: string; title: string; progress: number }[] {
    const count = Number.isFinite(limit)
      ? Math.max(0, Math.min(READING_LIMITS.books, Math.floor(limit)))
      : 8;
    return Object.entries(this.state.documents)
      .sort((a, b) => b[1].lastOpened - a[1].lastOpened || a[0].localeCompare(b[0]))
      .slice(0, count)
      .map(([id, item]) => ({ id, title: item.title ?? id, progress: item.progress }));
  }
}
