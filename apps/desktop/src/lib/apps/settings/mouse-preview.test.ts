import { describe, expect, it, vi, type Mock } from 'vite-plus/test';
import type { CanvasApp } from '../../os/host/app-contracts';
import {
  DEFAULT_SETTINGS,
  parseDesktopSettings,
  type DesktopSettings,
} from '../../os/desktop/desktop-settings';
import { appTestFixture } from '../testing/app-test-fixture';

async function fixture(initial: Partial<DesktopSettings> = {}) {
  let settings = parseDesktopSettings({ ...DEFAULT_SETTINGS, ...initial });
  const updateSettings = vi.fn((patch: Partial<DesktopSettings>) => {
    settings = parseDesktopSettings({ ...settings, ...patch });
  });
  const { mouseApp } = await import('./system-settings.app');
  const c = appTestFixture(mouseApp as CanvasApp, {
    desktop: {
      getSettings: () => ({ ...settings }),
      updateSettings,
      setPixelWallpaper: vi.fn(),
      printDocument: vi.fn(),
      previewSaver: vi.fn(),
    },
  });
  return { ...c, settings: () => settings, updateSettings };
}

function drawnSheets(drawImage: Mock) {
  return drawImage.mock.calls.filter((call) => (call[0] as { width?: number }).width === 36);
}

function rawPreviewArrows(drawImage: Mock) {
  return drawImage.mock.calls.filter(
    (call) => (call[0] as { width?: number }).width === 12 && call[1] === 244 && call[2] === 59,
  );
}

describe('Mouse shape preview', () => {
  it('redraws the preview for the chosen pointer scheme before Apply stores it', async () => {
    const c = await fixture();
    const drawImage = c.draw.getCtx().drawImage as unknown as Mock;
    drawImage.mockClear();
    c.frame();
    expect(rawPreviewArrows(drawImage).length).toBeGreaterThan(0);
    expect(drawnSheets(drawImage)).toEqual([]);

    c.click('Phosphor');
    drawImage.mockClear();
    c.frame();
    expect(drawnSheets(drawImage).length).toBeGreaterThanOrEqual(2);
    expect(rawPreviewArrows(drawImage)).toEqual([]);
    expect(c.updateSettings).not.toHaveBeenCalled();

    c.click('MHK10 Standard');
    drawImage.mockClear();
    c.frame();
    expect(rawPreviewArrows(drawImage).length).toBeGreaterThan(0);
    expect(drawnSheets(drawImage)).toEqual([]);

    c.click('Inverted');
    c.click('Apply');
    expect(c.updateSettings).toHaveBeenCalledWith({ cursorSet: 'inverted' });
    expect(c.settings().cursorSet).toBe('inverted');
  });
});
