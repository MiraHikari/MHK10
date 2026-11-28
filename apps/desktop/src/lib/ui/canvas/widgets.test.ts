import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createRenderer } from '../../gfx/context';
import { createThemeController } from '../../gfx/palette';
import { canvasFixture, makeTestCanvas } from '../../gfx/canvas-fixture';
import { createInputController } from './input';
import {
  createWidgetScope,
  type MenuBarState,
  type TextFieldState,
  type WidgetScope,
} from './widgets';
import type { AppMenus } from './menu-types';
const fixture = canvasFixture();
const draw = createRenderer(fixture.canvas, { createCanvas: makeTestCanvas });
const text = vi.spyOn(draw, 'text').mockImplementation(() => 0);
const rect = vi.spyOn(draw, 'rect').mockImplementation(() => {});
vi.spyOn(draw, 'tw').mockImplementation((value) => Array.from(value).length * 6);
vi.spyOn(draw, 'capH').mockImplementation(() => 8);
vi.spyOn(draw, 'fitText').mockImplementation((value) => value);
const TH = draw.TH;
const input = createInputController();
const { beginFrame, io, queueInput, setGate } = input;
const { blurTextField, focusTextField, menu, textField } = createWidgetScope(draw, input);

beforeEach(() => {
  beginFrame(0);
  setGate('test');
  blurTextField();
  io.keyDown.clear();
  vi.clearAllMocks();
});

function focus(value: string) {
  click(5, 5);
  textField('test', 0, 0, 60, 22, { text: value, caret: value.length });
  io.wentUp = false;
}

function click(x: number, y: number) {
  queueInput({ px: x, py: y, down: true });
  queueInput({ down: false });
  beginFrame(1);
  setGate('test');
}

