import type { FileSystem, FolderId, SandboxFile } from './filesystem';
import type { SaveText, SaveTextResult } from './save-request';

export interface DocumentSnapshot {
  readonly fileId: string;
  readonly name: string;
  readonly folder: FolderId;
  readonly content: string;
  readonly dirty: boolean;
  readonly notice: string;
  /** Changes only when the editor should reload its buffer and caret. */
  readonly version: number;
}

export interface DocumentSession {
  get(): DocumentSnapshot;
  edit(content: string): void;
  refresh(): DocumentSnapshot;
  save(): SaveTextResult;
  saveAs(saveText: SaveText): Promise<SaveTextResult>;
  dispose(): void;
}

export interface Documents {
  open(fileId?: string): DocumentSession;
  requestOpen(fileId: string): void;
  consumeOpen(): string | undefined;
}

/** Owns document revisions, conflict handling and pending picker adoption. */
export function createDocuments(files: FileSystem): Documents {
  let pendingOpen: string | undefined;
  return {
    requestOpen(fileId) {
      pendingOpen = fileId;
    },
    consumeOpen() {
      const id = pendingOpen;
      pendingOpen = undefined;
      return id;
    },
    open(fileId) {
      return createSession(files, fileId);
    },
  };
}

function createSession(files: FileSystem, fileId = 'diary'): DocumentSession {
  let snapshot: DocumentSnapshot = {
    fileId: '',
    name: 'Untitled.txt',
    folder: 'root',
    content: '',
    dirty: false,
    notice: '',
    version: 0,
  };
  let baseline = '',
    epoch = files.epoch,
    revision = files.revision;
  let expectedVersion: number | undefined;
  let disposed = false,
    pendingPersistence = false;
  let saveRequest: Promise<SaveTextResult> | undefined;

  const adopt = (file: SandboxFile, persisted = true) => {
    baseline = file.content;
    epoch = files.epoch;
    revision = files.revision;
    expectedVersion = files.getVersion(file.id);
    pendingPersistence = !persisted;
    snapshot = {
      fileId: file.id,
      name: file.name,
      folder: file.folder,
      content: file.content,
      dirty: !persisted,
      notice: files.notice,
      version: snapshot.version + 1,
    };
  };
  const load = (id = 'diary') => {
    const file = files.get(id);
    if (file && !file.deleted && (!file.kind || file.kind === 'text')) {
      adopt(file);
      return;
    }
    const created = files.newText();
    if (created.file) {
      adopt(created.file, created.persisted);
      return;
    }
    epoch = files.epoch;
    revision = files.revision;
    expectedVersion = undefined;
    baseline = '';
    pendingPersistence = false;
    snapshot = {
      fileId: '',
      name: 'Untitled.txt',
      folder: 'root',
      content: '',
      dirty: false,
      notice: created.error || 'Cannot create document.',
      version: snapshot.version + 1,
    };
  };
  const fail = (error: string): SaveTextResult => {
    snapshot = { ...snapshot, notice: error };
    return { status: 'failed', error };
  };
  load(fileId);

  const session: DocumentSession = {
    get: () => ({ ...snapshot }),
    edit(content) {
      if (disposed) return;
      if (epoch !== files.epoch) {
        session.refresh();
        return;
      }
      if (snapshot.content === content) return;
      snapshot = {
        ...snapshot,
        content,
        dirty: pendingPersistence || content !== baseline,
        notice: '',
      };
    },
    refresh() {
      if (disposed) return session.get();
      if (epoch !== files.epoch) {
        load();
        return session.get();
      }
      if (revision === files.revision) return session.get();
      revision = files.revision;
      const file = files.get(snapshot.fileId);
      if (!file || file.deleted) {
        snapshot = { ...snapshot, notice: 'File deleted. Restore it in Recycle Bin to save.' };
      } else if (!snapshot.dirty && file.content !== snapshot.content) {
        adopt(file);
      } else {
        snapshot = { ...snapshot, name: file.name, folder: file.folder };
        if (file.content !== baseline && file.content !== snapshot.content) {
          snapshot = { ...snapshot, notice: 'File changed elsewhere. Use Save As...' };
        } else {
          expectedVersion = files.getVersion(file.id);
          if (pendingPersistence && files.persisted && file.content === snapshot.content) {
            pendingPersistence = false;
            baseline = file.content;
            snapshot = { ...snapshot, dirty: false, notice: files.notice };
          } else if (snapshot.notice.startsWith('File deleted.')) {
            snapshot = { ...snapshot, notice: 'File restored. Unsaved changes remain.' };
          }
        }
      }
      return session.get();
    },
    save() {
      if (disposed) return { status: 'failed', error: 'Document is closed.' };
      session.refresh();
      const current = files.get(snapshot.fileId);
      if (!current || current.deleted)
        return fail('File deleted. Restore it in Recycle Bin or use Save As...');
      if (current.content !== baseline && current.content !== snapshot.content)
        return fail('File changed elsewhere. Use Save As...');
      const result = files.writeText(snapshot.fileId, snapshot.content, { expectedVersion });
      if (!result.ok || !result.file) return fail(result.error || 'Could not save this document.');
      baseline = snapshot.content;
      expectedVersion = files.getVersion(snapshot.fileId);
      revision = files.revision;
      pendingPersistence = !result.persisted;
      snapshot = { ...snapshot, dirty: !result.persisted, notice: files.notice };
      return { status: 'saved', file: result.file, persisted: result.persisted };
    },
    saveAs(saveText) {
      if (disposed) return Promise.resolve({ status: 'failed', error: 'Document is closed.' });
      if (saveRequest) return saveRequest;
      session.refresh();
      const before = snapshot,
        requestEpoch = epoch;
      // Invoke now so the host sees the pending save before processing this frame's close.
      let operation: Promise<SaveTextResult>;
      try {
        operation = saveText({ name: before.name, folder: before.folder, content: before.content });
      } catch (error) {
        operation = Promise.reject(error);
      }
      saveRequest = operation
        .then((result) => {
          if (disposed) return result;
          session.refresh();
          if (
            requestEpoch !== files.epoch ||
            snapshot.fileId !== before.fileId ||
            snapshot.version !== before.version
          )
            return result;
          if (result.status === 'failed') {
            snapshot = { ...snapshot, notice: result.error };
            return result;
          }
          if (result.status === 'cancelled') return result;
          if (snapshot.content !== before.content) {
            snapshot = {
              ...snapshot,
              notice: result.persisted
                ? 'Copy saved. Current edits kept.'
                : 'Session copy saved. Current edits kept; export a backup.',
            };
            return result;
          }
          const current = files.get(result.file.id);
          if (!current || current.deleted || current.content !== before.content) {
            snapshot = { ...snapshot, notice: 'Saved copy changed. Current edits kept.' };
            return result;
          }
          adopt(current, result.persisted);
          return result;
        })
        .catch((error: unknown) => {
          const result: SaveTextResult = {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Could not save this document.',
          };
          if (!disposed && requestEpoch === files.epoch)
            snapshot = { ...snapshot, notice: result.error };
          return result;
        })
        .finally(() => {
          saveRequest = undefined;
        });
      return saveRequest;
    },
    dispose() {
      disposed = true;
    },
  };
  return session;
}
