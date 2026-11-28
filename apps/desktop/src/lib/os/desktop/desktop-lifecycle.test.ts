import { describe, expect, it, vi } from 'vite-plus/test';
import type { Renderer } from '../../gfx/context';
import { C, VGA_COLORS } from '../../gfx/palette';
import { REGISTERS } from '../../gfx/registers';
import { DEFAULT_SETTINGS, parseDesktopSettings } from './desktop-settings';
import { createInputController } from '../../ui/canvas/input';
import { advanceStory, initialStory } from '../story/story';
import {
  createDesktopLifecycle,
  drawBoot,
  drawShutdown,
  drawSplash,
  type DesktopLifecycleFrame,
} from './desktop-lifecycle';

function fixture() {
  const lifecycle = createDesktopLifecycle('teal');
  const input = createInputController();
  const preferences = { ...DEFAULT_SETTINGS, saverMinutes: 1 };
  const state: DesktopLifecycleFrame = {
    preferences,
    story: initialStory(),
    risk: 5,
    modal: false,
    input: input.io,
  };
  return { lifecycle, input, preferences, state };
}

describe('desktop lifecycle', () => {
  it('goes straight to the desktop on a returning visit by default', () => {
    const { lifecycle } = fixture();
    const preferences = parseDesktopSettings({ hasVisited: true, welcomeCompleted: true });
    expect(lifecycle.beginStartup(preferences, true)).toBe('ready');
    expect(lifecycle.phase).toBe('desktop');
  });
  it('ends a preview after its time limit and retains the configured idle saver after None', () => {
    const { lifecycle, state } = fixture();
    lifecycle.enterDesktop();
    lifecycle.frame(0, state);
    lifecycle.previewSaver('Mystify');
    lifecycle.frame(0, state);
    expect(lifecycle.saverVisible).toBe(true);
    lifecycle.frame(15, state);
    expect(lifecycle.saverVisible).toBe(false);
    lifecycle.previewSaver('None');
    lifecycle.frame(60, state);
    expect(lifecycle.saverVisible).toBe(true);
    expect(lifecycle.requestedSaver).toBe('Starfield');
  });
  it('resets the active shell and clears preview state', () => {
    const { lifecycle, state, preferences } = fixture();
    lifecycle.enterDesktop();
    preferences.shell = 'progman';
    lifecycle.frame(0, state);
    expect(lifecycle.currentShell).toBe('progman');
    lifecycle.previewSaver('Mystify');
    lifecycle.reset(5);
    expect(lifecycle.currentShell).toBe('desktop');
    expect(lifecycle.saverVisible).toBe(false);
  });
  it('keeps first visit, returning visit and explicit startup animation choices', () => {
    const { lifecycle } = fixture();
    expect(lifecycle.beginStartup({ startupAnimation: 'first-visit', hasVisited: false })).toBe(
      'animation',
    );
    expect(lifecycle.phase).toBe('boot');
    expect(
      lifecycle.beginStartup({ startupAnimation: 'first-visit', hasVisited: false }, true),
    ).toBe('ready');
    expect(lifecycle.phase).toBe('desktop');
    expect(lifecycle.beginStartup({ startupAnimation: 'always', hasVisited: true }, true)).toBe(
      'animation',
    );
    expect(lifecycle.beginStartup({ startupAnimation: 'never', hasVisited: false })).toBe('ready');
  });

  it('shows the brand handoff once after the POST using the existing phase clock', () => {
    const { lifecycle, state } = fixture();
    lifecycle.beginStartup({ startupAnimation: 'always', hasVisited: false });
    lifecycle.frame(1.41, state);
    expect(lifecycle.advanceIntro(false)).toBeUndefined();
    lifecycle.frame(0.02, state);
    expect(lifecycle.advanceIntro(false)).toBe('splash');
    expect(lifecycle.phaseT).toBe(0);
    lifecycle.frame(2.74, state);
    expect(lifecycle.advanceIntro(false)).toBeUndefined();
    expect(lifecycle.phase).toBe('splash');
    lifecycle.frame(0.03, state);
    expect(lifecycle.advanceIntro(false)).toBe('desktop');
    expect(lifecycle.advanceIntro(false)).toBeUndefined();
  });

  it('skips both phases on release without inserting a timed intermediate frame', () => {
    const { lifecycle, state } = fixture();
    lifecycle.beginStartup({ startupAnimation: 'always', hasVisited: false });
    lifecycle.skipBoot();
    lifecycle.frame(0.2, state);
    expect(lifecycle.advanceIntro(true)).toBeUndefined();
    expect(lifecycle.phase).toBe('boot');
    expect(lifecycle.advanceIntro(false)).toBe('desktop');
    expect(lifecycle.phaseT).toBe(0);
  });

  it('bypasses decorative time for desktop and system motion preferences', () => {
    const { lifecycle, state, preferences } = fixture();
    lifecycle.setBootInfo({ userAgent: 'Browser\nReported', hardwareConcurrency: 8 });
    expect(lifecycle.bootLines.some((line) => line.includes('8 logical'))).toBe(true);
    expect(lifecycle.bootLines.every((line) => !line.includes('\n'))).toBe(true);
    expect(Object.isFrozen(lifecycle.bootLines)).toBe(true);
    preferences.startupAnimation = 'always';
    preferences.reducedMotion = true;
    lifecycle.frame(0, state);
    expect(lifecycle.beginStartup(preferences)).toBe('ready');
    expect(lifecycle.phase).toBe('desktop');
    preferences.reducedMotion = false;
    lifecycle.frame(0, { ...state, systemReducedMotion: true });
    expect(lifecycle.beginStartup(preferences)).toBe('ready');

    lifecycle.frame(0, state);
    expect(lifecycle.beginStartup(preferences)).toBe('animation');
    lifecycle.frame(0, { ...state, systemReducedMotion: true });
    expect(lifecycle.advanceIntro(false)).toBe('desktop');
  });

  it('keeps preferred theme separate from story appearance and derives restriction commands', () => {
    const { lifecycle, state, preferences } = fixture();
    const control = advanceStory(advanceStory(state.story, 'train'), 'audit');
    const update = lifecycle.syncStory(control, 61, true);
    expect(update).toMatchObject({ themeChanged: true, restrictionsChanged: true });
    expect(lifecycle.themeName).toBe('night');
    expect(lifecycle.preferredTheme).toBe('teal');
    expect(lifecycle.restrictedCommands).toEqual(['train', 'killswitch']);
    preferences.followStoryTheme = false;
    lifecycle.frame(0.1, { ...state, story: control, risk: 86 });
    expect(lifecycle.themeName).toBe('teal');
    expect(lifecycle.restrictedCommands).toEqual(['train', 'killswitch', 'solitaire']);
    expect(lifecycle.chooseTheme('missing')).toBe(false);
    expect(lifecycle.chooseTheme('hotdog')).toBe(true);
    expect(lifecycle.preferredTheme).toBe('hotdog');
  });

  it('owns copied assistant tips, story ending animation and restart state', () => {
    const { lifecycle, state } = fixture();
    const lines = ['A tip'];
    lifecycle.showTip(lines, 1);
    lines[0] = 'Outside change';
    expect(lifecycle.tip?.lines).toEqual(['A tip']);
    lifecycle.frame(1.1, state);
    expect(lifecycle.tip).toBeNull();
    const ending = advanceStory(advanceStory(advanceStory(state.story, 'train'), 'audit'), 'doom');
    expect(lifecycle.syncStory(ending, 99.9, true).playEnding).toBe(true);
    expect(lifecycle.slamT).toBe(lifecycle.t);
    lifecycle.shutdown();
    lifecycle.frame(0.4, { ...state, story: ending, risk: 99.9 });
    expect(lifecycle.phase).toBe('shutdown');
    expect(lifecycle.phaseT).toBe(0.4);
    lifecycle.reset(5);
    expect(lifecycle.phase).toBe('desktop');
    expect(lifecycle.themeName).toBe('teal');
    expect(lifecycle.slamT).toBe(-9);
    expect(lifecycle.tip).toBeNull();
  });

  it('consumes saver wake input until the held pointer is released without mutating input', () => {
    const { lifecycle, input, state } = fixture();
    lifecycle.enterDesktop();
    lifecycle.frame(0, state);
    lifecycle.frame(60, state);
    expect(lifecycle.saverVisible).toBe(true);
    input.queueInput({ px: 30, py: 30, down: true, typed: 'wake' });
    input.beginFrame(60.1);
    expect(lifecycle.frame(0.1, state).consumeWakeInput).toBe(true);
    expect(lifecycle.saverVisible).toBe(false);
    expect(lifecycle.wakeUntilRelease).toBe(true);
    expect(input.io.typed).toBe('wake');
    input.beginFrame(60.2);
    expect(lifecycle.frame(0.1, state).consumeWakeInput).toBe(true);
    input.queueInput({ down: false });
    input.beginFrame(60.3);
    expect(lifecycle.frame(0.1, state).consumeWakeInput).toBe(true);
    expect(lifecycle.wakeUntilRelease).toBe(false);
    input.beginFrame(60.4);
    expect(lifecycle.frame(0.1, state).consumeWakeInput).toBe(false);
  });

  it('owns saver preview, iframe activity and shell transition signals', () => {
    const { lifecycle, state, preferences } = fixture();
    lifecycle.enterDesktop();
    lifecycle.frame(0, state);
    lifecycle.previewSaver('Mystify');
    lifecycle.frame(0.1, state);
    expect(lifecycle.requestedSaver).toBe('Mystify');
    expect(lifecycle.saverVisible).toBe(true);
    lifecycle.noteActivity();
    expect(lifecycle.frame(0.1, state).consumeWakeInput).toBe(true);
    preferences.shell = 'progman';
    expect(lifecycle.frame(0.1, state).shellChanged).toBe('progman');
    expect(lifecycle.frame(0.1, state).shellChanged).toBeUndefined();
    expect(lifecycle.requestedSaver).toBe(preferences.saver);
  });

  it('isolates clocks and disposal between two surfaces without global resets', () => {
    const first = fixture();
    const second = fixture();
    first.lifecycle.frame(1, first.state);
    second.lifecycle.frame(4, second.state);
    first.lifecycle.showTip(['first']);
    expect(second.lifecycle.tip).toBeNull();
    first.lifecycle.dispose();
    first.lifecycle.dispose();
    first.lifecycle.frame(9, first.state);
    first.lifecycle.showTip(['late']);
    first.lifecycle.previewSaver('Pipes');
    expect(first.lifecycle.t).toBe(1);
    expect(first.lifecycle.tip).toBeNull();
    expect(first.lifecycle.saverVisible).toBe(false);
    second.lifecycle.frame(1, second.state);
    expect(second.lifecycle.t).toBe(5);
  });

  it('draws real POST facts and composes the release print using whole VGA pixels', () => {
    const texts: { value: string; font?: string; color?: string }[] = [];
    const colors = new Set<string>();
    const points: number[] = [];
    const paperColors: string[] = [];
    const renderer = {
      W: 640,
      H: 360,
      l0Screen: vi.fn((_w: number, _h: number) => {
        colors.add('#000000');
      }),
      cp437: vi.fn((_x: number, _y: number, _w: number, _h: number, color = '#c0c0c0') => {
        colors.add(color);
      }),
      rect: vi.fn((x: number, y: number, w: number, h: number, color: string) => {
        points.push(x, y, w, h);
        colors.add(color);
      }),
      frame: vi.fn((_x: number, _y: number, _w: number, _h: number, color: string) => {
        colors.add(color);
      }),
      line: vi.fn((_x0: number, _y0: number, _x1: number, _y1: number, color: string) => {
        colors.add(color);
      }),
      path: vi.fn((vertices: [number, number][], color: string) => {
        points.push(...vertices.flat());
        colors.add(color);
      }),
      poly: vi.fn((vertices: [number, number][], color: string) => {
        points.push(...vertices.flat());
        paperColors.push(color);
        colors.add(color);
      }),
      stipple: vi.fn((x: number, y: number, w: number, h: number, color: string) => {
        points.push(x, y, w, h);
        colors.add(color);
      }),
      fitText: (value: string) => value,
      text: vi.fn(
        (
          value: string | number,
          _x: number,
          _y: number,
          options?: { font?: string; color?: string },
        ) => {
          const entry = { value: String(value), font: options?.font, color: options?.color };
          texts.push(entry);
          if (options?.color) colors.add(options.color);
          return String(value).length * 8;
        },
      ),
    } as unknown as Renderer;

    drawBoot(renderer, {
      phaseT: 0.7,
      bootLines: ['Browser: Chrome 130 (UA-CH)', 'Platform: Windows (UA-CH)'],
      filesPersisted: false,
      checkpoint: 'initial',
    });

    const allowedL0 = new Set<string>(REGISTERS.L0.inks);
    for (const color of colors) {
      expect(allowedL0.has(color)).toBe(true);
    }
    expect(texts.every((entry) => entry.font === 'dos')).toBe(true);
    expect(texts).toContainEqual({ value: 'Session memory', font: 'dos', color: C.white });
    expect(texts).toContainEqual({ value: '[OK]', font: 'dos', color: C.lime });
    expect(texts.map(({ value }) => value)).toContain('POST 03 / LOCAL VOLUME');
    expect(texts.map(({ value }) => value).join(' ')).not.toMatch(/%|download/i);
    expect(texts.map(({ value }) => value).join(' ')).not.toContain('BIOS v');

    colors.clear();
    drawSplash(renderer, { phaseT: 1, themeName: 'std' });
    expect(paperColors).toContain(C.white);
    expect([...colors]).toEqual(expect.arrayContaining([C.navy, C.aqua, C.teal, C.yellow]));
    const allowedVga = new Set<string>(VGA_COLORS);
    expect([...colors].every((color) => allowedVga.has(color))).toBe(true);
    expect(texts.map(({ value }) => value)).toContain('MiraHikari');
    expect(texts).toContainEqual({ value: 'MHK10', font: 'bold', color: C.navy });
    expect(points.every(Number.isInteger)).toBe(true);

    colors.clear();
    drawSplash(renderer, { phaseT: 0, themeName: 'phosphor', reducedMotion: true });
    expect([...colors].every((color) => allowedL0.has(color))).toBe(true);
    expect(colors.has(C.lime)).toBe(true);
  });

  it('chases the print proof by VGA swatches and holds the final plate in either theme', () => {
    const rect = vi.fn<(x: number, y: number, w: number, h: number, color: string) => void>();
    const renderer = {
      W: 640,
      H: 360,
      rect,
      frame: vi.fn(),
      line: vi.fn(),
      path: vi.fn(),
      poly: vi.fn(),
      stipple: vi.fn(),
      text: vi.fn(),
    } as unknown as Renderer;
    const strip = (phaseT: number, themeName: string, reducedMotion = false) => {
      rect.mockClear();
      drawSplash(renderer, { phaseT, themeName, reducedMotion });
      return rect.mock.calls
        .filter(([, y, width, height]) => y === 134 && width === 16 && height === 6)
        .map(([, , , , color]) => color);
    };

    expect(strip(0.19, 'std')).toEqual([...VGA_COLORS.slice(-1), ...VGA_COLORS.slice(0, -1)]);
    expect(strip(0.28, 'std')).toEqual([...VGA_COLORS.slice(-3), ...VGA_COLORS.slice(0, -3)]);
    expect(strip(1.05, 'std')).toEqual(VGA_COLORS);
    expect(strip(2.3, 'std')).toEqual(VGA_COLORS);
    expect(strip(0.19, 'std', true)).toEqual(VGA_COLORS);

    const phosphor = strip(1.05, 'phosphor');
    expect(new Set(phosphor)).toEqual(new Set([C.black, C.gray, C.silver, C.lime]));
    expect(strip(0.19, 'phosphor')).not.toEqual(strip(0.28, 'phosphor'));
    expect(strip(0.19, 'phosphor', true)).toEqual(phosphor);
  });
  it('ejects the issue disk after power-off and waits for an explicit restart', () => {
    const texts: string[] = [];
    const renderer = {
      W: 640,
      H: 360,
      rect: vi.fn(),
      frame: vi.fn(),
      path: vi.fn(),
      poly: vi.fn(),
      stipple: vi.fn(),
      text: vi.fn((value: string) => texts.push(value)),
    } as unknown as Renderer;
    const base = {
      reducedMotion: false,
      endingDoom: false,
      themeName: 'std',
      paintDesktop: vi.fn(),
      dim: vi.fn(),
    };
    expect(
      drawShutdown(renderer, {
        ...base,
        phaseT: 0.1,
        restartRequested: false,
        onRestart: vi.fn(),
      }),
    ).toEqual({ animated: true });
    expect(base.paintDesktop).toHaveBeenCalledOnce();
    const onRestart = vi.fn();
    expect(
      drawShutdown(renderer, { ...base, phaseT: 2, restartRequested: false, onRestart }),
    ).toEqual({ animated: false });
    expect(onRestart).not.toHaveBeenCalled();
    expect(texts).toContain('It is now safe');
    expect(texts).toContain('01  /  OFF AIR');
    drawShutdown(renderer, { ...base, phaseT: 2, restartRequested: true, onRestart });
    expect(onRestart).toHaveBeenCalledOnce();
    expect(
      drawShutdown(renderer, {
        ...base,
        reducedMotion: true,
        phaseT: 0,
        restartRequested: false,
        onRestart,
      }),
    ).toEqual({ animated: false });
  });
});
