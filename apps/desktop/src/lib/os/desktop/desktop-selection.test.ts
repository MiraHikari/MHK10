import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { DesktopSelection } from './desktop-selection';
import { createInputController } from '../../ui/canvas/input';
let input = createInputController();
let { beginFrame, io, queueInput, pointerPress } = input;

const desktop = () =>
  new DesktopSelection(
    [
      { id: 'one', x: 10, y: 10, w: 40, h: 40 },
      { id: 'two', x: 10, y: 70, w: 40, h: 40 },
      { id: 'three', x: 100, y: 10, w: 40, h: 40 },
    ],
    300,
    200,
  );
const click = (selection: DesktopSelection, x: number, y: number, ctrl = false, dbl = false) => {
  selection.begin({ x, y }, ctrl);
  return selection.finish({ x, y }, dbl);
};

describe('desktop marquee selection', () => {
  it('selects every icon whose area intersects a left-button marquee', () => {
    const selection = desktop();
    selection.begin({ x: 5, y: 5 });
    selection.update({ x: 20, y: 100 });
    expect(selection.marquee).toEqual({ x: 5, y: 5, w: 15, h: 95 });
    expect([...selection.selected]).toEqual(['one', 'two']);
    selection.finish({ x: 20, y: 100 });
    expect(selection.marquee).toBe(null);
    expect([...selection.selected]).toEqual(['one', 'two']);
  });

  it('selects in reverse drag direction and excludes mere edge contact', () => {
    const selection = desktop();
    selection.begin({ x: 60, y: 120 });
    selection.update({ x: 50, y: 5 });
    expect(selection.selected.size).toBe(0);
    selection.update({ x: 49, y: 5 });
    expect([...selection.selected]).toEqual(['one', 'two']);
  });

  it('adds the intersecting area to the pre-drag selection with Ctrl', () => {
    const selection = desktop();
    selection.select('three');
    selection.begin({ x: 5, y: 5 }, true);
    selection.update({ x: 20, y: 100 });
    expect([...selection.selected]).toEqual(['three', 'one', 'two']);
    selection.update({ x: 20, y: 40 });
    expect([...selection.selected]).toEqual(['three', 'one']);
  });

  it('clears selection on an empty click but preserves it on a Ctrl empty click', () => {
    const selection = desktop();
    selection.select('one');
    click(selection, 200, 150, true);
    expect([...selection.selected]).toEqual(['one']);
    click(selection, 200, 150);
    expect(selection.selected.size).toBe(0);
  });

  it('cancels marquee changes and restores the previous focus and selection', () => {
    const selection = desktop();
    selection.select('three');
    selection.begin({ x: 5, y: 5 });
    selection.update({ x: 20, y: 100 });
    selection.cancel();
    expect([...selection.selected]).toEqual(['three']);
    expect(selection.focused).toBe('three');
    expect(selection.active).toBe(false);
  });
});

