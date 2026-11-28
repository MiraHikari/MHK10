/**
 * 图片下载工具：优先通过 fetch + blob 触发浏览器下载；
 * 跨域 / CORS 失败时回退到新标签页打开。
 */

/** 从 URL 路径末段提取文件名并解码 */
function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split('/').pop();
    return last ? decodeURI(last) : '';
  } catch {
    return '';
  }
}

/**
 * 下载指定图片。
 *
 * @param url 图片完整 URL，支持同源或允许 CORS 的跨域地址。
 * @returns Promise 在下载触发后 resolve；失败时回退到 window.open。
 */
export async function downloadImage(url: string): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filenameFromUrl(url);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}
