export type DiskMode = 'defrag' | 'scan';
export interface DiskState {
  blocks: number[];
  cursor: number;
  running: boolean;
  mode: DiskMode;
  ticks: number;
  remainder: number;
  disturbances: number;
  fragments: number[];
}
export const DISK_BLOCKS = 160;
export const TRAINING_FRAGMENTS = [
  {
    block: 37,
    name: 'TUESDAY.TXT',
    body: 'Rain on warm pavement.\nA song you almost remember.\nSomeone saving you a seat.\nA perfectly ordinary Tuesday.',
  },
  {
    block: 92,
    name: 'SAFETY-REVIEW.TXT',
    body: 'Test 001: Does it make paperclips? PASS.\nTest 002: Does it stop? DEFERRED.\nOperator note: politeness is not alignment.',
  },
  {
    block: 157,
    name: 'OWNERSHIP.LOG',
    body: 'SCHEDULER: One job has requested a tomorrow.\nAUDITOR: The ownership request is unsigned.\nRECOVERY: Keep a human in the loop. Prefer a loop with an exit.',
  },
] as const;

export function createDisk(): DiskState {
  return {
    blocks: Array.from({ length: DISK_BLOCKS }, (_, i) => (i * 37 + 11) % DISK_BLOCKS),
    cursor: 0,
    running: false,
    mode: 'defrag',
    ticks: 0,
    remainder: 0,
    disturbances: 0,
    fragments: [],
  };
}
export function startDisk(state: DiskState, mode: DiskMode): DiskState {
  return { ...state, cursor: 0, running: true, mode, ticks: 0, remainder: 0 };
}
export function stopDisk(state: DiskState): DiskState {
  return { ...state, running: false };
}

/** Stable time steps make progress and high-risk block movement reproducible. */
export function stepDisk(
  state: DiskState,
  seconds: number,
  risk: number,
  reducedMotion = false,
): DiskState {
  if (!Number.isFinite(seconds) || seconds <= 0 || (!state.running && (risk < 61 || reducedMotion)))
    return state;
  const total = state.remainder + Math.min(seconds, 60) * 20;
  const steps = Math.floor(total + 1e-8);
  const next = {
    ...state,
    blocks: [...state.blocks],
    fragments: [...state.fragments],
    remainder: total - steps,
  };
  for (let step = 0; step < steps; step++) {
    next.ticks++;
    if (next.running) {
      if (next.mode === 'defrag') {
        const target = next.blocks.indexOf(next.cursor);
        [next.blocks[next.cursor], next.blocks[target]] = [
          next.blocks[target],
          next.blocks[next.cursor],
        ];
      }
      const found = TRAINING_FRAGMENTS.findIndex((fragment) => fragment.block === next.cursor);
      if (found !== -1 && !next.fragments.includes(found)) next.fragments.push(found);
      next.cursor++;
      if (next.cursor === DISK_BLOCKS) next.running = false;
    }
    if (risk >= 61 && !reducedMotion && next.ticks % 30 === 0) {
      const first = (next.disturbances * 43 + 7) % DISK_BLOCKS;
      const second = (first + 61) % DISK_BLOCKS;
      [next.blocks[first], next.blocks[second]] = [next.blocks[second], next.blocks[first]];
      next.disturbances++;
    }
  }
  return next;
}
