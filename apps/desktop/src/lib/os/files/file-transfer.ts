// file-transfer.ts: pure decision for a drag-and-drop file transfer.
// Models WHAT a drop should do under classic Windows 95/Explorer rules, kept
// DOM-free. Hosts publish geometry, the rules decide the operation, and the
// executor revalidates records through the injected filesystem before mutation.
import type { FileSystem, FolderId } from './filesystem';
import { resolveFileOpen } from './file-types';

export interface FileTransferBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Read-only visible geometry published by a Canvas file view. */
export interface FileTransferSurface {
  bounds: FileTransferBounds;
  target: TransferTarget;
  entries: readonly {
    bounds: FileTransferBounds;
    source: TransferSource;
    target?: TransferTarget;
    label: string;
    icon: string;
  }[];
}

export interface FileSurfaceCapabilities {
  publish(windowId: string, surface: FileTransferSurface): void;
  remove(windowId: string): void;
}

export type TransferExecutionResult =
  | { ok: true; persisted: boolean; operation: Exclude<TransferAction['op'], 'none'> }
  | { ok: false; error: string };

/** Keyboard intent: Ctrl=copy, Shift=move, Alt or Ctrl+Shift=shortcut. */
export type TransferModifier = 'none' | 'copy' | 'move' | 'shortcut';

/** Logical roots behave like drive letters: same volume moves, cross copies. */
export type TransferVolume = 'documents' | 'personal' | 'bin' | 'desktop';

/** A nested folder belongs to its top-level volume, regardless of the current view. */
export function fileTransferVolume(
  files: Pick<FileSystem, 'getFolder'>,
  folderId: string,
): TransferVolume {
  const seen = new Set<string>();
  let folder = files.getFolder(folderId);
  while (folder && !seen.has(folder.id)) {
    if (folder.readonly) return 'personal';
    if (folder.id === 'desktop') return 'desktop';
    seen.add(folder.id);
    folder = folder.parent ? files.getFolder(folder.parent) : undefined;
  }
  return 'documents';
}

/** What is being dragged; 'readonly' and 'app' get special handling. */
export type TransferKind = 'file' | 'folder' | 'app' | 'readonly';

/** The dragged item and where it currently lives. */
export interface TransferSource {
  id: string;
  kind: TransferKind;
  volume: TransferVolume;
  parent: string | null;
}

/** The drop site: a folder, the Recycle Bin, or a surface that refuses drops. */
export interface TransferTarget {
  id: string;
  volume: TransferVolume;
  folder: string;
  isTrash: boolean;
  acceptsDrop: boolean;
}

/** Discriminated outcome; 'none' always carries a human-readable reason. */
export type TransferAction =
  | { op: 'move' }
  | { op: 'copy' }
  | { op: 'shortcut' }
  | { op: 'delete' }
  | { op: 'none'; reason: string };

export interface TransferDecision {
  action: TransferAction;
}

/**
 * Collapse raw held keys into a single intent. Shortcut wins over copy/move, so
 * Ctrl+Shift and Alt both read as 'shortcut'; a bare Ctrl copies, Shift moves.
 */
export function modifierFromKeys(keys: {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}): TransferModifier {
  if (keys.alt || (keys.ctrl && keys.shift)) {
    return 'shortcut';
  }
  if (keys.ctrl) {
    return 'copy';
  }
  if (keys.shift) {
    return 'move';
  }
  return 'none';
}

/**
 * Decide the drop outcome. `targetInsideSource` tells us the drop folder is the
 * dragged folder itself or one of its descendants (the caller walks the tree);
 * it is only meaningful when the source is a folder.
 *
 * Order of rules: refusals (no accept, self-descendant, same-folder) are checked
 * before the Recycle Bin and before the modifier so an impossible drop never
 * deletes or duplicates anything.
 */
export function decideTransfer(
  source: TransferSource,
  target: TransferTarget,
  modifier: TransferModifier,
  targetInsideSource = false,
): TransferDecision {
  const none = (reason: string): TransferDecision => ({ action: { op: 'none', reason } });

  if (!target.acceptsDrop) {
    return none('target does not accept drops');
  }

  // A folder cannot be dropped into itself or anything it contains.
  if (source.kind === 'folder' && targetInsideSource) {
    return none('cannot move a folder into itself or its own descendant');
  }

  if (target.isTrash) {
    if (source.kind === 'app') {
      return none('cannot delete an application launcher');
    }
    if (source.kind === 'readonly') {
      return none('cannot delete a read-only item');
    }
    return { action: { op: 'delete' } };
  }

  const sameFolder = source.volume === target.volume && source.parent === target.folder;

  // Explicit intent wins everywhere except a plain self-drop; a shortcut dropped
  // on the item's own folder is still useful, so it is allowed.
  if (modifier === 'copy') {
    return guardReadonly(source, { op: 'copy' }, none);
  }
  if (modifier === 'move') {
    if (sameFolder) {
      return none('item is already here');
    }
    return guardReadonly(source, { op: 'move' }, none);
  }
  if (modifier === 'shortcut') {
    return guardReadonly(source, { op: 'shortcut' }, none);
  }

  // Default (no modifier): a bare self-drop is a no-op.
  if (sameFolder) {
    return none('item is already here');
  }

  // Apps default to a shortcut; otherwise same volume moves, cross-volume copies.
  if (source.kind === 'app') {
    return { action: { op: 'shortcut' } };
  }
  const op = source.volume === target.volume ? 'move' : 'copy';
  return guardReadonly(source, op === 'move' ? { op: 'move' } : { op: 'copy' }, none);
}

