import {
  ReaderModel,
  type ReaderImportResult,
  type ReaderNotebookBackup,
  type ReaderPreferences,
  type ReaderNoteBlock,
} from '@mhk/site-core/fusion/reading-model';
import type { ReaderStorage } from '@mhk/site-core/fusion/reading-storage';

export interface ReaderSessionDependencies {
  storage: ReaderStorage;
  now(): number;
  /** Return the cancellation owned by this session. */
  schedule(callback: () => void, delay: number): () => void;
}

export type ReaderCommand =
  | { type: 'configure'; preferences: Partial<ReaderPreferences> }
  | { type: 'position'; progress: number; anchor?: string; pages?: number }
  | { type: 'page'; page: number }
  | { type: 'step'; direction: number }
  | { type: 'bookmark'; id: string; label: string; anchor: string }
  | {
      type: 'annotate';
      id: string;
      quote: string;
      text: string;
      anchor: string;
      offset?: number;
      block?: ReaderNoteBlock;
    }
  | { type: 'edit-note'; id: string; text: string }
  | { type: 'remove-bookmark' | 'remove-note'; id: string };

type Immutable<T> = T extends object ? { readonly [Key in keyof T]: Immutable<T[Key]> } : T;
export type ReaderSessionSnapshot = Immutable<
  ReturnType<ReaderModel['snapshot']> & {
    pendingSave: boolean;
    saveError: string;
    recoveryAvailable: boolean;
  }
>;
export type ReaderNotebookSnapshot = Immutable<{
  notebook: ReaderNotebookBackup;
  recent: ReturnType<ReaderModel['recent']>;
}>;
export type ReaderFlushResult =
  | { status: 'saved' | 'disposed' }
  | { status: 'failed'; error: string };
export type ReaderCommandResult = { status: 'applied' | 'rejected' | 'disposed' };
export type ReaderNotebookImportResult =
  | ({ status: 'imported'; persisted: boolean } & Omit<
      Extract<ReaderImportResult, { ok: true }>,
      'ok'
    >)
  | { status: 'failed'; error: string }
  | { status: 'ignored' };

/**
 * Own the notebook, delayed persistence and import generations. Scroll position is
 * applied immediately and is not written with the notebook until flush: page hide,
 * session close, or the next non-position save. Failed storage never rolls back
 * accepted reading changes. Flush before disposal when saving is intended; disposal
 * only cancels resources and makes late operations inert.
 */
export class ReaderSession {
  private readonly model: ReaderModel;
  private cancelSave: (() => void) | undefined;
  private pendingSave = false;
  /** Progress changed since the last successful notebook write. */
  private positionDirty = false;
  private disposed = false;
  private importGeneration = 0;
  private saveGeneration = 0;
  private saveError = '';
  private readonly unsubscribe: (() => void) | undefined;
  private saving = false;

  constructor(private readonly dependencies: ReaderSessionDependencies) {
    let saved: unknown;
    try {
      saved = dependencies.storage.read();
    } catch (error) {
      saved = undefined;
      this.saveError = error instanceof Error ? error.message : 'Reading data could not be read.';
    }
    this.model = new ReaderModel(saved);
    this.unsubscribe = dependencies.storage.subscribe?.(() => {
      if (!this.disposed && !this.saving) this.reconcile();
    });
  }

  open(document: { id: string; title: string }): ReaderCommandResult {
    if (this.disposed) return { status: 'disposed' };
    this.reconcile();
    const tracked = this.model.open(document.id, this.dependencies.now(), document.title);
    this.pendingSave = true;
    this.flush();
    return { status: tracked ? 'applied' : 'rejected' };
  }

  command(command: ReaderCommand): ReaderCommandResult {
    if (this.disposed) return { status: 'disposed' };
    // Scroll is session-local and already receives external changes through the
    // storage subscription. Reconcile durable commands, not every frame of input.
    if (command.type !== 'position') this.reconcile();
    let accepted = true;
    switch (command.type) {
      case 'configure':
        this.model.configure(command.preferences);
        break;
      case 'position':
        if (command.pages !== undefined) this.model.layout(command.pages);
        this.model.position(command.progress, command.anchor);
        break;
      case 'page':
        this.model.goToPage(command.page);
        break;
      case 'step':
        this.model.step(command.direction);
        break;
      case 'bookmark':
        accepted = this.model.bookmark(command.id, command.label, command.anchor);
        break;
      case 'annotate':
        accepted = this.model.annotate(
          command.id,
          command.quote,
          command.text,
          command.anchor,
          command.offset,
          command.block,
        );
        break;
      case 'edit-note':
        accepted = this.model.editNote(command.id, command.text);
        break;
      case 'remove-bookmark':
        this.model.removeBookmark(command.id);
        break;
      case 'remove-note':
        this.model.removeNote(command.id);
        break;
    }
    if (!accepted) return { status: 'rejected' };
    if (command.type === 'position') {
      this.positionDirty = true;
      return { status: 'applied' };
    }
    this.pendingSave = true;
    this.cancelSave?.();
    const generation = ++this.saveGeneration;
    this.cancelSave = this.dependencies.schedule(() => {
      if (this.disposed || generation !== this.saveGeneration) return;
      this.cancelSave = undefined;
      this.flush();
    }, 200);
    return { status: 'applied' };
  }

