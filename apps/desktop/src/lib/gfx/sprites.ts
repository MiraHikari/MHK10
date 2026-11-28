import type { DrawingTarget } from './context';
import { PAL } from './palette';
import { R } from './primitives';
import { DESKTOP_ICONS } from './desktop-icons';
import { CURSOR_ART } from './cursor-art';
import { REACT95_ICONS } from './react95-icon-data';

export function createSprites(target: DrawingTarget) {
  const { getCtx, createCanvas } = target;

  const _spr: Record<string, HTMLCanvasElement> = {};
  const artwork = new Map<string, { art: string; pal: Record<string, string> }>();
  let disposed = false;
  const selectedSprites = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();

  function defSprite(name: string, art: string, pal: Record<string, string> = PAL): void {
    if (disposed) throw new Error('Sprite renderer is disposed');
    artwork.set(name, { art, pal: { ...pal } });
    delete _spr[name];
  }
  function raster(name: string): HTMLCanvasElement | undefined {
    if (disposed) throw new Error('Sprite renderer is disposed');
    if (_spr[name]) return _spr[name];
    const definition = artwork.get(name);
    if (!definition) return;
    const { art, pal } = definition;
    const rows = art
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean);
    const c = createCanvas();
    c.width = Math.max(...rows.map((r) => r.length));
    c.height = rows.length;
    const g = c.getContext('2d')!;
    rows.forEach((r, y) =>
      [...r].forEach((ch, x) => {
        if (pal[ch]) {
          g.fillStyle = pal[ch];
          g.fillRect(x, y, 1, 1);
        }
      }),
    );
    _spr[name] = c;
    return c;
  }

  function spr(name: string, x: number, y: number, s = 1, flip = false): void {
    const c = raster(name);
    if (!c) throw new Error('no sprite: ' + name);
    const ctx = getCtx();
    if (!flip) return void ctx.drawImage(c, R(x), R(y), c.width * s, c.height * s);
    ctx.save();
    try {
      ctx.translate(R(x) + c.width * s, R(y));
      ctx.scale(-1, 1);
      ctx.drawImage(c, 0, 0, c.width * s, c.height * s);
    } finally {
      ctx.restore();
    }
  }

  /** Desktop icons have native 32px detail; captions keep the original 16px art. */
  function sprDesktop(name: string, x: number, y: number, selectionColor?: string): void {
    const key = name.replace(/^i_/, '');
    const desktopName = `desktop_${key}`;
    if (!artwork.has(desktopName) && DESKTOP_ICONS[key]) defSprite(desktopName, DESKTOP_ICONS[key]);
    const source = raster(desktopName) ?? raster(name);
    if (!source) throw new Error('no sprite: ' + name);
    if (!selectionColor) {
      getCtx().drawImage(source, R(x), R(y), 32, 32);
      return;
    }
    let colors = selectedSprites.get(source);
    if (!colors) {
      colors = new Map();
      selectedSprites.set(source, colors);
    }
    let selected = colors.get(selectionColor);
    if (!selected) {
      selected = createCanvas();
      selected.width = selected.height = 32;
      const ctx = selected.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(source, 0, 0, 32, 32);
      // Win95 selected icons use a colour checker over opaque pixels, preserving the silhouette.
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = selectionColor;
      for (let row = 0; row < 32; row++) {
        for (let column = row % 2; column < 32; column += 2) ctx.fillRect(column, row, 1, 1);
      }
      ctx.globalCompositeOperation = 'source-over';
      colors.set(selectionColor, selected);
    }
    getCtx().drawImage(selected, R(x), R(y));
  }

  function hasSprite(name: string): boolean {
    if (disposed) throw new Error('Sprite renderer is disposed');
    return Boolean(_spr[name]) || artwork.has(name);
  }

  const spriteSize = (name: string): [number, number] => {
    const c = raster(name);
    if (!c) throw new Error('no sprite: ' + name);
    return [c.width, c.height];
  };

  // ---------- the desktop, pointer and assistant art (from ui.js) ----------
  for (const [name, art] of Object.entries(REACT95_ICONS)) defSprite(`i_${name}`, art.small);

  defSprite('arrow', CURSOR_ART.arrow);
  defSprite('wait', CURSOR_ART.wait);
  defSprite('ibeam', CURSOR_ART.ibeam);
  defSprite(
    'star',
    `
...o...
...Y...
..oYo..
oYYWYYo
..oYo..
...Y...
...o...`,
  );
  return {
    defSprite,
    hasSprite,
    spr,
    sprDesktop,
    spriteSize,
    dispose() {
      if (disposed) return;
      disposed = true;
      artwork.clear();
      for (const name of Object.keys(_spr)) delete _spr[name];
    },
  };
}
export type Sprites = ReturnType<typeof createSprites>;