describe('text field editing', () => {
  it('masks password text and selected text while preserving editable Unicode offsets', () => {
    focusTextField('secret');
    const secret = 'key-😀-private';
    const result = textField(
      'secret',
      0,
      0,
      160,
      22,
      { text: secret, caret: secret.length, anchor: 0 },
      { password: true },
    );
    expect(result.text).toBe(secret);
    expect(result.caret).toBe(secret.length);
    const drawn = vi.mocked(text).mock.calls.map(([value]) => String(value));
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.every((value) => /^\*+$/.test(value))).toBe(true);
    expect(drawn).toContain('*'.repeat(Array.from(secret).length));
    io.keyPressed.add('Backspace');
    expect(textField('secret', 0, 0, 160, 22, result, { password: true }).text).toBe('');
  });
  it('keeps the beginning visible when Home moves through a long value', () => {
    const value = 'a very long message to scroll';
    focus(value);
    io.keyPressed.add('Home');
    const result = textField('test', 0, 0, 60, 22, { text: value, caret: value.length });
    expect(result.caret).toBe(0);
    expect(vi.mocked(text).mock.calls.at(-1)?.[0]).toBe(value);
  });

  it('inserts and removes a complete Unicode code point', () => {
    focus('');
    io.typed = 'A😀';
    const inserted = textField('test', 0, 0, 60, 22, { text: '', caret: 0 });
    expect(inserted.text).toBe('A😀');
    expect(inserted.caret).toBe(3);
    io.typed = '';
    io.keyPressed.add('Backspace');
    const removed = textField('test', 0, 0, 60, 22, inserted);
    expect(removed.text).toBe('A');
    expect(removed.caret).toBe(1);
  });

  it('places the caret at the clicked character', () => {
    click(18, 5);
    const result = textField('test', 0, 0, 60, 22, { text: 'hello', caret: 5 });
    expect(result.caret).toBe(2);
  });

  it('stops editing after a click outside the field', () => {
    focus('old');
    io.px = 100;
    io.py = 100;
    io.wentDown = true;
    io.typed = 'x';
    const result = textField('test', 0, 0, 60, 22, { text: 'old', caret: 3 });
    expect(result.active).toBe(false);
    expect(result.text).toBe('old');
  });

  it('ignores keyboard input while its window is behind a modal or menu', () => {
    focus('old');
    io.typed = 'x';
    io.keyPressed.add('Backspace');
    const result = textField('test', 0, 0, 60, 22, { text: 'old', caret: 3 }, { focused: false });
    expect(result.active).toBe(false);
    expect(result.text).toBe('old');
    expect(result.caret).toBe(3);
  });
  it('selects all and replaces the filename even when SelectAll and typing share a frame', () => {
    focusTextField('test');
    io.keyPressed.add('SelectAll');
    io.typed = 'new.txt';
    const result = textField('test', 0, 0, 100, 22, { text: 'Untitled.txt', caret: 3 });
    expect(result).toMatchObject({ text: 'new.txt', caret: 7, anchor: 7 });
  });
  it('uses the default anchor selection when typing a replacement', () => {
    focusTextField('test');
    io.typed = '替换😀.txt';
    const result = textField('test', 0, 0, 100, 22, { text: 'Untitled.txt', caret: 12, anchor: 0 });
    expect(result.text).toBe('替换😀.txt');
    expect(result.caret).toBe(result.text.length);
    expect(result.anchor).toBe(result.caret);
  });
  it('extends Shift+Arrow across an entire Unicode code point and deletes only the selected range', () => {
    focusTextField('test');
    io.keyDown.add('Shift');
    io.keyPressed.add('ArrowRight');
    const selected = textField('test', 0, 0, 100, 22, { text: 'A😀B', caret: 1 });
    expect(selected).toMatchObject({ caret: 3, anchor: 1 });
    io.keyPressed.clear();
    io.keyPressed.add('Delete');
    const removed = textField('test', 0, 0, 100, 22, selected);
    expect(removed).toMatchObject({ text: 'AB', caret: 1, anchor: 1 });
  });
  it('uses Shift+Home and Shift+End to extend from a stable anchor', () => {
    focusTextField('test');
    io.keyDown.add('Shift');
    io.keyPressed.add('Home');
    const left = textField('test', 0, 0, 100, 22, { text: 'abcde', caret: 2 });
    expect(left).toMatchObject({ caret: 0, anchor: 2 });
    io.keyPressed.clear();
    io.keyPressed.add('End');
    const right = textField('test', 0, 0, 100, 22, left);
    expect(right).toMatchObject({ caret: 5, anchor: 2 });
  });
  it('collapses a selection to its edge on a plain arrow without skipping another character', () => {
    focusTextField('test');
    io.keyPressed.add('ArrowRight');
    const right = textField('test', 0, 0, 100, 22, { text: 'A😀B', caret: 1, anchor: 3 });
    expect(right).toMatchObject({ caret: 3, anchor: 3 });
    io.keyPressed.clear();
    io.keyPressed.add('ArrowLeft');
    const left = textField('test', 0, 0, 100, 22, { text: 'A😀B', caret: 3, anchor: 1 });
    expect(left).toMatchObject({ caret: 1, anchor: 1 });
  });
  it('deletes an entire reversed selection with Backspace', () => {
    focusTextField('test');
    io.keyPressed.add('Backspace');
    const result = textField('test', 0, 0, 100, 22, { text: 'A😀B', caret: 1, anchor: 3 });
    expect(result).toMatchObject({ text: 'AB', caret: 1, anchor: 1 });
  });
  it('counts replacement capacity by Unicode characters after removing the selection', () => {
    focusTextField('test');
    io.typed = '😎Z';
    const result = textField(
      'test',
      0,
      0,
      100,
      22,
      { text: '😀AB', caret: 2, anchor: 0 },
      { max: 3 },
    );
    expect(result).toMatchObject({ text: '😎AB', caret: 2, anchor: 2 });
    expect(Array.from(result.text)).toHaveLength(3);
  });
  it('normalizes caller positions that would split a surrogate pair', () => {
    focusTextField('test');
    io.keyPressed.add('ArrowRight');
    const result = textField('test', 0, 0, 100, 22, { text: 'A😀B', caret: 2, anchor: 2 });
    expect(result).toMatchObject({ caret: 3, anchor: 3 });
  });
  it('renders the active selection with the theme selection background and text colors', () => {
    focusTextField('test');
    textField('test', 0, 0, 100, 22, { text: 'hello', caret: 4, anchor: 1 });
    expect(vi.mocked(rect).mock.calls).toContainEqual([11, 3, 18, 16, TH.sel]);
    expect(vi.mocked(text).mock.calls).toContainEqual([
      'ell',
      11,
      7,
      { color: TH.selText, font: 'ui' },
    ]);
  });
  it('keeps selection and text unchanged while keyboard focus is blocked', () => {
    focusTextField('test');
    io.keyPressed.add('SelectAll');
    io.keyPressed.add('Delete');
    io.typed = 'blocked';
    const result = textField(
      'test',
      0,
      0,
      100,
      22,
      { text: 'hello', caret: 4, anchor: 1 },
      { focused: false },
    );
    expect(result).toMatchObject({ text: 'hello', caret: 4, anchor: 1, active: false });
    expect(vi.mocked(rect).mock.calls.some((call) => call[4] === TH.sel)).toBe(false);
  });

  it.each(['clip', 'text'] as const)(
    'restores the text-field drawing context after a %s failure and keeps the scope usable',
    (failure) => {
      const widgets = createWidgetScope(draw, input);
      widgets.focusTextField('test');
      const failedOperation = failure === 'clip' ? fixture.context.clip : text;
      failedOperation.mockImplementationOnce(() => {
        throw new Error('Injected drawing failure');
      });
      expect(() => widgets.textField('test', 0, 0, 100, 22, { text: 'hello', caret: 5 })).toThrow(
        'Injected drawing failure',
      );
      expect(fixture.context.save).toHaveBeenCalledOnce();
      expect(fixture.context.restore).toHaveBeenCalledOnce();
      queueInput({ typed: '!' });
      beginFrame(2);
      setGate('test');
      expect(widgets.textField('test', 0, 0, 100, 22, { text: 'hello', caret: 5 })).toMatchObject({
        text: 'hello!',
        active: true,
      });
      widgets.dispose();
    },
  );
});

