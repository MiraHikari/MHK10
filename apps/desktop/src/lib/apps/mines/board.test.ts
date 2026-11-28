// Unit tests for the Minesweeper board logic — pure, no DOM, no imports in the lib.
// Math.random drives mine placement, so these test properties over many random
// boards rather than fixed layouts.

import { describe, it, expect } from 'vite-plus/test';
import {
  createBoard,
  openCell,
  toggleFlag,
  flagsUsed,
  chordOpen,
  COLS,
  ROWS,
  MINES,
  idx,
} from './board';

const CELLS = COLS * ROWS;
const CENTER = idx(4, 4);

/** Test-side brute-force neighbour list (independent of the lib's private one). */
function neighbours(i: number): number[] {
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = Math.floor(i / COLS) + dr;
      const c = (i % COLS) + dc;
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) out.push(c + r * COLS);
    }
  }
  return out;
}

/** A fresh board that has been started with a safe first click at CENTER. */
function startedBoard() {
  const b = createBoard();
  openCell(b, CENTER);
  return b;
}

describe('createBoard', () => {
  it('creates COLS*ROWS cells, all hidden, no mines, not started', () => {
    const b = createBoard();
    expect(COLS).toBe(9);
    expect(ROWS).toBe(9);
    expect(CELLS).toBe(81);
    expect(b.state.length).toBe(CELLS);
    expect(b.state.every((s) => s === 'hidden')).toBe(true);
    expect(b.mines.every((m) => m === false)).toBe(true);
    expect(b.nums.every((n) => n === 0)).toBe(true);
    expect(b.started).toBe(false);
    expect(b.dead).toBe(false);
    expect(b.won).toBe(false);
  });
});

describe('first click', () => {
  it("is safe, opens a flood containing the whole 9-cell safe zone, and starts the game (returns 'opened')", () => {
    for (let n = 0; n < 25; n++) {
      const b = createBoard();
      const r = openCell(b, CENTER);
      // 'won' is impossible here: 10 mines on 81 cells means 71 cells must open.
      expect(r).toBe('opened');
      expect(b.started).toBe(true);
      expect(b.dead).toBe(false);
      expect(b.won).toBe(false);

      // the clicked cell and all 8 of its neighbours are never mines
      const zone = [CENTER, ...neighbours(CENTER)];
      expect(zone.length).toBe(9);
      for (const j of zone) expect(b.mines[j], `safe zone cell ${j}`).toBe(false);

      // the flood opens at least the whole safe zone
      for (const j of zone) expect(b.state[j], `safe zone cell ${j}`).toBe('open');
      expect(b.state.filter((s) => s === 'open').length).toBeGreaterThanOrEqual(9);

      // exactly MINES mines were placed
      expect(b.mines.filter(Boolean).length).toBe(MINES);
    }
  });

  it('opening an already-open cell is a no-op', () => {
    const b = startedBoard();
    expect(b.state[CENTER]).toBe('open');
    expect(openCell(b, CENTER)).toBe('nothing');
    expect(b.state[CENTER]).toBe('open');
  });
});

describe('neighbour counts', () => {
  it('nums[i] equals the brute-force adjacent-mine count for every cell', () => {
    for (let n = 0; n < 25; n++) {
      const b = startedBoard();
      for (let i = 0; i < CELLS; i++) {
        const want = neighbours(i).filter((j) => b.mines[j]).length;
        expect(b.nums[i], `nums[${i}] on board #${n}`).toBe(want);
      }
    }
  });
});

describe('toggleFlag', () => {
  it('cycles hidden -> flag -> hidden', () => {
    const b = startedBoard();
    const h = b.state.findIndex((s) => s === 'hidden');
    expect(h).toBeGreaterThanOrEqual(0);
    toggleFlag(b, h);
    expect(b.state[h]).toBe('flag');
    expect(flagsUsed(b)).toBe(1);
    toggleFlag(b, h);
    expect(b.state[h]).toBe('hidden');
    expect(flagsUsed(b)).toBe(0);
  });

  it('cannot flag an open cell', () => {
    const b = startedBoard();
    toggleFlag(b, CENTER); // CENTER was opened by the first click
    expect(b.state[CENTER]).toBe('open');
  });

  it('a flagged cell is protected from openCell', () => {
    const b = startedBoard();
    const h = b.state.findIndex((s) => s === 'hidden');
    toggleFlag(b, h);
    expect(openCell(b, h)).toBe('nothing');
    expect(b.state[h]).toBe('flag');
  });
});

describe('losing', () => {
  it("opening a mine returns 'boom', marks dead, and freezes the board", () => {
    for (let n = 0; n < 10; n++) {
      const b = startedBoard();
      const m = b.mines.indexOf(true);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(b.state[m]).toBe('hidden');

      expect(openCell(b, m)).toBe('boom');
      expect(b.dead).toBe(true);
      expect(b.won).toBe(false);
      expect(b.state[m]).toBe('open'); // the mine cell itself is revealed

      // subsequent interactions are no-ops ('nothing' / state unchanged)
      const h = b.state.findIndex((s) => s === 'hidden');
      expect(h).toBeGreaterThanOrEqual(0);
      expect(openCell(b, h)).toBe('nothing');
      expect(b.state[h]).toBe('hidden');
      toggleFlag(b, h);
      expect(b.state[h]).toBe('hidden');
    }
  });
});

