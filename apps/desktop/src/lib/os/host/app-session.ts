import type { App, AppSession, CanvasApp, AppServices, AppSessionSurface } from './app-contracts';
import { createWidgetScope } from '../../ui/canvas/widgets';
import type { SaveTextResult } from '../files/save-request';

/** Seal each application's state once, before heterogeneous registration erases its type. */
export function defineCanvasApp<S>(definition: App<S>): CanvasApp {
  const {
    create: _create,
    draw: _draw,
    menus: _menus,
    status: _status,
    assistantView: _assistantView,
    assistantCommand: _assistantCommand,
    needsFrame: _needsFrame,
    checkpoint: _checkpoint,
    onClose: _onClose,
    dispose: _dispose,
    ...metadata
  } = definition;
  return {
    ...metadata,
    kind: 'canvas',
    createSession: (env, surface) => createAppSession(definition, env, surface),
  };
}

export function createAppSession<S>(
  app: App<S>,
  env: AppServices,
  surface: AppSessionSurface,
): AppSession {
  const saves = new Set<Promise<SaveTextResult>>();
  const releases = new Set<() => void>();
  let dirty = true;
  // Inherit live clock values instead of capturing a spread copy at mount time.
  const sessionEnv: AppServices = Object.create(env);
  sessionEnv.invalidate = () => {
    dirty = true;
  };
  sessionEnv.pickFile = (request) => {
    const selection = env.pickFile(request);
    const release = () => {
      if (releases.delete(release)) selection.cancel();
    };
    releases.add(release);
    void selection.result.finally(() => {
      releases.delete(release);
      dirty = true;
    });
    return { result: selection.result, cancel: release };
  };
  Object.defineProperty(sessionEnv, 'fileAudio', {
    value: {
      open(fileId: string) {
        const audio = env.fileAudio.open(fileId);
        const release = () => {
          if (!releases.delete(release)) return;
          audio.dispose();
        };
        releases.add(release);
        return {
          ready: audio.ready,
          snapshot: () => audio.snapshot(),
          play: () => audio.play(),
          pause: () => audio.pause(),
          stop: () => audio.stop(),
          dispose: release,
        };
      },
    } satisfies AppServices['fileAudio'],
  });
  sessionEnv.saveText = (request) => {
    let operation: Promise<SaveTextResult>;
    try {
      operation = env.saveText(request);
    } catch {
      operation = Promise.resolve({ status: 'failed', error: 'The document could not be saved.' });
    }
    const save = operation.catch((): SaveTextResult => ({
      status: 'failed',
      error: 'The document could not be saved.',
    }));
    saves.add(save);
    void save.finally(() => {
      saves.delete(save);
      dirty = true;
    });
    return save;
  };
  if (env.openSaveDialog) {
    sessionEnv.openSaveDialog = (frame, request) =>
      env.openSaveDialog!(frame, request, sessionEnv.saveText);
  }
  let focused = false;
  let frameTime = 0;
  let acceptingInput = true;
  const input = surface.input.scoped(
    surface.owner,
    () => acceptingInput,
    () => acceptingInput && focused,
  );
  const widgets = createWidgetScope(surface.draw, input, () => frameTime);
  let state: S;
  try {
    state = app.create(sessionEnv);
  } catch (error) {
    acceptingInput = false;
    widgets.dispose();
    input.release();
    for (const release of releases) release();
    throw error;
  }
  let disposed = false;
  const { promise: disposal, resolve: finishDisposal } = Promise.withResolvers<void>();
  let pending: { promise: Promise<boolean>; resolve(result: boolean): void } | undefined;
  let flushing: Promise<boolean> | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    acceptingInput = false;
    widgets.dispose();
    input.release();
    finishDisposal();
    saves.clear();
    try {
      app.dispose?.(state, sessionEnv);
    } catch {
      /* Teardown is final; a failed cleanup must not strand a close request. */
    }
    for (const release of releases) release();
    releases.clear();
    pending?.resolve(true);
    pending = undefined;
  };
  const flushClose = (): Promise<boolean> => {
    if (disposed) return Promise.resolve(true);
    if (flushing) return flushing;
    if (!pending) return Promise.resolve(false);
    const request = pending;
    const { promise, resolve: complete } = Promise.withResolvers<boolean>();
    // Assign before running close: a synchronous error or refusal must not leave a stale slot.
    flushing = promise;
    void (async () => {
      let accepted = false;
      try {
        let saved = true;
        while (saves.size && !disposed) {
          const results = await Promise.race([Promise.all(saves), disposal]);
          if (!results) break;
          saved &&= results.every((result) => result.status === 'saved' && result.persisted);
        }
        if (disposed) accepted = true;
        else if (saved) {
          // Invoke synchronously when possible so pagehide can checkpoint received input.
          const decision = app.onClose?.(state, sessionEnv);
          accepted = (await Promise.race([Promise.resolve(decision), disposal])) !== false;
        }
      } catch {
        accepted = disposed;
      }
      if (pending === request) pending = undefined;
      if (accepted) dispose();
      request.resolve(accepted);
      if (flushing === promise) flushing = undefined;
      complete(accepted);
    })();
    return promise;
  };
  return {
    prepareUnload() {
      if (disposed) return true;
      if (saves.size) return false;
      try {
        if (app.checkpoint) return app.checkpoint(state, sessionEnv) === true;
        // A close hook can cancel a dialog or release resources. Unloading must
        // not run it unless the user actually leaves the page.
        return !app.onClose;
      } catch {
        return false;
      }
    },
    frame(view) {
      if (disposed) return;
      focused = view.focused;
      frameTime = view.t;
      input.setPointerEnabled(true);
      const receivedInput =
        view.menuSel !== null ||
        input.io.keyboardEvents.length > 0 ||
        input.io.wentDown ||
        input.io.wentUp ||
        input.io.rwentDown ||
        input.io.rwentUp ||
        input.io.wheel !== 0;
      dirty = false;
      app.draw(
        state,
        Object.freeze({
          win: Object.freeze({
            id: view.win.id,
            menu: Object.freeze({ open: view.win.menu.open }),
          }),
          client: Object.freeze({ ...view.client }),
          menuSel: view.menuSel && Object.freeze({ ...view.menuSel }),
          focused: view.focused,
          pointerIn: view.pointerIn,
          t: view.t,
          dt: view.dt,
          draw: surface.draw,
          input,
          widgets,
          effects: surface.effects,
        }),
        sessionEnv,
      );
      // Immediate-mode controls can change state after painting their labels.
      // One settling frame presents the result of input, then static apps park.
      dirty ||= receivedInput;
      void flushClose();
    },
    needsFrame: () =>
      !disposed &&
      (dirty || saves.size > 0 || !!pending || (app.needsFrame?.(state, sessionEnv) ?? true)),
    ...(app.assistantView &&
      app.assistantCommand && {
        assistantView: () => (disposed ? undefined : app.assistantView!(state, sessionEnv)),
        assistantCommand(command) {
          if (disposed || pending) return;
          app.assistantCommand!(state, command, sessionEnv);
          dirty = true;
        },
      }),
    menus: () => (disposed ? undefined : app.menus?.(state, sessionEnv)),
    status: () => (disposed ? undefined : app.status?.(state, sessionEnv)),
    requestClose() {
      if (disposed) return Promise.resolve(true);
      if (!pending) pending = Promise.withResolvers<boolean>();
      return pending.promise;
    },
    flushClose,
    dispose,
    get closed() {
      return disposed;
    },
  };
}
