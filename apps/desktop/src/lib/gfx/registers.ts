export const REGISTERS = {
  L0: {
    fonts: ['dos'],
    inks: [C.black, C.white, C.silver, C.gray, C.lime],
    frame: 'cp437',
    motion: 'step',
    sound: 'beep',
  },
  L1: {
    fonts: ['dos'],
    inks: [C.navy, C.aqua, C.yellow, C.white, C.black],
    frame: 'double',
    motion: 'step',
    sound: 'clack',
  },
  L2: {
    fonts: ['ui', 'bold'],
    inks: VGA_COLORS,
    frame: 'bevel',
    motion: 'outline',
    sound: 'system',
  },
  L3: {
    fonts: ['bold'],
    inks: VGA_COLORS,
    frame: 'mask',
    motion: 'whole-pixel',
    sound: 'chord',
  },
  L4: {
    fonts: ['ui'],
    inks: VGA_COLORS,
    frame: 'html',
    motion: 'marquee',
    sound: 'modem',
  },
} as const;
import type { RendererCore } from './context';
import { C, VGA_COLORS } from './palette';

export type Register = keyof typeof REGISTERS;

export function createRegisterDrawing(draw: Pick<RendererCore, 'rect' | 'line' | 'text' | 'tw'>) {
  const { rect, line, text, tw } = draw;

  /** CP437 boxes use explicit one-pixel strokes, even when a glyph is absent from a font. */
  function cp437(
    x: number,
    y: number,
    w: number,
    h: number,
    color: string = C.silver,
    double = false,
  ): void {
    const box = (inset: number) => {
      line(x + inset, y + inset, x + w - 1 - inset, y + inset, color);
      line(x + inset, y + h - 1 - inset, x + w - 1 - inset, y + h - 1 - inset, color);
      line(x + inset, y + inset, x + inset, y + h - 1 - inset, color);
      line(x + w - 1 - inset, y + inset, x + w - 1 - inset, y + h - 1 - inset, color);
    };
    box(0);
    if (double) box(2);
  }
  function l0Screen(w = 640, h = 360): void {
    rect(0, 0, w, h, C.black);
  }
  function l1Panel(x: number, y: number, w: number, h: number, title = ''): void {
    rect(x + 4, y + 4, w, h, C.black);
    rect(x, y, w, h, C.navy);
    cp437(x, y, w, h, C.aqua, true);
    if (title) {
      const label = ` ${title.toUpperCase()} `;
      rect(x + 10, y - 3, tw(label, 'dos'), 8, C.navy);
      text(label, x + 10, y - 3, { font: 'dos', color: C.yellow });
    }
  }
  return { cp437, l0Screen, l1Panel };
}
export type RegisterDrawing = ReturnType<typeof createRegisterDrawing>;