describe('chordOpen', () => {
  const center = idx(4, 4);
  const mine = idx(4, 3);
  const safeFlag = idx(5, 3);
  function laidOut(flags: number[], open: number[]): ReturnType<typeof createBoard> {
    const board = createBoard();
    board.started = true;
    board.mines[mine] = true;
    for (let cell = 0; cell < CELLS; cell++)
      board.nums[cell] = neighbours(cell).filter((near) => board.mines[near]).length;
    for (const cell of open) board.state[cell] = 'open';
    for (const cell of flags) board.state[cell] = 'flag';
    return board;
  }
  it('does not place mines when the board has not started', () => {
    const board = createBoard();
    expect(chordOpen(board, center)).toBe('nothing');
    expect(board.started).toBe(false);
    expect(board.mines.some(Boolean)).toBe(false);
  });
  it('opens the unflagged neighbours when the flag count matches the number', () => {
    const board = laidOut([mine], [center]);
    expect(board.nums[center]).toBe(1);
    expect(chordOpen(board, center)).toBe('won');
    expect(board.dead).toBe(false);
    expect(board.won).toBe(true);
    expect(board.state[mine]).toBe('flag');
    expect(board.state[idx(3, 3)]).toBe('open');
  });
  it('changes nothing when the flag count does not match', () => {
    const board = laidOut([], [center]);
    const state = board.state.slice();
    const mines = board.mines.slice();
    expect(board.nums[center]).toBe(1);
    expect(chordOpen(board, center)).toBe('nothing');
    expect(board.state).toEqual(state);
    expect(board.mines).toEqual(mines);
    expect(board.dead).toBe(false);
    expect(board.won).toBe(false);
    expect(board.started).toBe(true);
  });
  it('dies through openCell when a matching chord still covers a mine', () => {
    const board = laidOut([safeFlag], [center]);
    expect(board.nums[center]).toBe(1);
    expect(chordOpen(board, center)).toBe('boom');
    expect(board.dead).toBe(true);
    expect(board.won).toBe(false);
    expect(board.state[mine]).toBe('open');
    expect(board.mines[mine]).toBe(true);
    expect(board.state[safeFlag]).toBe('flag');
  });
});

describe('winning', () => {
  it('requires safe flagged cells to be opened before winning', () => {
    const board = startedBoard();
    const flaggedSafe = board.state.findIndex(
      (state, cell) => state === 'hidden' && !board.mines[cell],
    );
    expect(flaggedSafe).toBeGreaterThanOrEqual(0);
    toggleFlag(board, flaggedSafe);
    for (let cell = 0; cell < CELLS; cell++)
      if (cell !== flaggedSafe && !board.mines[cell]) openCell(board, cell);
    expect(board.won).toBe(false);
    expect(board.state[flaggedSafe]).toBe('flag');
    toggleFlag(board, flaggedSafe);
    expect(openCell(board, flaggedSafe)).toBe('won');
  });
  it('ignores invalid flag indices without extending or corrupting the board', () => {
    const board = createBoard();
    for (const index of [-1, 0.5, NaN, Infinity, CELLS]) toggleFlag(board, index);
    expect(board.state).toEqual(Array(CELLS).fill('hidden'));
    expect(flagsUsed(board)).toBe(0);
  });
  it('flag all 10 mines, then open every non-mine cell: the last open wins', () => {
    for (let n = 0; n < 10; n++) {
      const b = startedBoard();
      const mineIdx: number[] = [];
      for (let i = 0; i < CELLS; i++) if (b.mines[i]) mineIdx.push(i);
      expect(mineIdx.length).toBe(MINES);

      for (const m of mineIdx) toggleFlag(b, m);
      expect(flagsUsed(b)).toBe(MINES);

      let lastAction = '';
      for (let i = 0; i < CELLS; i++) {
        if (b.mines[i]) continue;
        const r = openCell(b, i);
        expect(r, `opening non-mine ${i} must never boom`).not.toBe('boom');
        if (r !== 'nothing') lastAction = r; // remember the last call that did something
      }
      expect(lastAction).toBe('won');
      expect(b.won).toBe(true);

      // final state: every non-mine cell open, every mine still flagged
      for (let i = 0; i < CELLS; i++) {
        expect(b.state[i], `cell ${i}`).toBe(b.mines[i] ? 'flag' : 'open');
      }

      // post-win no-ops
      expect(openCell(b, mineIdx[0])).toBe('nothing');
      toggleFlag(b, mineIdx[0]);
      expect(b.state[mineIdx[0]]).toBe('flag');
    }
  });

  it('brute-force: opening all non-mine cells one by one never booms and ends won', () => {
    for (let n = 0; n < 10; n++) {
      const b = startedBoard();
      let lastAction = '';
      for (let i = 0; i < CELLS; i++) {
        if (b.mines[i]) continue;
        const r = openCell(b, i);
        expect(r).not.toBe('boom');
        if (r !== 'nothing') lastAction = r;
      }
      expect(lastAction).toBe('won');
      expect(b.won).toBe(true);
      for (let i = 0; i < CELLS; i++) {
        if (!b.mines[i]) expect(b.state[i]).toBe('open');
      }
    }
  });
});
