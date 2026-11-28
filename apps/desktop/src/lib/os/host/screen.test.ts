import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { mountDesktop } from './screen';
import { createInputController } from '../../ui/canvas/input';
let input = createInputController();
let { beginFrame, hit, io, queueInput, setGate } = input;

import { createAudio } from '../audio/pcspeaker';
const audio = createAudio();

class CanvasHost extends EventTarget {
  dataset: Record<string, string> = {};
  focus() {
    documentState.activeElement = this;
  }
  private captured = new Set<number>();
  setPointerCapture = vi.fn((id: number) => this.captured.add(id));
  hasPointerCapture = (id: number) => this.captured.has(id);
  releasePointerCapture = vi.fn((id: number) => {
    if (this.captured.delete(id))
      dispatch(this, 'lostpointercapture', { pointerId: id, isPrimary: true });
  });
  getBoundingClientRect() {
    return { left: 10, top: 20, width: 1280, height: 720 };
  }
}

let documentState: { activeElement: CanvasHost | null; getElementById: ReturnType<typeof vi.fn> };
let hostWindow: EventTarget;
let canvas: CanvasHost;
let dispose: () => void;
let frameTime = 100;
const nextFrame = () => beginFrame(frameTime++);
function dispatch(
  target: EventTarget,
  type: string,
  properties: Record<string, unknown> = {},
): Event {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, properties);
  target.dispatchEvent(event);
  return event;
}
const pointer = (type: string, button = 0) =>
  dispatch(canvas, type, { button, clientX: 50, clientY: 60, pointerId: 1, isPrimary: true });
const key = (value: string, extra: Record<string, unknown> = {}) =>
  dispatch(hostWindow, 'keydown', {
    key: value,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    ...extra,
  });

