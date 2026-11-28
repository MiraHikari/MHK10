import { describe, expect, it, vi } from 'vite-plus/test';
import { createRenderer } from './context';
import { createFontRasterizer } from './text';
import { createThemeController } from './palette';
import { canvasFixture, makeTestCanvas } from './canvas-fixture';
import { displayMetrics } from './display-metrics';

function surface(width = 640, height = 360) {
  const fixture = canvasFixture(width, height);
  const theme = createThemeController();
  const draw = createRenderer(fixture.canvas, { theme, createCanvas: makeTestCanvas });
  return { ...fixture, theme, draw };
}

describe('explicit rendering ownership', () => {
  it('restores the target after a transformed sprite draw fails', () => {
    const a = surface(),
      b = surface();
    a.context.drawImage.mockImplementationOnce(() => {
      throw new Error('sprite draw failed');
    });
    expect(() => a.draw.spr('arrow', 1, 2, 1, true)).toThrow('sprite draw failed');
    expect(a.context.save).toHaveBeenCalledOnce();
    expect(a.context.restore).toHaveBeenCalledOnce();
    expect(() => a.draw.spr('arrow', 3, 4)).not.toThrow();
    expect(() => b.draw.text('unaffected', 0, 0)).not.toThrow();
    a.draw.dispose();
    b.draw.dispose();
  });
  it('does not allocate sprite, font or pattern canvases at construction', () => {
    const createCanvas = vi.fn(makeTestCanvas);
    const { canvas } = canvasFixture();
    const draw = createRenderer(canvas, { createCanvas });
    expect(createCanvas).not.toHaveBeenCalled();
    expect(draw.hasSprite('arrow')).toBe(true);
    expect(draw.hasSprite('missing_sprite')).toBe(false);
    expect(createCanvas).not.toHaveBeenCalled();
    draw.tw('MHK10');
    expect(createCanvas).not.toHaveBeenCalled();
    draw.spr('arrow', 0, 0);
    const count = createCanvas.mock.calls.length;
    expect(count).toBe(1);
    draw.spr('arrow', 3, 4);
    expect(createCanvas).toHaveBeenCalledTimes(count);
    draw.dispose();
    expect(() => draw.hasSprite('arrow')).toThrow('disposed');
  });

  it('interleaves different sizes, themes, text and pattern caches', () => {
    const a = surface(),
      b = surface(800, 450);
    a.theme.setTheme('phosphor');
    a.draw.rect(1.4, 2.6, 3.4, 4.6, a.draw.TH.text);
    b.draw.rect(9, 8, 7, 6, b.draw.TH.text);
    a.draw.dither(0, 0, 10, 10, '#000000', '#ffffff');
    b.draw.dither(0, 0, 20, 20, '#000000', '#ffffff');
    a.draw.text('Hi', 0, 0);
    b.draw.text('Hi', 0, 0);
    expect(a.context.fillRect).toHaveBeenCalledWith(1, 3, 3, 5);
    expect(b.context.fillRect).toHaveBeenCalledWith(9, 8, 7, 6);
    expect([a.draw.W, a.draw.H, b.draw.W, b.draw.H]).toEqual([640, 360, 800, 450]);
    expect(a.draw.TH.text).toBe('#00ff00');
    expect(b.draw.TH.text).toBe('#000000');
    expect(a.context.createPattern).toHaveBeenCalledTimes(1);
    expect(b.context.createPattern).toHaveBeenCalledTimes(1);
    expect(a.context.drawImage.mock.calls[0][0]).not.toBe(b.context.drawImage.mock.calls[0][0]);
    a.draw.setDisplayMetrics(displayMetrics({ width: 960, height: 540 }));
    expect(b.draw.W).toBe(800);
    a.draw.dispose();
    a.draw.dispose();
    expect(() => a.draw.rect(0, 0, 1, 1, '#000000')).toThrow('disposed');
    expect(() => b.draw.text('still active', 0, 0)).not.toThrow();
  });

  it('binds nested offscreen draws explicitly and keeps siblings usable after failures', () => {
    const a = surface(),
      b = surface(800, 450);
    let nestedContext: CanvasRenderingContext2D | undefined;
    expect(() =>
      a.draw.offscreen(21, 13, (child) => {
        expect([child.W, child.H]).toEqual([21, 13]);
        child.rect(1, 2, 3, 4, '#ffffff');
        child.offscreen(5, 7, (nested) => {
          nestedContext = nested.getCtx();
          expect([nested.W, nested.H]).toEqual([5, 7]);
          a.draw.rect(10, 11, 12, 13, '#000000');
          b.draw.rect(20, 21, 22, 23, '#000000');
          nested.rect(30, 31, 32, 33, '#000000');
        });
        throw new Error('drawing failed');
      }),
    ).toThrow('drawing failed');
    expect(nestedContext?.fillRect).toHaveBeenCalledWith(30, 31, 32, 33);
    expect(a.context.fillRect).toHaveBeenCalledWith(10, 11, 12, 13);
    expect(b.context.fillRect).toHaveBeenCalledWith(20, 21, 22, 23);
    expect(() => a.draw.text('active', 0, 0)).not.toThrow();
    expect(() => b.draw.spr('arrow', 0, 0)).not.toThrow();
  });

  it('ignores late font completion after disposal and preserves another rasterizer', async () => {
    const a = createFontRasterizer(makeTestCanvas),
      b = createFontRasterizer(makeTestCanvas);
    const first = b.textSource('Hi');
    let complete: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const loading = ready.then(a.initFonts);
    a.dispose();
    complete();
    await loading;
    expect(a.fontRevision).toBe(0);
    expect(b.fontRevision).toBe(0);
    expect(b.textSource('Hi')).toBe(first);
    b.initFonts();
    expect(b.fontRevision).toBe(1);
    expect(b.textSource('Hi')).not.toBe(first);
  });

  it('rejects missing contexts without poisoning a second renderer or remount', () => {
    const broken = canvasFixture().canvas;
    broken.getContext = () => null;
    expect(() => createRenderer(broken)).toThrow('unavailable');
    const a = surface();
    a.draw.dispose();
    const remount = createRenderer(a.canvas, { createCanvas: makeTestCanvas });
    expect(() => remount.text('remounted', 0, 0)).not.toThrow();
  });
});
