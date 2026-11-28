import { describe, expect, it } from 'vite-plus/test';
import { appTestFixture } from '../testing/app-test-fixture';
import { displayApp } from './display.app';

describe('Display applies only edited preferences', () => {
  it('leaves a wallpaper and theme changed elsewhere intact when Apply has no edits', () => {
    const c = appTestFixture(displayApp);
    c.env.wallpaper.setWallpaper(3);
    c.env.setTheme('night');
    c.click('Apply');
    expect(c.env.wallpaper.getWallpaper()).toBe(3);
    expect(c.env.themeName()).toBe('night');
  });

  it('applies a selected wallpaper once and leaves the next external change intact', () => {
    const c = appTestFixture(displayApp);
    c.click('Background');
    c.click('Neon skyline');
    c.click('Apply');
    expect(c.env.wallpaper.getWallpaper()).toBe(2);
    c.env.wallpaper.setWallpaper(3);
    c.click('Apply');
    expect(c.env.wallpaper.getWallpaper()).toBe(3);
  });
});
