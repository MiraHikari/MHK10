import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vite-plus/test';
import { createRenderer, type Renderer } from '../../gfx/context';
import { canvasFixture, makeTestCanvas } from '../../gfx/canvas-fixture';
import { createFrameEffects, type FrameEffects } from '../../gfx/fx';
import { createWidgetScope, type WidgetScope } from '../../ui/canvas/widgets';
import { createInputController, type InputController } from '../../ui/canvas/input';
import { defineCanvasApp } from '../host/app-session';
import type { AppFrameRequest, AppServices, AppSession, HtmlApp } from '../host/app-contracts';
import type { SaveTextResult } from '../files/save-request';
import { WM } from './wm';
import { createWindowSessions, type WindowMessage, type WindowSessions } from './window-sessions';

const spec = (id: string, appId = id) => ({ id, appId, title: id, x: 10, y: 10, w: 200, h: 100 });
let draw: Renderer;
let input: InputController;
let widgets: WidgetScope;
let effects: FrameEffects;
let wm: WM;
let sessions: WindowSessions;
let removed: Mock<(id: string, message?: WindowMessage) => void>;

beforeEach(() => {
  draw = createRenderer(canvasFixture().canvas, { createCanvas: makeTestCanvas });
  input = createInputController();
  widgets = createWidgetScope(draw, input);
  effects = createFrameEffects(draw);
  wm = new WM(draw, input, widgets);
  removed = vi.fn();
  sessions = createWindowSessions(wm, [], removed);
});

afterEach(() => {
  sessions.dispose();
  effects.dispose();
  widgets.dispose();
  input.dispose();
  draw.dispose();
});

function session(overrides: Partial<AppSession> = {}): AppSession {
  return {
    frame: vi.fn(),
    menus: () => undefined,
    status: () => undefined,
    prepareUnload: () => true,
    requestClose: () => Promise.resolve(true),
    flushClose: () => Promise.resolve(false),
    dispose: vi.fn(),
    closed: false,
    ...overrides,
  };
}

const frame = (id: string): AppFrameRequest => ({
  win: { id, menu: { open: -1 } },
  client: { x: 13, y: 32, w: 194, h: 75 },
  menuSel: null,
  focused: true,
  pointerIn: true,
  t: 1,
  dt: 0.016,
});

