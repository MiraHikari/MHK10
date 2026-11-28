import { DESKTOP_IMAGE_PREFIX, createImageResolver } from '@mhk/site-core/media/image-path';
import type { MediaRecord } from '../../../data/media';

/** Pixel operations use bundled display renditions; original URLs remain download identities. */
export function imageProcessingSource(
  item: Pick<MediaRecord, 'original' | 'display' | 'preview' | 'local'>,
  imageBase = '',
): string {
  if (item.local) return item.original;
  const display = createImageResolver({
    localPrefix: DESKTOP_IMAGE_PREFIX,
    base: imageBase,
  }).local(item.display);
  return display.startsWith('/') && !display.startsWith('//') ? display : item.preview;
}
