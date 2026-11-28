export interface PixelBitmap {
  width: number;
  height: number;
  pixels: number[];
}
export interface PixelPoint {
  x: number;
  y: number;
}
export type PixelTool = 'pencil' | 'fill' | 'line' | 'eraser';
export type PixelSaveResult =
  | { status: 'saved'; persisted: boolean }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

const MAX_WIDTH = 192;
const MAX_HEIGHT = 100;
const WHITE = 15;
const copy = (bitmap: PixelBitmap): PixelBitmap => ({ ...bitmap, pixels: [...bitmap.pixels] });
const encode = (bitmap: PixelBitmap): string =>
  JSON.stringify({
    format: 'MHK10-PIXEL',
    version: 1,
    width: bitmap.width,
    height: bitmap.height,
    pixels: bitmap.pixels.map((pixel) => pixel.toString(16)).join(''),
  });

export function parsePixelBitmap(content: string): PixelBitmap | null {
  if (content.length > 20000) return null;
  try {
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== 'object') return null;
    const data = value as Record<string, unknown>;
    const { width, height, pixels } = data;
    if (
      data.format !== 'MHK10-PIXEL' ||
      data.version !== 1 ||
      typeof width !== 'number' ||
      !Number.isInteger(width) ||
      width < 1 ||
      width > MAX_WIDTH ||
      typeof height !== 'number' ||
      !Number.isInteger(height) ||
      height < 1 ||
      height > MAX_HEIGHT ||
      typeof pixels !== 'string' ||
      pixels.length !== width * height ||
      !/^[0-9a-f]+$/.test(pixels)
    )
      return null;
    return { width, height, pixels: Array.from(pixels, (pixel) => Number.parseInt(pixel, 16)) };
  } catch {
    return null;
  }
}