describe('popup menus', () => {
  it('does not activate a disabled item', () => {
    click(10, 10);
    expect(menu(0, 0, ['~Unavailable']).clicked).toBe(-1);
    expect(menu(0, 0, ['Available']).clicked).toBe(0);
  });

  it('draws only the hovered row when a later row replaces the keyboard selection', () => {
    io.px = 10;
    io.py = 45;
    menu(0, 0, ['First', 'Second', 'Third'], 0);
    expect(vi.mocked(rect).mock.calls.filter((call) => call[4] === TH.sel)).toEqual([
      [3, 39, 74, 18, TH.sel],
    ]);
  });

  it('keeps a keyboard selection visible without blocking pointer clicks', () => {
    click(10, 10);
    const result = menu(0, 0, ['First', 'Second', 'Third'], 2, undefined, { keyboard: true });
    expect(result.clicked).toBe(0);
    expect(vi.mocked(rect).mock.calls.filter((call) => call[4] === TH.sel)).toEqual([
      [3, 39, 74, 18, TH.sel],
    ]);
  });

  it('returns stable menu commands for a label selection and dismisses outside input', () => {
    const widgets = createWidgetScope(draw, input);
    const defs: AppMenus = { File: [{ label: 'Save a copy', command: 'save-as' }] };
    const state = { open: 0 };
    click(15, 25);
    expect(widgets.menubar(0, 0, defs, state)).toEqual({
      menu: 'File',
      item: 'Save a copy',
      command: 'save-as',
    });
    expect(state.open).toBe(-1);
    state.open = 0;
    queueInput({ px: 400, py: 200, down: true });
    beginFrame(2);
    setGate('test');
    expect(widgets.menubar(0, 0, defs, state)).toBeNull();
    expect(state.open).toBe(-1);
    widgets.dispose();
  });

  it('moves an open canvas menu with arrows, End and Enter', () => {
    const widgets = createWidgetScope(draw, input);
    const defs: AppMenus = {
      File: [{ label: 'New', command: 'new' }, '-', { label: 'Exit', command: 'exit' }],
    };
    const state = { open: 0, row: -1, keyboard: false };
    const press = (key: string, frame: number) => {
      queueInput({ key });
      beginFrame(frame);
      setGate('test');
    };
    press('ArrowDown', 4);
    expect(widgets.menubar(0, 0, defs, state)).toBeNull();
    expect(state.row).toBe(0);
    press('End', 5);
    expect(widgets.menubar(0, 0, defs, state)).toBeNull();
    expect(state.row).toBe(2);
    press('Enter', 6);
    expect(widgets.menubar(0, 0, defs, state)).toEqual({
      menu: 'File',
      item: 'Exit',
      command: 'exit',
    });
    expect(state.open).toBe(-1);
    widgets.dispose();
  });
  it('activates the menu bar with F10 and cycles duplicate menu names before Enter', () => {
    const widgets = createWidgetScope(draw, input);
    const defs: AppMenus = {
      File: [{ command: 'new', label: 'New' }],
      Edit: [{ command: 'copy', label: 'Copy' }],
      Format: [{ command: 'word-wrap', label: 'Word Wrap', checked: true }],
    };
    const state: MenuBarState = { open: -1 };
    const press = (key: string, frame: number, typed?: string) => {
      queueInput({ key, typed });
      beginFrame(frame);
      setGate('test');
      return widgets.menubar(0, 0, defs, state);
    };
    expect(press('F10', 1)).toBeNull();
    expect(state).toMatchObject({ open: -1, focused: 0 });
    expect(press('f', 2, 'f')).toBeNull();
    expect(state).toMatchObject({ open: -1, focused: 2 });
    expect(io.typed).toBe('');
    expect(press('Enter', 3)).toBeNull();
    expect(state).toMatchObject({ open: 2, row: 0 });
    expect(press('w', 4, 'w')).toEqual({ menu: 'Format', item: 'Word Wrap', command: 'word-wrap' });
    expect(state.open).toBe(-1);
    expect(state.focused).toBeUndefined();
    expect(io.typed).toBe('');
    widgets.dispose();
  });
  it('renders checked and radio marks in the gutter and default commands in bold', () => {
    const widgets = createWidgetScope(draw, input);
    const defs: AppMenus = {
      View: [
        { command: 'open', label: 'Open', default: true },
        { command: 'show', label: 'Show', checked: true },
        { command: 'small', label: 'Small', checked: true, radio: true },
        { command: 'large', label: 'Large', checked: false, radio: true },
      ],
    };
    widgets.menubar(0, 0, defs, { open: 0, keyboard: true });
    expect(vi.mocked(text).mock.calls.find(([label]) => label === 'Open')?.[3]?.font).toBe('bold');
    expect(vi.mocked(rect).mock.calls).toContainEqual([9, 46, 2, 1, TH.text]);
    expect(vi.mocked(rect).mock.calls).toContainEqual([11, 63, 4, 4, TH.text]);
    expect(vi.mocked(rect).mock.calls).not.toContainEqual([11, 81, 4, 4, TH.text]);
    widgets.dispose();
  });
  it('leaves a keyboard-selected bar when the client is clicked or input is cancelled', () => {
    const widgets = createWidgetScope(draw, input);
    const defs: AppMenus = { File: [{ command: 'new', label: 'New' }] };
    const state: MenuBarState = { open: -1 };
    queueInput({ down: false });
    beginFrame(0);
    queueInput({ key: 'F10' });
    beginFrame(1);
    setGate('test');
    widgets.menubar(0, 0, defs, state);
    click(100, 100);
    widgets.menubar(0, 0, defs, state);
    expect(state.focused).toBeUndefined();
    queueInput({ key: 'F10' });
    beginFrame(3);
    setGate('test');
    widgets.menubar(0, 0, defs, state);
    expect(state.focused).toBe(0);
    queueInput({ cancel: true });
    beginFrame(4);
    widgets.menubar(0, 0, defs, state);
    expect(state).toMatchObject({ open: -1, focused: undefined });
    widgets.dispose();
  });
});

