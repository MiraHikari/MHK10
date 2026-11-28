import { createLifetime } from '../../ui/browser/lifetime';
import type { NativeTextFile, NativeFileResult, NativeFileServices } from '../host/app-contracts';
export type {
  NativeFile,
  NativeTextFile,
  NativeAssetFile,
  NativeFileResult,
  NativeFileServices,
} from '../host/app-contracts';
export type NativeFileOperation =
  | { operation: 'read'; fileId: string }
  | { operation: 'write'; fileId: string; content: string; revision: number }
  | { operation: 'save-as'; name: string; content: string; folder?: string }
  | { operation: 'open'; fileId: string; application?: string };
export type NativeFileRequest = NativeFileOperation & {
  type: 'doom95:file-request';
  session: string;
  requestId: number;
};
const identifier = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 160 &&
  !/[\u0000-\u001f]/.test(value);
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 200000;
export function parseNativeFileRequest(value: unknown): NativeFileRequest | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (
    data.type !== 'doom95:file-request' ||
    !identifier(data.session) ||
    !Number.isSafeInteger(data.requestId) ||
    (data.requestId as number) < 0
  )
    return null;
  const base = {
    type: 'doom95:file-request' as const,
    session: data.session,
    requestId: data.requestId as number,
  };
  if (data.operation === 'read' && identifier(data.fileId))
    return { ...base, operation: data.operation, fileId: data.fileId };
  if (
    data.operation === 'write' &&
    identifier(data.fileId) &&
    text(data.content) &&
    Number.isSafeInteger(data.revision) &&
    (data.revision as number) >= 0
  )
    return {
      ...base,
      operation: data.operation,
      fileId: data.fileId,
      content: data.content,
      revision: data.revision as number,
    };
  if (
    data.operation === 'save-as' &&
    identifier(data.name) &&
    text(data.content) &&
    (data.folder === undefined || identifier(data.folder))
  )
    return {
      ...base,
      operation: data.operation,
      name: data.name,
      content: data.content,
      folder: data.folder as string | undefined,
    };
  if (
    data.operation === 'open' &&
    identifier(data.fileId) &&
    (data.application === undefined || identifier(data.application))
  )
    return {
      ...base,
      operation: data.operation,
      fileId: data.fileId,
      application: data.application as string | undefined,
    };
  return null;
}
export function parseNativeFileResult(value: unknown): NativeFileResult | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (data.status === 'cancelled' || data.status === 'opened') return { status: data.status };
  if (data.status === 'failed' && typeof data.error === 'string' && data.error.length <= 1000)
    return { status: data.status, error: data.error };
  if (data.status !== 'read' && data.status !== 'saved') return null;
  if (!data.file || typeof data.file !== 'object') return null;
  const file = data.file as Record<string, unknown>;
  if (
    !identifier(file.id) ||
    !identifier(file.title) ||
    !Number.isSafeInteger(file.revision) ||
    (file.revision as number) < 0 ||
    typeof file.readonly !== 'boolean'
  )
    return null;
  const common = {
    id: file.id,
    title: file.title,
    revision: file.revision as number,
    readonly: file.readonly,
  };
  if (file.kind === 'text' && typeof file.text === 'string' && file.text.length <= 2000000) {
    const document: NativeTextFile = { ...common, kind: 'text', text: file.text };
    return data.status === 'read'
      ? { status: 'read', file: document }
      : typeof data.persisted === 'boolean'
        ? { status: 'saved', file: document, persisted: data.persisted }
        : null;
  }
  if (
    data.status === 'read' &&
    (file.kind === 'image' || file.kind === 'audio') &&
    typeof file.mime === 'string' &&
    file.blob instanceof Blob &&
    file.blob.size <= 32 * 1024 * 1024
  )
    return {
      status: 'read',
      file: { ...common, kind: file.kind, mime: file.mime, blob: file.blob },
    };
  return null;
}

