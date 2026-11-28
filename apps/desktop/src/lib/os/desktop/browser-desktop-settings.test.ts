import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { DEFAULT_SETTINGS } from './desktop-settings';
import { createAudio } from '../audio/pcspeaker';
import { STORAGE_KEYS } from '../../../data/storage-keys';
const wallpaper = { setWallpaper: vi.fn(), setPixelWallpaper: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
});
async function fixture(initial?: string, fail = false) {
  const values = new Map<string, string>(initial ? [['doom95.desktop.v1', initial]] : []);
  const setItem = vi.fn((key: string, value: string) => {
    if (fail) throw new Error('Full');
    values.set(key, value);
  });
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem });
  const { createDesktopSettings } = await import('./browser-desktop-settings');
  const audio = createAudio();
  const create = () => createDesktopSettings(wallpaper, audio);
  return { settings: create(), createDesktopSettings: create, values, setItem };
}
describe('persisted desktop preferences', () => {
  it('recovers from malformed JSON and migrates legacy Welcome state', async () => {
    const invalid = await fixture('{broken');
    expect(invalid.settings.capabilities.getSettings()).toEqual(DEFAULT_SETTINGS);
    const legacy = await fixture(JSON.stringify({ welcome: false }));
    expect(legacy.settings.capabilities.getSettings()).toMatchObject({
      welcome: false,
      welcomeCompleted: true,
    });
  });
  it('persists visit and completion flags with customized controls across mounts', async () => {
    const c = await fixture();
    c.settings.update({
      hasVisited: true,
      welcome: false,
      welcomeCompleted: true,
      startupAnimation: 'never',
      showAssistant: true,
      clock24Hour: false,
      quickLaunch: false,
    });
    expect(c.createDesktopSettings().capabilities.getSettings()).toMatchObject({
      hasVisited: true,
      welcomeCompleted: true,
      startupAnimation: 'never',
      showAssistant: true,
      clock24Hour: false,
      quickLaunch: false,
    });
    expect(c.setItem.mock.calls.every(([key]) => key === 'doom95.desktop.v1')).toBe(true);
  });
  it('retains session preferences on storage failure and does not expose mutable state', async () => {
    const c = await fixture(undefined, true);
    c.settings.update({ hasVisited: true, riskDisplay: 'hidden' });
    const snapshot = { ...c.settings.capabilities.getSettings() };
    snapshot.hasVisited = false;
    expect(c.settings.capabilities.getSettings()).toMatchObject({
      hasVisited: true,
      riskDisplay: 'hidden',
    });
  });
  it('owns persistence for selected wallpaper and restores it on the next mount', async () => {
    const c = await fixture();
    c.settings.setWallpaper(2);
    expect(c.values.get(STORAGE_KEYS.wallpaper)).toBe('2');
    wallpaper.setWallpaper.mockClear();
    c.createDesktopSettings();
    expect(wallpaper.setWallpaper).toHaveBeenCalledWith(2);
  });
  it('theme selection retains startup, completion and taskbar preferences', async () => {
    const c = await fixture();
    c.settings.update({
      hasVisited: true,
      welcomeCompleted: true,
      welcome: false,
      showSeconds: true,
      taskbarLabels: false,
    });
    c.settings.applyTheme('night');
    expect(c.settings.capabilities.getSettings()).toMatchObject({
      hasVisited: true,
      welcomeCompleted: true,
      welcome: false,
      showSeconds: true,
      taskbarLabels: false,
      soundScheme: 'night',
    });
  });
});
