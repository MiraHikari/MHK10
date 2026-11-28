import { STORAGE_KEYS } from '../../../data/storage-keys';
import type { Renderer } from '../../gfx/context';
import { C } from '../../gfx/palette';
import { clamp, R } from '../../gfx/primitives';
import type { InputController } from '../../ui/canvas/input';
import type { WidgetScope } from '../../ui/canvas/widgets';
import { APP_CATALOG, catalogIcon } from '../../../data/app-catalog';
import { assistantPlacement } from './assistant-placement';
import {
  desktopIconArrangement,
  desktopIconGrid,
  desktopIconSlots,
  restoreIconPositions,
  type IconBounds,
  type IconPosition,
} from './desktop-icon-layout';
import {
  DesktopSelection,
  type DesktopClick,
  type DesktopItem,
  type DesktopPoint,
} from './desktop-selection';
import type { DesktopSettings } from './desktop-settings';
import { displayedFileName, fileSize, fileType } from '../files/file-types';
import type { FileSystem, FileStorage, FolderId } from '../files/filesystem';
import {
  decideTransfer,
  modifierFromKeys,
  type FileTransferSurface,
  type TransferSource,
  type TransferTarget,
} from '../files/file-transfer';

export const DESKTOP_ICONS_KEY = STORAGE_KEYS.desktopIcons;

export interface DesktopEntry {
  readonly id: string;
  readonly icon: string;
  readonly label: string;
  readonly kind: 'folder' | 'file';
  readonly targetId: string;
}

export type WorkspacePreferences = Pick<
  DesktopSettings,
  'showFileExtensions' | 'showAssistant' | 'showDesktopIcons' | 'autoArrangeIcons'
>;

export interface DesktopIconPaint {
  renderer: Renderer;
  widgets: WidgetScope;
  input: InputController;
  systemInput: boolean;
  blocked: boolean;
  gated: boolean;
  showIcons: boolean;
  showAssistant: boolean;
  showFocus: boolean;
  syncIcons(): void;
  onContextMenu(x: number, y: number, id?: string): void;
  onActivate(id: string): void;
  onDrop(sources: readonly TransferSource[], point: Readonly<{ x: number; y: number }>): boolean;
  onLayoutChanged(): void;
  onPage(delta: number): void;
}

export interface FileDragPaint {
  renderer: Renderer;
  pointer: { x: number; y: number };
  modifiers: { ctrl: boolean; shift: boolean; alt: boolean };
  moving?: { icon: string; label: string; source: TransferSource };
  dropSite(
    point: { x: number; y: number },
    excluded: ReadonlySet<string>,
  ): { bounds: { x: number; y: number; w: number; h: number }; target: TransferTarget } | undefined;
}

export interface DesktopWorkspaceOptions {
  files: FileSystem;
  storage: Pick<FileStorage, 'getItem' | 'setItem'> | null;
  settings(): Readonly<WorkspacePreferences>;
  workArea: Readonly<IconBounds>;
}

function savedPositions(value: unknown): Map<string, IconPosition> {
  const positions = new Map<string, IconPosition>();
  if (
    !value ||
    typeof value !== 'object' ||
    !('positions' in value) ||
    !Array.isArray(value.positions)
  )
    return positions;
  for (const position of value.positions.slice(0, 264)) {
    if (
      position &&
      typeof position === 'object' &&
      'id' in position &&
      typeof position.id === 'string' &&
      'x' in position &&
      typeof position.x === 'number' &&
      Number.isFinite(position.x) &&
      'y' in position &&
      typeof position.y === 'number' &&
      Number.isFinite(position.y)
    )
      positions.set(position.id, { id: position.id, x: position.x, y: position.y });
  }
  return positions;
}

