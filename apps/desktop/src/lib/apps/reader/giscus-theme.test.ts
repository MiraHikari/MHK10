import { describe, expect, it } from 'vite-plus/test';
import { THEMES } from '../../gfx/palette';
import { commentThemeColors, giscusThemeCss, isDarkCommentCanvas } from './giscus-theme';

describe('GitHub Discussions theme', () => {
  it('maps the reader themes onto palette colours', () => {
    expect(commentThemeColors(THEMES.std, 'paper')).toMatchObject({
      background: '#ffffff',
      ink: '#000000',
      muted: '#000000',
      border: '#808080',
      link: '#000080',
      dark: false,
    });
    expect(commentThemeColors(THEMES.std, 'sepia')).toMatchObject({
      background: '#c0c0c0',
      ink: '#000000',
      dark: false,
    });
    expect(commentThemeColors(THEMES.std, 'night')).toMatchObject({
      background: '#008080',
      ink: '#ffffff',
      link: '#ffffff',
      dark: true,
    });
    expect(commentThemeColors(THEMES.std, 'contrast')).toMatchObject({
      background: '#000000',
      ink: '#ffffff',
      link: '#ffffff',
      dark: true,
    });
    expect(commentThemeColors(THEMES.std)).toMatchObject({
      background: '#ffffff',
      ink: '#000000',
    });
  });

  it('follows the desktop scheme without introducing new colours', () => {
    expect(commentThemeColors(THEMES.phosphor, 'paper')).toMatchObject({
      background: '#000000',
      ink: '#00ff00',
      link: '#00ff00',
      buttonFace: '#000000',
      buttonInk: '#00ff00',
      dark: true,
    });
    expect(commentThemeColors(THEMES.hotdog, 'paper')).toMatchObject({
      background: '#ffffff',
      ink: '#000000',
      buttonFace: '#ffff00',
      accent: '#000000',
      accentText: '#ffff00',
    });
  });

  it('styles the Giscus frame from the active palette', () => {
    const night = giscusThemeCss(commentThemeColors(THEMES.night, 'night'));
    expect(night).toContain('--color-canvas-default: #000080');
    expect(night).toContain('--color-fg-default: #ffffff');
    expect(night).toContain('color-scheme: dark');
    expect(night).toContain('border-radius: 0');
    expect(night).toContain('font-family: "MS Sans Serif", Tahoma, "Segoe UI", sans-serif');
    const paper = giscusThemeCss(commentThemeColors(THEMES.std, 'paper'));
    expect(paper).toContain('color-scheme: light');
    expect(paper).toContain('--color-accent-emphasis: #000080');
    expect(paper).toContain('--color-btn-bg: #c0c0c0');
  });

  it('reuses the canvas pointer art as themed frame cursors', () => {
    const css = giscusThemeCss(commentThemeColors(THEMES.std, 'paper'));
    expect(css).toContain('cursor: url("data:image/svg+xml,');
    expect(css).toContain(', default !important');
    expect(css).toContain(', text !important');
    expect(css).toContain(', wait !important');
    const decoded = [...css.matchAll(/data:image\/svg\+xml,([^"\s]+)/g)]
      .map((match) => decodeURIComponent(match[1]!))
      .join('\n');
    expect(decoded).toContain('fill="#000000"');
    expect(decoded).toContain('fill="#ffffff"');
    expect(decoded).toContain('M0 0h1v1h-1z');
    expect(decoded).toContain('viewBox="0 0 12 19"');
    expect(decoded).toContain('viewBox="0 0 7 16"');
  });

  it('classifies light and dark canvases from their channels', () => {
    expect(isDarkCommentCanvas('#000080')).toBe(true);
    expect(isDarkCommentCanvas('#000000')).toBe(true);
    expect(isDarkCommentCanvas('#008080')).toBe(true);
    expect(isDarkCommentCanvas('#c0c0c0')).toBe(false);
    expect(isDarkCommentCanvas('#ffff00')).toBe(false);
    expect(isDarkCommentCanvas('nonsense')).toBe(false);
  });

  it('keeps secondary text readable in every desktop and reading theme', () => {
    const luminance = (hex: string) => {
      const linear = [1, 3, 5].map((index) => {
        const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
    };
    for (const theme of Object.values(THEMES)) {
      for (const reading of ['paper', 'sepia', 'night', 'contrast'] as const) {
        const colors = commentThemeColors(theme, reading);
        for (const text of [colors.ink, colors.muted, colors.link]) {
          const a = luminance(colors.background);
          const b = luminance(text);
          expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});
