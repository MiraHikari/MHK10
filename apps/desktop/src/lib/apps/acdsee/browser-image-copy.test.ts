import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { encodeImageCopy } from './browser-image-copy';
import { DEFAULT_IMAGE_ADJUSTMENTS } from './image-processing-model';

const edit = { rotation: 90, flipX: true, flipY: false, adjustments: DEFAULT_IMAGE_ADJUSTMENTS };
const pixels = new Uint8ClampedArray(24);
function fixture() {
  const bitmap = { width: 2, height: 3, close: vi.fn() };
  const context = {
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: pixels.slice() })),
    putImageData: vi.fn(),
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low',
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: vi.fn((callback: BlobCallback) => callback(new Blob(['PNG'], { type: 'image/png' }))),
  };
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Blob(['source']))),
  );
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap),
  );
  return { bitmap, canvas, context };
}

beforeEach(() => vi.useRealTimers());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('PNG image copy adapter', () => {
  it('draws the source with shared geometry and frees its bitmap and canvas', async () => {
    const current = fixture();
    const result = await encodeImageCopy('/source.png', edit);
    expect(result).toMatchObject({ status: 'encoded', width: 3, height: 2, scaled: false });
    expect(current.context.setTransform).toHaveBeenCalledWith(-0, -1, -1, 0, 3, 2);
    expect(current.context.drawImage).toHaveBeenCalledWith(current.bitmap, 0, 0, 2, 3);
    expect(current.bitmap.close).toHaveBeenCalledOnce();
    expect([current.canvas.width, current.canvas.height]).toEqual([0, 0]);
    expect(fetch).toHaveBeenCalledWith(
      '/source.png',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('reports source and encoder failures without retaining resources', async () => {
    const current = fixture();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    expect(await encodeImageCopy('/missing.png', edit)).toMatchObject({ status: 'failed' });
    expect(createImageBitmap).not.toHaveBeenCalled();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob(['source']))),
    );
    current.canvas.toBlob.mockImplementation((callback) => callback(null));
    expect(await encodeImageCopy('/source.png', edit)).toEqual({
      status: 'failed',
      error: 'The PNG copy could not be encoded.',
    });
    expect(current.bitmap.close).toHaveBeenCalledOnce();
    expect(current.canvas.width).toBe(0);
  });

  it('settles cancellation immediately and closes a decoder result that arrives later', async () => {
    const current = fixture();
    let finish: (value: typeof current.bitmap) => void = () => {};
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const controller = new AbortController();
    const result = encodeImageCopy('/source.png', edit, { signal: controller.signal });
    await vi.waitFor(() => expect(createImageBitmap).toHaveBeenCalledOnce());
    controller.abort();
    expect(await result).toEqual({ status: 'cancelled' });
    finish(current.bitmap);
    await Promise.resolve();
    expect(current.bitmap.close).toHaveBeenCalledOnce();
    expect(document.createElement).not.toHaveBeenCalled();
  });

  it('ignores late encoding after cancellation and remains usable for a later export', async () => {
    const current = fixture();
    let finish: BlobCallback = () => {};
    current.canvas.toBlob.mockImplementation((callback) => {
      finish = callback;
    });
    const controller = new AbortController();
    const result = encodeImageCopy('/source.png', edit, { signal: controller.signal });
    await vi.waitFor(() => expect(current.canvas.toBlob).toHaveBeenCalledOnce());
    controller.abort();
    expect(await result).toEqual({ status: 'cancelled' });
    finish(new Blob(['late PNG']));
    expect([current.canvas.width, current.canvas.height]).toEqual([0, 0]);
    current.canvas.toBlob.mockImplementation((callback) => callback(new Blob(['new PNG'])));
    expect(await encodeImageCopy('/source.png', edit)).toMatchObject({ status: 'encoded' });
  });

  it('does not start a cancelled operation and rejects oversize source metadata', async () => {
    fixture();
    const controller = new AbortController();
    controller.abort();
    expect(await encodeImageCopy('/source.png', edit, { signal: controller.signal })).toEqual({
      status: 'cancelled',
    });
    expect(fetch).not.toHaveBeenCalled();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('source', { headers: { 'content-length': String(33 * 1024 * 1024) } }),
      ),
    );
    expect(await encodeImageCopy('/source.png', edit)).toMatchObject({ status: 'failed' });
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('cancels an over-budget response stream without decoding or buffering the whole resource', async () => {
    fixture();
    const cancel = vi.fn();
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(33 * 1024 * 1024));
      },
      cancel,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(source)),
    );
    expect(await encodeImageCopy('/large.png', edit)).toEqual({
      status: 'failed',
      error: 'The source image exceeds the 32 MB export limit.',
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('cancels a response that is still waiting for source bytes', async () => {
    fixture();
    const cancel = vi.fn();
    const source = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(source)),
    );
    const controller = new AbortController();
    const result = encodeImageCopy('/slow.png', edit, { signal: controller.signal });
    await vi.waitFor(() => expect(source.locked).toBe(true));
    controller.abort();
    expect(await result).toEqual({ status: 'cancelled' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(source.locked).toBe(false);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
});
