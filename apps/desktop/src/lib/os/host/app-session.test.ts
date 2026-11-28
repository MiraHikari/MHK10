import { createCanvasSurfaceRuntime } from './canvas-surface-runtime';
import { canvasFixture, makeTestCanvas } from '../../gfx/canvas-fixture';
import { describe, expect, it, vi } from 'vite-plus/test';
import { defineCanvasApp } from './app-session';
import type { App, AppServices, AppFrameRequest } from './app-contracts';
import type { SaveTextResult } from '../files/save-request';

function fixture(
  overrides: Partial<App<{ text: string }>> = {},
  environment: Partial<AppServices> = {},
) {
  const app = defineCanvasApp({
    id: 'fixture',
    title: 'Fixture',
    w: 100,
    h: 100,
    create: () => ({ text: '' }),
    draw: (state: { text: string }) => {
      state.text += 'input';
    },
    ...overrides,
  });
  const env = {
    now: () => env.t,
    t: 0,
    saveText: vi.fn(async (): Promise<SaveTextResult> => ({ status: 'cancelled' })),
    ...environment,
  } as AppServices & { t: number };
  const surface = createCanvasSurfaceRuntime(canvasFixture().canvas, {
    createCanvas: makeTestCanvas,
  });
  const view: AppFrameRequest = {
    t: 0,
    dt: 0,
    win: { id: 'fixture', menu: { open: -1 } },
    client: { x: 0, y: 0, w: 100, h: 100 },
    menuSel: null,
    focused: true,
    pointerIn: true,
  };
  return {
    app,
    env,
    surface,
    session: app.createSession(env, { ...surface, owner: 'fixture' }),
    view,
  };
}

