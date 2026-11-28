import { describe, expect, it } from 'vite-plus/test';
import {
  C,
  VGA_COLORS,
  THEMES,
  THEME_NAMES,
  SOUND_SCHEMES,
  CURSOR_SETS,
  themeFor,
  createThemeController,
  themeCss,
} from './palette';

describe('explicit desktop palette and theme facts', () => {
  it('keeps the canonical VGA order immutable independently of semantic colour aliases', () => {
    expect(VGA_COLORS).toEqual([
      '#000000',
      '#800000',
      '#008000',
      '#808000',
      '#000080',
      '#800080',
      '#008080',
      '#c0c0c0',
      '#808080',
      '#ff0000',
      '#00ff00',
      '#ffff00',
      '#0000ff',
      '#ff00ff',
      '#00ffff',
      '#ffffff',
    ]);
    expect(Object.isFrozen(C)).toBe(true);
    expect(Object.isFrozen(VGA_COLORS)).toBe(true);
    expect(new Set(VGA_COLORS).size).toBe(16);
  });
  it('rejects inherited names and unknown themes through the public controller', () => {
    const controller = createThemeController('__proto__');
    expect(controller.current).toBe(THEMES.std);
    expect(controller.setTheme('night')).toBe(THEMES.night);
    for (const name of ['constructor', 'toString', '__proto__', 'unknown']) {
      expect(themeFor(name)).toBe(THEMES.std);
      expect(controller.setTheme(name)).toBe(THEMES.std);
    }
  });
  it('shares supported names between controls, settings and generated HTML theme CSS', () => {
    expect(Object.keys(THEMES)).toEqual(THEME_NAMES);
    for (const name of THEME_NAMES) {
      const theme = themeFor(name);
      expect(SOUND_SCHEMES).toContain(theme.soundScheme);
      expect(CURSOR_SETS).toContain(theme.cursorSet);
      expect(
        Object.values(theme.palette).every((color) => VGA_COLORS.some((vga) => vga === color)),
      ).toBe(true);
      expect(themeCss()).toContain(`:root[data-theme='${name}']`);
      expect(Object.isFrozen(theme.palette)).toBe(true);
    }
    expect(Object.isFrozen(THEMES)).toBe(true);
  });
});
