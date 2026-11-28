import {
  CLASSIC_SIZE,
  displayMetrics,
  TASKBAR_HEIGHT,
  type DisplayMetrics,
} from './display-metrics';
import { createThemeController, type ThemeController, type Theme } from './palette';
import { createPrimitives, type Primitives } from './primitives';
import { createFontRasterizer, type FontRasterizer, type TextOpts } from './text';
import { createSprites, type Sprites } from './sprites';
import { createAppIcons } from './app-icons';
import { createWallpaper, type WallpaperDrawing } from './wallpaper';
import { createSaverDrawing, type SaverDrawing } from './savers';
import { createRegisterDrawing, type RegisterDrawing } from './registers';

export const FPS = 60;
function ownMetrics(metrics: DisplayMetrics): DisplayMetrics {
  return Object.freeze({ ...metrics, workArea: Object.freeze({ ...metrics.workArea }) });
}
function targetMetrics(width: number, height: number): DisplayMetrics {
  return {
    ...displayMetrics({ width, height }),
    width,
    height,
    cssWidth: width,
    cssHeight: height,
    workArea: { x: 0, y: 0, w: width, h: Math.max(0, height - TASKBAR_HEIGHT) },
  };
}

/** A drawing target never changes identity, including inside nested offscreen work. */
export interface DrawingTarget {
  getCtx(): CanvasRenderingContext2D;
  createCanvas(): HTMLCanvasElement;
}

type FontMeasurements = Pick<
  FontRasterizer,
  'tw' | 'capH' | 'fitText' | 'textSource' | 'fontTop' | 'fontCap'
>;
export type RendererCore = DrawingTarget &
  Omit<Primitives, 'dispose'> &
  FontMeasurements &
  Omit<Sprites, 'dispose'> & {
    readonly W: number;
    readonly H: number;
    readonly TH: Readonly<Theme>;
    readonly theme: ThemeController;
    readonly fonts: FontRasterizer;
    text(str: string | number, x: number, y: number, options?: TextOpts): number;
    getDisplayMetrics(): Readonly<DisplayMetrics>;
    setDisplayMetrics(metrics: DisplayMetrics): void;
    registerAppIcons(): void;
    offscreen(width: number, height: number, draw: (renderer: Renderer) => void): HTMLCanvasElement;
    dispose(): void;
  };

export type Renderer = RendererCore &
  Omit<WallpaperDrawing, 'dispose'> &
  SaverDrawing &
  RegisterDrawing;

export interface RendererOptions {
  theme?: ThemeController;
  fonts?: FontRasterizer;
  metrics?: DisplayMetrics;
  createCanvas?: () => HTMLCanvasElement;
}

/** Owns the target and raster caches. Disposing never clears the caller's canvas. */
export function createRenderer(canvas: HTMLCanvasElement, options: RendererOptions = {}): Renderer {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable');
  context.imageSmoothingEnabled = false;
  const makeCanvas =
    options.createCanvas ?? (() => (canvas.ownerDocument ?? document).createElement('canvas'));
  const theme = options.theme ?? createThemeController();
  const fonts = options.fonts ?? createFontRasterizer(makeCanvas);
  let display = ownMetrics(
    options.metrics ??
      targetMetrics(canvas.width || CLASSIC_SIZE.width, canvas.height || CLASSIC_SIZE.height),
  );
  let disposed = false;
  const assertActive = () => {
    if (disposed) throw new Error('Renderer is disposed');
  };
  const target: DrawingTarget = {
    getCtx: () => {
      assertActive();
      return context;
    },
    createCanvas: () => {
      assertActive();
      return makeCanvas();
    },
  };
  const primitives = createPrimitives(target);
  const sprites = createSprites(target);
  const registerAppIcons = createAppIcons(sprites);
  const base = {
    ...target,
    ...primitives,
    ...sprites,
    theme,
    fonts,
    get W() {
      return display.width;
    },
    get H() {
      return display.height;
    },
    get TH() {
      return theme.current;
    },
    tw: fonts.tw,
    capH: fonts.capH,
    fitText: fonts.fitText,
    textSource: fonts.textSource,
    fontTop: fonts.fontTop,
    fontCap: fonts.fontCap,
    text: (str: string | number, x: number, y: number, textOptions: TextOpts = {}) =>
      fonts.text(target.getCtx(), theme.current.text, str, x, y, textOptions),
    getDisplayMetrics: () => display,
    setDisplayMetrics(metrics: DisplayMetrics) {
      assertActive();
      display = ownMetrics(metrics);
    },
    registerAppIcons,
    offscreen(width: number, height: number, draw: (renderer: Renderer) => void) {
      const childCanvas = target.createCanvas();
      childCanvas.width = width;
      childCanvas.height = height;
      const child = createRenderer(childCanvas, {
        theme,
        fonts,
        createCanvas: target.createCanvas,
        metrics: targetMetrics(width, height),
      });
      try {
        draw(child);
      } finally {
        child.dispose();
      }
      return childCanvas;
    },
  };
  const wallpaper = createWallpaper(base);
  const result: Renderer = Object.assign(
    base,
    wallpaper,
    createSaverDrawing(base),
    createRegisterDrawing(base),
    {
      dispose() {
        if (disposed) return;
        disposed = true;
        primitives.dispose();
        sprites.dispose();
        wallpaper.dispose();
        if (!options.fonts) fonts.dispose();
      },
    },
  );
  registerAppIcons();
  return result;
}
