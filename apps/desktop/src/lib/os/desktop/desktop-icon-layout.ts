export interface IconPosition {
  id: string;
  x: number;
  y: number;
}
export const DESKTOP_ICON = { w: 84, h: 58, stepX: 90, stepY: 62, x: 2, y: 6 } as const;
export type DesktopIconArrangement = 'default' | 'name' | 'manual';

/** Legacy complete grids were also saved by marquee selection; recover their adaptive layout. */
export function desktopIconArrangement(
  value: unknown,
  defaultIds: readonly string[],
  namedIds: readonly string[] = defaultIds,
): DesktopIconArrangement {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1)
    return 'default';
  if ('arrangement' in value) {
    if (
      value.arrangement === 'default' ||
      value.arrangement === 'name' ||
      value.arrangement === 'manual'
    )
      return value.arrangement;
  }
  if (!('positions' in value) || !Array.isArray(value.positions) || !value.positions.length)
    return 'default';
  if (value.positions.length > 264) return 'manual';
  const positions = new Map<string, { x: number; y: number }>();
  const entries: readonly unknown[] = value.positions;
  for (const item of entries) {
    if (
      !item ||
      typeof item !== 'object' ||
      !('id' in item) ||
      typeof item.id !== 'string' ||
      !('x' in item) ||
      typeof item.x !== 'number' ||
      !Number.isFinite(item.x) ||
      !('y' in item) ||
      typeof item.y !== 'number' ||
      !Number.isFinite(item.y)
    )
      return 'manual';
    const id = defaultIds.includes(item.id) ? item.id : `desktop-file:desktop:app:${item.id}`;
    positions.set(id, { x: item.x, y: item.y });
  }
  const isGrid = (ids: readonly string[]) => {
    if (!ids.length || positions.size !== ids.length) return false;
    const rows =
      Math.max(
        ...[...positions.values()].map(({ y }) => (y - DESKTOP_ICON.y) / DESKTOP_ICON.stepY),
      ) + 1;
    return (
      Number.isInteger(rows) &&
      rows > 0 &&
      ids.every((id, index) => {
        const position = positions.get(id);
        return (
          position?.x === DESKTOP_ICON.x + Math.floor(index / rows) * DESKTOP_ICON.stepX &&
          position.y === DESKTOP_ICON.y + (index % rows) * DESKTOP_ICON.stepY
        );
      })
    );
  };
  return isGrid(defaultIds) ? 'default' : isGrid(namedIds) ? 'name' : 'manual';
}

export interface IconBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlaps = (a: IconBounds, b: IconBounds) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function desktopIconSlots(
  width: number,
  height: number,
  reserved: readonly IconBounds[] = [],
) {
  const rows = Math.max(
    0,
    Math.floor((height - DESKTOP_ICON.y - DESKTOP_ICON.h) / DESKTOP_ICON.stepY) + 1,
  );
  const columns = Math.max(
    0,
    Math.floor((width - DESKTOP_ICON.x - DESKTOP_ICON.w) / DESKTOP_ICON.stepX) + 1,
  );
  const slots: IconBounds[] = [];
  for (let column = 0; column < columns; column++)
    for (let row = 0; row < rows; row++) {
      const slot = {
        x: DESKTOP_ICON.x + column * DESKTOP_ICON.stepX,
        y: DESKTOP_ICON.y + row * DESKTOP_ICON.stepY,
        w: DESKTOP_ICON.w,
        h: DESKTOP_ICON.h,
      };
      if (!reserved.some((area) => overlaps(slot, area))) slots.push(slot);
    }
  return slots;
}

/** Overflow gets another page, never a partial or overlapping final column. */
export function desktopIconGrid(
  ids: readonly string[],
  width: number,
  height: number,
  page = 0,
  reserved: readonly IconBounds[] = [],
) {
  const slots = desktopIconSlots(width, height, reserved);
  return ids
    .slice(page * slots.length, (page + 1) * slots.length)
    .map((id, index) => ({ id, ...slots[index] }));
}

/** Reserve valid known positions before new defaults, while retaining the input order. */
export function reflowIconPositions<T extends IconPosition>(
  items: readonly T[],
  width: number,
  height: number,
  reserved: readonly IconBounds[] = [],
  knownPositions?: ReadonlyMap<string, Pick<IconPosition, 'x' | 'y'>>,
): T[] {
  const slots = desktopIconSlots(width, height, reserved);
  if (items.length > slots.length) throw new RangeError('Paginate desktop icons before reflow.');
  const occupied = [...reserved];
  const retained = new Map<number, IconBounds>();
  const placements = items.map((item, index) => ({
    item,
    index,
    known: knownPositions?.get(item.id),
  }));
  placements.sort((a, b) => Number(!!b.known) - Number(!!a.known));
  for (const { item, index, known } of placements) {
    const bounds = {
      ...item,
      x: Math.round(known?.x ?? item.x),
      y: Math.round(known?.y ?? item.y),
      w: 'w' in item && typeof item.w === 'number' ? item.w : DESKTOP_ICON.w,
      h: 'h' in item && typeof item.h === 'number' ? item.h : DESKTOP_ICON.h,
    };
    if (
      bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.x + bounds.w <= width &&
      bounds.y + bounds.h <= height &&
      !occupied.some((area) => overlaps(bounds, area))
    ) {
      retained.set(index, bounds);
      occupied.push(bounds);
    }
  }
  const result: T[] = [];
  for (const [index, item] of items.entries()) {
    const place =
      retained.get(index) ?? slots.find((slot) => !occupied.some((area) => overlaps(slot, area)));
    if (!place) return items.map((item, i) => ({ ...item, x: slots[i].x, y: slots[i].y }));
    if (!retained.has(index)) occupied.push(place);
    result.push({ ...item, x: place.x, y: place.y });
  }
  return result;
}
/** Stored positions are suggestions inside the current desktop, never arbitrary geometry. */
export function restoreIconPositions<T extends IconPosition>(
  value: unknown,
  defaults: readonly T[],
  width = 640,
  height = 338,
  reserved: readonly IconBounds[] = [],
): T[] {
  const positions = new Map<string, { x: number; y: number }>();
  if (
    value &&
    typeof value === 'object' &&
    'version' in value &&
    value.version === 1 &&
    'positions' in value &&
    Array.isArray(value.positions)
  ) {
    for (const item of value.positions.slice(0, 264)) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Record<string, unknown>;
      if (
        typeof entry.id === 'string' &&
        typeof entry.x === 'number' &&
        Number.isFinite(entry.x) &&
        typeof entry.y === 'number' &&
        Number.isFinite(entry.y)
      )
        positions.set(entry.id, {
          x: Math.max(0, Math.min(width - DESKTOP_ICON.w, Math.round(entry.x))),
          y: Math.max(0, Math.min(height - DESKTOP_ICON.h, Math.round(entry.y))),
        });
    }
  }
  const known = new Map<string, Pick<IconPosition, 'x' | 'y'>>();
  for (const item of defaults) {
    const position =
      positions.get(item.id) ?? positions.get(item.id.replace(/^desktop-file:desktop:app:/, ''));
    if (position) known.set(item.id, position);
  }
  return reflowIconPositions(defaults, width, height, reserved, known);
}
