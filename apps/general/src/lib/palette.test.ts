import { describe, expect, it } from 'vite-plus/test';
import { mixHex, shade, rotateHue, toHex, parseHex } from '@/lib/palette';

describe('palette', () => {
  describe('mixHex', () => {
    it('returns the source colour at t = 0', () => {
      expect(mixHex('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    });

    it('returns the destination colour at t = 1', () => {
      expect(mixHex('#ff0000', '#0000ff', 1)).toBe('#0000ff');
    });

    it('handles shorthand hex inputs', () => {
      expect(mixHex('#f00', '#00f', 0)).toBe('#ff0000');
      expect(mixHex('#f00', '#00f', 1)).toBe('#0000ff');
    });

    it('mixes two colours at the midpoint', () => {
      const mixed = mixHex('#ff0000', '#0000ff', 0.5);
      expect(mixed).not.toBe('#ff0000');
      expect(mixed).not.toBe('#0000ff');
      expect(mixed).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  describe('shade', () => {
    it('lightens towards white with positive amount', () => {
      const lightened = shade('#254378', 0.5);
      expect(lightened).not.toBe('#254378');
      expect(parseHex(lightened)[0]).toBeGreaterThan(parseHex('#254378')[0]);
    });

    it('darkens towards black with negative amount', () => {
      const darkened = shade('#254378', -0.5);
      expect(darkened).not.toBe('#254378');
      expect(parseHex(darkened)[0]).toBeLessThan(parseHex('#254378')[0]);
    });

    it('approaches black for full negative shade', () => {
      const [r, g, b] = parseHex(shade('#254378', -1));
      expect(r).toBeLessThan(0.02);
      expect(g).toBeLessThan(0.02);
      expect(b).toBeLessThan(0.02);
    });

    it('approaches white for full positive shade', () => {
      const [r, g, b] = parseHex(shade('#254378', 1));
      expect(r).toBeGreaterThan(0.85);
      expect(g).toBeGreaterThan(0.85);
      expect(b).toBeGreaterThan(0.85);
    });
  });

  describe('rotateHue', () => {
    it('returns the same colour for a 0° rotation', () => {
      expect(rotateHue('#254378', 0)).toBe('#254378');
    });

    it('returns the same colour for a 360° rotation', () => {
      expect(rotateHue('#254378', 360)).toBe('#254378');
    });

    it('rotates hue in the OKLCh plane', () => {
      const rotated = rotateHue('#ff0000', 120);
      expect(rotated).not.toBe('#ff0000');
      expect(rotated).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  describe('toHex / parseHex round-trip', () => {
    it('round-trips common sRGB colours', () => {
      const colors = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#254378'];
      for (const color of colors) {
        expect(toHex(parseHex(color))).toBe(color.toLowerCase());
      }
    });

    it('falls back to black for malformed hex', () => {
      expect(parseHex('not-a-color')).toEqual([0, 0, 0]);
    });
  });
});