describe('window session transactions', () => {
  it('keeps desktop definitions while constructing a fresh session for each reopening', async () => {
    const app: HtmlApp = { kind: 'html', id: '$run', title: 'Run', w: 200, h: 100, html: '/run/' };
    sessions.register(app, 'desktop');
    const first = session();
    sessions.open(spec('$run'), { createSession: () => first });
    await sessions.requestClose('$run');
    expect(sessions.application('$run')).toBe(app);
    const next = session();
    sessions.open(spec('$run'), { createSession: () => next });
    expect(sessions.session('$run')).toBe(next);
    expect(first.dispose).toHaveBeenCalledOnce();
    sessions.dispose();
    expect(sessions.application('$run')).toBeUndefined();
  });

  it('rolls back failed creation, the dynamic definition and every opening outline', () => {
    const dynamic = defineCanvasApp({
      ...spec('dialog'),
      create: () => {
        throw new Error('creation failed');
      },
      draw: () => {},
    });
    sessions.register(dynamic);
    const failed = sessions.open(spec('dialog'), {
      createSession: () =>
        dynamic.createSession({} as AppServices, { draw, input, effects, owner: 'dialog' }),
    });
    expect(failed).toEqual({ accepted: false, reason: 'unavailable' });
    expect(sessions.application('dialog')).toBeUndefined();
    expect(wm.wins).toEqual([]);
    const outlines = vi.spyOn(draw, 'dither');
    wm.drawTransitions();
    expect(outlines).not.toHaveBeenCalled();
    expect(removed).toHaveBeenCalledExactlyOnceWith('dialog', undefined);
    expect(sessions.open(spec('dialog'))).toEqual({ accepted: true });
  });

  it('releases a session returned after reentrant host disposal and rejects later opens', () => {
    const late = session();
    const result = sessions.open(spec('late'), {
      createSession: () => {
        sessions.dispose();
        return late;
      },
    });
    expect(result.accepted).toBe(false);
    expect(late.dispose).toHaveBeenCalledOnce();
    expect(wm.wins).toEqual([]);
    expect(sessions.open(spec('next')).accepted).toBe(false);
    sessions.dispose();
    expect(removed).toHaveBeenCalledOnce();
  });

  it('shares duplicate close requests and keeps refusal usable for another attempt', async () => {
    const firstDecision = Promise.withResolvers<boolean>();
    const close = vi.fn().mockReturnValueOnce(firstDecision.promise).mockResolvedValue(true);
    const appSession = session({ requestClose: close });
    const createSession = vi.fn(() => appSession);
    sessions.open(spec('app'), { createSession });
    sessions.open(spec('app'), { createSession });
    expect(createSession).toHaveBeenCalledOnce();
    const pending = sessions.requestClose('app');
    expect(sessions.requestClose('app')).toBe(pending);
    firstDecision.resolve(false);
    expect(await pending).toBe(false);
    expect(sessions.session('app')).toBe(appSession);
    expect(wm.byId('app')).toBeDefined();
    expect(appSession.dispose).not.toHaveBeenCalled();
    expect(await sessions.requestClose('app')).toBe(true);
    expect(wm.byId('app')).toBeUndefined();
    expect(appSession.dispose).toHaveBeenCalledOnce();
    expect(removed).toHaveBeenCalledOnce();
  });

  it('settles discarded closes and ignores a late decision for a reused window id', async () => {
    const decision = Promise.withResolvers<boolean>();
    const prior = session({ requestClose: () => decision.promise });
    sessions.open(spec('app'), { createSession: () => prior });
    const closing = sessions.requestClose('app');
    sessions.discard('app');
    expect(await closing).toBe(true);
    const replacement = session();
    sessions.open(spec('app'), { createSession: () => replacement });
    decision.resolve(true);
    await decision.promise;
    expect(sessions.session('app')).toBe(replacement);
    expect(wm.byId('app')).toBeDefined();
    expect(replacement.dispose).not.toHaveBeenCalled();
  });

  it('retains a dynamic definition until its last window is released', async () => {
    const app: HtmlApp = {
      kind: 'html',
      id: 'reader',
      title: 'Reader',
      w: 200,
      h: 100,
      html: '/reader/',
    };
    sessions.register(app);
    sessions.open(spec('reader:first', 'reader'), { htmlUrl: '/reader/?file=first' });
    sessions.open(spec('reader:second', 'reader'), { htmlUrl: '/reader/?file=second' });
    expect(sessions.htmlUrl('reader:first')).toBe('/reader/?file=first');
    expect(sessions.htmlUrl('reader:second')).toBe('/reader/?file=second');
    expect(sessions.navigateHtml('reader:first', '/reader/?file=changed')).toBe(true);
    expect(sessions.htmlUrl('reader:first')).toBe('/reader/?file=changed');
    expect(sessions.htmlUrl('reader:second')).toBe('/reader/?file=second');
    expect(app.html).toBe('/reader/');
    sessions.unregister('reader');
    expect(sessions.application('reader')).toBe(app);
    await sessions.requestClose('reader:first');
    expect(sessions.application('reader')).toBe(app);
    expect(sessions.htmlUrl('reader:first')).toBeUndefined();
    await sessions.requestClose('reader:second');
    expect(sessions.application('reader')).toBeUndefined();
  });

  it('detaches auxiliary ownership before disposal can reopen the same instance id', async () => {
    const replacement = session();
    const seen: boolean[] = [];
    removed.mockImplementation((id) => {
      seen.push(!!sessions.session(id));
    });
    const first = session({
      dispose: () => {
        sessions.open(spec('app'), { createSession: () => replacement });
      },
    });
    sessions.open(spec('app'), { createSession: () => first });
    await sessions.requestClose('app');
    expect(seen).toEqual([false]);
    expect(sessions.session('app')).toBe(replacement);
  });

  it('owns message copies and accepts focus and checkbox changes through commands', async () => {
    const message = {
      title: 'Question',
      lines: ['Continue?'],
      def: 0,
      check: { label: 'Remember', checked: false },
    };
    sessions.open({ ...spec('message', '$msg'), modal: true }, { message });
    message.lines.push('outside');
    message.check.checked = true;
    const before = sessions.message('message');
    expect(before?.lines).toEqual(['Continue?']);
    expect(before?.check?.checked).toBe(false);
    expect(Object.isFrozen(before?.check)).toBe(true);
    sessions.updateMessage('message', { def: 1, checked: true });
    expect(before?.def).toBe(0);
    expect(sessions.message('message')).toMatchObject({ def: 1, check: { checked: true } });
    await sessions.requestClose('message');
    expect(sessions.message('message')).toBeUndefined();
    expect(removed.mock.calls[0]?.[1]).toMatchObject({ def: 1, check: { checked: true } });
  });

  it('checks every unload participant and releases all resources despite teardown failures', () => {
    const checkpoint = vi.fn(() => true);
    const first = session({
      prepareUnload: () => false,
      dispose: () => {
        throw new Error('cleanup');
      },
    });
    const second = session({ prepareUnload: checkpoint });
    sessions.open(spec('first'), { createSession: () => first });
    sessions.open(spec('second'), { createSession: () => second });
    expect(sessions.prepareUnload()).toBe(false);
    expect(checkpoint).toHaveBeenCalledOnce();
    expect(sessions.size).toBe(2);
    sessions.dispose();
    sessions.dispose();
    expect(second.dispose).toHaveBeenCalledOnce();
    expect(wm.wins).toEqual([]);
    expect(sessions.size).toBe(0);
  });
});

