import type { MediaRecord } from '../../../data/media';
import { awaitImageOperation } from './browser-image-copy';
import { applyImagePalette } from './image-processing-model';

export type LocalImageResult =
  | { status: 'opened'; records: readonly MediaRecord[]; total: number; failures: number }
  | { status: 'cancelled' };

/** 本地日历日 YYYY-MM-DD；`toISOString()` 在非 UTC 时区的深夜会给出前一天。 */
const LOCAL_DATE = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Retains every accepted local batch and owns its source/preview URLs until disposal.
 * A new nonempty batch cancels unaccepted work; cancellation never removes earlier images.
 */
export class LocalImages {
  private disposed = false;
  private nextId = 0;
  private active: AbortController | undefined;
  private readonly retained: MediaRecord[] = [];
  private readonly urls = new Set<string>();

  async open(files: readonly File[]): Promise<LocalImageResult> {
    if (this.disposed || !files.length) return { status: 'cancelled' };
    this.cancel();
    const controller = new AbortController();
    this.active = controller;
    const added: MediaRecord[] = [];
    const acquired = new Set<string>();
    let failures = 0;
    try {
      for (const file of files) {
        controller.signal.throwIfAborted();
        let bitmap: ImageBitmap | undefined;
        let output: HTMLCanvasElement | undefined;
        const fileUrls: string[] = [];
        try {
          bitmap = await awaitImageOperation(createImageBitmap(file), controller.signal, (late) =>
            late.close(),
          );
          controller.signal.throwIfAborted();
          const ratio = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height));
          output = document.createElement('canvas');
          output.width = Math.max(1, Math.round(bitmap.width * ratio));
          output.height = Math.max(1, Math.round(bitmap.height * ratio));
          // 仅用作调色板量化的读回画布：声明 willReadFrequently。
          const context = output.getContext('2d', { willReadFrequently: true });
          if (!context) throw new Error('Image context unavailable');
          context.fillStyle = '#fff';
          context.fillRect(0, 0, output.width, output.height);
          context.drawImage(bitmap, 0, 0, output.width, output.height);
          const imageInfo: MediaRecord['image'] = {
            width: bitmap.width,
            height: bitmap.height,
            bytes: file.size,
            format: file.type.replace('image/', '').toUpperCase() || 'IMAGE',
          };
          bitmap.close();
          bitmap = undefined;
          const pixels = context.getImageData(0, 0, output.width, output.height);
          applyImagePalette(pixels.data, output.width);
          context.putImageData(pixels, 0, 0);
          const canvas = output;
          const blob = await awaitImageOperation(
            new Promise<Blob>((resolve, reject) => {
              canvas.toBlob(
                (blob) => (blob ? resolve(blob) : reject(new Error('Image preview unavailable'))),
                'image/png',
              );
            }),
            controller.signal,
          );
          controller.signal.throwIfAborted();
          const original = URL.createObjectURL(file);
          fileUrls.push(original);
          const preview = URL.createObjectURL(blob);
          fileUrls.push(preview);
          added.push({
            id: `local-${++this.nextId}`,
            title: file.name,
            alt: file.name,
            preview,
            display: original,
            original,
            date: LOCAL_DATE.format(new Date(file.lastModified)),
            folders: ['Local files'],
            image: { width: output.width, height: output.height, bytes: blob.size, format: 'PNG' },
            file: imageInfo,
            local: true,
          });
          for (const url of fileUrls) acquired.add(url);
        } catch {
          for (const url of fileUrls) URL.revokeObjectURL(url);
          if (controller.signal.aborted) return { status: 'cancelled' };
          failures++;
        } finally {
          bitmap?.close();
          if (output) {
            output.width = 0;
            output.height = 0;
          }
        }
      }
      controller.signal.throwIfAborted();
      this.retained.push(...added);
      for (const url of acquired) this.urls.add(url);
      acquired.clear();
      return { status: 'opened', records: added, total: this.retained.length, failures };
    } catch {
      return { status: 'cancelled' };
    } finally {
      for (const url of acquired) URL.revokeObjectURL(url);
      if (this.active === controller) this.active = undefined;
    }
  }

  cancel(): void {
    this.active?.abort();
    this.active = undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
    this.retained.length = 0;
  }
}
