import { describe, expect, it } from 'vite-plus/test';
import { assistantPlacement } from './assistant-placement';

describe('assistantPlacement', () => {
  it('nestles into the bottom-right corner of the classic work area', () => {
    const place = assistantPlacement(640, 360 - 22);
    expect(place.scale).toBe(2);
    // Feet near the historic 588,326 corner within a few pixels.
    expect(place.x).toBeGreaterThan(580);
    expect(place.x).toBeLessThanOrEqual(640);
    expect(place.y).toBeLessThanOrEqual(360 - 22);
  });

  it('follows a larger desktop instead of staying pinned to 640x360', () => {
    const small = assistantPlacement(640, 338);
    const large = assistantPlacement(1280, 698);
    expect(large.x).toBeGreaterThan(small.x);
    expect(large.y).toBeGreaterThan(small.y);
  });

  it('keeps the hit box aligned under the drawn sprite footprint', () => {
    const place = assistantPlacement(1000, 600);
    const spriteHeight = 50 * place.scale;
    // Hit box spans the sprite vertically and is centred on the anchor.
    expect(place.hit.y).toBe(place.y - spriteHeight);
    expect(place.hit.h).toBe(spriteHeight);
    expect(place.hit.x + place.hit.w / 2).toBe(place.x);
    // And stays within the work area.
    expect(place.hit.x).toBeGreaterThanOrEqual(0);
    expect(place.hit.x + place.hit.w).toBeLessThanOrEqual(1000);
  });

  it.each([
    [640, 338],
    [960, 514],
    [1280, 698],
  ])('keeps the complete sprite clickable in a %ix%i work area', (width, height) => {
    const place = assistantPlacement(width, height);
    expect(place.hit.w).toBe(28 * place.scale);
    expect(place.hit.y).toBeGreaterThanOrEqual(0);
    expect(place.hit.x + place.hit.w).toBeLessThanOrEqual(width);
    expect(place.hit.y + place.hit.h).toBeLessThanOrEqual(height);
    expect(Object.values(place.hit).every(Number.isInteger)).toBe(true);
  });
});