/** A bitmap document. A gesture is one undo step; saving checkpoints only the captured image. */
export function createPixelDocument(width = MAX_WIDTH, height = MAX_HEIGHT) {
  if (
    !Number.isInteger(width) ||
    width < 1 ||
    width > MAX_WIDTH ||
    !Number.isInteger(height) ||
    height < 1 ||
    height > MAX_HEIGHT
  )
    throw new RangeError('Invalid image dimensions.');
  let bitmap: PixelBitmap = { width, height, pixels: Array<number>(width * height).fill(WHITE) };
  let saved = encode(bitmap);
  let revision = 0;
  let dirty = false;
  let gesture: PixelBitmap | null = null;
  let history: PixelBitmap[] = [];
  let saving = false;
  let disposed = false;
  let notice = '';
  const inside = ({ x, y }: PixelPoint) =>
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < bitmap.width &&
    y < bitmap.height;
  const remember = (before: PixelBitmap) => {
    if (encode(before) === encode(bitmap)) {
      dirty = encode(bitmap) !== saved;
      return false;
    }
    history = [...history.slice(-19), before];
    dirty = encode(bitmap) !== saved;
    return true;
  };
  const end = () => {
    if (!gesture) return false;
    const before = gesture;
    gesture = null;
    return remember(before);
  };
  const put = (x: number, y: number, color: number) => {
    if (!inside({ x, y })) return;
    const index = y * bitmap.width + x;
    if (bitmap.pixels[index] === color) return;
    bitmap.pixels[index] = color;
    revision++;
    dirty = true;
  };
  return {
    get: () => ({ ...copy(bitmap), dirty, revision, canUndo: history.length > 0, saving, notice }),
    begin() {
      if (!gesture && !disposed) gesture = copy(bitmap);
    },
    end,
    draw(tool: PixelTool, from: PixelPoint, to: PixelPoint, color: number) {
      if (
        disposed ||
        !inside(from) ||
        !inside(to) ||
        !Number.isInteger(color) ||
        color < 0 ||
        color > 15
      )
        return false;
      const standalone = !gesture;
      gesture ??= copy(bitmap);
      const previousRevision = revision;
      if (tool === 'fill') {
        const old = bitmap.pixels[from.y * bitmap.width + from.x];
        if (old !== color) {
          const stack = [from.y * bitmap.width + from.x];
          while (stack.length) {
            const index = stack.pop()!;
            if (bitmap.pixels[index] !== old) continue;
            const x = index % bitmap.width;
            const y = Math.floor(index / bitmap.width);
            put(x, y, color);
            if (x > 0) stack.push(index - 1);
            if (x < bitmap.width - 1) stack.push(index + 1);
            if (y > 0) stack.push(index - bitmap.width);
            if (y < bitmap.height - 1) stack.push(index + bitmap.width);
          }
        }
      } else {
        let { x, y } = from;
        const dx = Math.abs(to.x - x),
          dy = -Math.abs(to.y - y);
        const sx = x < to.x ? 1 : -1,
          sy = y < to.y ? 1 : -1;
        let error = dx + dy;
        for (;;) {
          if (tool === 'eraser') {
            for (let yy = y - 1; yy <= y + 1; yy++)
              for (let xx = x - 1; xx <= x + 1; xx++) put(xx, yy, WHITE);
          } else put(x, y, color);
          if (x === to.x && y === to.y) break;
          const twice = 2 * error;
          if (twice >= dy) {
            error += dy;
            x += sx;
          }
          if (twice <= dx) {
            error += dx;
            y += sy;
          }
        }
      }
      if (standalone) end();
      notice = '';
      return revision !== previousRevision;
    },
    undo() {
      end();
      const previous = history.pop();
      if (!previous || disposed) return false;
      bitmap = previous;
      revision++;
      dirty = encode(bitmap) !== saved;
      notice = '';
      return true;
    },
    clear() {
      if (disposed) return;
      end();
      const before = copy(bitmap);
      bitmap.pixels.fill(WHITE);
      if (remember(before)) revision++;
      notice = '';
    },
    improve() {
      if (disposed) return;
      end();
      const before = copy(bitmap);
      // AGI adds a one-pixel shadow without replacing any existing marks.
      for (let y = 0; y < bitmap.height - 1; y++)
        for (let x = 0; x < bitmap.width - 1; x++) {
          const index = y * bitmap.width + x;
          const shadow = index + bitmap.width + 1;
          if (before.pixels[index] !== WHITE && before.pixels[shadow] === WHITE)
            put(x + 1, y + 1, 8);
        }
      const changed = remember(before);
      notice = changed ? 'AGI.EXE added a shadow.' : 'AGI.EXE found no changes to make.';
    },
    load(content: string) {
      if (disposed || saving) return false;
      const loaded = parsePixelBitmap(content);
      if (!loaded) {
        notice = 'This file is not a valid PIXEL image.';
        return false;
      }
      bitmap = loaded;
      saved = encode(bitmap);
      gesture = null;
      history = [];
      dirty = false;
      revision++;
      notice = '';
      return true;
    },
    serialize: () => encode(bitmap),
    async save(writer: (content: string) => Promise<PixelSaveResult>): Promise<boolean> {
      if (saving || disposed) return false;
      end();
      saving = true;
      const content = encode(bitmap);
      try {
        const result = await writer(content);
        if (disposed) return false;
        if (result.status === 'saved' && result.persisted) {
          saved = content;
          dirty = encode(bitmap) !== saved;
          notice = dirty ? 'Image changed after saving.' : 'Saved.';
          return !dirty;
        }
        notice =
          result.status === 'failed'
            ? result.error
            : result.status === 'cancelled'
              ? 'Save cancelled.'
              : 'Image is a session copy. Export to keep it.';
        return false;
      } catch {
        if (!disposed) notice = 'The image could not be saved.';
        return false;
      } finally {
        saving = false;
      }
    },
    dispose() {
      disposed = true;
      history = [];
      gesture = null;
    },
  };
}
