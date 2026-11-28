import { STORAGE_KEYS } from '../../../data/storage-keys';
export const IMAGE_PRESENTATION_EVENT = 'mhk10:image-presentation';

export function pixelImagesEnabled(): boolean {
  return document.documentElement.dataset.imageStyle === 'pixel';
}

/** Adapts one document's images to the desktop preference; source URLs remain in markup. */
export function mountImagePresentation(): () => void {
  const root = document.documentElement;
  const lifetime = createLifetime();
  function readPreference(): void {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEYS.desktop) ?? '{}');
      const pixel =
        !!value &&
        typeof value === 'object' &&
        'pixelImages' in value &&
        value.pixelImages === true;
      root.dataset.imageStyle = pixel ? 'pixel' : 'original';
    } catch {
      root.dataset.imageStyle = 'original';
    }
  }
  if (!root.dataset.imageStyle) readPreference();
  function updateImages(): void {
    if (lifetime.disposed) return;
    const pixel = pixelImagesEnabled();
    for (const image of document.querySelectorAll<HTMLImageElement>('img[data-original-src]')) {
      const source = pixel
        ? image.dataset.pixelSrc || image.dataset.originalSrc
        : image.dataset.originalSrc;
      if (source && image.getAttribute('src') !== source) image.src = source;
      image.style.imageRendering = pixel ? 'pixelated' : 'auto';
    }
  }
  try {
    const preferences = new MutationObserver(() => {
      if (lifetime.disposed) return;
      updateImages();
      window.dispatchEvent(new Event(IMAGE_PRESENTATION_EVENT));
    });
    lifetime.defer(() => preferences.disconnect());
    preferences.observe(root, { attributes: true, attributeFilter: ['data-image-style'] });
    const additions = new MutationObserver(updateImages);
    lifetime.defer(() => additions.disconnect());
    additions.observe(document.body, { childList: true, subtree: true });
    lifetime.listen(window, 'storage', (event) => {
      if (event.key === STORAGE_KEYS.desktop || event.key === null) readPreference();
    });
    lifetime.listen(window, 'pagehide', (event) => {
      if (!event.persisted) lifetime.dispose();
    });
    updateImages();
    return lifetime.dispose;
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}
import { createLifetime } from './lifetime';