  snapshot(): ReaderSessionSnapshot;
  snapshot(scope: 'notebook'): ReaderNotebookSnapshot;
  snapshot(scope?: 'notebook'): ReaderSessionSnapshot | ReaderNotebookSnapshot {
    // ReaderModel returns detached copies; freezing also catches accidental view writes.
    const reading = this.model.snapshot();
    const freezeDocument = (document: NonNullable<typeof reading.document>) => {
      document.bookmarks.forEach(Object.freeze);
      document.notes.forEach((note) => {
        if (note.block) Object.freeze(note.block);
        Object.freeze(note);
      });
      Object.freeze(document.bookmarks);
      Object.freeze(document.notes);
      Object.freeze(document);
    };
    if (scope === 'notebook') {
      const notebook = this.model.backup();
      Object.values(notebook.documents).forEach(freezeDocument);
      Object.freeze(notebook.documents);
      const recent = this.model.recent();
      recent.forEach(Object.freeze);
      return Object.freeze({ notebook: Object.freeze(notebook), recent: Object.freeze(recent) });
    }
    if (reading.document) freezeDocument(reading.document);
    return Object.freeze({
      ...reading,
      preferences: Object.freeze(reading.preferences),
      pendingSave: this.pendingSave,
      saveError: this.saveError,
      recoveryAvailable: this.dependencies.storage.recovery?.() !== undefined,
    });
  }

  async import(file: {
    size: number;
    text(): Promise<string>;
  }): Promise<ReaderNotebookImportResult> {
    if (this.disposed) return { status: 'ignored' };
    const generation = ++this.importGeneration;
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > 10 * 1024 * 1024)
      return { status: 'failed', error: 'Notebook backups must be smaller than 10 MB.' };
    let source: string;
    try {
      source = await file.text();
    } catch {
      return this.disposed || generation !== this.importGeneration
        ? { status: 'ignored' }
        : { status: 'failed', error: 'The notebook backup could not be read.' };
    }
    if (this.disposed || generation !== this.importGeneration) return { status: 'ignored' };
    if (source.length > 10 * 1024 * 1024)
      return { status: 'failed', error: 'Notebook backups must be smaller than 10 MB.' };
    let input: unknown;
    try {
      input = JSON.parse(source);
    } catch {
      return { status: 'failed', error: 'This file is not valid JSON. Existing notes were kept.' };
    }
    const result = this.model.importNotebook(input);
    if (!result.ok) return { status: 'failed', error: result.error };
    this.pendingSave = true;
    return {
      status: 'imported',
      persisted: this.flush().status === 'saved',
      documents: result.documents,
      bookmarks: result.bookmarks,
      notes: result.notes,
      skipped: result.skipped,
    };
  }

  flush(): ReaderFlushResult {
    if (this.disposed) return { status: 'disposed' };
    this.saveGeneration++;
    this.cancelSave?.();
    this.cancelSave = undefined;
    if (!this.pendingSave && !this.positionDirty) return { status: 'saved' };
    try {
      this.saving = true;
      const merged = this.dependencies.storage.write(this.model.serialize());
      if (merged) this.model.replace(merged);
      this.pendingSave = false;
      this.positionDirty = false;
      this.saveError = '';
      return { status: 'saved' };
    } catch (error) {
      this.pendingSave = true;
      this.saveError = error instanceof Error ? error.message : 'Reading data could not be saved.';
      return { status: 'failed', error: this.saveError };
    } finally {
      this.saving = false;
    }
  }

  private reconcile(): void {
    if (!this.dependencies.storage.reconcile) return;
    try {
      this.model.replace(this.dependencies.storage.reconcile(this.model.serialize()));
    } catch (error) {
      this.saveError =
        error instanceof Error ? error.message : 'Reading data could not be synchronized.';
    }
  }

  recovery(): string | undefined {
    return this.dependencies.storage.recovery?.();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.importGeneration++;
    this.saveGeneration++;
    this.cancelSave?.();
    this.cancelSave = undefined;
    this.unsubscribe?.();
  }
}
