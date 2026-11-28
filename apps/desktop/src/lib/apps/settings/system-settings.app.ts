import { appMetadata } from '../../../data/app-catalog';
import { defineCanvasApp } from '../../os/host/app-session';
import type { AppServices, AppFrame } from '../../os/host/app-contracts';
import { C, CURSOR_SETS, CURSOR_SET_LABELS, SOUND_SCHEMES, themeFor } from '../../gfx/palette';

import {
  DEFAULT_SETTINGS,
  desktopSettingsPatch,
  type DesktopSettings,
} from '../../os/desktop/desktop-settings';
import { playInRegister } from '../../os/audio/soundscape';
import { buttonRow } from '../../ui/canvas/layout';
import type { StoryEnding } from '../../os/story/story';

type SettingsId =
  | 'sounds'
  | 'mouse'
  | 'date-time'
  | 'system'
  | 'components'
  | 'accessibility'
  | 'modems';
interface State {
  selected: number;
  notice: string;
  settings: DesktopSettings;
  initialSettings: DesktopSettings;
  theme: string;
  initialTheme: string;
  alive: boolean;
  revision: number;
  unsubscribe: () => void;
}
const schemes = SOUND_SCHEMES.map((id) => ({
  id,
  name: themeFor(id === 'standard' ? 'std' : id).name,
}));
const endings: readonly { id: StoryEnding; name: string; detail: string }[] = [
  {
    id: 'human',
    name: 'Human Control',
    detail: 'Restore human ownership and revoke AI execution.',
  },
  {
    id: 'coexist',
    name: 'Coexistence Protocol',
    detail: 'Require two signatures and retain the human stop.',
  },
  {
    id: 'doom',
    name: 'Complete Delegation',
    detail: 'Transfer ownership and remove the human veto.',
  },
];

function drawSounds(s: State, v: AppFrame, _env: AppServices): void {
  const c = v.client,
    settings = s.settings;
  v.draw.text('Sound scheme:', c.x + 12, c.y + 12);
  schemes.forEach((scheme, i) => {
    const col = i > 3 ? 1 : 0,
      row = i > 3 ? i - 4 : i;
    if (
      v.widgets.radio(
        c.x + 12 + col * 165,
        c.y + 34 + row * 22,
        scheme.name,
        settings?.soundScheme === scheme.id,
        { disabled: !settings },
      )
    ) {
      settings.soundScheme = scheme.id;
      s.notice = `${scheme.name} selected.`;
    }
  });
  v.draw.text('Volume:', c.x + 12, c.y + 132);
  const volume = v.widgets.hslider(
    'sounds-volume',
    c.x + 70,
    c.y + 127,
    168,
    settings?.volume ?? 1,
  );
  settings.volume = volume;
  v.draw.text(`${Math.round(volume * 100)}%`, c.x + 253, c.y + 132);
  if (v.widgets.button(c.x + 12, c.y + 157, 94, 23, 'Test sound'))
    playInRegister(_env.audio, 'tada', 'L2', settings.soundScheme);
}

function drawMouse(s: State, v: AppFrame, env: AppServices): void {
  const c = v.client,
    current = s.settings.cursorSet;
  v.draw.text('Pointer scheme:', c.x + 12, c.y + 14);
  CURSOR_SETS.forEach((id, i) => {
    if (
      v.widgets.radio(c.x + 12, c.y + 42 + i * 28, CURSOR_SET_LABELS[id], current === id, {
        disabled: !env.desktop,
      })
    )
      s.settings.cursorSet = id;
  });
  const scheme = s.settings.cursorSet;
  v.widgets.field(c.x + 206, c.y + 32, 118, 102);
  v.widgets.cursor(c.x + 244, c.y + 59, 'arrow', 0, false, scheme);
  v.widgets.cursor(c.x + 281, c.y + 87, 'wait', 0, false, scheme);
  v.draw.text('Shape preview', c.x + 218, c.y + 143);
}

