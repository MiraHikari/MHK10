import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { encodeImageCopy, type ImageCopyResult } from './browser-image-copy';
import { ImageBrowser } from './image-browser-model';
import { ImageExport } from './image-export';
import type { MediaRecord } from '../../../data/media';

vi.mock('./browser-image-copy', () => ({ encodeImageCopy: vi.fn() }));
const encoded: ImageCopyResult = {
  status: 'encoded',
  blob: new Blob(['PNG']),
  width: 2,
  height: 3,
  scaled: false,
};
const record: MediaRecord = {
  id: 'first',
  title: 'Photo.png',
  alt: 'Photo',
  original: '/photo.png',
  display: '/display.png',
  preview: '/preview.png',
  date: '',
  folders: ['Photos'],
  image: { width: 2, height: 3, bytes: 3, format: 'PNG' },
};
function fixture() {
  const links: {
    href: string;
    download: string;
    click: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  }[] = [];
  vi.stubGlobal('document', {
    createElement: vi.fn(() => {
      const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
      links.push(link);
      return link;
    }),
  });
  let id = 0;
  const createUrl = vi
    .spyOn(URL, 'createObjectURL')
    .mockImplementation(() => `blob:export-${++id}`);
  const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.mocked(encodeImageCopy).mockResolvedValue(encoded);
  const root = { append: vi.fn() } as unknown as HTMLElement;
  const model = new ImageBrowser([record]);
  const exporter = new ImageExport(root, (request) => model.isCurrentCopy(request));
  return { exporter, model, root, links, createUrl, revokeUrl };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(encodeImageCopy).mockReset();
  vi.useRealTimers();
});

describe('ImageExport', () => {
  it('downloads a named copy, releases its link immediately and leases its URL once', async () => {
    vi.useFakeTimers();
    const current = fixture();
    expect(await current.exporter.start(current.model.copyRequest()!)).toEqual({
      status: 'downloaded',
      width: 2,
      height: 3,
      scaled: false,
    });
    expect(current.links[0].download).toBe('Photo-edited.png');
    expect(current.links[0].click).toHaveBeenCalledOnce();
    expect(current.links[0].remove).toHaveBeenCalledOnce();
    expect(current.exporter.busy).toBe(false);
    expect(current.revokeUrl).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(current.revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:export-1');
    current.exporter.dispose();
    current.exporter.dispose();
    expect(current.revokeUrl).toHaveBeenCalledOnce();
  });

  it('invalidates edited work, aborts the encoder and suppresses a late result while a new export proceeds', async () => {
    vi.useFakeTimers();
    const current = fixture();
    let finish!: (result: ImageCopyResult) => void;
    vi.mocked(encodeImageCopy).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = current.exporter.start(current.model.copyRequest()!);
    expect(current.exporter.busy).toBe(true);
    const signal = vi.mocked(encodeImageCopy).mock.calls[0][2]!.signal!;
    current.model.rotate();
    expect(current.exporter.cancelIfStale()).toBe(true);
    expect(signal.aborted).toBe(true);
    const next = current.exporter.start(current.model.copyRequest()!);
    finish(encoded);
    expect(await pending).toEqual({ status: 'superseded' });
    expect(await next).toMatchObject({ status: 'downloaded' });
    expect(current.links).toHaveLength(1);
    current.exporter.dispose();
    expect(current.revokeUrl).toHaveBeenCalledOnce();
  });

  it('rechecks the source on completion even without a render and keeps duplicate starts harmless', async () => {
    const current = fixture();
    let finish!: (result: ImageCopyResult) => void;
    vi.mocked(encodeImageCopy).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const request = current.model.copyRequest()!;
    const pending = current.exporter.start(request);
    expect(await current.exporter.start(request)).toEqual({ status: 'superseded' });
    current.model.adjust({ brightness: 10 });
    finish(encoded);
    expect(await pending).toEqual({ status: 'superseded' });
    expect(current.createUrl).not.toHaveBeenCalled();
    expect(current.exporter.busy).toBe(false);
    current.exporter.dispose();
  });

  it('reports encoding and download failures, releases acquired resources and supports retry', async () => {
    vi.useFakeTimers();
    const current = fixture();
    vi.mocked(encodeImageCopy).mockResolvedValueOnce({ status: 'failed', error: 'Cannot encode' });
    expect(await current.exporter.start(current.model.copyRequest()!)).toEqual({
      status: 'failed',
      error: 'Cannot encode',
    });
    vi.mocked(current.root.append).mockImplementationOnce(() => {
      throw new Error('Cannot append');
    });
    expect(await current.exporter.start(current.model.copyRequest()!)).toEqual({
      status: 'failed',
      error: 'The PNG download could not be started.',
    });
    expect(current.revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:export-1');
    expect(current.links[0].remove).toHaveBeenCalledOnce();
    expect(await current.exporter.start(current.model.copyRequest()!)).toMatchObject({
      status: 'downloaded',
    });
    current.exporter.dispose();
    expect(current.revokeUrl).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects post-disposal work and leaves a different exporter usable', async () => {
    vi.useFakeTimers();
    const current = fixture();
    const second = new ImageExport(current.root, (request) => current.model.isCurrentCopy(request));
    let finish!: (result: ImageCopyResult) => void;
    vi.mocked(encodeImageCopy).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = current.exporter.start(current.model.copyRequest()!);
    current.exporter.dispose();
    finish(encoded);
    expect(await pending).toEqual({ status: 'superseded' });
    expect(await current.exporter.start(current.model.copyRequest()!)).toEqual({
      status: 'superseded',
    });
    expect(await second.start(current.model.copyRequest()!)).toMatchObject({
      status: 'downloaded',
    });
    expect(current.links).toHaveLength(1);
    second.dispose();
    expect(current.revokeUrl).toHaveBeenCalledOnce();
  });
});