describe('desktop icon selection and dragging', () => {
  it('toggles icons with Ctrl without launching them', () => {
    const selection = desktop();
    click(selection, 20, 20);
    click(selection, 110, 20, true, true);
    expect([...selection.selected]).toEqual(['one', 'three']);
    expect(click(selection, 20, 20, true, true).activate).toBeUndefined();
    expect([...selection.selected]).toEqual(['three']);
  });

  it('preserves a group while pressing a selected icon, then moves every selected icon', () => {
    const selection = desktop();
    selection.select('one');
    selection.select('two', true);
    selection.begin({ x: 20, y: 20 });
    expect([...selection.selected]).toEqual(['one', 'two']);
    selection.update({ x: 40.3, y: 50.2 });
    expect(selection.items.map((item) => [item.x, item.y])).toEqual([
      [30, 40],
      [30, 100],
      [100, 10],
    ]);
    expect(selection.finish({ x: 40.3, y: 50.2 }, true)).toEqual({
      activate: undefined,
      dragged: true,
    });
  });

  it('clamps the entire group together within the desktop bounds', () => {
    const selection = desktop();
    selection.selectAll();
    selection.begin({ x: 20, y: 20 });
    selection.update({ x: 999, y: 999 });
    expect(selection.items.map((item) => [item.x, item.y])).toEqual([
      [170, 100],
      [170, 160],
      [260, 100],
    ]);
    selection.update({ x: -999, y: -999 });
    expect(selection.items.map((item) => [item.x, item.y])).toEqual([
      [0, 0],
      [0, 60],
      [90, 0],
    ]);
  });

  it('rolls back a drag and keeps its original multi-selection on Escape', () => {
    const selection = desktop();
    selection.select('one');
    selection.select('two', true);
    selection.begin({ x: 20, y: 20 });
    selection.update({ x: 90, y: 100 });
    selection.cancel();
    expect(selection.items.map((item) => [item.x, item.y])).toEqual([
      [10, 10],
      [10, 70],
      [100, 10],
    ]);
    expect([...selection.selected]).toEqual(['one', 'two']);
  });

  it('collapses a plain click on a selected icon only after releasing without dragging', () => {
    const selection = desktop();
    selection.selectAll();
    selection.begin({ x: 20, y: 20 });
    expect(selection.selected.size).toBe(3);
    selection.finish({ x: 21, y: 20 });
    expect([...selection.selected]).toEqual(['one']);
  });

  it('requires two clicks on the same icon and never launches after a drag', () => {
    const selection = desktop();
    expect(click(selection, 20, 20, false, true).activate).toBeUndefined();
    expect(click(selection, 20, 20, false, true).activate).toBe('one');
    selection.begin({ x: 20, y: 20 });
    selection.finish({ x: 80, y: 80 }, true);
    expect(click(selection, 80, 80, false, true).activate).toBeUndefined();
    expect(click(selection, 80, 80, false, true).activate).toBe('one');
  });

  it('preserves a multi-selection when right clicking one of its icons', () => {
    const selection = desktop();
    selection.select('one');
    selection.select('two', true);
    expect(selection.context({ x: 20, y: 80 })).toBe('two');
    expect([...selection.selected]).toEqual(['one', 'two']);
    selection.context({ x: 110, y: 20 });
    expect([...selection.selected]).toEqual(['three']);
  });
});

describe('desktop keyboard selection', () => {
  it('navigates according to icon positions and supports additive selection', () => {
    const selection = desktop();
    selection.navigate('Home');
    selection.navigate('ArrowRight', true);
    expect([...selection.selected]).toEqual(['one', 'three']);
    selection.navigate('ArrowLeft');
    selection.navigate('ArrowDown');
    expect([...selection.selected]).toEqual(['two']);
  });

  it('moves focus with Ctrl+arrows without altering the selection and toggles with Space', () => {
    const selection = desktop();
    selection.select('one');
    selection.navigate('ArrowDown', false, true);
    expect(selection.focused).toBe('two');
    expect([...selection.selected]).toEqual(['one']);
    selection.toggleFocused();
    expect([...selection.selected]).toEqual(['one', 'two']);
    selection.toggleFocused();
    expect([...selection.selected]).toEqual(['one']);
  });

  it('uses changed positions for subsequent spatial navigation', () => {
    const selection = desktop();
    selection.begin({ x: 110, y: 20 });
    selection.finish({ x: 110, y: 150 });
    selection.select('one');
    selection.navigate('ArrowDown');
    expect(selection.focused).toBe('two');
    selection.navigate('ArrowRight');
    expect(selection.focused).toBe('three');
  });
});

