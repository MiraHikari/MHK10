import { fontCss, type FontRasterizer } from '../../gfx/text';
import '../../../styles/cjk-pixel.css';
import type { createLifetime } from '../../ui/browser/lifetime';

/** Cancellation also settles a mount waiting on a font server that never responds. */
export async function prepareFonts(
  lifetime: ReturnType<typeof createLifetime>,
  fonts: FontRasterizer,
): Promise<boolean> {
  if (lifetime.disposed) return false;
  const initFonts = () => {
    if (!lifetime.disposed) fonts.initFonts();
  };
  // The host owns late font completion as well as initial loading, including remounts.
  document.fonts.addEventListener?.('loadingdone', initFonts);
  lifetime.defer(() => document.fonts.removeEventListener?.('loadingdone', initFonts));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.allSettled(fontCss.map((css) => document.fonts.load(css, 'Hg口'))),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 2500);
        lifetime.defer(() => {
          clearTimeout(timer);
          resolve();
        });
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  if (lifetime.disposed) return false;
  initFonts();
  return true;
}
