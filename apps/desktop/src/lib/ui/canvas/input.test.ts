import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { createInputController } from './input';
const { beginFrame, hit, io, queueInput, setGate, pointerPress, cancelPointerInput } =
  createInputController();

beforeEach(() => {
  queueInput({ cancel: true });
  beginFrame(0);
});

describe('pointer click sequences', () => {
  it('keeps accepted modifier state after hardware release and clears it in the next frame', () => {
    const input = createInputController();
    const editor = input.scoped('editor');
    input.queueInput({ key: 'Home', modifiers: { control: true, shift: false, alt: false } });
    input.beginFrame(1);
    input.setGate('editor');
    input.io.keyDown.clear();
    expect(editor.io.keyDown.has('Control')).toBe(true);
    expect(Object.isFrozen(editor.io.keyboardEvents[0].modifiers)).toBe(true);
    input.beginFrame(2);
    input.setGate('editor');
    expect(editor.io.keyDown.has('Control')).toBe(false);
  });
  it('retains keyboard event order when text and commands arrive in a single frame', () => {
    queueInput({ key: 'Escape' });
    queueInput({ typed: '81' });
    queueInput({ key: 'F8' });
    beginFrame(1);
    expect(io.keyboardEvents).toEqual([{ key: 'Escape' }, { typed: '81' }, { key: 'F8' }]);
    cancelPointerInput();
    expect(io.keyboardEvents).toHaveLength(3);
    queueInput({ cancel: true });
    beginFrame(2);
    expect(io.keyboardEvents).toEqual([]);
  });
  it('cancels stale display coordinates while retaining queued text and save commands', () => {
    queueInput({ px: 20, py: 30, down: true });
    queueInput({ typed: '保留 input', key: 'Save' });
    cancelPointerInput();
    queueInput({ px: 800, py: 300, down: false });
    beginFrame(1);
    setGate('editor');
    expect(io.typed).toBe('保留 input');
    expect(io.keyPressed.has('Save')).toBe(true);
    expect(io.down).toBe(false);
    expect(pointerPress()).toBeNull();
    expect(hit(0, 0, 1000, 700).clicked).toBe(false);
  });

  it('preserves text already accepted in a frame when a settings command changes resolution', () => {
    queueInput({ typed: 'accepted' });
    beginFrame(1);
    cancelPointerInput();
    expect(io.typed).toBe('accepted');
    expect(io.cancelled).toBe(true);
  });
  it('retains an immutable press origin through moves, release, and batched frames', () => {
    queueInput({ px: 5, py: 7, down: true });
    queueInput({ px: 50, py: 70, down: false });
    beginFrame(1);
    expect(pointerPress()).toEqual({ x: 5, y: 7 });
    const copy = pointerPress() as { x: number; y: number };
    copy.x = 99;
    expect(pointerPress()).toEqual({ x: 5, y: 7 });
    queueInput({ cancel: true });
    beginFrame(2);
    expect(pointerPress()).toBeNull();
  });
  it('keeps double-click detection through separate release frames', () => {
    queueInput({ px: 20, py: 20, down: true });
    beginFrame(10);
    queueInput({ down: false });
    beginFrame(10.05);
    queueInput({ down: true });
    beginFrame(10.2);
    expect(io.dbl).toBe(true);
    beginFrame(10.21);
    queueInput({ down: false });
    beginFrame(10.25);
    setGate('desktop');
    expect(hit(0, 0, 48, 50).clicked && io.dbl).toBe(true);
  });

  it('does not activate controls when a drag started outside them', () => {
    queueInput({ px: 100, py: 100, down: true });
    beginFrame(20);
    queueInput({ px: 10, py: 10, down: false });
    beginFrame(20.1);
    setGate('window');
    expect(hit(0, 0, 30, 20).clicked).toBe(false);
  });

  it('prevents gated controls from receiving a click', () => {
    queueInput({ px: 10, py: 10, down: true });
    beginFrame(30);
    queueInput({ down: false });
    beginFrame(30.1);
    setGate(null);
    expect(hit(0, 0, 30, 20).clicked).toBe(false);
  });

  it('preserves two actual releases aggregated before a single animation frame', () => {
    queueInput({ px: 20, py: 20, down: true });
    queueInput({ down: false });
    queueInput({ down: true });
    queueInput({ down: false });
    beginFrame(1);
    expect(io.completedClicks).toEqual([
      { x: 20, y: 20, startX: 20, startY: 20, dragged: false, double: false },
      { x: 20, y: 20, startX: 20, startY: 20, dragged: false, double: true },
    ]);
    beginFrame(1.1);
    expect(io.completedClicks).toEqual([]);
  });

  it('does not count duplicate presses or releases as a second click', () => {
    queueInput({ px: 20, py: 20, down: true });
    queueInput({ down: true });
    queueInput({ down: false });
    queueInput({ down: false });
    beginFrame(1);
    expect(io.completedClicks).toHaveLength(1);
    expect(io.completedClicks[0].double).toBe(false);
  });

  it('remembers a drag even if it returns to its origin within one frame', () => {
    queueInput({ px: 20, py: 20, down: true });
    queueInput({ px: 100, py: 100 });
    queueInput({ px: 20, py: 20, down: false });
    queueInput({ down: true });
    queueInput({ down: false });
    beginFrame(1);
    expect(io.completedClicks.map((click) => [click.dragged, click.double])).toEqual([
      [true, false],
      [false, false],
    ]);
  });

  it('discards buffered completed clicks when input is cancelled', () => {
    queueInput({ px: 20, py: 20, down: true });
    queueInput({ down: false });
    queueInput({ cancel: true });
    beginFrame(1);
    expect(io.completedClicks).toEqual([]);
    queueInput({ down: true });
    queueInput({ down: false });
    beginFrame(1.1);
    expect(io.completedClicks[0].double).toBe(false);
  });
});

