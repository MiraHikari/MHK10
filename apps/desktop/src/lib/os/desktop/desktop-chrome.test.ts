import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { canvasFixture, makeTestCanvas } from '../../gfx/canvas-fixture';
import { createRenderer, type Renderer } from '../../gfx/context';
import { createWidgetScope, type WidgetScope } from '../../ui/canvas/widgets';
import { createInputController, type InputController } from '../../ui/canvas/input';
import { createDesktopChrome, type DesktopChrome } from './desktop-chrome';

let draw: Renderer;
let input: InputController;
let widgets: WidgetScope;
let chrome: DesktopChrome;

beforeEach(() => {
  draw = createRenderer(canvasFixture().canvas, { createCanvas: makeTestCanvas });
  input = createInputController();
  widgets = createWidgetScope(draw, input);
  chrome = createDesktopChrome(draw, input, widgets, [
    {
      label: 'Programs',
      children: [
        { label: 'Train', command: 'train' },
        { label: 'Notepad', command: 'notepad' },
      ],
    },
    { label: '-' },
    { label: 'Help', command: '$help' },
  ]);
});

afterEach(() => {
  chrome.dispose();
  widgets.dispose();
  input.dispose();
  draw.dispose();
});

function key(value: string, time = 1) {
  input.queueInput({ key: value });
  input.beginFrame(time);
  return chrome.drawStartMenu(time);
}

describe('desktop chrome interaction', () => {
  it('navigates nested Start commands and preserves the rendered launch geometry', () => {
    chrome.toggleStart();
    chrome.drawStartMenu(0);
    key('ArrowRight');
    expect(chrome.blockers).toHaveLength(2);
    key('ArrowDown', 2);
    const command = key('Enter', 3);
    expect(command).toMatchObject({ command: 'notepad', launchBounds: { h: 18 } });
    expect(chrome.startOpen).toBe(false);
    expect(chrome.blockers).toEqual([]);
    expect(input.io.keyPressed.size).toBe(0);
  });

  it('skips restricted commands and preserves the original entries when restrictions are lifted', () => {
    chrome.restrictCommands(['train']);
    chrome.toggleStart();
    chrome.drawStartMenu(0);
    key('ArrowRight');
    expect(key('t', 2)).toBeUndefined();
    expect(chrome.startOpen).toBe(true);
    expect(key('Enter', 3)?.command).toBe('notepad');
    chrome.restrictCommands([]);
    chrome.toggleStart();
    key('ArrowRight', 4);
    expect(key('Enter', 5)?.command).toBe('train');
  });

  it('uses completed pointer input for Start selection and copies context entries', () => {
    chrome.toggleStart();
    chrome.drawStartMenu(0);
    const bounds = chrome.blockers[0];
    input.queueInput({ px: bounds.x + 35, py: bounds.y + 3 + 18 + 8 + 6, down: true });
    input.queueInput({ down: false });
    input.beginFrame(1);
    expect(chrome.drawStartMenu(1)?.command).toBe('$help');
    const entries = [{ label: 'Original', command: 'original' }];
    chrome.openContext(20, 20, entries);
    entries[0].command = 'changed';
    expect(chrome.contextKey('Enter')).toBe('original');
    expect(chrome.contextBounds).toBeNull();
  });

  it('closes Start on modal blocking or outside input and returns focus navigation state cleanly', () => {
    chrome.toggleStart();
    chrome.drawStartMenu(0, true);
    expect(chrome.startOpen).toBe(false);
    chrome.toggleStart();
    input.queueInput({ px: 600, py: 30, down: true });
    input.beginFrame(1);
    chrome.drawStartMenu(1);
    expect(chrome.startOpen).toBe(false);
    chrome.toggleStart();
    chrome.openContext(0, 0, [{ label: 'Open', command: 'open' }]);
    expect(chrome.startOpen).toBe(false);
    chrome.toggleStart();
    expect(chrome.contextBounds).toBeNull();
  });

  it('reveals newly focused tasks but preserves explicit scrolling while focus is unchanged', () => {
    const tasks = Array.from({ length: 12 }, (_, index) => ({ id: `task-${index}` }));
    const options = { quickLaunch: false, labels: true, clockWidth: 42, risk: false, contexts: 0 };
    const first = chrome.layoutTasks(tasks, 'task-0', options, 640, 338);
    expect(first.offset).toBe(0);
    const focused = chrome.layoutTasks(tasks, 'task-11', options, 640, 338);
    expect(focused.tasks.some((task) => task.index === 11)).toBe(true);
    chrome.scrollTasks(-1, true);
    const previous = chrome.layoutTasks(tasks, 'task-11', options, 640, 338);
    expect(previous.offset).toBeLessThan(focused.offset);
    chrome.reflow();
    expect(
      chrome
        .layoutTasks(tasks, 'task-11', options, 960, 516)
        .tasks.some((task) => task.index === 11),
    ).toBe(true);
  });

  it('owns tooltip delay and copies each frame occluder', () => {
    const hover = { id: 'clock', label: 'Clock', x: 580 };
    chrome.drawTooltip(hover, 0, 338);
    expect(chrome.blockers).toEqual([]);
    chrome.drawTooltip(hover, 0.6, 338);
    expect(chrome.blockers).toHaveLength(1);
    chrome.beginFrame();
    chrome.drawTooltip({ ...hover, id: 'volume' }, 0.7, 338);
    expect(chrome.blockers).toEqual([]);
    chrome.toggleVolume();
    chrome.drawTooltip(hover, 2, 338);
    expect(chrome.blockers).toEqual([]);
    const bounds = { x: 1, y: 2, w: 3, h: 4 };
    chrome.addTransient(bounds);
    bounds.x = 900;
    expect(chrome.blockers).toEqual([{ x: 1, y: 2, w: 3, h: 4 }]);
  });

  it('restores a failed Start rail transform and releases owned state without releasing its renderer', () => {
    chrome.toggleStart();
    const restore = vi.spyOn(draw.getCtx(), 'restore');
    vi.spyOn(draw, 'text').mockImplementationOnce(() => {
      throw new Error('font failed');
    });
    expect(() => chrome.drawStartMenu(0)).toThrow('font failed');
    expect(restore).toHaveBeenCalledOnce();
    chrome.drawStartMenu(0.1);
    chrome.toggleVolume();
    chrome.dispose();
    chrome.dispose();
    expect(chrome.blockers).toEqual([]);
    expect(chrome.startOpen).toBe(false);
    expect(chrome.volumeOpen).toBe(false);
    chrome.toggleStart();
    expect(chrome.drawStartMenu(1)).toBeUndefined();
    expect(() => draw.rect(0, 0, 1, 1, '#000000')).not.toThrow();
  });
});
