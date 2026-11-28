export interface ListCursor {
  index: number;
  top: number;
}

const LIST_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End']);

/** Keep the selected row inside the visible page after a keyboard move. */
export function revealList(index: number, top: number, rows: number): number {
  let next = Math.max(0, Math.min(top, index));
  if (index >= next + rows) next = index - rows + 1;
  return Math.max(0, next);
}

/**
 * Move a single-column list. Page size is the number of visible rows.
 * Home and End also pin the scroll origin to the ends of the list.
 */
export function moveList(
  cursor: ListCursor & { count: number; rows: number },
  key: string,
): ListCursor | null {
  if (!LIST_KEYS.has(key)) return null;
  const { count, rows } = cursor;
  if (count <= 0) return { index: -1, top: 0 };
  let index = cursor.index;
  if (key === 'ArrowDown') index = Math.min(count - 1, cursor.index + 1);
  else if (key === 'ArrowUp') index = Math.max(0, cursor.index - 1);
  else if (key === 'PageDown') index = Math.min(count - 1, cursor.index + rows);
  else if (key === 'PageUp') index = Math.max(0, cursor.index - rows);
  else if (key === 'Home') index = count ? 0 : -1;
  else index = count - 1;
  const top =
    key === 'Home'
      ? 0
      : key === 'End'
        ? Math.max(0, count - rows)
        : revealList(index, cursor.top, rows);
  return { index, top };
}

/** Step a linear or grid index without moving past either end. */
export function stepIndex(count: number, index: number, delta: number): number {
  return Math.max(0, Math.min(count - 1, index + delta));
}
