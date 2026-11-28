import { describe, expect, it } from 'vite-plus/test';
import { applyCursorScheme } from './cursor-scheme';

function sample(): Uint8ClampedArray {
  return new Uint8ClampedArray([0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 128, 255]);
}

describe('applyCursorScheme', () => {
  it('leaves the standard pointer and transparent pixels unchanged', () => {
    const pixels = sample();
    const before = pixels.slice();
    applyCursorScheme(pixels, 'arrow');
    expect(pixels).toEqual(before);
  });

  it('inverts opaque pointer colours and keeps transparency', () => {
    const pixels = sample();
    applyCursorScheme(pixels, 'inverted');
    expect(Array.from(pixels)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 127, 255,
    ]);
  });

  it('keeps only the green channel for the phosphor pointer', () => {
    const pixels = sample();
    applyCursorScheme(pixels, 'phosphor');
    expect(Array.from(pixels)).toEqual([0, 0, 0, 0, 0, 255, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
  });
});
