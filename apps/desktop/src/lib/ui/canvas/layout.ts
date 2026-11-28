export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const DLG = { margin: 12, row: 22, btnW: 66, btnH: 23, gap: 6, tabH: 23 } as const;
export function dialogRows(bounds: Bounds, count: number, top = DLG.margin): Bounds[] {
  return Array.from({ length: count }, (_, i) => ({
    x: bounds.x + DLG.margin,
    y: bounds.y + top + i * DLG.row,
    w: bounds.w - DLG.margin * 2,
    h: DLG.row,
  }));
}
export function buttonRow(bounds: Bounds, count: number): Bounds[] {
  const width = count * DLG.btnW + Math.max(0, count - 1) * DLG.gap;
  return Array.from({ length: count }, (_, i) => ({
    x: bounds.x + bounds.w - DLG.margin - width + i * (DLG.btnW + DLG.gap),
    y: bounds.y + bounds.h - DLG.margin - DLG.btnH,
    w: DLG.btnW,
    h: DLG.btnH,
  }));
}

/** One geometry result feeds popup rendering, hit testing and iframe occlusion. */
export function popupLayout(
  x: number,
  y: number,
  items: readonly string[],
  measure: (label: string) => number,
  screen = { w: 640, h: 360 },
) {
  const w = Math.min(
    screen.w,
    Math.max(
      0,
      ...items.map((item) =>
        item
          .replace(/^~|>$/g, '')
          .split('\t')
          .reduce((sum, part, i) => sum + measure(part) + (i ? 20 : 0), 0),
      ),
    ) + 44,
  );
  const h = 6 + items.reduce((height, item) => height + (item === '-' ? 8 : 18), 0);
  x = Math.max(0, Math.min(Math.round(x), screen.w - w));
  y = Math.max(0, Math.min(Math.round(y), screen.h - h));
  let top = y + 3;
  const rows = items.map((item) => {
    const row = { x: x + 3, y: top, w: w - 6, h: item === '-' ? 8 : 18, separator: item === '-' };
    top += row.h;
    return row;
  });
  return { x, y, w, h, rows };
}

export function windowClient(bounds: Bounds, menus: boolean, status: boolean): Bounds {
  const y = bounds.y + 22 + (menus ? 18 : 0);
  return {
    x: bounds.x + 3,
    y,
    w: bounds.w - 6,
    h: bounds.y + bounds.h - 3 - y - (status ? 19 : 0),
  };
}