describe('desktop double-clicks through the real input frame queue', () => {
  beforeEach(() => {
    input.dispose();
    input = createInputController();
    ({ beginFrame, io, queueInput, pointerPress } = input);
    queueInput({ cancel: true });
    beginFrame(0);
  });
  const queueClick = (x = 20, y = 20) => {
    queueInput({ px: x, py: y, down: true });
    queueInput({ down: false });
  };
  const render = (
    selection: DesktopSelection,
    time: number,
  ): { activate?: string; dragged?: boolean } => {
    beginFrame(time);
    const point = { x: io.px, y: io.py };
    if (io.cancelled) {
      selection.cancel();
      return {};
    }
    if (io.wentDown && !selection.active) selection.begin(pointerPress() ?? point);
    if (selection.active) selection.update(point);
    return io.wentUp ? selection.finish(point, io.dbl, io.completedClicks) : {};
  };

  it('opens exactly once when both complete clicks arrive before one render', () => {
    const selection = desktop();
    queueClick();
    queueClick();
    expect(render(selection, 1)).toEqual({ activate: 'one', dragged: false });
    expect(render(selection, 1.1)).toEqual({});
  });

  it('starts a marquee at the actual empty press when a same-frame move ends over an icon', () => {
    const selection = desktop();
    queueInput({ px: 5, py: 5, down: true });
    queueInput({ px: 25, py: 25 });
    render(selection, 1);
    expect(selection.marquee).toEqual({ x: 5, y: 5, w: 20, h: 20 });
    expect([...selection.selected]).toEqual(['one']);
    expect(selection.items[0]).toMatchObject({ x: 10, y: 10 });
    queueInput({ down: false });
    render(selection, 1.1);
    expect([...selection.selected]).toEqual(['one']);
    expect(selection.items[0]).toMatchObject({ x: 10, y: 10 });
  });

  it('keeps the selected group when an entire marquee completes before a render', () => {
    const selection = desktop();
    queueInput({ px: 5, py: 5, down: true });
    queueInput({ px: 45, py: 100, down: false });
    expect(render(selection, 1)).toEqual({ activate: undefined, dragged: true });
    expect([...selection.selected]).toEqual(['one', 'two']);
    expect(selection.items.map((item) => [item.x, item.y])).toEqual([
      [10, 10],
      [10, 70],
      [100, 10],
    ]);
  });

  it('also recognizes two complete clicks rendered in separate frames', () => {
    const selection = desktop();
    queueClick();
    expect(render(selection, 1).activate).toBeUndefined();
    queueClick();
    expect(render(selection, 1.2).activate).toBe('one');
  });

  it('requires two releases, not a double-down flag', () => {
    const selection = desktop();
    queueInput({ px: 20, py: 20, down: true });
    queueInput({ down: true });
    queueInput({ down: false });
    expect(render(selection, 1).activate).toBeUndefined();
  });

  it('does not combine nearby clicks on different adjacent icons', () => {
    const selection = new DesktopSelection(
      [
        { id: 'one', x: 10, y: 10, w: 40, h: 40 },
        { id: 'two', x: 50, y: 10, w: 40, h: 40 },
      ],
      300,
      200,
    );
    queueClick(49, 20);
    queueClick(51, 20);
    expect(render(selection, 1).activate).toBeUndefined();
    expect([...selection.selected]).toEqual(['two']);
  });

  it('requires each click to start and finish on the same icon', () => {
    const selection = new DesktopSelection(
      [
        { id: 'one', x: 10, y: 10, w: 40, h: 40 },
        { id: 'two', x: 50, y: 10, w: 40, h: 40 },
      ],
      300,
      200,
    );
    queueClick(51, 20);
    queueInput({ px: 49, py: 20, down: true });
    queueInput({ px: 51, py: 20, down: false });
    expect(render(selection, 1).activate).toBeUndefined();
  });

  it('rejects an out-and-back drag followed by a click in the same batch', () => {
    const selection = desktop();
    queueClick();
    render(selection, 1);
    queueInput({ px: 20, py: 20, down: true });
    queueInput({ px: 90, py: 90 });
    queueInput({ px: 20, py: 20, down: false });
    queueClick();
    expect(render(selection, 1.2)).toEqual({ activate: undefined, dragged: true });
    queueClick();
    expect(render(selection, 1.3).activate).toBeUndefined();
    queueClick();
    expect(render(selection, 1.4).activate).toBe('one');
  });

  it('does not combine clicks outside the double-click time or position tolerance', () => {
    const selection = desktop();
    queueClick();
    render(selection, 1);
    queueClick();
    expect(render(selection, 2).activate).toBeUndefined();
    queueClick(40, 20);
    expect(render(selection, 2.1).activate).toBeUndefined();
  });

  it('cannot replay a completed pair after a cancellation', () => {
    const selection = desktop();
    queueClick();
    queueClick();
    queueInput({ cancel: true });
    expect(render(selection, 1).activate).toBeUndefined();
    queueClick();
    expect(render(selection, 1.1).activate).toBeUndefined();
  });
});

