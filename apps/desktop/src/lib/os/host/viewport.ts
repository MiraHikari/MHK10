import {
  CLASSIC_SIZE,
  MAX_DESKTOP_SIZE,
  displayMetrics,
  type DisplayMetrics,
  type DisplaySize,
  type ResolutionMode,
} from '../../gfx/display-metrics';

export type DesktopZoom = 'fit' | 'actual' | 'double';

/**
 * Auto mode never expands the logical workspace below this zoom: the desktop's
 * 11px UI is unreadable at scale 1, so a 1024-wide screen keeps a smaller
 * workspace at 1.5× instead of a 1024×720 one at 1×.
 */
const MIN_READABLE_SCALE = 1.5;

export function desktopScale(
  width: number,
  height: number,
  pixelScale: boolean,
  zoom: DesktopZoom = 'fit',
  logical: DisplaySize = CLASSIC_SIZE,
  devicePixelRatio = 1,
): number {
  const fit = Math.max(0.05, Math.min(width / logical.width, height / logical.height));
  if (zoom === 'actual') return 1;
  if (zoom === 'double') return 2;
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  if (!pixelScale || fit < 1) return fit;
  const snapped = Math.max(1, Math.floor(fit * ratio) / ratio);
  // Whole-pixel snapping is the default, but a 1.6× desktop snapped down to 1×
  // makes the 11px UI unreadable. Keep the fractional fit when it clears the
  // floor; above 2× snapping still applies.
  if (snapped < MIN_READABLE_SCALE && fit >= MIN_READABLE_SCALE) return fit;
  return snapped;
}

export interface DisplayViewport {
  width: number;
  height: number;
  mode: ResolutionMode;
  pixelScale: boolean;
  zoom?: DesktopZoom;
  devicePixelRatio?: number;
  coarsePointer?: boolean;
}

/** Bounded, aligned workspaces use available room without shrinking the original pixel grid. */
export function chooseDisplayMetrics(viewport: DisplayViewport): DisplayMetrics {
  const width = Number.isFinite(viewport.width) ? Math.max(1, viewport.width) : CLASSIC_SIZE.width;
  const height = Number.isFinite(viewport.height)
    ? Math.max(1, viewport.height)
    : CLASSIC_SIZE.height;
  const ratio =
    Number.isFinite(viewport.devicePixelRatio) && viewport.devicePixelRatio! > 0
      ? viewport.devicePixelRatio!
      : 1;
  let logical: DisplaySize = { ...CLASSIC_SIZE };
  if (
    viewport.mode === 'auto' &&
    !(viewport.coarsePointer && width < 1024) &&
    width >= CLASSIC_SIZE.width &&
    height >= CLASSIC_SIZE.height
  ) {
    const fit = Math.min(width / CLASSIC_SIZE.width, height / CLASSIC_SIZE.height);
    const deviceScale = Math.min(Math.floor(fit * ratio), Math.max(1, Math.floor(2 * ratio)));
    // Only spend monitor space when it buys a whole 2× desktop. From 1024px up
    // the 640×360 surface simply scales (1.6×) instead of becoming 1024×720 at
    // 1×, where the 11px UI is too small to read. Smaller windows keep the
    // existing adaptive work area.
    if (deviceScale >= 2 || width < 1024) {
      const scale = deviceScale / ratio;
      logical = {
        width: Math.max(
          CLASSIC_SIZE.width,
          Math.min(MAX_DESKTOP_SIZE.width, Math.floor(width / scale / 16) * 16),
        ),
        height: Math.max(
          CLASSIC_SIZE.height,
          Math.min(MAX_DESKTOP_SIZE.height, Math.floor(height / scale / 8) * 8),
        ),
      };
    }
  }
  return displayMetrics(
    logical,
    desktopScale(width, height, viewport.pixelScale, viewport.zoom, logical, ratio),
    viewport.mode,
  );
}
