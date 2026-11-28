import { DISPLAY_LONG_EDGE, WEBP_QUALITY, JPEG_QUALITY } from '@mhk/site-core/media/derivatives';
export { DISPLAY_LONG_EDGE };

/**
 * 等比缩放尺寸，使长边不超过目标值；若原图已更小则不放大。
 */
export function containSize(
  width: number,
  height: number,
  longEdge: number,
): { width: number; height: number } {
  const max = Math.max(width, height);

  if (max <= longEdge) {
    return { width, height };
  }

  const ratio = longEdge / max;

  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

export interface ImageDerivative {
  width: number;
  height: number;
  format: 'webp' | 'jpeg';
  display: Blob;
}

/**
 * 检测当前浏览器是否支持将 canvas 导出为 WebP。
 */
function supportsWebp(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  const canvas = document.createElement('canvas');
  return canvas.toDataURL('image/webp').startsWith('data:image/webp');
}

/**
 * 将 canvas.toBlob 包装为 Promise。
 */
function blobFromCanvas(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('canvas.toBlob 返回 null'));
        }
      },
      type,
      quality,
    );
  });
}

/**
 * 使用等比缩放渲染指定长边的图片 Blob。
 */
async function renderDerivative(
  bitmap: ImageBitmap,
  longEdge: number,
  format: 'webp' | 'jpeg',
): Promise<Blob> {
  const { width, height } = containSize(bitmap.width, bitmap.height, longEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法获取 canvas 2D 上下文');
  }

  ctx.drawImage(bitmap, 0, 0, width, height);

  const type = format === 'webp' ? 'image/webp' : 'image/jpeg';
  const quality = (format === 'webp' ? WEBP_QUALITY : JPEG_QUALITY) / 100;

  return blobFromCanvas(canvas, type, quality);
}

/**
 * 为上传的图片生成 display 派生图。
 * 优先使用 WebP；浏览器不支持时整体回退到 JPEG 0.85。
 * 用完后会关闭 ImageBitmap。
 */
export async function generateImageDerivative(file: Blob): Promise<ImageDerivative> {
  const bitmap = await createImageBitmap(file);

  try {
    const format = supportsWebp() ? 'webp' : 'jpeg';
    const display = await renderDerivative(bitmap, DISPLAY_LONG_EDGE, format);

    return {
      width: bitmap.width,
      height: bitmap.height,
      format,
      display,
    };
  } finally {
    bitmap.close();
  }
}