/** A narrow file capability for registered native Reader and image-browser clients. */
export function mountNativeFileHost(services: NativeFileServices): () => void {
  const lifetime = createLifetime();
  const pending = new WeakMap<Window, Map<string, Promise<NativeFileResult>>>();
  lifetime.listen(window, 'message', (event) => {
    if (event.origin !== location.origin || !event.source) return;
    const request = parseNativeFileRequest(event.data);
    if (!request) return;
    const frame = Array.from(
      document.querySelectorAll<HTMLIFrameElement>('iframe[data-html-window]'),
    ).find((item) => item.contentWindow === event.source);
    if (!frame?.contentWindow) return;
    // The shell owns stable application metadata separately from per-file instance IDs.
    // Older exact application IDs remain compatible; never infer an app from a prefix.
    const appId = frame.dataset.htmlApp ?? frame.dataset.htmlWindow;
    if (appId !== 'blog' && appId !== 'acdsee') return;
    const locationOfFrame = new URL(frame.src, location.href);
    if (
      locationOfFrame.origin !== location.origin ||
      (appId === 'blog'
        ? !locationOfFrame.pathname.startsWith('/blog/')
        : locationOfFrame.pathname !== '/acdsee/')
    )
      return;
    const source = frame.contentWindow;
    let operations = pending.get(source);
    if (!operations) {
      operations = new Map();
      pending.set(source, operations);
    }
    const key = `${request.session}:${request.requestId}`;
    let operation = operations.get(key);
    if (!operation) {
      operation = Promise.resolve()
        .then(() => {
          if (
            lifetime.disposed ||
            !frame.isConnected ||
            frame.contentWindow !== source ||
            frame.src !== locationOfFrame.href
          )
            return { status: 'failed' as const, error: 'The file window is closed.' };
          if (request.operation === 'read') return services.read(request.fileId);
          if (request.operation === 'write')
            return services.write(request.fileId, request.content, request.revision);
          if (request.operation === 'save-as')
            return services.saveAs(request.name, request.content, request.folder);
          return services.open(request.fileId, request.application);
        })
        .catch((): NativeFileResult => ({
          status: 'failed',
          error: 'The file operation could not be completed.',
        }));
      operations.set(key, operation);
      if (operations.size > 128) operations.delete(operations.keys().next().value!);
    }
    void operation.then((result) => {
      if (request.operation === 'read') operations?.delete(key);
      if (
        lifetime.disposed ||
        !frame.isConnected ||
        frame.contentWindow !== source ||
        frame.src !== locationOfFrame.href
      )
        return;
      try {
        source.postMessage(
          {
            type: 'doom95:file-result',
            session: request.session,
            requestId: request.requestId,
            result: parseNativeFileResult(result) ?? {
              status: 'failed',
              error: 'The file response exceeds the supported size or format.',
            },
          },
          location.origin,
        );
      } catch {
        // A navigated or closed receiver cannot consume an already accepted operation.
      }
    });
  });
  return lifetime.dispose;
}

export function createNativeFileClient() {
  const lifetime = createLifetime();
  const session = crypto.randomUUID();
  let serial = 0;
  const pending = new Map<
    number,
    {
      operation: NativeFileOperation;
      resolve(result: NativeFileResult): void;
      timeout?: number;
    }
  >();
  lifetime.listen(window, 'message', (event) => {
    if (
      event.origin !== location.origin ||
      event.source !== window.parent ||
      !event.data ||
      typeof event.data !== 'object'
    )
      return;
    const data = event.data as Record<string, unknown>;
    if (
      data.type !== 'doom95:file-result' ||
      data.session !== session ||
      typeof data.requestId !== 'number'
    )
      return;
    const operation = pending.get(data.requestId),
      result = parseNativeFileResult(data.result);
    if (!operation || !result) return;
    const requested = operation.operation;
    if (
      result.status === 'read' &&
      (requested.operation !== 'read' || result.file.id !== requested.fileId)
    )
      return;
    if (
      result.status === 'saved' &&
      requested.operation !== 'save-as' &&
      (requested.operation !== 'write' || result.file.id !== requested.fileId)
    )
      return;
    if (result.status === 'opened' && requested.operation !== 'open') return;
    clearTimeout(operation.timeout);
    pending.delete(data.requestId);
    operation.resolve(result);
  });
  function request(operation: NativeFileOperation): Promise<NativeFileResult> {
    if (lifetime.disposed || window.parent === window)
      return Promise.resolve({
        status: 'failed',
        error: 'The desktop file service is unavailable.',
      });
    if (
      !parseNativeFileRequest({
        ...operation,
        type: 'doom95:file-request',
        session,
        requestId: serial + 1,
      })
    )
      return Promise.resolve({
        status: 'failed',
        error: 'The file request is invalid or exceeds the supported size.',
      });
    return new Promise((resolve) => {
      const requestId = ++serial;
      const timeout =
        operation.operation === 'save-as'
          ? undefined
          : window.setTimeout(() => {
              pending.delete(requestId);
              resolve({ status: 'failed', error: 'The file service did not respond.' });
            }, 15000);
      pending.set(requestId, { operation, resolve, timeout });
      try {
        window.parent.postMessage(
          { ...operation, type: 'doom95:file-request', session, requestId },
          location.origin,
        );
      } catch {
        clearTimeout(timeout);
        pending.delete(requestId);
        resolve({ status: 'failed', error: 'The file service could not be contacted.' });
      }
    });
  }
  const dispose = () => {
    if (lifetime.disposed) return;
    lifetime.dispose();
    for (const operation of pending.values()) {
      clearTimeout(operation.timeout);
      operation.resolve({ status: 'cancelled' });
    }
    pending.clear();
  };
  lifetime.listen(window, 'pagehide', (event) => {
    if (!event.persisted) {
      dispose();
      return;
    }
    for (const operation of pending.values()) {
      clearTimeout(operation.timeout);
      operation.resolve({ status: 'cancelled' });
    }
    pending.clear();
  });
  return {
    read: (fileId: string) => request({ operation: 'read', fileId }),
    write: (fileId: string, content: string, revision: number) =>
      request({ operation: 'write', fileId, content, revision }),
    saveAs: (name: string, content: string, folder?: string) =>
      request({ operation: 'save-as', name, content, folder }),
    open: (fileId: string, application?: string) =>
      request({ operation: 'open', fileId, application }),
    dispose,
  };
}
