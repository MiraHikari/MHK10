import type { Application, AppSession, MsgSpec, OpenResult } from '../host/app-contracts';
import type { WM, WinSpec } from './wm';

export type WindowMessage = Readonly<Omit<MsgSpec, 'lines' | 'buttons' | 'check'>> & {
  readonly lines: readonly string[];
  readonly buttons?: readonly string[];
  readonly check?: Readonly<NonNullable<MsgSpec['check']>>;
};

export interface WindowSessionOptions {
  createSession?: () => AppSession;
  htmlUrl?: string;
  message?: MsgSpec;
}

interface WindowEntry {
  appId: string;
  session?: AppSession;
  htmlUrl?: string;
  message?: MsgSpec;
  closing?: Promise<boolean>;
  finishClose?: (accepted: boolean) => void;
}

/** Owns each window's resources from provisional creation through final release. */
export function createWindowSessions(
  wm: WM,
  applications: readonly Application[] = [],
  onRemoved: (id: string, message?: WindowMessage) => void = () => {},
) {
  const catalog = new Map<string, Application>();
  for (const application of applications) {
    if (catalog.has(application.id)) throw new Error(`Duplicate application: ${application.id}`);
    catalog.set(application.id, application);
  }
  const dynamic = new Map<string, { application: Application; lifetime: 'desktop' | 'window' }>();
  const entries = new Map<string, WindowEntry>();
  let disposed = false;

  const messageSnapshot = (message: MsgSpec | undefined): WindowMessage | undefined =>
    message &&
    Object.freeze({
      ...message,
      lines: Object.freeze([...message.lines]),
      ...(message.buttons ? { buttons: Object.freeze([...message.buttons]) } : {}),
      ...(message.check ? { check: Object.freeze({ ...message.check }) } : {}),
    });

  const remove = (id: string, entry: WindowEntry, animate: boolean) => {
    if (entries.get(id) !== entry) return;
    entries.delete(id);
    entry.finishClose?.(true);
    if (animate) wm.close(id);
    else wm.discard(id);
    // Detach auxiliary ownership before application cleanup can open a replacement.
    if (
      dynamic.get(entry.appId)?.lifetime === 'window' &&
      ![...entries.values()].some((other) => other.appId === entry.appId)
    )
      dynamic.delete(entry.appId);
    try {
      onRemoved(id, messageSnapshot(entry.message));
    } catch {
      /* Window ownership has already been released. */
    }
    try {
      entry.session?.dispose();
    } catch {
      /* One application cannot strand the other window resources. */
    }
  };

  const requestClose = (id: string): Promise<boolean> => {
    const entry = entries.get(id);
    if (!entry) return Promise.resolve(true);
    if (entry.closing) return entry.closing;
    if (!entry.session) {
      remove(id, entry, true);
      return Promise.resolve(true);
    }
    // Enroll before calling application code, including synchronous reentry or failure.
    const operation = Promise.withResolvers<boolean>();
    entry.closing = operation.promise;
    entry.finishClose = operation.resolve;
    let requested: Promise<boolean>;
    try {
      requested = entry.session.requestClose();
    } catch {
      requested = Promise.resolve(false);
    }
    void requested.then(
      (accepted) => {
        if (entries.get(id) !== entry) {
          operation.resolve(true);
          return;
        }
        if (accepted) remove(id, entry, true);
        else {
          entry.closing = undefined;
          entry.finishClose = undefined;
        }
        operation.resolve(accepted);
      },
      () => {
        if (entries.get(id) === entry) {
          entry.closing = undefined;
          entry.finishClose = undefined;
        }
        operation.resolve(entries.get(id) !== entry);
      },
    );
    return operation.promise;
  };

  return {
    application: (appId: string): Application | undefined =>
      dynamic.get(appId)?.application ?? catalog.get(appId),
    register(application: Application, lifetime: 'desktop' | 'window' = 'window'): void {
      if (disposed) throw new Error('The desktop is closed');
      if (catalog.has(application.id) || dynamic.has(application.id))
        throw new Error(`Duplicate application: ${application.id}`);
      dynamic.set(application.id, { application, lifetime });
    },
    unregister(appId: string): void {
      if (![...entries.values()].some((entry) => entry.appId === appId)) dynamic.delete(appId);
    },
    open(spec: WinSpec, options: WindowSessionOptions = {}): OpenResult {
      if (disposed) return { accepted: false, reason: 'unavailable' };
      if (entries.has(spec.id)) {
        wm.restore(spec.id);
        return { accepted: true };
      }
      const entry: WindowEntry = {
        appId: spec.appId,
        htmlUrl: options.htmlUrl,
        ...(options.message
          ? {
              message: {
                ...options.message,
                lines: [...options.message.lines],
                ...(options.message.buttons ? { buttons: [...options.message.buttons] } : {}),
                ...(options.message.check ? { check: { ...options.message.check } } : {}),
              },
            }
          : {}),
      };
      entries.set(spec.id, entry);
      try {
        wm.open(spec);
        const session = options.createSession?.();
        // Creation can close/dispose the host; a late created resource still needs release.
        if (disposed || entries.get(spec.id) !== entry) {
          try {
            session?.dispose();
          } catch (error) {
            console.error('Application initialization cleanup failed', error);
          }
          throw new Error('The desktop closed during application creation');
        }
        entry.session = session;
        return { accepted: true };
      } catch {
        remove(spec.id, entry, false);
        return { accepted: false, reason: 'unavailable' };
      }
    },
    session: (id: string): AppSession | undefined => entries.get(id)?.session,
    htmlUrl: (id: string): string | undefined => entries.get(id)?.htmlUrl,
    navigateHtml(id: string, href: string): boolean {
      const entry = entries.get(id);
      if (!entry || entry.htmlUrl === undefined) return false;
      entry.htmlUrl = href;
      return true;
    },
    message: (id: string): WindowMessage | undefined => messageSnapshot(entries.get(id)?.message),
    updateMessage(id: string, update: { def?: number; checked?: boolean }): void {
      const message = entries.get(id)?.message;
      if (!message) return;
      if (update.def !== undefined) message.def = update.def;
      if (update.checked !== undefined && message.check) message.check.checked = update.checked;
    },
    get size(): number {
      return [...entries.values()].filter((entry) => entry.session).length;
    },
    needsFrame(): boolean {
      return wm.wins.some((win) => {
        if (win.minimized) return false;
        const session = entries.get(win.id)?.session;
        return !!session && (session.needsFrame?.() ?? true);
      });
    },
    requestClose,
    /** Roll back an unsuccessful host operation; ordinary closing uses requestClose. */
    discard(id: string): void {
      const entry = entries.get(id);
      if (entry) remove(id, entry, false);
    },
    /** Call after all clients have consumed accepted input, including hidden clients. */
    flushClose(): void {
      for (const id of wm.takeCloseRequests()) void requestClose(id);
      for (const entry of entries.values()) void entry.session?.flushClose();
    },
    prepareUnload(): boolean {
      let accepted = true;
      for (const entry of entries.values()) {
        try {
          if (entry.session && !entry.session.prepareUnload()) accepted = false;
        } catch {
          accepted = false;
        }
      }
      return accepted;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const [id, entry] of entries) remove(id, entry, false);
      dynamic.clear();
      wm.clear();
    },
  };
}

export type WindowSessions = ReturnType<typeof createWindowSessions>;
