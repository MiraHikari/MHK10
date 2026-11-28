import { describe, expect, it, vi } from 'vite-plus/test';
import type { CanvasApp } from '../../os/host/app-contracts';
import {
  DEFAULT_SETTINGS,
  parseDesktopSettings,
  type DesktopSettings,
} from '../../os/desktop/desktop-settings';
import { appTestFixture } from '../testing/app-test-fixture';
async function fixture(app: CanvasApp, initial: Partial<DesktopSettings> = {}) {
  let settings = parseDesktopSettings({ ...DEFAULT_SETTINGS, ...initial });
  const updateSettings = vi.fn((patch: Partial<DesktopSettings>) => {
    settings = parseDesktopSettings({ ...settings, ...patch });
  });
  const c = appTestFixture(
    app,
    {
      desktop: {
        getSettings: () => ({ ...settings }),
        updateSettings,
        setPixelWallpaper: vi.fn(),
        printDocument: vi.fn(),
        previewSaver: vi.fn(),
      },
      setTheme: vi.fn(),
    },
    { x: 0, y: 0, w: 374, h: 252 },
  );
  return { ...c, settings: () => settings, updateSettings };
}

describe('Welcome completion', () => {
  it('keeps the optional introduction finite and only Finish marks completion', async () => {
    const { welcomeApp } = await import('../welcome/welcome.app');
    const c = await fixture(welcomeApp);
    c.click('Next');
    c.click('Next');
    c.click('Next');
    c.click('Next');
    expect(c.session.status()).toBe('Introduction 4 of 4');
    expect(c.updateSettings).not.toHaveBeenCalled();
    c.click('Finish');
    expect(c.settings()).toMatchObject({ welcome: false, welcomeCompleted: true });
    expect(c.env.close).toHaveBeenCalledWith('welcome');
  });
  it('dismissing the window leaves the optional introduction incomplete', async () => {
    const { welcomeApp } = await import('../welcome/welcome.app');
    const c = await fixture(welcomeApp);
    c.session.dispose();
    expect(c.settings().welcomeCompleted).toBe(false);
    expect(c.updateSettings).not.toHaveBeenCalled();
  });
});
describe('preference transactions', () => {
  it('keeps pending edits private until Apply and preserves concurrent settings', async () => {
    const { taskbarSettingsApp } = await import('../display/display.app');
    const c = await fixture(taskbarSettingsApp);
    c.click('Show Quick Launch');
    expect(c.settings().quickLaunch).toBe(true);
    c.updateSettings({ volume: 0.2, hasVisited: true });
    c.click('Apply');
    expect(c.settings()).toMatchObject({ quickLaunch: false, volume: 0.2, hasVisited: true });
    c.click('Show application names');
    c.click('Cancel');
    expect(c.settings().taskbarLabels).toBe(true);
  });
  it('restores only the selected preference group and retains completion', async () => {
    const { taskbarSettingsApp } = await import('../display/display.app');
    const c = await fixture(taskbarSettingsApp, {
      quickLaunch: false,
      windowAnimations: false,
      startupAnimation: 'never',
      welcome: false,
      welcomeCompleted: true,
      hasVisited: true,
    });
    c.click('Restore defaults');
    c.click('Apply');
    expect(c.settings()).toMatchObject({
      quickLaunch: true,
      windowAnimations: false,
      startupAnimation: 'never',
      welcomeCompleted: true,
      hasVisited: true,
    });
    c.click('Startup');
    c.click('Restore defaults');
    c.click('Apply');
    expect(c.settings()).toMatchObject({
      startupAnimation: 'first-visit',
      welcomeCompleted: true,
      welcome: false,
    });
    c.click('Show introduction at startup');
    c.click('Apply');
    expect(c.settings()).toMatchObject({ welcomeCompleted: false, welcome: true });
  });
  it('cancels a Sounds selection and applies a later selection explicitly', async () => {
    const { soundsApp } = await import('./system-settings.app');
    const c = await fixture(soundsApp);
    c.click('Singularity Night');
    c.click('Cancel');
    expect(c.settings().soundScheme).toBe('standard');
    const applied = await fixture(soundsApp);
    applied.click('Singularity Night');
    applied.click('Apply');
    expect(applied.settings().soundScheme).toBe('night');
  });
  it('rejects component confirmations after a story reset or window disposal', async () => {
    const { componentsApp } = await import('./system-settings.app');
    const c = await fixture(componentsApp);
    c.env.story.dispatch('investigate');
    c.env.story.dispatch('audit');
    c.click('Install...');
    const old = vi.mocked(c.env.msg).mock.calls.at(-1)![0];
    c.env.story.reset();
    c.env.story.dispatch('investigate');
    c.env.story.dispatch('audit');
    old.onBtn?.(0, c.env);
    expect(c.env.story.get().ending).toBeNull();
    c.click('Install...');
    const disposed = vi.mocked(c.env.msg).mock.calls.at(-1)![0];
    c.session.dispose();
    disposed.onBtn?.(0, c.env);
    expect(c.env.story.get().ending).toBeNull();
  });
});
