import { vi } from 'vite-plus/test';

/** Minimal Canvas adapter exercising real raster/cache ownership without a browser. */
export function canvasFixture(width = 640, height = 360) {
  let pixels = new Uint8ClampedArray();
  const canvas = { width, height } as HTMLCanvasElement;
  const context = {
    canvas,
    imageSmoothingEnabled: true,
    fillStyle: '#000000',
    font: '',
    globalCompositeOperation: 'source-over',
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    createPattern: vi.fn(() => ({}) as CanvasPattern),
    measureText: vi.fn(() => ({ width: 12 })),
    fillText: vi.fn(),
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    putImageData: (data: ImageData) => {
      pixels = new Uint8ClampedArray(data.data);
    },
    getImageData: () => ({
      data: pixels.length ? pixels : new Uint8ClampedArray(canvas.width * canvas.height * 4),
      width: canvas.width,
      height: canvas.height,
    }),
  };
  canvas.getContext = (() => context) as unknown as HTMLCanvasElement['getContext'];
  return { canvas, context };
}

export const makeTestCanvas = () => canvasFixture().canvas;
