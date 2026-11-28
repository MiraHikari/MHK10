// board.ts: Minesweeper board logic — pure, no drawing. Testable through this interface.

export const COLS = 9,
  ROWS = 9,
  MINES = 10;

export type CellState = 'hidden' | 'open' | 'flag';

export interface Board {
  mines: boolean[]; // COLS*ROWS
  nums: number[]; // neighbouring-mine counts
  state: CellState[];
  started: boolean; // mines placed after the first click (first click is safe)
  dead: boolean;
  won: boolean;
}

export const idx = (c: number, r: number) => c + r * COLS;

function neighbours(i: number): number[] {
  const c = i % COLS,
    r = (i - c) / COLS,
    out: number[] = [];
  for (let dr = -1; dr < 2; dr++)
    for (let dc = -1; dc < 2; dc++) {
      if ((dr || dc) && c + dc >= 0 && c + dc < COLS && r + dr >= 0 && r + dr < ROWS)
        out.push(i + dc + dr * COLS);
    }
  return out;
}

export function createBoard(): Board {
  return {
    mines: Array(COLS * ROWS).fill(false),
    nums: Array(COLS * ROWS).fill(0),
    state: Array(COLS * ROWS).fill('hidden'),
    started: false,
    dead: false,
    won: false,
  };
}

function placeMines(b: Board, safe: number): void {
  const forbidden = new Set([safe, ...neighbours(safe)]);
  let placed = 0;
  while (placed < MINES) {
    const i = Math.floor(Math.random() * COLS * ROWS);
    if (!b.mines[i] && !forbidden.has(i)) {
      b.mines[i] = true;
      placed++;
    }
  }
  for (let i = 0; i < COLS * ROWS; i++) b.nums[i] = neighbours(i).filter((j) => b.mines[j]).length;
}

/** Open a cell. Returns 'boom' | 'won' | 'opened' | 'nothing'. */
export function openCell(b: Board, i: number): 'boom' | 'won' | 'opened' | 'nothing' {
  if (b.dead || b.won || b.state[i] !== 'hidden') return 'nothing';
  if (!b.started) {
    placeMines(b, i);
    b.started = true;
  }
  if (b.mines[i]) {
    b.dead = true;
    b.state[i] = 'open';
    return 'boom';
  }
  const flood = (j: number) => {
    if (b.state[j] !== 'hidden') return;
    b.state[j] = 'open';
    if (b.nums[j] === 0) for (const k of neighbours(j)) if (!b.mines[k]) flood(k);
  };
  flood(i);
  if (b.state.every((s, j) => s === 'open' || b.mines[j])) {
    b.won = true;
    return 'won';
  }
  return 'opened';
}

/**
 * Chord an open numbered cell. Flagged neighbours must equal that number.
 * Hidden unflagged neighbours then follow openCell, including first-click safety and mines.
 */
export function chordOpen(b: Board, index: number): 'boom' | 'won' | 'opened' | 'nothing' {
  if (b.dead || b.won || b.state[index] !== 'open' || b.nums[index] <= 0) return 'nothing';
  const near = neighbours(index);
  if (near.filter((cell) => b.state[cell] === 'flag').length !== b.nums[index]) return 'nothing';
  let opened: 'opened' | 'nothing' = 'nothing';
  for (const cell of near) {
    if (b.state[cell] !== 'hidden') continue;
    const result = openCell(b, cell);
    if (result === 'boom' || result === 'won') return result;
    if (result === 'opened') opened = 'opened';
  }
  return opened;
}

export function toggleFlag(b: Board, i: number): void {
  if (b.dead || b.won || !Number.isInteger(i) || i < 0 || i >= COLS * ROWS || b.state[i] === 'open')
    return;
  b.state[i] = b.state[i] === 'flag' ? 'hidden' : 'flag';
}

export const flagsUsed = (b: Board) => b.state.filter((s) => s === 'flag').length;
