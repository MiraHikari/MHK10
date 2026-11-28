/**
 * Enhance article images: lazy-loading attributes + click-to-open Lightbox.
 * Call after the article body is populated (React children or <template> innerHTML).
 *
 * 点击走容器级事件委托：监听挂在 container 上，命中时实时定位 img，因此正文
 * DOM 里的 img 节点被替换后监听依然有效（逐图绑定时节点的监听随替换永久丢失，
 * 表现为灯箱偶发打不开、刷新恢复）。逐图 attribute 增强（cursor / data-cursor /
 * loading / decoding）由 MutationObserver 兜底，替换进来的新节点同样补齐。
 *
 * 同一 container 的重复调用经 WeakMap 引用计数共享同一份监听与 observer：
 * 每个调用方拿到的 disposer 只减自己的引用，归零才真正解绑，不存在「第二个
 * 调用方拿到空 disposer、却被第一个调用方的 cleanup 误删监听」的问题。
 *
 * PhotoFigure（photo journal）在服务端写入的增强数据在此回读：
 * figcaption → 灯箱标题，data-full → FULL RES 下载原图，data-date → 拍摄时间。
 */
export interface ArticleImage {
  readonly src: string;
  readonly alt: string;
  /** 灯箱标题：figcaption 优先，回退 alt。 */
  readonly title?: string;
  /** 相机原图地址（PhotoFigure data-full），FULL RES 下载用。 */
  readonly downloadSrc?: string;
  /** 拍摄时间标签（PhotoFigure data-date），灯箱底栏显示。 */
  readonly dateLabel?: string;
}

function shouldSkipLightbox(img: HTMLImageElement): boolean {
  if (img.closest('a')) return true;
  const attrWidth = img.hasAttribute('width') ? Number(img.getAttribute('width')) : NaN;
  if (Number.isFinite(attrWidth) && attrWidth < 48) return true;
  if (img.complete && img.naturalWidth > 0 && img.naturalWidth < 48) return true;
  return false;
}

function toArticleImage(img: HTMLImageElement): ArticleImage {
  const caption = img.closest('figure')?.querySelector('figcaption')?.textContent?.trim();
  return {
    src: img.src,
    alt: img.alt,
    title: caption || img.alt || undefined,
    downloadSrc: img.dataset.full || undefined,
    dateLabel: img.dataset.date || undefined,
  };
}

/** 逐图 attribute 增强（幂等，dataset guard 保留）；只写 attribute，不会再触发 childList 观察。 */
function enhanceImageNode(img: HTMLImageElement): void {
  if (img.dataset.lightboxEnhanced) return;
  img.dataset.lightboxEnhanced = 'true';

  if (!img.hasAttribute('loading')) img.loading = 'lazy';
  if (!img.hasAttribute('decoding')) img.decoding = 'async';

  if (shouldSkipLightbox(img)) return;

  img.style.cursor = 'pointer';
  img.dataset.cursor = 'VIEW';
}

function enhanceAllImages(container: HTMLElement): void {
  container.querySelectorAll<HTMLImageElement>('.prose-mh img').forEach(enhanceImageNode);
}

function enhanceAddedNode(node: Node): void {
  if (!(node instanceof Element)) return;
  if (node instanceof HTMLImageElement && node.closest('.prose-mh')) {
    enhanceImageNode(node);
  }
  node.querySelectorAll<HTMLImageElement>('.prose-mh img').forEach(enhanceImageNode);
}

interface ContainerBinding {
  refs: number;
  dispose: () => void;
}

const containerBindings = new WeakMap<HTMLElement, ContainerBinding>();

function releaseBinding(container: HTMLElement): void {
  const binding = containerBindings.get(container);
  if (!binding) return;
  binding.refs -= 1;
  if (binding.refs <= 0) {
    binding.dispose();
    containerBindings.delete(container);
  }
}

export function enhanceArticleImages(
  container: HTMLElement,
  onOpen: (index: number, images: ArticleImage[]) => void,
): () => void {
  enhanceAllImages(container);

  const existing = containerBindings.get(container);
  if (existing) {
    existing.refs += 1;
    return () => releaseBinding(container);
  }

  const handleClick = (event: MouseEvent) => {
    const img = (event.target as Element | null)?.closest?.('img');
    if (!img || !container.contains(img)) return;
    if (!img.closest('.prose-mh') || shouldSkipLightbox(img)) return;

    // 点击时重算可灯箱图片列表，索引取自过滤后的列表，避免与跳过项错位。
    const enhanced = [...container.querySelectorAll<HTMLImageElement>('.prose-mh img')].filter(
      (current) => !shouldSkipLightbox(current),
    );
    onOpen(Math.max(0, enhanced.indexOf(img)), enhanced.map(toArticleImage));
  };

  container.addEventListener('click', handleClick);

  // img 节点被替换（正文重渲染等）后，补做新节点的逐图增强。
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) enhanceAddedNode(node);
    }
  });
  observer.observe(container, { childList: true, subtree: true });

  containerBindings.set(container, {
    refs: 1,
    dispose: () => {
      observer.disconnect();
      container.removeEventListener('click', handleClick);
    },
  });

  return () => releaseBinding(container);
}