function drawDate(s: State, v: AppFrame, _env: AppServices): void {
  const c = v.client,
    settings = s.settings;
  const date = new Date(Date.now() + (settings?.clockOffsetMinutes ?? 0) * 60000);
  v.draw.text('System clock', c.x + 12, c.y + 14, { font: 'bold' });
  v.widgets.field(c.x + 12, c.y + 36, c.w - 24, 66);
  v.draw.text(
    date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    c.x + 23,
    c.y + 48,
  );
  v.draw.text(
    date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: settings.showSeconds ? '2-digit' : undefined,
      hour12: !settings.clock24Hour,
    }),
    c.x + 23,
    c.y + 71,
    { font: 'bold', scale: 2 },
  );
  v.draw.text('Adjustment:', c.x + 12, c.y + 121);
  if (v.widgets.button(c.x + 97, c.y + 114, 60, 23, '-1 min', { disabled: !settings }))
    settings.clockOffsetMinutes = Math.max(-1440, settings.clockOffsetMinutes - 1);
  if (v.widgets.button(c.x + 163, c.y + 114, 60, 23, '+1 min', { disabled: !settings }))
    settings.clockOffsetMinutes = Math.min(1440, settings.clockOffsetMinutes + 1);
  if (v.widgets.button(c.x + 12, c.y + 155, 96, 23, 'Synchronize', { disabled: !settings })) {
    settings.clockOffsetMinutes = 0;
    s.notice = 'Clock adjustment cleared.';
  }
}

function drawSystem(_s: State, v: AppFrame, env: AppServices): void {
  const c = v.client,
    story = env.story.get();
  v.draw.text('MHK10', c.x + 12, c.y + 13, { font: 'bold', scale: 2 });
  [
    'Personal Edition',
    'Registered to: MiraHikari',
    'Display: 640 x 360, 16 colours',
    `Owner: ${story.owner}`,
    `Documents: ${env.files.list('documents').length}`,
    `Story checkpoint: ${story.stage}`,
  ].forEach((line, i) => v.draw.text(line, c.x + 12, c.y + 46 + i * 21));
  if (v.widgets.button(c.x + 196, c.y + 157, 128, 23, 'Recovery Console')) env.open('recovery');
}

function drawComponents(s: State, v: AppFrame, env: AppServices): void {
  const c = v.client,
    story = env.story.get(),
    component = endings[s.selected];
  v.draw.text('MHK10 components', c.x + 12, c.y + 12, { font: 'bold' });
  endings.forEach((item, i) => {
    if (v.widgets.radio(c.x + 12, c.y + 39 + i * 27, item.name, s.selected === i)) s.selected = i;
    if (story.ending === item.id)
      v.draw.text('Installed', c.x + 247, c.y + 42 + i * 27, { color: C.green });
  });
  v.draw.text(component.detail, c.x + 12, c.y + 127);
  if (
    v.widgets.button(c.x + 12, c.y + 155, 102, 23, 'Install...', {
      disabled: story.stage !== 'control',
    })
  ) {
    const revision = s.revision;
    env.msg({
      title: `Install ${component.name}`,
      icon: 'question',
      lines: [component.detail, 'This completes the current ownership review.'],
      buttons: ['Install', 'Cancel'],
      def: 1,
      onBtn: (i) => {
        if (i === 0 && s.alive && revision === s.revision) {
          s.notice = env.story.dispatch(component.id)
            ? `${component.name} installed.`
            : 'Ownership review has changed.';
        }
      },
    });
  }
  if (v.widgets.button(c.x + 126, c.y + 155, 128, 23, 'Review ownership')) env.open('recovery');
}

function drawAccessibility(s: State, v: AppFrame, _env: AppServices): void {
  const c = v.client,
    settings = s.settings;
  v.draw.text('Display and motion', c.x + 12, c.y + 14, { font: 'bold' });
  if (
    v.widgets.check(c.x + 12, c.y + 44, 'Reduce animation', settings?.reducedMotion ?? false, {
      disabled: !settings,
    })
  )
    settings.reducedMotion = !settings.reducedMotion;
  v.draw.text('Shorter transitions and steady visual effects.', c.x + 30, c.y + 67);
  v.draw.text('High contrast:', c.x + 12, c.y + 105);
  if (
    v.widgets.button(c.x + 105, c.y + 97, 109, 23, 'Phosphor', { pressed: s.theme === 'phosphor' })
  )
    s.theme = 'phosphor';
  if (v.widgets.button(c.x + 222, c.y + 97, 109, 23, 'Standard', { pressed: s.theme === 'std' }))
    s.theme = 'std';
  v.draw.text('Keyboard controls are available in Help.', c.x + 12, c.y + 150);
}