describe('widget scope ownership', () => {
  it('isolates equal field IDs, focus and scroll on the same drawing surface', () => {
    const a = createWidgetScope(draw, input),
      b = createWidgetScope(draw, input);
    a.focusTextField('equal');
    const long = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    a.textField('equal', 0, 0, 30, 22, { text: long, caret: long.length });
    expect(a.textFieldFocused()).toBe('equal');
    expect(b.textFieldFocused()).toBeNull();
    input.queueInput({ typed: '!' });
    input.beginFrame(3);
    input.setGate('test');
    const first = a.textField('equal', 0, 0, 30, 22, { text: 'A', caret: 1 });
    const second = b.textField('equal', 0, 0, 30, 22, { text: 'B', caret: 1 });
    expect(first.text).toBe('A!');
    expect(second.text).toBe('B');
    a.dispose();
    a.dispose();
    b.focusTextField('equal');
    const third = b.textField('equal', 0, 0, 30, 22, { text: 'B', caret: 1 });
    expect(third.text).toBe('B!');
    expect(a.textFieldFocused()).toBeNull();
  });

  it('preserves independent horizontal viewports for equal field IDs through caret moves and disposal', () => {
    const controller = createInputController();
    const a = createWidgetScope(draw, controller.scoped('left'));
    const b = createWidgetScope(draw, controller.scoped('right'));
    const render = (scope: WidgetScope, state: TextFieldState, visible: string) => {
      text.mockClear();
      const result = scope.textField('equal', 0, 0, 30, 22, state);
      expect(text.mock.calls[0]?.[0]).toBe(visible);
      return result;
    };
    try {
      a.focusTextField('equal');
      expect(b.textFieldFocused()).toBeNull();
      let left = render(a, { text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', caret: 26 }, 'XYZ');
      b.focusTextField('equal');
      let right = render(
        b,
        { text: 'abcdefghijklmnopqrstuvwxyz', caret: 10 },
        'hijklmnopqrstuvwxyz',
      );

      controller.queueInput({ key: 'ArrowLeft' });
      controller.beginFrame(1);
      controller.setGate('left');
      left = render(a, left, 'XYZ');
      expect(left.caret).toBe(25);
      right = render(b, right, 'hijklmnopqrstuvwxyz');
      expect(right.caret).toBe(10);

      controller.queueInput({ key: 'ArrowLeft' });
      controller.beginFrame(2);
      controller.setGate('right');
      right = render(b, right, 'hijklmnopqrstuvwxyz');
      expect(right.caret).toBe(9);
      left = render(a, left, 'XYZ');
      expect(left.caret).toBe(25);

      a.dispose();
      a.dispose();
      expect(b.textFieldFocused()).toBe('equal');
      controller.queueInput({ key: 'ArrowLeft' });
      controller.beginFrame(3);
      controller.setGate('right');
      right = render(b, right, 'hijklmnopqrstuvwxyz');
      expect(right.caret).toBe(8);

      controller.queueInput({ typed: '!' });
      controller.beginFrame(4);
      controller.setGate('right');
      right = render(b, right, 'h!ijklmnopqrstuvwxyz');
      expect(right).toMatchObject({ text: 'abcdefgh!ijklmnopqrstuvwxyz', caret: 9, active: true });
    } finally {
      a.dispose();
      b.dispose();
      controller.dispose();
    }
  });

  it('does not continue another session slider drag with an equal ID', () => {
    const a = createWidgetScope(draw, input),
      b = createWidgetScope(draw, input);
    input.queueInput({ px: 30, py: 10, down: true });
    input.beginFrame(1);
    input.setGate('test');
    expect(a.hslider('equal', 0, 0, 100, 0)).toBeCloseTo(30 / 89);
    input.queueInput({ px: 500, py: 10 });
    input.beginFrame(2);
    input.setGate('test');
    expect(a.hslider('equal', 0, 0, 100, 0)).toBe(1);
    expect(b.hslider('equal', 0, 0, 100, 0)).toBe(0);
    a.dispose();
    expect(b.hslider('equal', 0, 0, 100, 0)).toBe(0);
  });

  it('rejects late text focus, menu selection and slider gestures after disposal', () => {
    const old = createWidgetScope(draw, input);
    const current = createWidgetScope(draw, input);
    old.focusTextField('equal');
    current.focusTextField('equal');
    old.dispose();
    old.dispose();
    old.focusTextField('equal');
    queueInput({ cancel: true });
    beginFrame(0);
    setGate('test');
    click(10, 10);
    io.typed = '!';
    expect(old.textFieldFocused()).toBeNull();
    expect(old.textField('equal', 0, 0, 100, 22, { text: 'old', caret: 3 })).toMatchObject({
      text: 'old',
      active: false,
    });
    expect(old.menu(0, 0, ['Choice'])).toEqual({ clicked: -1, hovered: -1 });
    expect(current.menu(0, 0, ['Choice']).clicked).toBe(0);
    io.wentUp = false;
    expect(current.textField('equal', 0, 0, 100, 22, { text: 'new', caret: 3 })).toMatchObject({
      text: 'new!',
      active: true,
    });
    queueInput({ px: 30, py: 10, down: true });
    beginFrame(2);
    setGate('test');
    expect(old.hslider('equal', 0, 0, 100, 0.25)).toBe(0.25);
    expect(current.hslider('equal', 0, 0, 100, 0.25)).toBeCloseTo(30 / 89);
    current.dispose();
  });

  it('reads live theme and dimensions from its own renderer', () => {
    const one = canvasFixture(640, 360),
      two = canvasFixture(800, 450);
    const theme = createThemeController();
    const first = createRenderer(one.canvas, { theme, createCanvas: makeTestCanvas });
    const second = createRenderer(two.canvas, { createCanvas: makeTestCanvas });
    const a = createWidgetScope(first, input),
      b = createWidgetScope(second, input);
    theme.setTheme('phosphor');
    a.field(0, 0, 10, 10);
    b.field(0, 0, 10, 10);
    expect(first.TH.field).toBe('#000000');
    expect(second.TH.field).toBe('#ffffff');
    a.menu(750, 400, ['Menu']);
    b.menu(750, 400, ['Menu']);
    expect(one.context.fillRect.mock.calls[0]).toEqual([0, 0, 10, 10]);
    expect(two.context.fillRect.mock.calls[0]).toEqual([0, 0, 10, 10]);
  });
});
