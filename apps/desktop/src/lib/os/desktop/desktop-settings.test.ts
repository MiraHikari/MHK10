import { describe, expect, it } from 'vite-plus/test';
import {
  DEFAULT_SETTINGS,
  desktopSettingsPatch,
  effectiveSaver,
  parseDesktopSettings,
  parsePixelWallpaper,
  pinQuickLaunch,
  rememberRecentProgram,
  rememberRunCommand,
  unpinQuickLaunch,
} from './desktop-settings';
import { systemClock } from '../story/doom';
import { C, THEMES, themeCss } from '../../gfx/palette';

describe('desktop design preferences', () => {
  it('defaults to first-visit startup while retaining explicit saved choices', () => {
    expect(parseDesktopSettings({ hasVisited: true }).startupAnimation).toBe('first-visit');
    expect(
      parseDesktopSettings({ startupAnimation: 'first-visit', hasVisited: true }).startupAnimation,
    ).toBe('first-visit');
    expect(
      parseDesktopSettings({ startupAnimation: 'never', hasVisited: true }).startupAnimation,
    ).toBe('never');
    expect(
      parseDesktopSettings({ startupAnimation: 'always', hasVisited: true }).startupAnimation,
    ).toBe('always');
  });
  it('keeps manual icon positions by default and accepts an explicit auto-arrange choice', () => {
    expect(parseDesktopSettings({}).autoArrangeIcons).toBe(false);
    expect(parseDesktopSettings({ autoArrangeIcons: 'true' }).autoArrangeIcons).toBe(false);
    expect(parseDesktopSettings({ autoArrangeIcons: true }).autoArrangeIcons).toBe(true);
    expect(
      desktopSettingsPatch(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, autoArrangeIcons: true })
        .autoArrangeIcons,
    ).toBe(true);
  });
  it('rejects malformed external preferences and bounds fields', () => {
    expect(parseDesktopSettings(null)).toEqual(DEFAULT_SETTINGS);
    const settings = parseDesktopSettings({
      volume: Infinity,
      saver: 'danger',
      shell: 'eval',
      saverMinutes: -4,
      clockOffsetMinutes: 1e9,
      marquee: 'a\nb',
    });
    expect(settings.volume).toBe(DEFAULT_SETTINGS.volume);
    expect(settings.saver).toBe('Starfield');
    expect(settings.shell).toBe('desktop');
    expect(settings.saverMinutes).toBe(1);
    expect(settings.clockOffsetMinutes).toBe(1440);
    expect(settings.marquee).toBe('a b');
  });
  it('keeps the chosen saver available after a story replay', () => {
    expect(effectiveSaver('Mystify', 85)).toBe('Mystify');
    expect(effectiveSaver('None', 86)).toBe('P(DOOM).SCR');
    expect(effectiveSaver('Mystify', 5)).toBe('Mystify');
  });
  it('validates startup and taskbar options without coercing malformed values', () => {
    const preferences = parseDesktopSettings({
      startupAnimation: 'skip',
      riskDisplay: 'yes',
      hasVisited: 'true',
      welcomeCompleted: 1,
      windowAnimations: 0,
      showAssistant: {},
      clock24Hour: null,
      showSeconds: [],
      quickLaunch: 'off',
      taskbarLabels: 1,
      followStoryTheme: 'false',
    });
    expect(preferences).toEqual(DEFAULT_SETTINGS);
    expect(parseDesktopSettings([])).toEqual(DEFAULT_SETTINGS);
    expect(
      parseDesktopSettings({
        startupAnimation: 'never',
        riskDisplay: 'hidden',
        hasVisited: true,
        showAssistant: true,
        quickLaunch: false,
      }),
    ).toMatchObject({
      startupAnimation: 'never',
      riskDisplay: 'hidden',
      hasVisited: true,
      showAssistant: true,
      quickLaunch: false,
    });
  });
  it('migrates legacy disabled Welcome without turning dismissals into completion', () => {
    expect(parseDesktopSettings({ welcome: false }).welcomeCompleted).toBe(true);
    expect(parseDesktopSettings({ welcome: true }).welcomeCompleted).toBe(false);
    expect(parseDesktopSettings({ welcome: false, welcomeCompleted: false }).welcomeCompleted).toBe(
      false,
    );
  });
  it('commits only edited preferences so another applet can retain its changes', () => {
    const draft = { ...DEFAULT_SETTINGS, quickLaunch: false, startupAnimation: 'never' as const };
    expect(desktopSettingsPatch(DEFAULT_SETTINGS, draft)).toEqual({
      quickLaunch: false,
      startupAnimation: 'never',
    });
    expect(desktopSettingsPatch(draft, draft)).toEqual({});
  });
  it('accepts only complete bounded 16-colour images and copies their pixels', () => {
    const input = { width: 2, height: 1, pixels: [0, 15] };
    const parsed = parsePixelWallpaper(input)!;
    input.pixels[0] = 5;
    expect(parsed.pixels).toEqual([0, 15]);
    expect(parsePixelWallpaper({ width: 2, height: 1, pixels: [0, 16] })).toBeUndefined();
    expect(parsePixelWallpaper({ width: 50000, height: 1, pixels: [] })).toBeUndefined();
  });
  it('bundles all seven themes with matching HTML and canvas palette values', () => {
    expect(Object.keys(THEMES)).toHaveLength(7);
    for (const [id, theme] of Object.entries(THEMES)) {
      for (const color of Object.values(theme.palette)) expect(Object.values(C)).toContain(color);
      expect(themeCss()).toContain(`data-theme='${id}'`);
      expect(themeCss()).toContain(`--desk:${theme.desk}`);
      expect(theme.face).toBe(theme.palette.face);
    }
  });
  it('leaves run and program history empty when an older desktop record omits them', () => {
    const legacy = {
      volume: 0.2,
      marquee: 'kept',
      shell: 'progman' as const,
      welcome: false,
      quickLaunchItems: ['home', 'notepad'],
      clock24Hour: false,
    };
    const parsed = parseDesktopSettings(legacy);
    expect(parsed.recentRunCommands).toEqual([]);
    expect(parsed.recentProgramIds).toEqual([]);
    expect(parsed.volume).toBe(0.2);
    expect(parsed.marquee).toBe('kept');
    expect(parsed.shell).toBe('progman');
    expect(parsed.welcome).toBe(false);
    expect(parsed.welcomeCompleted).toBe(true);
    expect(parsed.quickLaunchItems).toEqual(['home', 'notepad']);
    expect(parsed.clock24Hour).toBe(false);
    expect(parsed.saver).toBe(DEFAULT_SETTINGS.saver);
  });
  it('caps, trims and deduplicates recent commands and program ids', () => {
    const commands = [
      ' ok ',
      'OK',
      4,
      '',
      'second',
      ...Array.from({ length: 10 }, (_, i) => `c${i}`),
    ];
    const parsed = parseDesktopSettings({
      volume: 0.4,
      recentRunCommands: commands,
      recentProgramIds: ['Home', 'home', 'home', 'mines', '$run', 'bad id', 'computer'],
    });
    expect(parsed.volume).toBe(0.4);
    expect(parsed.recentRunCommands).toEqual(['ok', 'second', 'c0', 'c1', 'c2', 'c3', 'c4', 'c5']);
    expect(parsed.recentProgramIds).toEqual(['home', 'mines', 'computer']);
    expect(parseDesktopSettings({ recentRunCommands: 'notepad' }).recentRunCommands).toEqual([]);
    expect(parseDesktopSettings({ recentProgramIds: { id: 'mines' } }).recentProgramIds).toEqual(
      [],
    );
    let settings = DEFAULT_SETTINGS;
    for (const command of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'])
      settings = rememberRunCommand(settings, command);
    expect(settings.recentRunCommands).toEqual(['i', 'h', 'g', 'f', 'e', 'd', 'c', 'b']);
    settings = rememberRunCommand(settings, '  H \n');
    expect(settings.recentRunCommands[0]).toBe('H');
    expect(settings.recentRunCommands.filter((item) => item.toLowerCase() === 'h')).toHaveLength(1);
    expect(rememberRunCommand(settings, '   ')).toBe(settings);
    expect(settings.volume).toBe(DEFAULT_SETTINGS.volume);
    settings = DEFAULT_SETTINGS;
    for (const id of ['notepad', 'mines', 'home', 'computer', 'chat', 'blog', 'pixel'])
      settings = rememberRecentProgram(settings, id);
    expect(settings.recentProgramIds).toEqual([
      'pixel',
      'blog',
      'chat',
      'computer',
      'home',
      'mines',
    ]);
    expect(rememberRecentProgram(settings, '$run')).toBe(settings);
    expect(rememberRecentProgram(settings, '../bad')).toBe(settings);
    expect(
      desktopSettingsPatch(DEFAULT_SETTINGS, rememberRunCommand(DEFAULT_SETTINGS, 'notepad')),
    ).toEqual({ recentRunCommands: ['notepad'] });
  });
  it('shows real local time before descent and converges to midnight', () => {
    expect(DEFAULT_SETTINGS.pixelImages).toBe(false);
    expect(
      parseDesktopSettings({
        quickLaunchItems: ['home', 'home', '../bad', 'notepad', 4, 'pixel', 'chat', 'train'],
      }).quickLaunchItems,
    ).toEqual(['home', 'notepad', 'pixel', 'chat']);
    expect(parseDesktopSettings({ pixelImages: true }).pixelImages).toBe(true);
    expect(systemClock(5, 847, { hour24: true, seconds: 9 })).toBe('14:07:09');
    expect(systemClock(99.9, 847, { hour24: true, seconds: 9 })).toBe('00:00:00');
    expect(systemClock(5, 14 * 60 + 7)).toBe('2:07 PM');
    expect(systemClock(33, 0)).toBe('12:00 AM');
    expect(systemClock(61, 300)).toBe('11:57 PM');
    expect(systemClock(86, 300)).toBe('11:58 PM');
    expect(systemClock(99.9, 300)).toBe('12:00 AM');
    expect(systemClock(5, -1)).toBe('11:59 PM');
  });
  it('pins a program while the bar has room and removes one without shifting the others', () => {
    expect(pinQuickLaunch(['home', 'computer'], 'notepad')).toEqual({
      quickLaunch: true,
      quickLaunchItems: ['home', 'computer', 'notepad'],
    });
    expect(pinQuickLaunch(['home', 'computer', 'notepad', 'chat'], 'mines')).toBeUndefined();
    expect(pinQuickLaunch(['home'], '$run')).toBeUndefined();
    expect(pinQuickLaunch(['home', 'notepad'], 'home')).toEqual({
      quickLaunch: true,
      quickLaunchItems: ['home', 'notepad'],
    });
    expect(unpinQuickLaunch(['home', 'notepad', 'chat'], 'notepad')).toEqual(['home', 'chat']);
  });
});
