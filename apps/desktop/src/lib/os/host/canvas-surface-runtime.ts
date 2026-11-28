import { createRenderer, type RendererOptions } from '../../gfx/context';
import { createFrameEffects } from '../../gfx/fx';
import { createWidgetScope } from '../../ui/canvas/widgets';
import { createInputController } from '../../ui/canvas/input';
import { createAudio } from '../audio/pcspeaker';
import { createLifetime } from '../../ui/browser/lifetime';

/** A surface owns every mutable raster, input and audio resource from acquisition. */
export function createCanvasSurfaceRuntime(
  canvas: HTMLCanvasElement,
  options: RendererOptions = {},
) {
  const lifetime = createLifetime();
  try {
    const draw = createRenderer(canvas, options);
    lifetime.defer(draw.dispose);
    const input = createInputController();
    lifetime.defer(input.dispose);
    const effects = createFrameEffects(draw);
    lifetime.defer(effects.dispose);
    const audio = createAudio();
    lifetime.defer(audio.dispose);
    const widgets = createWidgetScope(draw, input, input.now);
    lifetime.defer(widgets.dispose);
    return { draw, input, effects, audio, widgets, dispose: lifetime.dispose };
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}
export type CanvasSurfaceRuntime = ReturnType<typeof createCanvasSurfaceRuntime>;
