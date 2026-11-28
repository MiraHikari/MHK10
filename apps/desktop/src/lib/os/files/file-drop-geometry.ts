import type { FileTransferBounds, FileTransferSurface, TransferTarget } from './file-transfer';

export interface FileDropWindow {
  bounds: FileTransferBounds;
  surface?: FileTransferSurface;
}

export interface FileDropSite {
  bounds: FileTransferBounds;
  target: TransferTarget;
}

export function containsFilePoint(
  bounds: FileTransferBounds,
  point: { x: number; y: number },
): boolean {
  return (
    point.x >= bounds.x &&
    point.y >= bounds.y &&
    point.x < bounds.x + bounds.w &&
    point.y < bounds.y + bounds.h
  );
}

/** Windows are back-to-front. An unrelated covering window blocks a drop. */
export function fileDropSite(
  windows: readonly FileDropWindow[],
  desktop: FileTransferSurface,
  point: { x: number; y: number },
  excluded: ReadonlySet<string> = new Set(),
): FileDropSite | undefined {
  const window = windows.findLast((entry) => containsFilePoint(entry.bounds, point));
  const surface = window ? window.surface : desktop;
  if (!surface || !containsFilePoint(surface.bounds, point)) return;
  const entry = surface.entries.findLast(
    (entry) => !excluded.has(entry.source.id) && containsFilePoint(entry.bounds, point),
  );
  if (entry) return entry.target ? { bounds: entry.bounds, target: entry.target } : undefined;
  return { bounds: surface.bounds, target: surface.target };
}
