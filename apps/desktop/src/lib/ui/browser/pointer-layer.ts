import { createRenderer } from '../../gfx/context';
import { createWidgetScope } from '../canvas/widgets';
import { createInputController } from '../canvas/input';
import { createLifetime } from './lifetime';
import type { CursorKind } from '../canvas/input';
import { applyCursorScheme } from '../../gfx/cursor-scheme';
import type { CursorSet } from '../../gfx/palette';

/** The pointer belongs above both the desktop raster and native app clients.
 * A separate transparent raster lets its whole sprite cross an iframe edge. */
export function createPointerLayer(screen: HTMLCanvasElement) {
  const lifetime = createLifetime();
  try {
    const parent = screen.parentElement!;
    if (getComputedStyle(parent).position === 'static') {
      const original = parent.style.position;
      parent.style.position = 'relative';
      lifetime.defer(() => {
        parent.style.position = original;
      });
    }
    const canvas = document.createElement('canvas');
    lifetime.defer(() => canvas.remove());
    canvas.width = screen.width || 640;
    canvas.height = screen.height || 360;
    canvas.className = 'desktop-pointer-layer';
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'absolute',
      pointerEvents: 'none',
      imageRendering: 'pixelated',
      zIndex: '999998',
      cursor: 'none',
    });
    // 光标重着色要读回像素：显式声明 CPU 侧读回，避免 Chrome 首次
    // getImageData 时把整块画布降级并打印性能警告。
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.imageSmoothingEnabled = false;
    const renderer = createRenderer(canvas);
    lifetime.defer(renderer.dispose);
    const input = createInputController();
    lifetime.defer(input.dispose);
    const widgets = createWidgetScope(renderer, input);
    lifetime.defer(widgets.dispose);
    parent.append(canvas);
    let painted = '';

    function draw(
      x: number,
      y: number,
      kind: CursorKind,
      visible: boolean,
      seconds = 0,
      reducedMotion = false,
      scheme: CursorSet = 'arrow',
    ): void {
      if (lifetime.disposed) return;
      const width = screen.width || 640,
        height = screen.height || 360;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        context.imageSmoothingEnabled = false;
        renderer.setDisplayMetrics({
          ...renderer.getDisplayMetrics(),
          width,
          height,
          cssWidth: width,
          cssHeight: height,
          workArea: { x: 0, y: 0, w: width, h: height },
        });
      }
      const bounds = screen.getBoundingClientRect();
      const ix = Math.floor(x),
        iy = Math.floor(y);
      const sample = [
        ix,
        iy,
        kind,
        visible,
        scheme,
        reducedMotion,
        width,
        height,
        screen.offsetLeft,
        screen.offsetTop,
        bounds.width,
        bounds.height,
      ].join(':');
      if (sample === painted) return;
      canvas.style.left = `${screen.offsetLeft}px`;
      canvas.style.top = `${screen.offsetTop}px`;
      canvas.style.width = `${bounds.width}px`;
      canvas.style.height = `${bounds.height}px`;
      if (canvas.style.cursor !== 'none') canvas.style.cursor = 'none';
      context.clearRect(0, 0, width, height);
      if (!visible || x < 0 || y < 0 || x >= width || y >= height) {
        painted = sample;
        return;
      }
      context.save();
      try {
        widgets.cursor(ix, iy, kind, seconds, reducedMotion);
        if (scheme !== 'arrow') {
          const left = Math.max(0, Math.floor(x) - 10),
            top = Math.max(0, Math.floor(y) - 12);
          const pixels = context.getImageData(
            left,
            top,
            Math.min(36, width - left),
            Math.min(36, height - top),
          );
          applyCursorScheme(pixels.data, scheme);
          context.putImageData(pixels, left, top);
        }
        painted = sample;
      } finally {
        context.restore();
      }
    }

    return { draw, dispose: lifetime.dispose };
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}
