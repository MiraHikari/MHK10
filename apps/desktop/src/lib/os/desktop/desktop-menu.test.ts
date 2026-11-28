import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { DesktopMenu } from './desktop-menu';
import { createWidgetScope } from '../../ui/canvas/widgets';
import { createCanvasSurfaceRuntime } from '../host/canvas-surface-runtime';
import { canvasFixture, makeTestCanvas } from '../../gfx/canvas-fixture';
let surface = createCanvasSurfaceRuntime(canvasFixture().canvas, { createCanvas: makeTestCanvas });
let { io, queueInput, beginFrame } = surface.input;
let text = vi.spyOn(surface.draw, 'text');
let rect = vi.spyOn(surface.draw, 'rect');
let TH = surface.draw.TH;
let widgets = createWidgetScope(surface.draw, surface.input);
const entries = [
  { label: 'Open', command: 'open' },
  { label: '-' },
  { label: 'Unavailable', command: 'disabled', disabled: true },
  { label: 'Tile', command: 'tile' },
  { label: 'Close', command: 'close' },
];
const selectedLabels = () =>
  vi
    .mocked(text)
    .mock.calls.filter((call) => call[3]?.color === TH.selText && call[0] !== 'Unavailable')
    .map((call) => call[0]);
const highlights = () => vi.mocked(rect).mock.calls.filter((call) => call[4] === TH.sel);

beforeEach(() => {
  surface.dispose();
  surface = createCanvasSurfaceRuntime(canvasFixture().canvas, { createCanvas: makeTestCanvas });
  ({ io, queueInput, beginFrame } = surface.input);
  text = vi.spyOn(surface.draw, 'text');
  rect = vi.spyOn(surface.draw, 'rect');
  TH = surface.draw.TH;
  widgets.dispose();
  widgets = createWidgetScope(surface.draw, surface.input);
  queueInput({ cancel: true, px: 0, py: 0 });
  beginFrame(0);
  io.cancelled = false;
  vi.clearAllMocks();
});

describe('desktop popup pointer and keyboard ownership', () => {
  it('runs the hovered command on Enter', () => {
    const popup = new DesktopMenu(surface.draw, surface.input, widgets);
    popup.open(20, 20, entries);
    io.px = 30;
    io.py = 70;
    popup.draw();
    expect(selectedLabels()).toEqual(['Tile']);
    expect(popup.key('Enter')).toBe('tile');
    expect(popup.bounds).toBe(null);
  });

  it('keeps keyboard highlight and activation together while the pointer stays still', () => {
    const popup = new DesktopMenu(surface.draw, surface.input, widgets);
    popup.open(20, 20, entries);
    io.px = 30;
    io.py = 30;
    popup.draw();
    popup.key('ArrowDown');
    vi.clearAllMocks();
    popup.draw();
    expect(selectedLabels()).toEqual(['Tile']);
    expect(highlights()).toHaveLength(1);
    expect(popup.key('Enter')).toBe('tile');
  });

  it('returns selection to the pointer when it moves after keyboard navigation', () => {
    const popup = new DesktopMenu(surface.draw, surface.input, widgets);
    popup.open(20, 20, entries);
    popup.key('ArrowDown');
    popup.draw();
    vi.clearAllMocks();
    io.px = 30;
    io.py = 94;
    popup.draw();
    expect(selectedLabels()).toEqual(['Close']);
    expect(highlights()).toHaveLength(1);
    expect(popup.key('Enter')).toBe('close');
  });

  it('does not execute a previous enabled selection when hovering a disabled command', () => {
    const popup = new DesktopMenu(surface.draw, surface.input, widgets);
    popup.open(20, 20, entries);
    io.px = 30;
    io.py = 54;
    popup.draw();
    expect(popup.key('Enter')).toBeUndefined();
    expect(popup.bounds).not.toBe(null);
    popup.key('ArrowDown');
    expect(popup.key('Enter')).toBe('tile');
  });

  it('starts on the first available command and skips separators', () => {
    const popup = new DesktopMenu(surface.draw, surface.input, widgets);
    popup.open(20, 20, entries.slice(1));
    expect(popup.key('Enter')).toBe('tile');
  });

  it('dismisses with Escape or lost input ownership without running a command', () => {
    const popup = new DesktopMenu(surface.draw, surface.input, widgets);
    popup.open(20, 20, entries);
    expect(popup.key('Escape')).toBe('$close');
    expect(popup.bounds).toBe(null);
    popup.open(20, 20, entries);
    io.px = 30;
    io.py = 30;
    io.cancelled = true;
    expect(popup.draw()).toBeUndefined();
    expect(popup.bounds).toBe(null);
  });

  it('does not execute the hovered command when clicking outside the popup', () => {
    const popup = new DesktopMenu(surface.draw, surface.input, widgets);
    popup.open(20, 20, entries);
    queueInput({ px: 600, py: 300, down: true });
    beginFrame(1);
    expect(popup.draw()).toBeUndefined();
    expect(popup.bounds).toBe(null);
  });
});