beforeEach(() => {
  input.dispose();
  input = createInputController();
  ({ beginFrame, hit, io, queueInput, setGate } = input);
  documentState = { activeElement: null, getElementById: vi.fn(() => null) };
  hostWindow = new EventTarget();
  canvas = new CanvasHost();
  vi.stubGlobal('document', documentState);
  vi.stubGlobal('window', hostWindow);
  queueInput({ down: false, rdown: false });
  nextFrame();
  io.keyDown.clear();
  dispose = mountDesktop(canvas as unknown as HTMLCanvasElement, input, audio);
});
afterEach(() => {
  dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('canvas input lifetime', () => {
  it('releases an active pointer and removes listeners before remounting', () => {
    pointer('pointerdown');
    nextFrame();
    expect(canvas.hasPointerCapture(1)).toBe(true);
    dispose();
    dispose();
    expect(canvas.hasPointerCapture(1)).toBe(false);
    expect(canvas.releasePointerCapture).toHaveBeenCalledOnce();
    nextFrame();
    expect(io.down).toBe(false);
    canvas.focus();
    expect(key('a').defaultPrevented).toBe(false);
    expect(pointer('pointerdown').defaultPrevented).toBe(false);
    const oldDispose = dispose;
    dispose = mountDesktop(canvas as unknown as HTMLCanvasElement, input, audio);
    pointer('pointerdown');
    oldDispose();
    expect(canvas.hasPointerCapture(1)).toBe(true);
    key('b');
    nextFrame();
    expect(io.typed).toBe('b');
  });

  it('releases accepted input and listeners when later browser listener registration fails', () => {
    dispose();
    vi.spyOn(hostWindow, 'addEventListener').mockImplementationOnce(() => {
      pointer('pointerdown');
      throw new Error('keyboard listener failed');
    });
    expect(() => mountDesktop(canvas as unknown as HTMLCanvasElement, input, audio)).toThrow(
      'keyboard listener failed',
    );
    expect(canvas.hasPointerCapture(1)).toBe(false);
    expect(canvas.releasePointerCapture).toHaveBeenCalledOnce();
    expect(pointer('pointerdown').defaultPrevented).toBe(false);
    dispose = mountDesktop(canvas as unknown as HTMLCanvasElement, input, audio);
    canvas.focus();
    key('r');
    nextFrame();
    expect(io.typed).toBe('r');
  });
});

describe('canvas keyboard ownership', () => {
  it('does not acquire modifiers from another focused canvas key release', () => {
    const secondCanvas = new CanvasHost();
    const secondInput = createInputController();
    const releaseSecond = mountDesktop(
      secondCanvas as unknown as HTMLCanvasElement,
      secondInput,
      audio,
    );
    try {
      secondCanvas.focus();
      key('Shift', { shiftKey: true });
      dispatch(hostWindow, 'keyup', { key: 'a', shiftKey: true });
      expect(secondInput.io.keyDown.has('Shift')).toBe(true);
      expect(io.keyDown.size).toBe(0);
    } finally {
      releaseSecond();
      secondInput.dispose();
    }
  });
  it('reads resized backing dimensions for every pointer event instead of its mount-time size', () => {
    Object.assign(canvas, { width: 960, height: 536 });
    pointer('pointermove');
    nextFrame();
    expect(io.px).toBe(30);
    expect(io.py).toBe(Math.round((40 * 536) / 720));
    Object.assign(canvas, { width: 800, height: 448 });
    pointer('pointermove');
    nextFrame();
    expect(io.px).toBe(25);
    expect(io.py).toBe(Math.round((40 * 448) / 720));
  });
  it('leaves touch gestures to the viewport while panning a zoomed desktop', () => {
    canvas.dataset.pan = 'true';
    const event = pointer('pointerdown');
    nextFrame();
    expect(event.defaultPrevented).toBe(false);
    expect(io.down).toBe(false);
    expect(canvas.setPointerCapture).not.toHaveBeenCalled();
  });

  it('hides the software cursor after leaving the canvas without a drag', () => {
    pointer('pointermove');
    nextFrame();
    dispatch(canvas, 'pointerleave');
    nextFrame();
    expect(io.px).toBeLessThan(0);
    expect(io.py).toBeLessThan(0);
  });
  it('leaves keyboard input untouched while canvas is not focused', () => {
    const event = key('a');
    nextFrame();
    expect(event.defaultPrevented).toBe(false);
    expect(io.typed).toBe('');
    expect(io.keyPressed.size).toBe(0);
  });

  it.each([
    ['s', 'Save'],
    ['z', 'Undo'],
  ])('maps Ctrl+%s to %s without inserting text', (letter, command) => {
    canvas.focus();
    const event = key(letter, { ctrlKey: true });
    nextFrame();
    expect(event.defaultPrevented).toBe(true);
    expect(io.keyPressed.has(command)).toBe(true);
    expect(io.typed).toBe('');
  });

  it('delivers Enter as a special key and ordinary text as typed characters', () => {
    canvas.focus();
    expect(key('Enter').defaultPrevented).toBe(true);
    nextFrame();
    expect(io.keyPressed.has('Enter')).toBe(true);
    expect(io.typed).toBe('');
    key('a');
    nextFrame();
    expect(io.typed).toBe('a');
  });

  it('leaves Tab available for accessible browser controls', () => {
    canvas.focus();
    expect(key('Tab').defaultPrevented).toBe(false);
    nextFrame();
    expect(io.keyPressed.size).toBe(0);
  });
  it('routes Tab to an active canvas modal and restores browser traversal afterwards', () => {
    canvas.focus();
    canvas.dataset.captureTab = 'true';
    expect(key('Tab').defaultPrevented).toBe(true);
    nextFrame();
    expect(io.keyPressed.has('Tab')).toBe(true);
    canvas.dataset.captureTab = 'false';
    expect(key('Tab').defaultPrevented).toBe(false);
    nextFrame();
    expect(io.keyPressed.has('Tab')).toBe(false);
  });

  it.each([
    ['Escape', false, 'StartMenu'],
    ['Tab', false, 'CycleWindow'],
    ['Tab', true, 'CycleWindowReverse'],
  ])('maps Ctrl+%s with Shift=%s to %s', (input, shiftKey, command) => {
    canvas.focus();
    expect(key(input, { ctrlKey: true, shiftKey }).defaultPrevented).toBe(true);
    nextFrame();
    expect(io.keyPressed.has(command)).toBe(true);
    expect(io.typed).toBe('');
  });

  it.each(['F2', 'F5'])('routes %s to the active canvas application', (input) => {
    canvas.focus();
    expect(key(input).defaultPrevented).toBe(true);
    nextFrame();
    expect(io.keyPressed.has(input)).toBe(true);
  });

  it.each([
    ['a', 'SelectAll'],
    [' ', ' '],
    ['ArrowLeft', 'ArrowLeft'],
    ['ArrowDown', 'ArrowDown'],
  ])('routes Ctrl+%s selection input without typing text', (input, command) => {
    canvas.focus();
    expect(key(input, { ctrlKey: true }).defaultPrevented).toBe(true);
    nextFrame();
    expect(io.keyPressed.has(command)).toBe(true);
    expect(io.keyDown.has('Control')).toBe(true);
    expect(io.typed).toBe('');
  });

  it('leaves Alt+Tab to the host and exposes the desktop task manager command', () => {
    canvas.focus();
    expect(key('Tab', { altKey: true }).defaultPrevented).toBe(false);
    expect(key('Escape', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    nextFrame();
    expect([...io.keyPressed]).toEqual(['TaskManager']);
  });

  it('retains held modifiers across frames and clears them on release or blur', () => {
    canvas.focus();
    key('Control', { ctrlKey: true });
    key('Shift', { ctrlKey: true, shiftKey: true });
    nextFrame();
    nextFrame();
    expect(io.keyDown.has('Control')).toBe(true);
    expect(io.keyDown.has('Shift')).toBe(true);
    dispatch(hostWindow, 'keyup', { key: 'Control', shiftKey: true });
    nextFrame();
    expect(io.keyDown.has('Control')).toBe(false);
    expect(io.keyDown.has('Shift')).toBe(true);
    dispatch(hostWindow, 'keyup', { key: 'Shift' });
    nextFrame();
    expect(io.keyDown.size).toBe(0);
    key('Control', { ctrlKey: true });
    dispatch(hostWindow, 'blur');
    nextFrame();
    expect(io.keyDown.size).toBe(0);
  });
  it('keeps accepted text and shortcuts when focus moves before the next frame', () => {
    canvas.focus();
    key('x');
    key('s', { ctrlKey: true });
    dispatch(canvas, 'blur');
    nextFrame();
    expect(io.typed).toBe('x');
    expect(io.keyPressed.has('Save')).toBe(true);
    expect(io.down).toBe(false);
  });

  it('recognizes modifiers already held when a pointer focuses the canvas', () => {
    dispatch(canvas, 'pointerdown', {
      button: 0,
      clientX: 50,
      clientY: 60,
      pointerId: 1,
      isPrimary: true,
      ctrlKey: true,
      shiftKey: true,
    });
    nextFrame();
    expect(io.keyDown.has('Control')).toBe(true);
    expect(io.keyDown.has('Shift')).toBe(true);
  });
});

describe('canvas pointer ownership', () => {
  it('preserves a completed click when releasing capture sends lostpointercapture', () => {
    pointer('pointerdown');
    nextFrame();
    pointer('pointerup');
    dispatch(canvas, 'lostpointercapture', { pointerId: 1, isPrimary: true });
    nextFrame();
    setGate('app');
    expect(hit(0, 0, 50, 50).clicked).toBe(true);
    expect(canvas.hasPointerCapture(1)).toBe(false);
  });

  it('cancels held input when the browser unexpectedly releases the active capture', () => {
    pointer('pointerdown');
    nextFrame();
    canvas.releasePointerCapture(1);
    nextFrame();
    setGate('app');
    expect(io.down).toBe(false);
    expect(hit(0, 0, 50, 50).clicked).toBe(false);
  });

  it('ignores a late capture-loss event for a pointer that no longer owns input', () => {
    pointer('pointerdown');
    nextFrame();
    pointer('pointerup');
    nextFrame();
    dispatch(canvas, 'pointerdown', {
      button: 0,
      clientX: 50,
      clientY: 60,
      pointerId: 2,
      isPrimary: true,
    });
    dispatch(canvas, 'lostpointercapture', { pointerId: 1, isPrimary: true });
    nextFrame();
    expect(io.down).toBe(true);
    expect(canvas.hasPointerCapture(2)).toBe(true);
  });

  it('maps embedded app coordinates using its own logical client size', () => {
    dispose();
    canvas = new CanvasHost();
    dispose = mountDesktop(canvas as unknown as HTMLCanvasElement, input, audio, {
      w: 168,
      h: 193,
    });
    dispatch(canvas, 'pointerdown', {
      button: 0,
      clientX: 650,
      clientY: 380,
      pointerId: 1,
      isPrimary: true,
    });
    nextFrame();
    expect([io.px, io.py]).toEqual([84, 97]);
  });

  it('turns the next touch into a right click and resets the touch mode', () => {
    canvas.dataset.rightClick = 'true';
    dispatch(canvas, 'pointerdown', {
      pointerType: 'touch',
      button: 0,
      clientX: 50,
      clientY: 60,
      pointerId: 1,
      isPrimary: true,
    });
    nextFrame();
    expect(io.rdown).toBe(true);
    expect(io.down).toBe(false);
    expect(canvas.dataset.rightClick).toBe('false');
    pointer('pointerup');
    nextFrame();
    setGate('app');
    expect(hit(0, 0, 50, 50).rclicked).toBe(true);
  });

  it('tolerates finger drift for a double tap on a downscaled desktop', () => {
    canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 320, height: 180 });
    const touch = (type: string, x: number) =>
      dispatch(canvas, type, {
        pointerType: 'touch',
        button: 0,
        clientX: x,
        clientY: 60,
        pointerId: 1,
        isPrimary: true,
      });
    touch('pointerdown', 50);
    beginFrame(1000);
    touch('pointerup', 50);
    beginFrame(1000.05);
    touch('pointerdown', 60);
    beginFrame(1000.2);
    expect(io.dbl).toBe(true);
    expect(io.px).toBe(80);
    touch('pointermove', 61);
    beginFrame(1000.22);
    touch('pointerup', 61);
    beginFrame(1000.25);
    expect(io.px).toBe(80);
    expect(io.dbl).toBe(true);
  });

  it('ignores a second finger release while the primary finger is dragging', () => {
    pointer('pointerdown');
    nextFrame();
    dispatch(canvas, 'pointerup', { isPrimary: false });
    nextFrame();
    expect(io.down).toBe(true);
    pointer('pointerup');
    nextFrame();
    expect(io.down).toBe(false);
  });
  it('maps scaled coordinates and right clicks without pressing the left button', () => {
    pointer('pointerdown', 2);
    nextFrame();
    expect([io.px, io.py]).toEqual([20, 20]);
    expect(io.rdown).toBe(true);
    expect(io.down).toBe(false);
    pointer('pointerup', 2);
    nextFrame();
    setGate('app');
    expect(hit(0, 0, 50, 50).rclicked).toBe(true);
    expect(hit(0, 0, 50, 50).clicked).toBe(false);
  });

  it('cancels a pointer without activating the control under it', () => {
    pointer('pointerdown');
    nextFrame();
    pointer('pointercancel');
    nextFrame();
    setGate('app');
    expect(io.down).toBe(false);
    expect(hit(0, 0, 50, 50).clicked).toBe(false);
  });

  it('does not turn cancellation into a click when the pointer moves before the next frame', () => {
    pointer('pointerdown');
    nextFrame();
    pointer('pointercancel');
    pointer('pointermove');
    nextFrame();
    setGate('app');
    expect(hit(0, 0, 50, 50).clicked).toBe(false);
  });
});