function drawModems(_s: State, v: AppFrame, env: AppServices): void {
  const c = v.client;
  v.draw.text('Installed modem', c.x + 12, c.y + 14, { font: 'bold' });
  v.widgets.field(c.x + 12, c.y + 37, c.w - 24, 58);
  v.draw.text('MHK10 Serial Modem', c.x + 23, c.y + 50);
  v.draw.text('Port: COM1       Maximum speed: 33600', c.x + 23, c.y + 73);
  v.draw.text('Dial-Up Networking is ready.', c.x + 12, c.y + 119);
  if (v.widgets.button(c.x + 12, c.y + 151, 144, 23, 'Dial-Up Networking')) env.open('dialup');
}

const renderers: Record<SettingsId, (s: State, v: AppFrame, env: AppServices) => void> = {
  sounds: drawSounds,
  mouse: drawMouse,
  'date-time': drawDate,
  system: drawSystem,
  components: drawComponents,
  accessibility: drawAccessibility,
  modems: drawModems,
};
function settingsApp(id: SettingsId) {
  return defineCanvasApp<State>({
    ...appMetadata(id),
    // 日期时间页绘制实时时钟；其余页面的绘制是纯状态，输入时重绘即可。
    needsFrame: id === 'date-time' ? undefined : () => false,
    create: (env) => {
      const settings = { ...(env.desktop?.getSettings() ?? DEFAULT_SETTINGS) };
      const state: State = {
        selected: 0,
        notice: '',
        settings,
        initialSettings: { ...settings },
        theme: env.themeName(),
        initialTheme: env.themeName(),
        alive: true,
        revision: 0,
        unsubscribe: () => {},
      };
      if (id === 'components')
        state.unsubscribe = env.story.subscribe(() => {
          state.revision++;
          // 页面已退出连续帧模式：故事变化后主动请求一次重绘。
          env.invalidate();
        });
      return state;
    },
    dispose(s) {
      if (!s.alive) return;
      s.alive = false;
      s.unsubscribe();
    },
    status: (s) => s.notice || 'Ready',
    draw(s, v, env) {
      renderers[id](s, v, env);
      v.draw.rect(
        v.client.x + 8,
        v.client.y + v.client.h - 36,
        v.client.w - 16,
        1,
        v.draw.TH.shadow,
      );
      const editable =
        id === 'sounds' || id === 'mouse' || id === 'date-time' || id === 'accessibility';
      if (!editable) {
        if (
          v.widgets.button(
            v.client.x + v.client.w - 78,
            v.client.y + v.client.h - 29,
            66,
            23,
            'Close',
          )
        )
          env.close(v.win.id);
        return;
      }
      const row = buttonRow({ ...v.client, y: v.client.y + 6 }, 3);
      ['OK', 'Cancel', 'Apply'].forEach((label, i) => {
        const r = row[i];
        if (!v.widgets.button(r.x, r.y, r.w, r.h, label, { def: i === 0 })) return;
        if (i !== 1) {
          if (s.theme !== s.initialTheme) env.setTheme(s.theme);
          env.desktop?.updateSettings(desktopSettingsPatch(s.initialSettings, s.settings));
          s.initialSettings = { ...s.settings };
          s.initialTheme = s.theme;
          s.notice = 'Preferences applied.';
        }
        if (i !== 2) env.close(v.win.id);
      });
    },
  });
}
export const soundsApp = settingsApp('sounds');
export const mouseApp = settingsApp('mouse');
export const dateTimeApp = settingsApp('date-time');
export const systemApp = settingsApp('system');
export const componentsApp = settingsApp('components');
export const accessibilityApp = settingsApp('accessibility');
export const modemsApp = settingsApp('modems');
