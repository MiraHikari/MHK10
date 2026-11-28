import type { ImageCopyRequest } from './image-browser-model';
import { encodeImageCopy } from './browser-image-copy';

export type ImageExportResult =
  | { status: 'downloaded'; width: number; height: number; scaled: boolean }
  | { status: 'cancelled' }
  | { status: 'superseded' }
  | { status: 'failed'; error: string };

/** Owns one export generation, its cancellation, download link and leased URLs. */
export class ImageExport {
  private disposed = false;
  private job: { request: ImageCopyRequest; controller: AbortController } | undefined;
  private readonly downloads = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly root: HTMLElement,
    private readonly isCurrent: (request: ImageCopyRequest) => boolean,
  ) {}

  get busy(): boolean {
    return !!this.job;
  }

  /** Rechecks the model after commands; a late encoder result checks it again before download. */
  cancelIfStale(): boolean {
    return this.job && !this.isCurrent(this.job.request) ? this.cancel() : false;
  }

  cancel(): boolean {
    if (!this.job) return false;
    this.job.controller.abort();
    this.job = undefined;
    return true;
  }

  async start(request: ImageCopyRequest): Promise<ImageExportResult> {
    if (this.disposed || this.job || !this.isCurrent(request)) return { status: 'superseded' };
    const job = { request, controller: new AbortController() };
    this.job = job;
    try {
      const result = await encodeImageCopy(request.source, request.edit, {
        signal: job.controller.signal,
      });
      if (this.disposed || this.job !== job || !this.isCurrent(request))
        return { status: 'superseded' };
      if (result.status !== 'encoded') return result;
      let url: string | undefined;
      const link = document.createElement('a');
      try {
        url = URL.createObjectURL(result.blob);
        link.href = url;
        const title =
          Array.from(request.title.replace(/\.[^./\\]+$/, ''), (character) =>
            character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '-' : character,
          )
            .join('')
            .trim()
            .slice(0, 90) || 'image';
        link.download = `${title}-edited.png`;
        this.root.append(link);
        link.click();
        const ownedUrl = url;
        this.downloads.set(
          ownedUrl,
          setTimeout(() => {
            this.downloads.delete(ownedUrl);
            URL.revokeObjectURL(ownedUrl);
          }, 30_000),
        );
        return {
          status: 'downloaded',
          width: result.width,
          height: result.height,
          scaled: result.scaled,
        };
      } catch {
        if (url) URL.revokeObjectURL(url);
        return { status: 'failed', error: 'The PNG download could not be started.' };
      } finally {
        link.remove();
      }
    } catch {
      return { status: 'failed', error: 'The image copy could not be created. Try another image.' };
    } finally {
      if (this.job === job) this.job = undefined;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    for (const [url, timeout] of this.downloads) {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
    }
    this.downloads.clear();
  }
}
