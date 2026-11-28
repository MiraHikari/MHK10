import {
  applyImageAdjustments,
  hasImageAdjustments,
  planImageCopy,
  type ImageCopyLimits,
  type ImageCopyPlan,
  type ImageEdit,
} from './image-processing-model';

export type ImageCopyResult =
  | { status: 'encoded'; blob: Blob; width: number; height: number; scaled: boolean }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

/** Preview and PNG export use the same geometry and pixel operations. The caller owns the canvas. */
export function paintImageCopy(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  width: number,
  height: number,
  edit: ImageEdit,
  limits?: ImageCopyLimits,
): ImageCopyPlan {
  const plan = planImageCopy(width, height, edit, limits);
  canvas.width = plan.width;
  canvas.height = plan.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Image processing is unavailable.');
  context.clearRect(0, 0, plan.width, plan.height);
  context.setTransform(...plan.matrix);
  context.imageSmoothingEnabled = plan.scaled;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, plan.drawWidth, plan.drawHeight);
  context.resetTransform();
  if (hasImageAdjustments(edit.adjustments)) {
    const pixels = context.getImageData(0, 0, plan.width, plan.height);
    applyImageAdjustments(pixels.data, edit.adjustments);
    context.putImageData(pixels, 0, 0);
  }
  return plan;
}

/** Cancellation settles immediately; a late resource is released by its acquiring owner. */
export function awaitImageOperation<T>(
  pending: Promise<T>,
  signal: AbortSignal,
  releaseLate?: (value: T) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      reject(new DOMException('Image copy cancelled.', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    pending.then(
      (value) => {
        if (settled) {
          releaseLate?.(value);
          return;
        }
        settled = true;
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

const SOURCE_SIZE_ERROR = 'The source image exceeds the 32 MB export limit.';

async function readImageSource(
  response: Response,
  maximumBytes: number,
  signal: AbortSignal,
): Promise<Blob> {
  if (!response.body) return new Blob();
  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await awaitImageOperation(reader.read(), signal);
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maximumBytes) throw new Error(SOURCE_SIZE_ERROR);
      chunks.push(part.value);
    }
    return new Blob(chunks, { type: response.headers.get('content-type') ?? '' });
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Reads the original resource, creates a bounded PNG copy, and never writes to its source. */
export async function encodeImageCopy(
  source: string,
  edit: ImageEdit,
  options: ImageCopyLimits & { signal?: AbortSignal } = {},
): Promise<ImageCopyResult> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    cancel();
  }, 30_000);
  let bitmap: ImageBitmap | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    controller.signal.throwIfAborted();
    const response = await fetch(source, { signal: controller.signal, credentials: 'same-origin' });
    if (!response.ok) return { status: 'failed', error: 'The original image could not be read.' };
    const maximumBytes = 32 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > maximumBytes) {
      void response.body?.cancel().catch(() => {});
      return { status: 'failed', error: SOURCE_SIZE_ERROR };
    }
    const sourceBlob = await readImageSource(response, maximumBytes, controller.signal);
    if (!sourceBlob.size || sourceBlob.size > maximumBytes)
      return {
        status: 'failed',
        error: 'The source image is empty or exceeds the 32 MB export limit.',
      };
    bitmap = await awaitImageOperation(createImageBitmap(sourceBlob), controller.signal, (late) =>
      late.close(),
    );
    if (bitmap.width * bitmap.height > 64_000_000)
      return { status: 'failed', error: 'The original image is too large to process safely.' };
    controller.signal.throwIfAborted();
    canvas = document.createElement('canvas');
    const plan = paintImageCopy(canvas, bitmap, bitmap.width, bitmap.height, edit, options);
    bitmap.close();
    bitmap = undefined;
    const output = canvas;
    const blob = await awaitImageOperation(
      new Promise<Blob>((resolve, reject) => {
        output.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error('The PNG copy could not be encoded.')),
          'image/png',
        );
      }),
      controller.signal,
    );
    controller.signal.throwIfAborted();
    return { status: 'encoded', blob, width: plan.width, height: plan.height, scaled: plan.scaled };
  } catch (error) {
    if (timedOut) return { status: 'failed', error: 'Image export timed out. Please try again.' };
    if (controller.signal.aborted) return { status: 'cancelled' };
    return {
      status: 'failed',
      error:
        error instanceof Error &&
        [SOURCE_SIZE_ERROR, 'The PNG copy could not be encoded.'].includes(error.message)
          ? error.message
          : 'The image copy could not be created. Try another image.',
    };
  } finally {
    clearTimeout(timeout);
    controller.abort();
    options.signal?.removeEventListener('abort', cancel);
    bitmap?.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