/** Read-only sources may be copied or shortcutted, never moved or deleted. */
function guardReadonly(
  source: TransferSource,
  action: { op: 'move' } | { op: 'copy' } | { op: 'shortcut' },
  none: (reason: string) => TransferDecision,
): TransferDecision {
  if (source.kind === 'readonly' && action.op === 'move') {
    return none('cannot move a read-only item');
  }
  return { action };
}

/** Execute every file view's transfer through the same filesystem Interface. */
export async function executeTransfer(
  files: FileSystem,
  source: TransferSource,
  target: TransferTarget,
  modifier: TransferModifier,
): Promise<TransferExecutionResult> {
  const sourceFolder = source.kind === 'app' ? undefined : files.getFolder(source.id);
  const sourceFile = source.kind === 'app' ? undefined : files.get(source.id);
  if (
    source.kind !== 'app' &&
    (!sourceFolder || sourceFolder.deleted) &&
    (!sourceFile || sourceFile.deleted)
  )
    return { ok: false, error: 'The source item is missing.' };
  const destination = files.getFolder(target.folder);
  const actualTarget = {
    ...target,
    volume: target.isTrash ? ('bin' as const) : fileTransferVolume(files, target.folder),
    acceptsDrop:
      target.acceptsDrop &&
      (target.isTrash || (!!destination && !destination.deleted && !destination.readonly)),
  };
  let parent = destination;
  const seen = new Set<string>();
  let inside = false;
  while (parent && !seen.has(parent.id)) {
    if (parent.id === source.id) inside = true;
    seen.add(parent.id);
    parent = parent.parent ? files.getFolder(parent.parent) : undefined;
  }
  const actualSource: TransferSource = {
    ...source,
    kind:
      sourceFolder?.readonly || sourceFile?.readonly
        ? 'readonly'
        : sourceFolder
          ? 'folder'
          : source.kind,
    parent: sourceFolder?.parent ?? sourceFile?.folder ?? source.parent,
    volume:
      sourceFolder?.readonly || sourceFile?.readonly
        ? 'personal'
        : fileTransferVolume(
            files,
            sourceFolder?.id ?? sourceFile?.folder ?? source.parent ?? 'root',
          ),
  };
  const { action } = decideTransfer(actualSource, actualTarget, modifier, inside);
  if (action.op === 'none') return { ok: false, error: action.reason };
  const folder = target.folder as FolderId;
  if (action.op === 'shortcut' || source.kind === 'app') {
    const resolved =
      source.kind === 'app'
        ? { kind: 'application' as const, application: source.id }
        : resolveFileOpen(files, source.id);
    const appId =
      resolved.kind === 'folder'
        ? 'computer'
        : resolved.kind === 'application'
          ? resolved.application
          : resolved.kind === 'choose'
            ? resolved.applications[0]
            : undefined;
    if (!appId) return { ok: false, error: 'This item has no compatible application.' };
    const title = sourceFolder?.name ?? sourceFile?.name ?? source.id;
    let name = `${title.slice(0, 51)} - Shortcut`;
    let serial = 2;
    while (files.findByName(name, folder)) name = `${title.slice(0, 46)} - Shortcut (${serial++})`;
    const result = files.createShortcut(
      name,
      {
        appId,
        ...(source.kind === 'app' ? {} : { fileId: source.id }),
      },
      folder,
    );
    return result.ok
      ? { ok: true, persisted: result.persisted, operation: 'shortcut' }
      : { ok: false, error: result.error ?? 'The shortcut could not be created.' };
  }
  const result = sourceFolder
    ? action.op === 'delete'
      ? files.removeFolder(sourceFolder.id)
      : action.op === 'move'
        ? files.moveFolder(sourceFolder.id, folder)
        : await files.copyFolder(sourceFolder.id, folder)
    : action.op === 'delete'
      ? files.remove(source.id)
      : action.op === 'move'
        ? files.move(source.id, folder)
        : await files.copy(source.id, folder);
  return result.ok
    ? { ok: true, persisted: result.persisted, operation: action.op }
    : { ok: false, error: result.error ?? 'The item could not be transferred.' };
}
