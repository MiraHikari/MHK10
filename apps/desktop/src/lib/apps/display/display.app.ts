import { defineCanvasApp } from '../../os/host/app-session';
import { appMetadata } from '../../../data/app-catalog';
import { THEMES, themeFor } from '../../gfx/palette';

import { WALLPAPERS, type Wallpaper } from '../../gfx/wallpaper';

import {
  SAVERS,
  DEFAULT_SETTINGS,
  effectiveSaver,
  desktopSettingsPatch,
  type DesktopSettings,
} from '../../os/desktop/desktop-settings';
import { buttonRow } from '../../ui/canvas/layout';
import type { AppServices, AppFrame } from '../../os/host/app-contracts';

type PreferenceTab = 'desktop' | 'taskbar' | 'startup' | 'monitor';
interface PreferenceState {
  settings: DesktopSettings;
  initialSettings: DesktopSettings;
  preferencesTab: PreferenceTab;
}
interface State extends PreferenceState {
  theme: string;
  initialTheme: string;
  tab: number;
  wallpaper: Wallpaper;
  initialWallpaper: Wallpaper;
  marquee: { text: string; caret: number };
}
function preview(frame: AppFrame, x: number, y: number, state: State, env: AppServices): void {
  const th = themeFor(state.theme);
  frame.widgets.bevel(x - 6, y - 6, 140, 108, 'button');
  frame.draw.rect(x, y, 128, 86, th.desk);
  const ctx = frame.draw.getCtx();
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, 128, 86);
  ctx.clip();
  if (state.tab === 2) {
    ctx.translate(x, y);
    frame.draw.drawSaver(
      effectiveSaver(state.settings.saver, env.doom.v),
      env.now(),
      128,
      86,
      env.reducedMotion,
      state.marquee.text,
      env.doom.v,
    );
  } else {
    frame.draw.drawWallpaper(x, y, 128, 86, state.wallpaper);
    frame.draw.rect(x + 14, y + 14, 82, 42, th.face);
    frame.draw.rect(x + 14, y + 14, 82, 10, th.title);
    frame.draw.rect(x + 20, y + 30, 42, 3, th.shadow);
    frame.draw.rect(x + 20, y + 37, 60, 3, th.shadow);
    frame.draw.rect(x, y + 74, 128, 12, th.face);
    frame.draw.rect(x + 2, y + 76, 22, 8, th.title);
  }
  ctx.restore();
  frame.draw.rect(x + 47, y + 102, 34, 5, frame.draw.TH.shadow);
}
function preferences(env: AppServices, preferencesTab: PreferenceTab): PreferenceState {
  const settings = { ...(env.desktop?.getSettings() ?? DEFAULT_SETTINGS) };
  return { settings, initialSettings: { ...settings }, preferencesTab };
}
function applyPreferences(s: PreferenceState, env: AppServices): void {
  env.desktop?.updateSettings(desktopSettingsPatch(s.initialSettings, s.settings));
  s.initialSettings = { ...s.settings };
}
const preferenceTabs = {
  desktop: 'Desktop',
  taskbar: 'Taskbar',
  startup: 'Startup',
  monitor: 'Monitor',
} as const;
function drawPreferences(
  s: PreferenceState,
  v: AppFrame,
  env: AppServices,
  tabs: readonly PreferenceTab[],
  top: number,
): void {
  const c = v.client,
    width = Math.floor((c.w - 12) / tabs.length);
  tabs.forEach((tab, i) => {
    if (
      v.widgets.button(c.x + 6 + i * width, c.y + top, width - 1, 22, preferenceTabs[tab], {
        pressed: s.preferencesTab === tab,
      })
    )
      s.preferencesTab = tab;
  });
  const x = c.x + 14,
    y = c.y + top + 32,
    settings = s.settings;
  const toggle = (
    key:
      | 'showAssistant'
      | 'windowAnimations'
      | 'quickLaunch'
      | 'taskbarLabels'
      | 'clock24Hour'
      | 'showSeconds'
      | 'pixelImages'
      | 'showDesktopIcons',
    label: string,
    offset: number,
  ) => {
    if (v.widgets.check(x, y + offset, label, settings[key], { disabled: !env.desktop }))
      settings[key] = !settings[key];
  };
  if (s.preferencesTab === 'desktop') {
    toggle('showAssistant', 'Show desktop assistant', 0);
    toggle('windowAnimations', 'Animate window transitions', 28);
    if (v.widgets.check(x, y + 56, 'Use Program Manager', settings.shell === 'progman'))
      settings.shell = settings.shell === 'progman' ? 'desktop' : 'progman';
    toggle('pixelImages', 'Use pixel previews for images', 84);
    toggle('showDesktopIcons', 'Show desktop icons', 112);
  } else if (s.preferencesTab === 'taskbar') {
    toggle('quickLaunch', 'Show Quick Launch', 0);
    toggle('taskbarLabels', 'Show application names', 24);
    toggle('clock24Hour', 'Use 24-hour clock', 48);
    toggle('showSeconds', 'Show seconds', 72);
    v.draw.text('Risk meter:', x, y + 100);
    const modes = [
      ['auto', 'Automatic'],
      ['always', 'Always'],
      ['hidden', 'Hidden'],
    ] as const;
    modes.forEach(([mode, label], index) => {
      if (v.widgets.radio(x + index * 110, y + 116, label, settings.riskDisplay === mode))
        settings.riskDisplay = mode;
    });
  } else if (s.preferencesTab === 'startup') {
    v.draw.text('Startup animation', x, y, { font: 'bold' });
    const modes = [
      ['first-visit', 'First visit only'],
      ['always', 'Every visit'],
      ['never', 'Skip animation'],
    ] as const;
    modes.forEach(([mode, label], index) => {
      if (v.widgets.radio(x, y + 24 + index * 23, label, settings.startupAnimation === mode))
        settings.startupAnimation = mode;
    });
    if (
      v.widgets.check(
        x,
        y + 99,
        'Show introduction at startup',
        settings.welcome && !settings.welcomeCompleted,
      )
    ) {
      settings.welcome = !(settings.welcome && !settings.welcomeCompleted);
      if (settings.welcome) settings.welcomeCompleted = false;
    }
  } else {
    v.draw.text('MHK10 VGA Compatible Adapter', x, y, { font: 'bold' });
    if (v.widgets.radio(x, y + 25, 'Automatic work area', settings.resolutionMode === 'auto'))
      settings.resolutionMode = 'auto';
    if (v.widgets.radio(x, y + 48, 'Classic 640 x 360', settings.resolutionMode === 'classic'))
      settings.resolutionMode = 'classic';
    v.draw.text(`Current desktop: ${v.draw.W} x ${v.draw.H} pixels`, x, y + 75);
    v.draw.text('16 colours (4 bit)  |  60 Hz', x, y + 98);
    v.draw.text('Font smoothing: Off', x, y + 120);
  }
}
function restorePreferences(s: PreferenceState): void {
  const fields: Record<PreferenceTab, readonly (keyof DesktopSettings)[]> = {
    desktop: ['showAssistant', 'windowAnimations', 'shell', 'pixelImages', 'showDesktopIcons'],
    taskbar: [
      'quickLaunch',
      'quickLaunchItems',
      'taskbarLabels',
      'clock24Hour',
      'showSeconds',
      'riskDisplay',
    ],
    startup: ['startupAnimation'],
    monitor: [],
  };
  for (const key of fields[s.preferencesTab])
    Object.assign(s.settings, { [key]: DEFAULT_SETTINGS[key] });
}
function preferenceButtons(
  s: PreferenceState,
  v: AppFrame,
  env: AppServices,
  apply: () => void,
  restore = true,
): void {
  const c = v.client,
    row = buttonRow({ ...c, y: c.y + 6, h: c.h }, 3);
  if (
    restore &&
    s.preferencesTab !== 'monitor' &&
    v.widgets.button(c.x + 12, row[0].y, 110, 23, 'Restore defaults')
  )
    restorePreferences(s);
  ['OK', 'Cancel', 'Apply'].forEach((label, i) => {
    const r = row[i];
    if (v.widgets.button(r.x, r.y, r.w, r.h, label, { def: i === 0 })) {
      if (i !== 1) apply();
      if (i !== 2) env.close(v.win.id);
    }
  });
}
function apply(s: State, env: AppServices): void {
  if (s.theme !== s.initialTheme) env.setTheme(s.theme);
  if (s.wallpaper !== s.initialWallpaper) env.wallpaper.setWallpaper(s.wallpaper);
  s.initialTheme = s.theme;
  s.initialWallpaper = s.wallpaper;
  s.settings.marquee = s.marquee.text;
  applyPreferences(s, env);
}
export const displayApp = defineCanvasApp<State>({
  ...appMetadata('display'),
  create: (env) => {
    const settings = { ...(env.desktop?.getSettings() ?? DEFAULT_SETTINGS) };
    return {
      ...preferences(env, 'desktop'),
      theme: env.themeName(),
      initialTheme: env.themeName(),
      tab: 0,
      wallpaper: env.wallpaper.getWallpaper(),
      initialWallpaper: env.wallpaper.getWallpaper(),
      settings,
      marquee: { text: settings.marquee, caret: settings.marquee.length },
    };
  },
  needsFrame: (s) => s.tab === 2,
  draw(s, v, env) {
    const c = v.client;
    ['Themes', 'Background', 'Screen Saver', 'Settings'].forEach((tab, i) => {
      if (v.widgets.button(c.x + 6 + i * 86, c.y + 4, 85, 23, tab, { pressed: s.tab === i }))
        s.tab = i;
    });
    if (s.tab !== 3) preview(v, c.x + 17, c.y + 44, s, env);
    const x = c.x + 169,
      top = c.y + 38;
    if (s.tab === 0) {
      Object.entries(THEMES).forEach(([id, theme], i) => {
        if (v.widgets.radio(x, top + i * 18, theme.name, s.theme === id)) {
          s.theme = id;
          s.wallpaper = theme.wallpaper;
        }
      });
      v.draw.text('Colour, wallpaper, sounds and pointers', c.x + 12, c.y + 170);
      if (
        v.widgets.check(
          c.x + 12,
          c.y + 188,
          'Follow story colour changes',
          s.settings.followStoryTheme,
        )
      )
        s.settings.followStoryTheme = !s.settings.followStoryTheme;
    } else if (s.tab === 1) {
      WALLPAPERS.forEach((wallpaper, i) => {
        if (v.widgets.radio(x, top + i * 24, wallpaper, s.wallpaper === i))
          s.wallpaper = i as Wallpaper;
      });
      v.draw.text('My picture is set from PIXEL.EXE.', c.x + 12, c.y + 170);
    } else if (s.tab === 2) {
      const locked = env.doom.v >= 86;
      SAVERS.forEach((saver, i) => {
        if (
          v.widgets.radio(
            x,
            top + i * 17,
            saver,
            effectiveSaver(s.settings.saver, env.doom.v) === saver,
            {
              disabled: locked,
            },
          )
        )
          s.settings.saver = saver;
      });
      if (v.widgets.button(c.x + 17, c.y + 157, 64, 21, 'Preview'))
        env.desktop?.previewSaver(effectiveSaver(s.settings.saver, env.doom.v));
      if (v.widgets.button(c.x + 91, c.y + 157, 22, 21, '-'))
        s.settings.saverMinutes = Math.max(1, s.settings.saverMinutes - 1);
      if (v.widgets.button(c.x + 140, c.y + 157, 22, 21, '+'))
        s.settings.saverMinutes = Math.min(60, s.settings.saverMinutes + 1);
      v.draw.text(String(s.settings.saverMinutes), c.x + 120, c.y + 164);
      v.draw.text('minutes', c.x + 174, c.y + 164);
      if (s.settings.saver === 'Marquee' && !locked)
        s.marquee = v.widgets.textField(
          'saver-marquee',
          c.x + 12,
          c.y + 181,
          c.w - 24,
          19,
          s.marquee,
          {
            max: 40,
            focused: v.focused,
          },
        );
      else if (locked) v.draw.text('AGI.EXE controls the idle display.', c.x + 12, c.y + 187);
    } else {
      drawPreferences(s, v, env, ['desktop', 'taskbar', 'startup', 'monitor'], 34);
    }
    preferenceButtons(s, v, env, () => apply(s, env), s.tab === 3);
  },
});

/** Taskbar context and Control Panel share the same preference controls and transaction. */
export const taskbarSettingsApp = defineCanvasApp<PreferenceState>({
  ...appMetadata('taskbar-settings'),
  create: (env) => preferences(env, 'taskbar'),
  draw(s, v, env) {
    drawPreferences(s, v, env, ['taskbar', 'startup', 'desktop'], 4);
    preferenceButtons(s, v, env, () => applyPreferences(s, env));
  },
});
