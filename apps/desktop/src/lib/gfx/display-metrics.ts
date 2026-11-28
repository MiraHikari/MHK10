/** Logical pixels never change the font, palette or widget grid. */
export type ResolutionMode = 'auto' | 'classic';
export interface DisplaySize {
  width: number;
  height: number;
}
export interface DisplayMetrics extends DisplaySize {
  scale: number;
  cssWidth: number;
  cssHeight: number;
  mode: ResolutionMode;
  workArea: { x: number; y: number; w: number; h: number };
}
export const CLASSIC_SIZE: Readonly<DisplaySize> = { width: 640, height: 360 };
export const MAX_DESKTOP_SIZE: Readonly<DisplaySize> = { width: 1280, height: 720 };
export const TASKBAR_HEIGHT = 22;

export function displayMetrics(
  size: DisplaySize,
  scale = 1,
  mode: ResolutionMode = 'classic',
): DisplayMetrics {
  const width = Math.max(CLASSIC_SIZE.width, Math.round(size.width));
  const height = Math.max(CLASSIC_SIZE.height, Math.round(size.height));
  return {
    width,
    height,
    scale,
    cssWidth: width * scale,
    cssHeight: height * scale,
    mode,
    workArea: { x: 0, y: 0, w: width, h: height - TASKBAR_HEIGHT },
  };
}