describe('input controller ownership', () => {
  it('exposes stable live key views that cannot mutate the accepted queue', () => {
    const input = createInputController();
    const editor = input.scoped('editor');
    input.queueInput({ key: 'Enter' });
    input.queueInput({ key: 'Escape' });
    input.beginFrame(1);
    input.setGate('editor');
    const pressed = editor.io.keyPressed;
    const held = editor.io.keyDown;
    expect(editor.io.keyPressed).toBe(pressed);
    expect(editor.io.keyDown).toBe(held);
    expect(pressed).not.toBe(input.io.keyPressed);
    expect(held).not.toBe(input.io.keyDown);
    expect([...pressed]).toEqual(['Enter', 'Escape']);
    expect([...pressed.entries()]).toEqual([
      ['Enter', 'Enter'],
      ['Escape', 'Escape'],
    ]);
    const owners: ReadonlySet<string>[] = [];
    pressed.forEach((_value, _duplicate, owner) => owners.push(owner));
    expect(owners).toEqual([pressed, pressed]);
    expect(() => (pressed as Set<string>).delete('Enter')).toThrow(TypeError);
    expect(() => (held as Set<string>).clear()).toThrow(TypeError);
    expect(() => Set.prototype.clear.call(pressed)).toThrow(TypeError);
    expect(Reflect.set(pressed, 'has', () => false)).toBe(false);
    expect(input.io.keyPressed.has('Enter')).toBe(true);
    expect(input.io.keyDown.has('Escape')).toBe(true);
    const union = pressed.union(new Set(['Save']));
    union.clear();
    expect(pressed.size).toBe(2);
    expect(editor.consumeKey('Enter')).toBe(true);
    expect(pressed.has('Enter')).toBe(false);
    expect(held.has('Enter')).toBe(true);
    input.io.keyDown.delete('Enter');
    expect(held.has('Enter')).toBe(false);
    input.dispose();
  });

  it('freezes event snapshots and their records while explicit consumption updates later reads', () => {
    const input = createInputController();
    const editor = input.scoped('editor');
    input.queueInput({ typed: 'accepted' });
    input.queueInput({ key: 'Enter' });
    input.queueInput({ px: 10, py: 12, down: true });
    input.queueInput({ down: false });
    input.beginFrame(1);
    input.setGate('editor');
    const events = editor.io.keyboardEvents;
    const clicks = editor.io.completedClicks;
    expect(editor.io.keyboardEvents).toBe(events);
    expect(editor.io.completedClicks).toBe(clicks);
    expect(events).not.toBe(input.io.keyboardEvents);
    expect(clicks).not.toBe(input.io.completedClicks);
    expect(Object.isFrozen(editor.io)).toBe(true);
    expect(Object.isFrozen(events)).toBe(true);
    expect(Object.isFrozen(clicks)).toBe(true);
    expect(Object.isFrozen(events[0])).toBe(true);
    expect(Object.isFrozen(clicks[0])).toBe(true);
    expect(() => (events as { typed?: string }[]).push({ typed: 'injected' })).toThrow(TypeError);
    expect(() => Object.assign(events[0], { typed: 'overwritten' })).toThrow(TypeError);
    expect(() => Object.assign(clicks[0], { startX: 99 })).toThrow(TypeError);
    expect(input.io.typed).toBe('accepted');
    expect(input.pointerPress()).toEqual({ x: 10, y: 12 });
    expect(editor.hit(0, 0, 20, 20).clicked).toBe(true);
    expect(editor.consumeKey('Enter')).toBe(true);
    expect(editor.io.keyboardEvents).toEqual([{ typed: 'accepted' }]);
    expect(events).toEqual([{ typed: 'accepted' }, { key: 'Enter' }]);
    expect(editor.consumeText()).toBe('accepted');
    expect(editor.io.keyboardEvents).toEqual([]);
    editor.consumePointer();
    expect(editor.io.completedClicks).toEqual([]);
    expect(editor.hit(0, 0, 20, 20).clicked).toBe(false);
    input.queueInput({ px: 30, py: 40, down: true });
    input.queueInput({ down: false });
    input.beginFrame(2);
    input.setGate('editor');
    expect(clicks[0]).toMatchObject({ x: 10, y: 12, startX: 10, startY: 12 });
    expect(editor.io.completedClicks[0]).toMatchObject({ x: 30, y: 40 });
    input.dispose();
  });

  it('keeps retained key views gated and inert after releasing their input owner', () => {
    const input = createInputController();
    let accepting = true;
    const editor = input.scoped('editor', () => accepting);
    input.queueInput({ key: 'Enter', typed: 'accepted' });
    input.beginFrame(1);
    input.setGate('editor');
    const keys = editor.io.keyPressed;
    expect(keys.has('Enter')).toBe(true);
    input.setGate('other');
    expect(keys.size).toBe(0);
    expect([...keys]).toEqual([]);
    expect(keys.union(new Set(['Save']))).toEqual(new Set(['Save']));
    expect(editor.io.keyboardEvents).toEqual([]);
    expect(editor.consumeKey('Enter')).toBe(false);
    expect(input.io.keyPressed.has('Enter')).toBe(true);
    input.setGate('editor');
    expect(editor.io.keyPressed).toBe(keys);
    expect(keys.has('Enter')).toBe(true);
    accepting = false;
    expect(keys.has('Enter')).toBe(false);
    expect(editor.io.typed).toBe('');
    expect(editor.consumeText()).toBe('');
    input.dispose();
    accepting = true;
    input.setGate('editor');
    expect(keys.size).toBe(0);
    expect(editor.io.completedClicks).toEqual([]);
    expect(editor.consumeKey('Enter')).toBe(false);
  });

  it('isolates queues and consumption in two interleaved surfaces', () => {
    const a = createInputController(),
      b = createInputController();
    const first = a.scoped('editor'),
      second = b.scoped('editor');
    a.queueInput({ typed: 'first', key: 'Save', wheel: 3 });
    b.queueInput({ typed: 'second', key: 'Enter', wheel: 8 });
    a.beginFrame(1);
    b.beginFrame(1);
    a.setGate('editor');
    b.setGate('editor');
    expect(first.consumeText()).toBe('first');
    expect(first.consumeKey('Save')).toBe(true);
    expect(first.consumeWheel()).toBe(3);
    expect(second.io.typed).toBe('second');
    expect(second.io.keyPressed.has('Enter')).toBe(true);
    expect(second.io.wheel).toBe(8);
    a.dispose();
    a.dispose();
    a.queueInput({ typed: 'late' });
    a.beginFrame(2);
    expect(first.io.typed).toBe('');
    expect(second.consumeText()).toBe('second');
  });

  it('restricts scoped input to the owner and releases capture on cancellation', () => {
    const input = createInputController();
    const editor = input.scoped('editor'),
      other = input.scoped('other');
    input.queueInput({ px: 5, py: 5, down: true, typed: 'x', key: 'Enter' });
    input.beginFrame(1);
    input.setGate('editor');
    expect(other.io.typed).toBe('');
    expect(other.consumeKey('Enter')).toBe(false);
    expect(editor.hit(0, 0, 20, 20).held).toBe(true);
    editor.capture();
    input.setGate('other');
    expect(editor.hit(0, 0, 20, 20).held).toBe(true);
    editor.release();
    expect(editor.hit(0, 0, 20, 20).held).toBe(false);
    input.setGate('editor');
    editor.capture();
    input.queueInput({ cancelPointer: true });
    input.beginFrame(2);
    input.setGate('other');
    expect(editor.hit(0, 0, 20, 20).held).toBe(false);
    expect(editor.io.cancelled).toBe(true);
  });

  it('releases each accepted native capture once, including external and late releases', () => {
    const input = createInputController();
    let releases = 0;
    const external = input.ownPointerCapture(() => {
      releases++;
    });
    external();
    external();
    input.ownPointerCapture(() => {
      releases++;
    });
    input.cancelPointerInput();
    input.dispose();
    input.dispose();
    input.ownPointerCapture(() => {
      releases++;
    });
    expect(releases).toBe(3);
  });
});
