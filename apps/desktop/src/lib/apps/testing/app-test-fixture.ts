import { onTestFinished, vi } from 'vite-plus/test';
import type { App, AppFrameRequest, AppServices, CanvasApp } from '../../os/host/app-contracts';
import { createAppSession } from '../../os/host/app-session';
import { createInputController, type RawInput } from '../../ui/canvas/input';
import { createFileSystem, type FileStorage } from '../../os/files/filesystem';
import { createDocuments } from '../../os/files/documents';
import { createStory } from '../../os/story/story';
import { createRuntimeState } from '../../os/story/runtime-state';
import { createAiConnection } from '../../os/ai/ai-connection';
import { createAudio } from '../../os/audio/pcspeaker';
import { createRenderer } from '../../gfx/context';
import { createFrameEffects } from '../../gfx/fx';
import { canvasFixture, makeTestCanvas } from '../../gfx/canvas-fixture';
import { createTextClipboard } from '../../os/host/text-clipboard';
import { createBrowserFileAudio } from '../../os/audio/browser-file-audio';

export function memoryStorage(): FileStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

/** Exercise the same session, renderer and input Interfaces used by a Canvas host. */
export function appTestFixture<S>(
  app: CanvasApp | App<S>,
  services: Partial<AppServices> = {},
  client = { x: 0, y: 0, w: app.w, h: app.h },
) {
  const storage = memoryStorage();
  const files = services.files ?? createFileSystem(storage);
  const story = services.story ?? createStory();
  const runtime = createRuntimeState(story);
  const audio = createAudio();
  const ai = createAiConnection();
  const input = createInputController();
  const canvas = canvasFixture();
  const draw = createRenderer(canvas.canvas, { createCanvas: makeTestCanvas });
  const effects = createFrameEffects(draw);
  const text = vi.spyOn(draw, 'text');
  let time = 0;
  let themeName = 'std';
  let wallpaper: 0 | 1 | 2 | 3 = 0;
  const env: AppServices = {
    clipboard: createTextClipboard(),
    pickFile: () => ({ result: Promise.resolve({ status: 'cancelled' }), cancel: () => {} }),
    fileAudio: {
      open: (fileId) =>
        createBrowserFileAudio(
          () => services.loadFileAsset?.(fileId) ?? Promise.resolve(undefined),
          () => ({ volume: audio.getVolume(), muted: audio.isMuted() }),
        ),
    },
    invalidate: vi.fn(),
    files,
    story,
    documents: createDocuments(files),
    ai,
    audio,
    doom: runtime.doom,
    snapshot: runtime.snapshot,
    doomUp: () => {
      runtime.up();
    },
    doomDown: runtime.down,
    now: () => time,
    wallpaper: {
      getWallpaper: () => wallpaper,
      setWallpaper: (value) => {
        wallpaper = value;
      },
    },
    open: vi.fn<AppServices['open']>(() => ({ accepted: true })),
    close: vi.fn(),
    play: vi.fn(),
    msg: vi.fn(),
    setTitle: vi.fn(),
    downloadText: vi.fn(),
    saveText: vi.fn<AppServices['saveText']>(async () => ({ status: 'cancelled' })),
    setTheme: (name) => {
      themeName = name;
      draw.theme.setTheme(name);
    },
    themeName: () => themeName,
    ...services,
  };
  const surface = { draw, input, effects, owner: app.id };
  const session =
    'createSession' in app ? app.createSession(env, surface) : createAppSession(app, env, surface);
  const view = {
    win: { id: app.id, menu: { open: -1 } },
    client,
    focused: true,
    pointerIn: true,
    menuSel: null as AppFrameRequest['menuSel'],
    t: 0,
    dt: 0.05,
  };
  const frame = (changes: Partial<AppFrameRequest> = {}) => {
    time = changes.t ?? time + 0.05;
    view.t = time;
    input.beginFrame(time);
    input.setGate((changes.focused ?? view.focused) ? app.id : null);
    session.frame({ ...view, ...changes, t: time });
  };
  const send = (event: RawInput, changes: Partial<AppFrameRequest> = {}) => {
    input.queueInput(event);
    frame(changes);
    // The browser host releases hardware keys outside the queued press events.
    input.io.keyDown.clear();
  };
  const clickAt = (x: number, y: number, right = false) => {
    send({ px: x, py: y, ...(right ? { rdown: true } : { down: true }) });
    send(right ? { rdown: false } : { down: false });
  };
  const click = (label: string) => {
    text.mockClear();
    frame();
    const rendered = text.mock.calls.findLast(([value]) => String(value) === label);
    if (!rendered) throw new Error(`No rendered control label: ${label}`);
    clickAt(rendered[1] + 1, rendered[2] + 2);
  };
  const fillAt = (x: number, y: number, value: string) => {
    clickAt(x, y);
    send({ key: 'SelectAll' });
    send({ typed: value });
  };
  const command = (command: string, menu = 'File') =>
    frame({ menuSel: { menu, item: command, command } });
  const dispose = () => {
    session.dispose();
    effects.dispose();
    input.dispose();
    draw.dispose();
    runtime.dispose();
    audio.dispose();
    ai.dispose();
  };
  onTestFinished(dispose);
  return {
    env,
    session,
    surface,
    input,
    draw,
    text,
    view,
    frame,
    send,
    click,
    clickAt,
    fillAt,
    command,
    key: (key: string) => send({ key }),
    type: (typed: string) => send({ typed }),
    storage,
    files,
    story,
    runtime,
    dispose,
  };
}
