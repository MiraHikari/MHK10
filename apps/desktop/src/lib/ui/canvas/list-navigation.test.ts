import { describe, expect, it } from 'vite-plus/test';
import { moveList, revealList, stepIndex } from './list-navigation';

describe('list navigation', () => {
  it('moves by one row, pages, and pins Home and End', () => {
    const cursor = { count: 12, rows: 5, index: 1, top: 0 };
    expect(moveList(cursor, 'ArrowDown')).toEqual({ index: 2, top: 0 });
    expect(moveList(cursor, 'PageDown')).toEqual({ index: 6, top: 2 });
    expect(moveList({ ...cursor, index: 6, top: 2 }, 'End')).toEqual({ index: 11, top: 7 });
    expect(moveList({ count: 12, rows: 5, index: 11, top: 7 }, 'Home')).toEqual({
      index: 0,
      top: 0,
    });
    expect(moveList(cursor, 'Enter')).toBeNull();
  });

  it('keeps an empty list from selecting a row', () => {
    for (const key of ['Home', 'End', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'])
      expect(moveList({ count: 0, rows: 5, index: -1, top: 4 }, key)).toEqual({
        index: -1,
        top: 0,
      });
  });

  it('scrolls the selection into view', () => {
    expect(revealList(8, 0, 5)).toBe(4);
    expect(revealList(1, 4, 5)).toBe(1);
  });

  it('steps a grid index without passing either end', () => {
    expect(stepIndex(4, 0, -1)).toBe(0);
    expect(stepIndex(4, 3, 1)).toBe(3);
    expect(stepIndex(0, 0, 1)).toBe(0);
  });
});
