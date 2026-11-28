import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createRenderer, type Renderer } from '../../gfx/context';
import { canvasFixture, makeTestCanvas } from '../../gfx/canvas-fixture';
import { createFrameEffects, type FrameEffects } from '../../gfx/fx';
import { createInputController, type InputController } from '../../ui/canvas/input';
import { createWidgetScope, type WidgetScope } from '../../ui/canvas/widgets';
import type { MsgSpec } from '../host/app-contracts';
import { WM } from '../windows/wm';
import { createWindowSessions, type WindowSessions } from '../windows/window-sessions';
import { createMessageWindows, messageWindowBounds, type MessageWindows } from './message-window';

let draw: Renderer;
let input: InputController;
let widgets: WidgetScope;
let effects: FrameEffects;
let wm: WM;
let sessions: WindowSessions;
let messages: MessageWindows;
const closed: string[] = [];
const activated: number[] = [];

function setup() {
  closed.length = 0;
  activated.length = 0;
  draw = createRenderer(canvasFixture().canvas, { createCanvas: makeTestCanvas });
  input = createInputController();
  widgets = createWidgetScope(draw, input);
  effects = createFrameEffects(draw);
  wm = new WM(draw, input, widgets);
  sessions = createWindowSessions(wm, [], (id, message) => messages.remove(id, message));
  wm.reducedMotion = true;
  messages = createMessageWindows({
    sessions,
    renderer: draw,
    widgets,
    input,
    width: () => draw.W,
    height: () => draw.H,
    focused: (id) => wm.focused === id,
    systemInput: () => false,
    interacting: () => false,
    drawChrome: (id) => wm.draw(id, { active: true }),
    close: (id) => {
      closed.push(id);
    },
    playClick() {},
    activate(_message, index) {
      activated.push(index);
    },
  });
}

afterEach(() => {
  messages?.dispose();
  sessions?.dispose();
  effects?.dispose();
  widgets?.dispose();
  input?.dispose();
  draw?.dispose();
});

describe('message windows', () => {
  it('sizes a dialog from its text, icon and buttons', () => {
    const measure = (text: string) => text.length * 6;
    const plain = messageWindowBounds(
      measure,
      { title: 'Hello', lines: ['One line'] },
      { w: 640, h: 360 },
    );
    const icon = messageWindowBounds(
      measure,
      { title: 'Hello', lines: ['One line'], icon: 'info' },
      { w: 640, h: 360 },
    );
    expect(icon.w - plain.w).toBe(44);
    expect(plain.x).toBe(Math.round(640 / 2 - plain.w / 2));
    expect(icon.h).toBeGreaterThan(plain.h);
  });

  it('keeps long copy and multirow buttons inside the desktop and scrolls all text', () => {
    setup();
    const text = vi.spyOn(draw, 'text');
    const button = vi.spyOn(widgets, 'button');
    const lastLine = 'Final readable line';
    messages.open({
      title: 'Long copy',
      icon: 'info',
      lines: [
        ...Array.from({ length: 40 }, (_, index) => `Line ${index} ${'long content '.repeat(12)}`),
        lastLine,
      ],
      buttons: Array.from({ length: 12 }, (_, index) => `Choice ${index}`),
    });
    const win = wm.wins[0]!;
    expect(win.x).toBeGreaterThanOrEqual(0);
    expect(win.x + win.w).toBeLessThanOrEqual(draw.W);
    expect(win.y + win.h).toBeLessThanOrEqual(draw.H - 22);
    input.queueInput({ key: 'End', px: -10, py: -10 });
    input.beginFrame(1);
    messages.paint(win);
    expect(text.mock.calls.some((call) => call[0] === lastLine)).toBe(true);
    const choices = button.mock.calls.filter((call) => call[4].startsWith('Choice '));
    expect(choices).toHaveLength(12);
    for (const [x, y, width, height] of choices) {
      expect(x).toBeGreaterThanOrEqual(win.x);
      expect(x + width).toBeLessThanOrEqual(win.x + win.w);
      expect(y + height).toBeLessThanOrEqual(win.y + win.h);
    }
  });

  it('consumes activation text and closes exactly one button, including empty and invalid defaults', () => {
    setup();
    messages.open({ title: 'Confirm', lines: ['Continue?'], buttons: [], def: -2 });
    const win = wm.wins[0]!;
    input.queueInput({ key: 'Enter', typed: 'leaked', px: -10, py: -10 });
    input.beginFrame(1);
    messages.paint(win);
    expect(input.io.typed).toBe('');
    expect(activated).toEqual([0]);
    expect(closed).toEqual([win.id]);
    messages.dispose();
    messages.open({ title: 'Late', lines: [] });
    expect(wm.wins).toHaveLength(1);
  });

  it('moves focus with the arrows and activates the focused button', () => {
    setup();
    const spec: MsgSpec = {
      title: 'Confirm',
      lines: ['Continue?'],
      buttons: ['Yes', 'No'],
      def: 1,
    };
    messages.open(spec);
    const win = wm.wins[0];
    expect(win?.appId).toBe('$msg');
    if (!win) return;
    input.queueInput({ key: 'ArrowLeft', px: -10, py: -10 });
    input.beginFrame(1);
    messages.paint(win);
    expect(sessions.message(win.id)?.def).toBe(0);
    input.queueInput({ key: 'Enter', px: -10, py: -10 });
    input.beginFrame(2);
    messages.paint(wm.byId(win.id) ?? win);
    expect(activated).toEqual([0]);
    expect(closed).toEqual([win.id]);
  });

  it('toggles the checkbox from the keyboard and dismisses with escape', () => {
    setup();
    messages.open({
      title: 'Open With',
      lines: ['Notes.txt'],
      buttons: ['Notepad', 'Cancel'],
      def: 2,
      check: { label: 'Always', checked: false },
    });
    const win = wm.wins[0];
    if (!win) return;
    input.queueInput({ key: ' ', px: -10, py: -10 });
    input.beginFrame(1);
    messages.paint(win);
    expect(sessions.message(win.id)?.check?.checked).toBe(true);
    input.queueInput({ key: 'Escape', px: -10, py: -10 });
    input.beginFrame(2);
    messages.paint(wm.byId(win.id) ?? win);
    expect(closed).toEqual([win.id]);
    expect(activated).toEqual([]);
  });

  it('notifies dismissal when a confirmation closes without a button', async () => {
    setup();
    const cancelled = vi.fn();
    messages.open({
      title: 'Open Calculator',
      lines: ['Open this application?'],
      buttons: ['Open', 'Cancel'],
      onDismiss: cancelled,
    });
    const win = wm.wins[0]!;
    input.queueInput({ key: 'Escape', px: -10, py: -10 });
    input.beginFrame(1);
    messages.paint(win);
    await sessions.requestClose(win.id);
    await sessions.requestClose(win.id);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(activated).toEqual([]);
  });

  it('does not dismiss a confirmation whose button was accepted', async () => {
    setup();
    const cancelled = vi.fn();
    messages.open({
      title: 'Open Calculator',
      lines: ['Open this application?'],
      buttons: ['Open', 'Cancel'],
      onDismiss: cancelled,
    });
    const win = wm.wins[0]!;
    input.queueInput({ key: 'Enter', px: -10, py: -10 });
    input.beginFrame(1);
    messages.paint(win);
    await sessions.requestClose(win.id);
    expect(activated).toEqual([0]);
    expect(cancelled).not.toHaveBeenCalled();
  });
});