describe('production application closing', () => {
  it.each(['saved', 'cancelled', 'failed'] as const)(
    'processes accepted input and the %s save result before releasing a window',
    async (status) => {
      const save = Promise.withResolvers<SaveTextResult>();
      const onClose = vi.fn(() => true);
      const disposed = vi.fn();
      const saveText = vi.fn(() => save.promise);
      const app = defineCanvasApp({
        ...spec('editor'),
        create: () => ({ text: '' }),
        draw(state, current, services) {
          state.text += current.input.io.typed;
          if (current.input.io.typed)
            void services.saveText({ name: 'note.txt', content: state.text });
        },
        onClose,
        dispose: disposed,
      });
      sessions.open(spec('editor'), {
        createSession: () =>
          app.createSession({ saveText } as unknown as AppServices, {
            draw,
            input,
            effects,
            owner: 'editor',
          }),
      });
      input.queueInput({ typed: 'accepted' });
      input.beginFrame(1);
      input.setGate('editor');
      wm.requestClose('editor');
      sessions.session('editor')!.frame(frame('editor'));
      sessions.flushClose();
      const closing = sessions.requestClose('editor');
      expect(saveText).toHaveBeenCalledExactlyOnceWith({ name: 'note.txt', content: 'accepted' });
      expect(onClose).not.toHaveBeenCalled();
      expect(wm.byId('editor')).toBeDefined();
      save.resolve(
        status === 'saved'
          ? {
              status,
              persisted: true,
              file: { id: 'file' } as Extract<SaveTextResult, { status: 'saved' }>['file'],
            }
          : status === 'failed'
            ? { status, error: 'Disk full' }
            : { status },
      );
      expect(await closing).toBe(status === 'saved');
      expect(onClose).toHaveBeenCalledTimes(status === 'saved' ? 1 : 0);
      expect(disposed).toHaveBeenCalledTimes(status === 'saved' ? 1 : 0);
      expect(!!wm.byId('editor')).toBe(status !== 'saved');
    },
  );
});