/** Owns desktop entries, selection, placement transactions and compatible layout storage. */
export function createDesktopWorkspace(options: DesktopWorkspaceOptions) {
  const { files, storage } = options;
  let workArea = { ...options.workArea };
  const selection = new DesktopSelection([], workArea.w, workArea.h);
  const entries = new Map<string, DesktopEntry>();
  let preferences = { ...options.settings() };
  let revision = -1;
  let page = 0;
  let pageCount = 1;
  let named = false;
  let manual = false;
  let stored: unknown;
  let reserved: IconBounds[] = [];
  let dragPositions: IconPosition[] = [];
  let disposed = false;

  const currentEntries = (): DesktopEntry[] => [
    ...files.folders('desktop').map((folder) => ({
      id: `desktop-folder:${folder.id}`,
      icon: 'i_folder',
      label: folder.name,
      kind: 'folder' as const,
      targetId: folder.id,
    })),
    ...files.list('documents', 'desktop').map((file) => ({
      id: `desktop-file:${file.id}`,
      icon:
        file.target && APP_CATALOG.some((app) => app.id === file.target!.appId)
          ? catalogIcon(file.target.appId)
          : fileType(file.name).icon,
      label: displayedFileName(file.name, preferences.showFileExtensions),
      kind: 'file' as const,
      targetId: file.id,
    })),
  ];

  try {
    stored = JSON.parse(storage?.getItem(DESKTOP_ICONS_KEY) ?? 'null');
    const initial = currentEntries();
    const arrangement = desktopIconArrangement(
      stored,
      initial.map((entry) => entry.id),
      initial.toSorted((a, b) => a.label.localeCompare(b.label)).map((entry) => entry.id),
    );
    manual = arrangement === 'manual';
    named =
      arrangement === 'name' ||
      (manual &&
        !!stored &&
        typeof stored === 'object' &&
        'order' in stored &&
        stored.order === 'name');
  } catch {
    /* A malformed or unavailable store starts an adaptive desktop. */
  }

  const sync = (update: { force?: boolean; workArea?: Readonly<IconBounds> } = {}): boolean => {
    if (disposed) return false;
    const next = options.settings();
    const area = update.workArea ?? workArea;
    if (
      !update.force &&
      revision === files.revision &&
      area.x === workArea.x &&
      area.y === workArea.y &&
      area.w === workArea.w &&
      area.h === workArea.h &&
      next.showFileExtensions === preferences.showFileExtensions &&
      next.showAssistant === preferences.showAssistant &&
      next.showDesktopIcons === preferences.showDesktopIcons &&
      next.autoArrangeIcons === preferences.autoArrangeIcons
    )
      return false;
    workArea = { ...area };
    preferences = { ...next };
    revision = files.revision;
    const list = currentEntries();
    if (preferences.autoArrangeIcons || named) list.sort((a, b) => a.label.localeCompare(b.label));
    entries.clear();
    for (const entry of list) entries.set(entry.id, Object.freeze(entry));
    reserved = preferences.showAssistant ? [assistantPlacement(workArea.w, workArea.h).hit] : [];
    if (list.length > desktopIconSlots(workArea.w, workArea.h, reserved).length)
      reserved.push({ x: workArea.w - 142, y: 2, w: 140, h: 25 });
    const capacity = Math.max(1, desktopIconSlots(workArea.w, workArea.h, reserved).length);
    pageCount = Math.max(1, Math.ceil(list.length / capacity));
    page = Math.min(page, pageCount - 1);
    const grid = desktopIconGrid(
      list.map((entry) => entry.id),
      workArea.w,
      workArea.h,
      page,
      reserved,
    );
    const positions =
      manual && !preferences.autoArrangeIcons
        ? restoreIconPositions(stored, grid, workArea.w, workArea.h, reserved)
        : grid;
    selection.reconcile(positions, {
      width: workArea.w,
      height: workArea.h,
      reserved,
      preservePositions: false,
    });
    if (!preferences.showDesktopIcons) selection.clear();
    dragPositions = [];
    return true;
  };

  const persist = (moved: readonly IconPosition[] = []): boolean => {
    const hadManual = manual;
    if (moved.length) manual = !preferences.autoArrangeIcons;
    const positions =
      hadManual && manual ? savedPositions(stored) : new Map<string, IconPosition>();
    for (const { id, x, y } of moved) positions.set(id, { id, x, y });
    stored = {
      version: 1,
      arrangement: manual ? 'manual' : named ? 'name' : 'default',
      ...(manual && named ? { order: 'name' } : {}),
      positions: manual ? [...positions.values()] : [],
    };
    try {
      if (!storage) return false;
      storage.setItem(DESKTOP_ICONS_KEY, JSON.stringify(stored));
      return true;
    } catch {
      return false;
    }
  };

  const arrange = (byName: boolean): boolean => {
    if (disposed) return false;
    named = byName;
    manual = false;
    sync({ force: true });
    return persist();
  };

  const restorePositions = (positions: readonly IconPosition[]) => {
    for (const position of positions) {
      const item = selection.items.find((candidate) => candidate.id === position.id);
      if (item) {
        item.x = position.x;
        item.y = position.y;
      }
    }
  };

  const fileSurface = (): FileTransferSurface => ({
    bounds: { ...workArea },
    target: {
      id: 'desktop',
      volume: 'desktop',
      folder: 'desktop',
      isTrash: false,
      acceptsDrop: true,
    },
    entries: selection.items.flatMap((item) => {
      const entry = entries.get(item.id);
      if (!entry) return [];
      const isTrash = files.get(entry.targetId)?.target?.appId === 'bin';
      return [
        {
          bounds: { ...item },
          label: entry.label,
          icon: entry.icon,
          source: {
            id: entry.targetId,
            kind: entry.kind,
            volume: 'desktop' as const,
            parent: 'desktop',
          },
          ...(entry.kind === 'folder' || isTrash
            ? {
                target: {
                  id: entry.targetId,
                  volume: 'desktop' as const,
                  folder: entry.kind === 'folder' ? entry.targetId : 'desktop',
                  isTrash,
                  acceptsDrop: true,
                },
              }
            : {}),
        },
      ];
    }),
  });

  const selectedSources = (): readonly TransferSource[] =>
    fileSurface()
      .entries.filter((entry) =>
        [...selection.selected].some((id) => entries.get(id)?.targetId === entry.source.id),
      )
      .map((entry) => entry.source);

  const properties = (id: string): readonly string[] | undefined => {
    const entry = entries.get(id);
    if (!entry) return;
    const lines = [`Name: ${entry.label}`, 'Location: Desktop'];
    if (entry.kind === 'folder') {
      const folder = files.getFolder(entry.targetId);
      const folderId = entry.targetId as FolderId;
      const objects = files.folders(folderId).length + files.list('documents', folderId).length;
      lines.push(
        'Type: File folder',
        `Contains: ${objects} object(s)`,
        `Source: ${folder?.readonly ? 'MiraHikari' : 'This computer'}`,
      );
      return lines;
    }
    const file = files.get(entry.targetId);
    if (!file) return;
    const type = fileType(file.name);
    const target = file.target;
    lines.push(
      `Type: ${file.kind === 'shortcut' ? 'Shortcut' : type.description}`,
      ...(target
        ? [
            `Target: ${
              target.fileId
                ? (files.get(target.fileId)?.name ??
                  files.getFolder(target.fileId)?.name ??
                  'Missing file')
                : (APP_CATALOG.find((app) => app.id === target.appId)?.name ??
                  'Missing application')
            }`,
          ]
        : [`Size: ${fileSize(file.size ?? new TextEncoder().encode(file.content).length)}`]),
      `Source: ${file.readonly ? 'MiraHikari' : file.source}`,
    );
    return lines;
  };

  sync({ force: true });
  const api = {
    sync,
    arrange,
    fileSurface,
    selectedSources,
    entry: (id: string): DesktopEntry | undefined => entries.get(id),
    get entries(): readonly DesktopEntry[] {
      return Object.freeze([...entries.values()]);
    },
    get items(): readonly Readonly<DesktopItem>[] {
      return Object.freeze(selection.items.map((item) => Object.freeze({ ...item })));
    },
    get selected(): ReadonlySet<string> {
      return new Set(selection.selected);
    },
    get focused(): string | null {
      return selection.focused;
    },
    get active(): boolean {
      return selection.active;
    },
    get dragging(): boolean {
      return selection.dragging;
    },
    get marquee() {
      const bounds = selection.marquee;
      return bounds ? Object.freeze(bounds) : null;
    },
    get page(): number {
      return page;
    },
    get pageCount(): number {
      return pageCount;
    },
    properties,
    launchBounds(id: string): Readonly<IconBounds> | undefined {
      const icon = preferences.showDesktopIcons
        ? selection.items.find((item) => item.id === id)
        : undefined;
      return icon ? Object.freeze({ x: icon.x + 18, y: icon.y, w: 32, h: 32 }) : undefined;
    },
    changePage(delta: number): void {
      if (disposed) return;
      page = Math.max(0, Math.min(pageCount - 1, page + Math.trunc(delta)));
      selection.clear();
      sync({ force: true });
    },
    begin(point: DesktopPoint, additive = false): boolean {
      if (
        disposed ||
        !preferences.showDesktopIcons ||
        point.x < 0 ||
        point.y < 0 ||
        point.x >= workArea.w ||
        point.y >= workArea.h ||
        reserved.some(
          (bounds) =>
            point.x >= bounds.x &&
            point.y >= bounds.y &&
            point.x < bounds.x + bounds.w &&
            point.y < bounds.y + bounds.h,
        )
      )
        return false;
      selection.cancel();
      dragPositions = selection.items.map(({ id, x, y }) => ({ id, x, y }));
      selection.begin(point, additive);
      return true;
    },
    update(point: DesktopPoint): void {
      if (!disposed) selection.update(point);
    },
    /** Restore the preview before external transfer; persist only a real local icon movement. */
    finish(
      point: DesktopPoint,
      doubleClick = false,
      completedClicks?: readonly DesktopClick[],
      transfer?: (sources: readonly TransferSource[], point: Readonly<DesktopPoint>) => boolean,
    ): { activate?: string; dragged: boolean } {
      if (disposed) return { dragged: false };
      selection.update(point);
      const dragging = selection.dragging;
      const result = selection.finish(point, doubleClick, completedClicks);
      if (result.dragged && dragging) {
        const moved = selection.items
          .filter((item) => {
            const before = dragPositions.find((position) => position.id === item.id);
            return before && (before.x !== item.x || before.y !== item.y);
          })
          .map(({ id, x, y }) => ({ id, x, y }));
        const sources = selectedSources();
        restorePositions(dragPositions);
        let transferred = false;
        try {
          transferred = transfer?.(sources, point) ?? false;
        } finally {
          if (!disposed && !transferred) {
            restorePositions(moved);
            if (preferences.autoArrangeIcons) {
              named = true;
              manual = false;
              sync({ force: true });
            }
            if (moved.length) persist(moved);
          }
        }
      }
      dragPositions = [];
      return result;
    },
    cancel(): void {
      selection.cancel();
      dragPositions = [];
    },
    clear(): void {
      selection.clear();
      dragPositions = [];
    },
    select(id: string, additive = false): void {
      if (!disposed) selection.select(id, additive);
    },
    selectAll(): void {
      if (!disposed) selection.selectAll();
    },
    toggleFocused(): void {
      if (!disposed) selection.toggleFocused();
    },
    navigate(key: string, additive = false, focusOnly = false): void {
      if (!disposed) selection.navigate(key, additive, focusOnly);
    },
    context(point: DesktopPoint): string | undefined {
      return disposed ? undefined : selection.context(point);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      selection.clear();
      selection.reconcile([], { width: workArea.w, height: workArea.h });
      entries.clear();
      dragPositions = [];
    },
  };

  function paintIcons(host: DesktopIconPaint): boolean {
    host.syncIcons();
    let systemInput = host.systemInput;
    const available = !host.blocked;
    const live = available && !systemInput && !host.gated;
    if (!host.showIcons) {
      api.clear();
      host.input.setGate(live ? 'desktop' : null);
      if (live && host.input.hit(0, 0, host.renderer.W, host.renderer.H - 22).rclicked)
        host.onContextMenu(host.input.io.px, host.input.io.py);
      return systemInput;
    }
    const point = { x: host.input.io.px, y: host.input.io.py };
    const inside =
      host.input.io.px >= 0 &&
      host.input.io.px < host.renderer.W &&
      host.input.io.py >= 0 &&
      host.input.io.py < host.renderer.H - 22;
    const work = host.renderer.getDisplayMetrics().workArea;
    const assistantHit = assistantPlacement(work.w, work.h).hit;
    const overAssistant =
      host.showAssistant &&
      host.input.io.px >= assistantHit.x &&
      host.input.io.px < assistantHit.x + assistantHit.w &&
      host.input.io.py >= assistantHit.y &&
      host.input.io.py < assistantHit.y + assistantHit.h;
    if (api.active && (!available || host.input.io.cancelled)) api.cancel();
    const overPages =
      api.pageCount > 1 && host.input.io.px >= host.renderer.W - 142 && host.input.io.py < 27;
    if (live && inside && !overAssistant && !overPages && host.input.io.wentDown) {
      api.begin(host.input.pointerPress() ?? point, host.input.io.keyDown.has('Control'));
      systemInput = true;
    }
    if (api.active) {
      systemInput = true;
      api.update(point);
      if (host.input.io.wentUp) {
        const result = api.finish(
          point,
          host.input.io.dbl,
          host.input.io.completedClicks,
          host.onDrop,
        );
        if (result.dragged) {
          host.input.io._lastClick = { t: -9, x: 0, y: 0 };
          host.onLayoutChanged();
        }
        if (result.activate) host.onActivate(result.activate);
      } else if (!host.input.io.down) api.cancel();
    }
    host.input.setGate(live && !systemInput ? 'desktop' : null);
    // 两个 getter 每次都返回新副本/新 Set：在循环外取一次，避免每个图标
    // 每帧分配一份。
    const items = api.items;
    const selected = api.selected;
    items.forEach((item) => {
      const entry = api.entry(item.id);
      if (!entry) return;
      const x = item.x + 18,
        y = item.y;
      host.widgets.dicon(entry.icon, entry.label, x, y, { sel: selected.has(item.id) });
      if (api.focused === item.id && host.showFocus && !api.active) {
        const left = x - 15,
          top = y + 33,
          width = 78;
        host.renderer.dither(left, top, width, 1, C.black, C.white);
        host.renderer.dither(left, top + 23, width, 1, C.black, C.white);
        host.renderer.dither(left, top, 1, 24, C.black, C.white);
        host.renderer.dither(left + width - 1, top, 1, 24, C.black, C.white);
      }
    });
    if (api.pageCount > 1) {
      host.input.setGate(live && !systemInput ? 'desktop' : null);
      if (host.widgets.button(host.renderer.W - 138, 4, 24, 20, '<', { disabled: api.page === 0 }))
        host.onPage(-1);
      host.renderer.text(`Desktop ${api.page + 1}/${api.pageCount}`, host.renderer.W - 110, 10);
      if (
        host.widgets.button(host.renderer.W - 28, 4, 24, 20, '>', {
          disabled: api.page + 1 === api.pageCount,
        })
      )
        host.onPage(1);
    }
    const box = api.marquee;
    if (box) {
      host.renderer.dither(box.x, box.y, box.w, 1, C.black, C.white);
      host.renderer.dither(box.x, box.y + box.h - 1, box.w, 1, C.black, C.white);
      host.renderer.dither(box.x, box.y, 1, box.h, C.black, C.white);
      host.renderer.dither(box.x + box.w - 1, box.y, 1, box.h, C.black, C.white);
    }
    if (live && host.input.hit(0, 0, host.renderer.W, host.renderer.H - 22).rclicked) {
      const appId = api.context(point);
      host.onContextMenu(host.input.io.px, host.input.io.py, appId);
    }
    return systemInput;
  }

  function paintFileDrag(host: FileDragPaint): void {
    const selected = api.dragging
      ? api
          .fileSurface()
          .entries.filter((entry) =>
            [...api.selected].some((id) => api.entry(id)?.targetId === entry.source.id),
          )
      : [];
    const source = host.moving?.source ?? selected[0]?.source;
    if (!source) return;
    const site = host.dropSite(
      host.pointer,
      new Set(host.moving ? [source.id] : selected.map((item) => item.source.id)),
    );
    if (site && site.target.id !== 'desktop') {
      const { x, y, w, h } = site.bounds;
      host.renderer.line(x, y, x + w - 1, y, host.renderer.TH.sel);
      host.renderer.line(x, y + h - 1, x + w - 1, y + h - 1, host.renderer.TH.sel);
      host.renderer.line(x, y, x, y + h - 1, host.renderer.TH.sel);
      host.renderer.line(x + w - 1, y, x + w - 1, y + h - 1, host.renderer.TH.sel);
    }
    if (!host.moving) return;
    const x = clamp(R(host.pointer.x) + 12, 0, host.renderer.W - 110),
      y = clamp(R(host.pointer.y) + 10, 0, host.renderer.H - 50);
    host.renderer.dither(x, y, 108, 30, host.renderer.TH.face, host.renderer.TH.hi);
    host.renderer.spr(host.moving.icon, x + 2, y + 2);
    const action = site
      ? decideTransfer(source, site.target, modifierFromKeys(host.modifiers)).action
      : undefined;
    host.renderer.text(
      action && action.op !== 'none' ? action.op.toUpperCase() : 'NO DROP',
      x + 22,
      y + 3,
    );
    host.renderer.text(host.renderer.fitText(host.moving.label, 100), x + 3, y + 17);
  }

  return Object.assign(api, { paintIcons, paintFileDrag });
}

export type DesktopWorkspace = ReturnType<typeof createDesktopWorkspace>;
