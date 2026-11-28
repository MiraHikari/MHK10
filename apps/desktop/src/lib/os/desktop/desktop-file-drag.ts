import type { InputController } from '../../ui/canvas/input';
import { containsFilePoint, fileDropSite, type FileDropSite } from '../files/file-drop-geometry';
import {
  executeTransfer,
  modifierFromKeys,
  type FileTransferSurface,
  type TransferSource,
  type TransferTarget,
} from '../files/file-transfer';
import type { FileSystem } from '../files/filesystem';

export type TransferNotice =
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'session' };

interface DragEntry {
  entry: FileTransferSurface['entries'][number];
  start: { x: number; y: number };
  moving: boolean;
  windowId: string;
}

export interface DesktopFileDragDeps {
  input: InputController;
  files: FileSystem;
  blocked(): boolean;
  workspaceActive(): boolean;
  windows(): readonly {
    id: string;
    minimized: boolean;
    x: number;
    y: number;
    w: number;
    h: number;
  }[];
  windowOpen(id: string): boolean;
  desktopSurface(): FileTransferSurface;
  syncIcons(): void;
  playClick(): void;
  notify(notice: TransferNotice): void;
  render(view: {
    pointer: { x: number; y: number };
    modifiers: { ctrl: boolean; shift: boolean; alt: boolean };
    moving?: { icon: string; label: string; source: TransferSource };
    dropSite: FileDragPaintSite;
  }): void;
}

type FileDragPaintSite = (
  point: { x: number; y: number },
  excluded: ReadonlySet<string>,
) => FileDropSite | undefined;

/** Pointer file transfers between window surfaces and the desktop. */
export function createDesktopFileDrag(deps: DesktopFileDragDeps) {
  const surfaces = new Map<string, FileTransferSurface>();
  let drag: DragEntry | undefined;
  let transferGeneration = 0;
  const pendingTransfers = new Set<Promise<void>>();

  const modifiers = () => ({
    ctrl: deps.input.io.keyDown.has('Control'),
    shift: deps.input.io.keyDown.has('Shift'),
    alt: deps.input.io.keyDown.has('Alt'),
  });

  const dropSite = (point: { x: number; y: number }, excluded: ReadonlySet<string>) =>
    fileDropSite(
      deps
        .windows()
        .filter((win) => !win.minimized)
        .map((win) => ({ bounds: win, surface: surfaces.get(win.id) })),
      deps.desktopSurface(),
      point,
      excluded,
    );

  const transfer = (sources: readonly TransferSource[], destination: TransferTarget) => {
    const generation = transferGeneration;
    const modifier = modifierFromKeys(modifiers());
    // The accepted drop owns its sources, destination and modifier while any
    // publication body loads; later pointer movement cannot redirect it.
    const operation = Promise.all(
      sources.map((source) => executeTransfer(deps.files, source, destination, modifier)),
    ).then((results) => {
      if (generation !== transferGeneration) return;
      const failure = results.find((result) => !result.ok);
      deps.syncIcons();
      if (results.some((result) => result.ok)) deps.playClick();
      if (failure && !failure.ok) deps.notify({ kind: 'failed', message: failure.error });
      else if (results.some((result) => result.ok && !result.persisted))
        deps.notify({ kind: 'session' });
    });
    pendingTransfers.add(operation);
    void operation.then(
      () => pendingTransfers.delete(operation),
      () => pendingTransfers.delete(operation),
    );
    return operation;
  };

  return {
    publish(id: string, view: FileTransferSurface): void {
      surfaces.set(id, view);
    },
    remove(id: string): void {
      surfaces.delete(id);
      if (drag?.windowId === id) drag = undefined;
    },
    clear(): void {
      transferGeneration++;
      surfaces.clear();
      drag = undefined;
    },
    transfer,
    get pending(): boolean {
      return pendingTransfers.size > 0;
    },
    async settled(): Promise<void> {
      await Promise.allSettled([...pendingTransfers]);
    },
    drop(sources: readonly TransferSource[], point: Readonly<{ x: number; y: number }>): boolean {
      const site = dropSite(point, new Set(sources.map((source) => source.id)));
      const keys = modifiers();
      if (!site || (site.target.id === 'desktop' && !keys.ctrl && !keys.alt)) return false;
      void transfer(sources, site.target);
      return true;
    },
    update(): boolean {
      if (deps.blocked() || deps.input.io.cancelled || deps.input.io.keyPressed.has('Escape')) {
        drag = undefined;
        return false;
      }
      const point = { x: deps.input.io.px, y: deps.input.io.py };
      if (deps.input.io.wentDown && !deps.workspaceActive()) {
        const start = deps.input.pointerPress() ?? point;
        const win = deps
          .windows()
          .findLast((candidate) => !candidate.minimized && containsFilePoint(candidate, start));
        const entry = win
          ? surfaces.get(win.id)?.entries.find((item) => containsFilePoint(item.bounds, start))
          : undefined;
        if (win && entry) drag = { entry, start, moving: false, windowId: win.id };
      }
      if (!drag) return false;
      if (!deps.windowOpen(drag.windowId)) {
        drag = undefined;
        return false;
      }
      drag.moving ||=
        Math.max(Math.abs(point.x - drag.start.x), Math.abs(point.y - drag.start.y)) >= 4;
      const moving = drag.moving;
      if (deps.input.io.wentUp) {
        const current = drag;
        drag = undefined;
        if (current.moving) {
          const site = dropSite(point, new Set([current.entry.source.id]));
          if (site) void transfer([current.entry.source], site.target);
          deps.input.io.wentUp = false;
          deps.input.io.dbl = false;
          deps.input.io.completedClicks = [];
        }
      } else if (!deps.input.io.down) drag = undefined;
      return moving;
    },
    paint(): void {
      const entry = drag?.moving ? drag.entry : undefined;
      deps.render({
        pointer: { x: deps.input.io.px, y: deps.input.io.py },
        modifiers: modifiers(),
        ...(entry
          ? { moving: { icon: entry.icon, label: entry.label, source: entry.source } }
          : {}),
        dropSite: (point, excluded) => dropSite(point, new Set(excluded)),
      });
    },
  };
}

export type DesktopFileDrag = ReturnType<typeof createDesktopFileDrag>;
