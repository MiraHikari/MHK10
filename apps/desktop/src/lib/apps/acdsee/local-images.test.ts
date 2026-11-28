import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { LocalImages } from './local-images';

function fixture() {
  const bitmaps: { width: number; height: number; close: ReturnType<typeof vi.fn> }[] = [];
  const canvases: { width: number; height: number; toBlob: ReturnType<typeof vi.fn> }[] = [];
  const decode = vi.fn(async () => {
    const bitmap = { width: 2, height: 3, close: vi.fn() };
    bitmaps.push(bitmap);
    return bitmap;
  });
  vi.stubGlobal('createImageBitmap', decode);
  vi.stubGlobal('document', {
    createElement: vi.fn(() => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          fillRect: vi.fn(),
          drawImage: vi.fn(),
          getImageData: () => ({ data: new Uint8ClampedArray(24) }),
          putImageData: vi.fn(),
        }),
        toBlob: vi.fn((callback: BlobCallback) => callback(new Blob(['PNG']))),
      };
      canvases.push(canvas);
      return canvas;
    }),
  });
  let id = 0;
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:local-${++id}`);
  const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  return { bitmaps, canvases, decode, createUrl, revokeUrl };
}

const file = (name: string) => new File(['source'], name, { type: 'image/png', lastModified: 0 });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LocalImages', () => {
  it('retains cumulative batches, tolerates unreadable files and releases every resource once', async () => {
    const current = fixture();
    const images = new LocalImages();
    const first = await images.open([file('first.png')]);
    current.decode.mockRejectedValueOnce(new Error('Unreadable'));
    const second = await images.open([file('bad.png'), file('second.png')]);
    expect(first).toMatchObject({ status: 'opened', total: 1, failures: 0 });
    expect(second).toMatchObject({ status: 'opened', total: 2, failures: 1 });
    if (first.status !== 'opened' || second.status !== 'opened')
      throw new Error('Expected opened batches');
    expect(first.records[0].id).not.toBe(second.records[0].id);
    expect(second.records[0]).toMatchObject({
      title: 'second.png',
      local: true,
      folders: ['Local files'],
      file: { width: 2, height: 3 },
    });
    expect(await images.open([])).toEqual({ status: 'cancelled' });
    expect(current.revokeUrl).not.toHaveBeenCalled();
    expect(current.bitmaps.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true);
    expect(current.canvases.map(({ width, height }) => [width, height])).toEqual([
      [0, 0],
      [0, 0],
    ]);
    images.dispose();
    images.dispose();
    expect(current.revokeUrl.mock.calls.flat()).toEqual(
      current.createUrl.mock.results.map((result) => result.value),
    );
    expect(await images.open([file('after.png')])).toEqual({ status: 'cancelled' });
  });

  it('settles a superseded decode immediately, closes its late bitmap and accepts the next batch', async () => {
    const current = fixture();
    let finish!: (value: Awaited<ReturnType<typeof current.decode>>) => void;
    current.decode.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const images = new LocalImages();
    const old = images.open([file('old.png')]);
    const next = images.open([file('new.png')]);
    expect(await old).toEqual({ status: 'cancelled' });
    expect(await next).toMatchObject({
      status: 'opened',
      total: 1,
      records: [{ title: 'new.png' }],
    });
    const late = { width: 2, height: 3, close: vi.fn() };
    finish(late);
    await Promise.resolve();
    expect(late.close).toHaveBeenCalledOnce();
    expect(current.createUrl).toHaveBeenCalledTimes(2);
    images.dispose();
  });

  it('rolls back an unaccepted partial batch on preview cancellation without dropping prior images', async () => {
    const current = fixture();
    const images = new LocalImages();
    expect(await images.open([file('retained.png')])).toMatchObject({ total: 1 });
    const create = vi.mocked(document.createElement);
    const originalCreate = create.getMockImplementation()!;
    let finish: BlobCallback | undefined;
    create.mockImplementation((...args) => {
      const canvas = originalCreate(...args);
      if (current.canvases.length === 3) {
        current.canvases[2].toBlob.mockImplementation((callback: BlobCallback) => {
          finish = callback;
        });
      }
      return canvas;
    });
    const pending = images.open([file('staged.png'), file('late-preview.png')]);
    await vi.waitFor(() => expect(finish).toBeDefined());
    images.cancel();
    expect(await pending).toEqual({ status: 'cancelled' });
    expect(current.revokeUrl.mock.calls.flat()).toEqual(['blob:local-3', 'blob:local-4']);
    finish!(new Blob(['late']));
    expect(await images.open([file('next.png')])).toMatchObject({ total: 2 });
    images.dispose();
    expect(current.revokeUrl).toHaveBeenCalledTimes(6);
    expect(current.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(
      true,
    );
  });

  it('rolls back a source URL if the preview URL cannot be created and allows retry', async () => {
    const current = fixture();
    const images = new LocalImages();
    current.createUrl.mockReturnValueOnce('blob:source').mockImplementationOnce(() => {
      throw new Error('URL unavailable');
    });
    expect(await images.open([file('broken.png')])).toMatchObject({
      status: 'opened',
      total: 0,
      failures: 1,
    });
    expect(current.revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:source');
    expect(await images.open([file('retry.png')])).toMatchObject({ total: 1, failures: 0 });
    images.dispose();
    expect(current.revokeUrl).toHaveBeenCalledTimes(3);
  });

  it('keeps different sessions independent when one is disposed during decoding', async () => {
    const current = fixture();
    const first = new LocalImages();
    const second = new LocalImages();
    await first.open([file('first.png')]);
    await second.open([file('second.png')]);
    let finish!: (value: Awaited<ReturnType<typeof current.decode>>) => void;
    current.decode.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = first.open([file('pending.png')]);
    first.dispose();
    expect(await pending).toEqual({ status: 'cancelled' });
    expect(current.revokeUrl.mock.calls.flat()).toEqual(['blob:local-1', 'blob:local-2']);
    const late = { width: 2, height: 3, close: vi.fn() };
    finish(late);
    await Promise.resolve();
    expect(late.close).toHaveBeenCalledOnce();
    expect(await second.open([file('still-usable.png')])).toMatchObject({ total: 2 });
    second.dispose();
    expect(current.revokeUrl).toHaveBeenCalledTimes(6);
  });
});
