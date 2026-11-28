import { describe, expect, it, vi } from 'vite-plus/test';
import { createRenderer } from './context';
import { createThemeController } from './palette';
import { createFrameEffects } from './fx';
import { canvasFixture, makeTestCanvas } from './canvas-fixture';

function surface(width = 640, height = 360) {
  const fixture = canvasFixture(width, height);
  const theme = createThemeController();
  const draw = createRenderer(fixture.canvas, { theme, createCanvas: makeTestCanvas });
  return { ...fixture, theme, draw, effects: createFrameEffects(draw) };
}

describe('frame effects ownership', () => {
  it.each(['transform', 'invert'] as const)(
    'restores target state when %s drawing fails',
    (operation) => {
      const a = surface(),
        b = surface();
      if (operation === 'transform') {
        a.effects.FX.tilt = 0.2;
        a.context.drawImage.mockImplementationOnce(() => {
          throw new Error('effect draw failed');
        });
      } else {
        a.effects.FX.invert = true;
        a.context.fillRect.mockImplementationOnce(() => {
          throw new Error('effect draw failed');
        });
      }
      expect(() => a.effects.applyFX(1)).toThrow('effect draw failed');
      expect(a.context.save).toHaveBeenCalledOnce();
      expect(a.context.restore).toHaveBeenCalledOnce();
      a.effects.resetFX();
      expect(() => a.effects.applyFX(2)).not.toThrow();
      expect(() => b.effects.applyFX(2)).not.toThrow();
      a.effects.dispose();
      b.effects.dispose();
      a.draw.dispose();
      b.draw.dispose();
    },
  );
  it('rebuilds only its own WordArt after late font calibration', () => {
    const a = surface(),
      b = surface();
    const first = vi.spyOn(a.draw, 'textSource');
    const second = vi.spyOn(b.draw, 'textSource');
    const effectsA = createFrameEffects(a.draw),
      effectsB = createFrameEffects(b.draw);
    effectsA.wordart('MHK10', 320, 100, 3);
    effectsB.wordart('MHK10', 320, 100, 3);
    effectsA.wordart('MHK10', 320, 100, 3);
    expect(first).toHaveBeenCalledTimes(1);
    a.draw.fonts.initFonts();
    effectsA.wordart('MHK10', 320, 100, 3);
    effectsB.wordart('MHK10', 320, 100, 3);
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('keeps snapshots, dimensions, theme quantization and disposal local', () => {
    const a = surface(640, 360),
      b = surface(800, 450);
    a.effects.FX.shake = 2;
    expect(b.effects.FX).toEqual({});
    const one = a.effects.snap(),
      two = b.effects.snap();
    expect([one.width, one.height]).toEqual([640, 360]);
    expect([two.width, two.height]).toEqual([800, 450]);
    expect(one).not.toBe(two);
    a.theme.setTheme('phosphor');
    a.effects.applyFX(1);
    b.effects.FX.flash = ['#ffffff', 0.5];
    a.effects.dispose();
    a.draw.dispose();
    expect(() => b.effects.applyFX(2)).not.toThrow();
    expect(b.context.fillRect).toHaveBeenCalled();
    expect(b.draw.TH.cursorSet).toBe('arrow');
  });
});
