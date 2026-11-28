export interface TaskbarRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface TaskbarOptions {
  quickLaunch: boolean;
  quickCount?: number;
  labels: boolean;
  clockWidth: number;
  risk: boolean;
  contexts: number;
  offset: number;
}

/** One layout owns painting, hit testing, overflow and window-animation targets. */
export function taskbarLayout(count: number, options: TaskbarOptions, width = 640, y = 338) {
  const row = (x: number, w: number): TaskbarRect => ({ x, y: y + 3, w, h: 18 });
  const start = row(2, 50);
  const quick = options.quickLaunch
    ? Array.from({ length: Math.max(0, Math.min(5, options.quickCount ?? 3)) }, (_, i) =>
        row(59 + i * 21, 20),
      )
    : [];
  const clockW = Math.max(42, Math.min(76, Math.round(options.clockWidth)));
  const clock = row(width - clockW - 3, clockW);
  const volume = row(clock.x - 22, 20);
  const contexts = Array.from({ length: Math.max(0, Math.min(2, options.contexts)) }, (_, i) =>
    row(volume.x - (i + 1) * 19, 18),
  );
  const statusLeft = contexts.at(-1)?.x ?? volume.x;
  const risk = options.risk ? row(statusLeft - 68, 64) : null;
  const tray = row((risk?.x ?? statusLeft) - 3, width - (risk?.x ?? statusLeft));
  const left = quick.length ? quick.at(-1)!.x + 27 : 58,
    available = Math.max(80, tray.x - left - 5);
  const min = options.labels ? 76 : 26,
    max = options.labels ? 136 : 26;
  const overflowing = count * (min + 3) > available;
  const capacity = Math.max(1, Math.floor((available - (overflowing ? 38 : 0)) / (min + 3)));
  const visibleCount = Math.min(count, capacity);
  const maxOffset = Math.max(0, count - capacity);
  const offset = Math.max(0, Math.min(maxOffset, Math.floor(options.offset) || 0));
  const previous = overflowing ? row(left, 16) : null;
  const next = overflowing ? row(left + available - 16, 16) : null;
  const taskLeft = left + (overflowing ? 19 : 0);
  const taskWidth = Math.min(
    max,
    Math.floor((available - (overflowing ? 38 : 0)) / Math.max(1, visibleCount)) - 3,
  );
  const tasks = Array.from({ length: visibleCount }, (_, i) => ({
    index: offset + i,
    bounds: row(taskLeft + i * (taskWidth + 3), taskWidth),
  }));
  const anchor = (index: number): TaskbarRect =>
    tasks.find((task) => task.index === index)?.bounds ??
    (index < offset ? previous : next) ??
    row(taskLeft, taskWidth);
  return {
    start,
    quick,
    clock,
    volume,
    contexts,
    risk,
    tray,
    tasks,
    previous,
    next,
    offset,
    capacity,
    maxOffset,
    anchor,
    strip: row(left, available),
  };
}

export function revealTask(index: number, offset: number, capacity: number): number {
  if (index < 0) return offset;
  if (index < offset) return index;
  if (index >= offset + capacity) return index - capacity + 1;
  return offset;
}
