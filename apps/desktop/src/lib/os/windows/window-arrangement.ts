import type { WindowBounds } from './resize';
import type { WinState } from './wm';

export type WindowArrangement = 'cascade' | 'horizontal' | 'vertical';

/** Keep legacy app minimums intact even when a requested tile must overlap its neighbour. */
export function arrangeWindows(
  windows: WinState[],
  mode: WindowArrangement,
  width: number,
  height: number,
): WindowBounds[] {
  return windows.map((win, index) => {
    const fixed = win.resizable === false || !(win.ctl ?? 'mx').includes('m');
    const columns = mode === 'vertical' ? windows.length : 1;
    const rows = mode === 'horizontal' ? windows.length : 1;
    const desiredW = mode === 'cascade' ? Math.round(width * 0.75) : Math.floor(width / columns);
    const desiredH = mode === 'cascade' ? Math.round(height * 0.75) : Math.floor(height / rows);
    const w = fixed ? win.w : Math.max(win.minW ?? win.w, desiredW);
    const h = fixed ? win.h : Math.max(win.minH ?? win.h, desiredH);
    const offset =
      mode === 'cascade'
        ? (index % Math.max(1, Math.floor(Math.min(width - w, height - h) / 22) + 1)) * 22
        : 0;
    const x = mode === 'vertical' ? Math.floor((index * width) / columns) : offset;
    const y = mode === 'horizontal' ? Math.floor((index * height) / rows) : offset;
    return {
      x: Math.max(0, Math.min(x, width - w)),
      y: Math.max(0, Math.min(y, height - h)),
      w,
      h,
    };
  });
}