describe('application session lifecycle', () => {
  it('parks opt-in static sessions and paints once more after accepted input or invalidation', () => {
    let current!: AppServices;
    const { session, surface, view } = fixture({
      create: (env) => {
        current = env;
        return { text: '' };
      },
      needsFrame: () => false,
    });
    expect(session.needsFrame?.()).toBe(true);
    surface.input.beginFrame(0);
    session.frame(view);
    expect(session.needsFrame?.()).toBe(false);
    surface.input.queueInput({ typed: 'accepted' });
    surface.input.beginFrame(0.05);
    session.frame({ ...view, t: 0.05 });
    expect(session.needsFrame?.()).toBe(true);
    surface.input.beginFrame(0.1);
    session.frame({ ...view, t: 0.1 });
    expect(session.needsFrame?.()).toBe(false);
    current.invalidate();
    expect(session.needsFrame?.()).toBe(true);
    surface.input.beginFrame(0.15);
    session.frame({ ...view, t: 0.15 });
    expect(session.needsFrame?.()).toBe(false);
    session.dispose();
    current.invalidate();
    expect(session.needsFrame?.()).toBe(false);
    surface.dispose();
  });

  it('retains continuous frames for existing animated sessions', () => {
    const { session, surface, view } = fixture();
    session.frame(view);
    expect(session.needsFrame?.()).toBe(true);
    session.dispose();
    surface.dispose();
  });

  it('releases acquired host capabilities after a partial application initialization fails', () => {
    const cancel = vi.fn();
    const releaseAudio = vi.fn();
    const selection =
      Promise.withResolvers<Awaited<ReturnType<AppServices['pickFile']>['result']>>();
    const surface = createCanvasSurfaceRuntime(canvasFixture().canvas, {
      createCanvas: makeTestCanvas,
    });
    const app = defineCanvasApp({
      id: 'partial',
      title: 'Partial',
      w: 100,
      h: 100,
      create(env: AppServices) {
        env.pickFile({ accept: '.json' });
        env.fileAudio.open('audio');
        throw new Error('Application failed');
      },
      draw() {},
    });
    const env = {
      pickFile: () => ({ result: selection.promise, cancel }),
      fileAudio: {
        open: () => ({
          ready: Promise.resolve(true),
          snapshot: () => ({
            phase: 'ready' as const,
            playing: false,
            position: 0,
            duration: 1,
            error: '',
          }),
          play: async () => true,
          pause: () => {},
          stop: () => {},
          dispose: releaseAudio,
        }),
      },
    } as unknown as AppServices;
    expect(() => app.createSession(env, { ...surface, owner: 'partial' })).toThrow(
      'Application failed',
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseAudio).toHaveBeenCalledOnce();
    surface.dispose();
  });
  it.each(['saved', 'cancelled', 'failed'] as const)(
    'tracks a presented Save As before close: %s',
    async (status) => {
      let complete!: (result: SaveTextResult) => void;
      const operation = new Promise<SaveTextResult>((resolve) => {
        complete = resolve;
      });
      const saved = vi.fn();
      const onClose = vi.fn();
      const { session, view } = fixture(
        {
          draw: (_state, frame, current) => {
            current.openSaveDialog?.(
              frame,
              { name: 'note.txt', content: 'Accepted input', onSave: saved },
              current.saveText,
            );
          },
          onClose,
        },
        {
          saveText: () => operation,
          openSaveDialog: (_frame, request, save) => {
            void save(request).then((result) => {
              if (result.status === 'saved') request.onSave(result.file, result.persisted);
            });
          },
        },
      );
      session.frame(view);
      expect(session.prepareUnload()).toBe(false);
      const closing = session.requestClose();
      const flushing = session.flushClose();
      await Promise.resolve();
      expect(onClose).not.toHaveBeenCalled();
      const file = { id: 'note' } as Extract<SaveTextResult, { status: 'saved' }>['file'];
      complete(
        status === 'saved'
          ? { status, persisted: true, file }
          : status === 'failed'
            ? { status, error: 'Disk full' }
            : { status },
      );
      expect(await closing).toBe(status === 'saved');
      await flushing;
      expect(session.closed).toBe(status === 'saved');
      expect(saved).toHaveBeenCalledTimes(status === 'saved' ? 1 : 0);
      expect(onClose).toHaveBeenCalledTimes(status === 'saved' ? 1 : 0);
      session.dispose();
    },
  );
  it('makes a retained frame input scope inert after its session is disposed', () => {
    const draw = vi.fn();
    const current = fixture({ draw });
    current.session.frame(current.view);
    const frame = draw.mock.calls[0][1];
    current.session.dispose();
    current.surface.input.queueInput({ typed: 'next session', key: 'Enter' });
    current.surface.input.beginFrame(1);
    current.surface.input.setGate('fixture');
    expect(frame.input.consumeText()).toBe('');
    expect(frame.input.consumeKey('Enter')).toBe(false);
    expect(current.surface.input.io.typed).toBe('next session');
    current.surface.dispose();
  });
  it('exposes only metadata and a session factory, and projects a minimal immutable view', () => {
    const draw = vi.fn();
    const { app, session, view } = fixture({ draw });
    expect(app).not.toHaveProperty('create');
    expect(app).not.toHaveProperty('draw');
    expect(app).not.toHaveProperty('dispose');
    const hostWindow = { ...view.win, x: 123, closeReq: true };
    session.frame({ ...view, win: hostWindow });
    const frame = draw.mock.calls[0][1];
    expect(frame.win).toEqual({ id: 'fixture', menu: { open: -1 } });
    expect(Object.isFrozen(frame.win)).toBe(true);
    session.dispose();
  });
  it('checkpoints before navigation without running close side effects', () => {
    const onClose = vi.fn(),
      checkpoint = vi.fn(() => true);
    const current = fixture({ checkpoint, onClose });
    expect(current.session.prepareUnload()).toBe(true);
    expect(current.session.prepareUnload()).toBe(true);
    expect(current.session.closed).toBe(false);
    expect(checkpoint).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();
    expect(fixture({ checkpoint: () => false }).session.prepareUnload()).toBe(false);
    expect(
      fixture({
        checkpoint: () => {
          throw new Error('checkpoint failed');
        },
      }).session.prepareUnload(),
    ).toBe(false);
  });
  it('requires confirmation for close hooks without a synchronous checkpoint', () => {
    const onClose = vi.fn(),
      asyncClose = vi.fn(async () => true);
    expect(fixture({ onClose }).session.prepareUnload()).toBe(false);
    expect(fixture({ onClose: asyncClose }).session.prepareUnload()).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(asyncClose).not.toHaveBeenCalled();
    expect(fixture().session.prepareUnload()).toBe(true);
  });
  it('keeps pending saves unchanged across repeated unload checks', async () => {
    const pending = Promise.withResolvers<SaveTextResult>();
    const onClose = vi.fn(),
      checkpoint = vi.fn(() => true);
    const { session, view } = fixture(
      {
        draw: (_state, _view, env) => {
          void env.saveText({ name: 'draft.txt', content: 'draft' });
        },
        onClose,
        checkpoint,
      },
      { saveText: () => pending.promise },
    );
    session.frame(view);
    expect(session.prepareUnload()).toBe(false);
    expect(session.prepareUnload()).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(checkpoint).not.toHaveBeenCalled();
    expect(session.closed).toBe(false);
    pending.resolve({ status: 'cancelled' });
    await pending.promise;
    await Promise.resolve();
    expect(session.prepareUnload()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });
  it('checkpoints synchronously before pagehide disposal when no picker is pending', async () => {
    const onClose = vi.fn();
    const { session } = fixture({ onClose });
    const closing = session.requestClose();
    const flushing = session.flushClose();
    expect(onClose).toHaveBeenCalledTimes(1);
    session.dispose();
    expect(await closing).toBe(true);
    expect(await flushing).toBe(true);
  });

  it('processes the queued frame before a merged close request', async () => {
    const seen: string[] = [];
    const { session, view } = fixture({
      onClose: (state) => {
        seen.push(state.text);
      },
    });
    const close = session.requestClose();
    expect(session.requestClose()).toBe(close);
    expect(seen).toEqual([]);
    session.frame(view);
    expect(await close).toBe(true);
    expect(seen).toEqual(['input']);
    expect(session.closed).toBe(true);
    session.frame(view);
    expect(seen).toHaveLength(1);
  });

  it.each(['cancelled', 'failed'] as const)(
    'retains the session after an in-flight save is %s',
    async (status) => {
      let resolve!: (result: SaveTextResult) => void;
      const operation = new Promise<SaveTextResult>((complete) => {
        resolve = complete;
      });
      const onClose = vi.fn();
      const { session, view } = fixture(
        {
          draw: (_state, _view, env) => {
            void env.saveText({ name: 'note.txt', content: 'draft' });
          },
          onClose,
        },
        { saveText: () => operation },
      );
      session.frame(view);
      const closing = session.requestClose();
      const flush = session.flushClose();
      await Promise.resolve();
      expect(onClose).not.toHaveBeenCalled();
      resolve(status === 'failed' ? { status, error: 'Disk full' } : { status });
      expect(await closing).toBe(false);
      await flush;
      expect(session.closed).toBe(false);
      expect(onClose).not.toHaveBeenCalled();
    },
  );

  it('waits for save completion before checking close and reads the live clock', async () => {
    let resolve!: (result: SaveTextResult) => void;
    const operation = new Promise<SaveTextResult>((complete) => {
      resolve = complete;
    });
    const order: string[] = [];
    const { session, env, view } = fixture(
      {
        draw: (_state, _view, current) => {
          order.push(`frame:${current.now()}`);
          void current.saveText({ name: 'note.txt', content: 'draft' });
        },
        onClose: () => {
          order.push('close');
        },
      },
      { saveText: () => operation },
    );
    env.t = 42;
    const close = session.requestClose();
    session.frame(view);
    await Promise.resolve();
    expect(order).toEqual(['frame:42']);
    resolve({
      status: 'saved',
      persisted: true,
      file: { id: 'note' } as Extract<SaveTextResult, { status: 'saved' }>['file'],
    });
    expect(await close).toBe(true);
    expect(order).toEqual(['frame:42', 'close']);
  });

  it('keeps a session copy open until the user can export or retry persistence', async () => {
    let resolve!: (result: SaveTextResult) => void;
    const operation = new Promise<SaveTextResult>((complete) => {
      resolve = complete;
    });
    const onClose = vi.fn();
    const { session, view } = fixture(
      {
        draw: (_state, _view, env) => {
          void env.saveText({ name: 'note.txt', content: 'draft' });
        },
        onClose,
      },
      { saveText: () => operation },
    );
    session.frame(view);
    const closing = session.requestClose();
    const flushing = session.flushClose();
    resolve({
      status: 'saved',
      persisted: false,
      file: { id: 'note' } as Extract<SaveTextResult, { status: 'saved' }>['file'],
    });
    expect(await closing).toBe(false);
    await flushing;
    expect(session.closed).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps a refused or throwing close available for retry', async () => {
    const onClose = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('save failed');
      })
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    const { session } = fixture({ onClose });
    for (const accepted of [false, false, true]) {
      const close = session.requestClose();
      await session.flushClose();
      expect(await close).toBe(accepted);
      expect(session.closed).toBe(accepted);
    }
  });

  it('disposes resources once without saving or running close checks', async () => {
    const dispose = vi.fn(),
      onClose = vi.fn();
    const { session, env } = fixture({ dispose, onClose });
    const pending = session.requestClose();
    session.dispose();
    session.dispose();
    expect(await pending).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(env.saveText).not.toHaveBeenCalled();
  });

  it('releases a close waiting for save and never checks an already disposed application', async () => {
    let resolve!: (result: SaveTextResult) => void;
    const operation = new Promise<SaveTextResult>((complete) => {
      resolve = complete;
    });
    const onClose = vi.fn();
    const { session, view } = fixture(
      {
        draw: (_state, _view, env) => {
          void env.saveText({ name: 'note.txt', content: 'draft' });
        },
        onClose,
      },
      { saveText: () => operation },
    );
    session.frame(view);
    const closing = session.requestClose(),
      flushing = session.flushClose();
    await Promise.resolve();
    session.dispose();
    expect(await closing).toBe(true);
    expect(await flushing).toBe(true);
    resolve({ status: 'cancelled' });
    await Promise.resolve();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('settles a close even if an application cleanup throws', async () => {
    const dispose = vi.fn(() => {
      throw new Error('cleanup failed');
    });
    const { session } = fixture({ dispose });
    const closing = session.requestClose();
    await expect(session.flushClose()).resolves.toBe(true);
    expect(await closing).toBe(true);
    session.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