describe('desktop icon reconciliation', () => {
  it('keeps placement and selection for surviving icons when metadata changes', () => {
    const selection = desktop();
    selection.items[0].x = 117;
    selection.items[0].y = 43;
    selection.select('two');
    selection.reconcile([
      { id: 'two', x: 0, y: 0, w: 50, h: 50 },
      { id: 'one', x: 0, y: 0, w: 50, h: 50 },
    ]);
    expect(selection.items.map(({ id, x, y }) => [id, x, y])).toEqual([
      ['two', 10, 70],
      ['one', 117, 43],
    ]);
    expect([...selection.selected]).toEqual(['two']);
    expect(selection.focused).toBe('two');
  });

  it('drops removed selections and places a new icon in the first free grid cell', () => {
    const selection = desktop();
    selection.select('three');
    selection.reconcile([
      { id: 'one', x: 0, y: 0, w: 40, h: 40 },
      { id: 'two', x: 0, y: 0, w: 40, h: 40 },
      { id: 'four', x: 0, y: 0, w: 40, h: 40 },
    ]);
    expect(selection.items.map(({ id }) => id)).toEqual(['one', 'two', 'four']);
    expect(selection.selected.size).toBe(0);
    expect(selection.items[2]).toMatchObject({ x: 2, y: 130 });
  });

  it('reuses space vacated by removed icons without overlapping a surviving manual placement', () => {
    const selection = new DesktopSelection(
      [
        { id: 'removed', x: 2, y: 6, w: 84, h: 58 },
        { id: 'kept', x: 2, y: 68, w: 84, h: 58 },
      ],
      640,
      338,
    );
    selection.select('kept');
    selection.reconcile([
      { id: 'new', x: 2, y: 6, w: 84, h: 58 },
      { id: 'kept', x: 2, y: 6, w: 84, h: 58 },
    ]);
    expect(selection.items.map(({ id, x, y }) => ({ id, x, y }))).toEqual([
      { id: 'new', x: 2, y: 6 },
      { id: 'kept', x: 2, y: 68 },
    ]);
    expect([...selection.selected]).toEqual(['kept']);
  });

  it('keeps an existing icon in place when a new folder precedes it in the input', () => {
    const kept = { id: 'kept', x: 2, y: 6, w: 84, h: 58 };
    const selection = new DesktopSelection([kept], 640, 338);
    selection.select('kept');
    selection.reconcile([
      { id: 'new-folder', x: 2, y: 6, w: 84, h: 58 },
      { ...kept, x: 2, y: 68 },
    ]);
    expect(selection.items).toEqual([{ id: 'new-folder', x: 2, y: 68, w: 84, h: 58 }, kept]);
    expect([...selection.selected]).toEqual(['kept']);
    expect(selection.focused).toBe('kept');
  });

  it('uses the same reserved areas for replacement and resize, retaining focus and integer positions', () => {
    const selection = new DesktopSelection(
      [
        { id: 'one', x: 700, y: 350, w: 84, h: 58 },
        { id: 'two', x: 540, y: 240, w: 84, h: 58 },
      ],
      912,
      490,
    );
    const reserved = [
      { x: 560, y: 226, w: 56, h: 100 },
      { x: 498, y: 2, w: 140, h: 25 },
    ];
    selection.select('two');
    selection.reconcile(
      [
        { id: 'one', x: 510, y: 6, w: 84, h: 58 },
        { id: 'two', x: 540, y: 240, w: 84, h: 58 },
      ],
      { width: 640, height: 338, reserved, preservePositions: false },
    );
    expect(selection.items.map(({ x, y }) => [x, y])).toEqual([
      [2, 6],
      [2, 68],
    ]);
    selection.items[0].x = 510;
    selection.items[0].y = 6;
    selection.items[1].x = 100.3;
    selection.items[1].y = 140.2;
    selection.resize(640, 338, reserved);
    expect(selection.items.map(({ x, y }) => [x, y])).toEqual([
      [2, 6],
      [100, 140],
    ]);
    expect(selection.focused).toBe('two');
    expect([...selection.selected]).toEqual(['two']);
  });
});
