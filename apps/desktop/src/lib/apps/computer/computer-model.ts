import { APP_CATALOG, catalogIcon, type CatalogApp } from '../../../data/app-catalog';
import { displayedFileName, fileType } from '../../os/files/file-types';
import type { FileSystem, FolderId, SandboxFile } from '../../os/files/filesystem';
import { moveList } from '../../ui/canvas/list-navigation';

export type ComputerPath = '' | 'documents' | 'personal' | 'programs' | 'control';
export interface ComputerEntry {
  readonly icon: string;
  readonly label: string;
  readonly open?: string;
  readonly path?: ComputerPath;
  readonly fileId?: string;
  readonly folder?: FolderId;
}
const ROOT: ComputerEntry[] = [
  { icon: 'i_folder', label: 'Personal Site', path: 'personal' },
  { icon: 'i_folder', label: 'Desktop', path: 'documents', folder: 'desktop' },
  { icon: 'i_folder', label: 'My Documents', path: 'documents', folder: 'root' },
  { icon: 'i_computer', label: 'Programs', path: 'programs' },
  { icon: 'i_display', label: 'Control Panel', open: 'control-panel' },
  { icon: 'i_bin', label: 'Recycle Bin', open: 'bin' },
];
const PROGRAMS: ComputerEntry[] = (APP_CATALOG as readonly CatalogApp[])
  .filter((app) => app.menu === 'Programs')
  .map((app) => ({ icon: catalogIcon(app.id), label: app.name, open: app.id }));
const CONTROL: ComputerEntry[] = (APP_CATALOG as readonly CatalogApp[])
  .filter((app) => app.applet)
  .map((app) => ({ icon: catalogIcon(app.id), label: app.name, open: app.id }));
const TITLES: Record<ComputerPath, string> = {
  '': 'My Computer',
  documents: 'My Documents',
  personal: 'Personal Site',
  programs: 'Programs',
  control: 'Control Panel',
};
export function fileBytes(file: SandboxFile | undefined): number {
  return file?.size ?? (file ? new TextEncoder().encode(file.content).byteLength : 0);
}

type Sort = 'none' | 'name' | 'type' | 'size';
export interface ComputerBrowseState {
  path: ComputerPath;
  folder: FolderId;
  sel: number;
  top: number;
  notice: string;
  sort: Sort;
  descending: boolean;
  canBack: boolean;
  canForward: boolean;
}
export type ComputerBrowseCommand =
  | 'back'
  | 'forward'
  | 'up'
  | 'refresh'
  | 'sort-name'
  | 'sort-type'
  | 'sort-size'
  | 'reverse-sort'
  | 'ArrowDown'
  | 'ArrowUp'
  | 'Home'
  | 'End'
  | 'PageDown'
  | 'PageUp';
export type ComputerAction =
  | { type: 'navigate'; path: ComputerPath; folder?: FolderId }
  | { type: 'command'; command: ComputerBrowseCommand }
  | { type: 'select'; index: number }
  | { type: 'select-key'; key: string }
  | { type: 'select-entry'; id: string }
  | { type: 'click'; index: number; at: number; double: boolean }
  | { type: 'search'; text: string; at: number }
  | { type: 'viewport'; rows: number }
  | { type: 'scroll'; delta: number }
  | { type: 'reveal' }
  | { type: 'clear-click' }
  | { type: 'reconcile' }
  | { type: 'notice'; message: string }
  | { type: 'report'; result: { ok: boolean; error?: string; persisted?: boolean } };
export type ComputerResult =
  | { kind: 'handled' }
  | { kind: 'activate'; entry: ComputerEntry }
  | { kind: 'reset'; reason: 'epoch' | 'missing-folder' }
  | { kind: 'failed'; message: string };
export const computerEntryKey = (
  path: ComputerPath,
  entry: ComputerEntry,
  folder: FolderId = 'root',
): string => `${path}/${folder}:${entry.fileId || entry.folder || entry.path || entry.open}`;

/** Own browsing decisions; FileSystem remains the owner of every file transaction. */
export function createComputerModel(
  files: FileSystem,
  options: { showFileExtensions?(): boolean } = {},
) {
  const s: ComputerBrowseState = {
    path: '',
    folder: 'root',
    sel: -1,
    top: 0,
    notice: '',
    sort: 'none',
    descending: false,
    canBack: false,
    canForward: false,
  };
  type Location = { path: ComputerPath; folder: FolderId };
  let history: Location[] = [],
    future: Location[] = [];
  let epoch = files.epoch,
    rows = 1;
  let search = '',
    searchAt = 0;
  let lastClick: { key: string; at: number } | undefined;
  function entries(path: ComputerPath, folder: FolderId = 'root'): ComputerEntry[] {
    if (path === 'documents' || path === 'personal') {
      const showExtensions = options.showFileExtensions?.() ?? true;
      const directories: ComputerEntry[] =
        path === 'documents' || folder.startsWith('library:')
          ? files.folders(folder).map((item) => ({
              icon: 'i_folder',
              label: item.name,
              path: 'documents' as const,
              folder: item.id,
            }))
          : files
              .folders(null)
              .filter((item) => item.readonly)
              .map((item) => ({
                icon: 'i_folder',
                label: item.name,
                path: 'documents' as const,
                folder: item.id,
              }));
      return [
        ...directories,
        ...files.list(path, folder).map((file) => ({
          icon: file.target ? catalogIcon(file.target.appId) : fileType(file.name).icon,
          label: displayedFileName(file.name, showExtensions),
          fileId: file.id,
          open: file.appId,
        })),
      ];
    }
    return [...(path === 'programs' ? PROGRAMS : path === 'control' ? CONTROL : ROOT)];
  }
  function visibleEntries(): ComputerEntry[] {
    const list = entries(s.path, s.folder);
    if (s.sort === 'none' || !s.path) return list;
    return list.sort((a, b) => {
      const directory = Number(!!b.folder) - Number(!!a.folder);
      if (directory) return directory;
      const av = a.fileId ? files.get(a.fileId) : undefined;
      const bv = b.fileId ? files.get(b.fileId) : undefined;
      const order =
        s.sort === 'size'
          ? fileBytes(av) - fileBytes(bv)
          : s.sort === 'type'
            ? (av ? fileType(av.name).description : '').localeCompare(
                bv ? fileType(bv.name).description : '',
              )
            : 0;
      return (
        (s.descending ? -1 : 1) *
        (order || a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }))
      );
    });
  }

  function navigate(path: ComputerPath, folder: FolderId = 'root', remember = true) {
    if (s.path === path && s.folder === folder) return;
    if (remember) {
      history.push({ path: s.path, folder: s.folder });
      history = history.slice(-32);
      future = [];
    }
    s.path = path;
    s.folder = folder;
    s.sel = -1;
    s.top = 0;
    s.notice = '';
    lastClick = undefined;
    search = '';
  }
  function clamp() {
    const list = visibleEntries();
    s.sel = Math.max(-1, Math.min(s.sel, list.length - 1));
    s.top = Math.max(0, Math.min(Math.max(0, list.length - rows), s.top));
    s.canBack = history.length > 0;
    s.canForward = future.length > 0;
  }
  function reveal() {
    s.top = Math.max(0, Math.min(s.top, s.sel));
    if (s.sel >= s.top + rows) s.top = s.sel - rows + 1;
  }
  function command(action: ComputerBrowseCommand) {
    const list = visibleEntries();
    if (action === 'back' || action === 'forward') {
      const from = action === 'back' ? history : future;
      const to = action === 'back' ? future : history;
      const destination = from.pop();
      if (destination) {
        to.push({ path: s.path, folder: s.folder });
        navigate(destination.path, destination.folder, false);
      }
    } else if (action === 'up') {
      if (s.path === 'documents' && s.folder !== 'root') {
        const parent = files.getFolder(s.folder)?.parent;
        navigate(parent === null ? '' : 'documents', parent ?? 'root');
      } else navigate('');
    } else if (action === 'refresh') {
      s.notice = `${list.length} object(s). Refreshed.`;
      lastClick = undefined;
    } else if (action.startsWith('sort-') || action === 'reverse-sort') {
      const chosen = list[s.sel];
      const key = chosen && computerEntryKey(s.path, chosen, s.folder);
      if (action === 'reverse-sort') s.descending = !s.descending;
      else {
        const sort = action.slice(5) as Exclude<Sort, 'none'>;
        s.descending = s.sort === sort ? !s.descending : false;
        s.sort = sort;
      }
      s.sel = key
        ? visibleEntries().findIndex((entry) => computerEntryKey(s.path, entry, s.folder) === key)
        : -1;
      lastClick = undefined;
    } else {
      const moved = moveList({ count: list.length, rows, index: s.sel, top: s.top }, action);
      if (moved) {
        s.sel = moved.index;
        s.top = moved.top;
      }
    }
  }
  function apply(action: ComputerAction): ComputerResult {
    const list = visibleEntries();
    switch (action.type) {
      case 'navigate':
        navigate(action.path, action.folder);
        break;
      case 'command':
        command(action.command);
        break;
      case 'select':
        s.sel = action.index;
        if (action.index < 0) lastClick = undefined;
        break;
      case 'select-key':
        s.sel = list.findIndex((entry) => computerEntryKey(s.path, entry, s.folder) === action.key);
        break;
      case 'select-entry':
        s.sel = list.findIndex((entry) => (entry.fileId ?? entry.folder) === action.id);
        break;
      case 'click': {
        const entry = list[action.index];
        if (!entry) break;
        const key = computerEntryKey(s.path, entry, s.folder);
        const activate = action.double && lastClick?.key === key && action.at - lastClick.at < 0.45;
        lastClick = { key, at: action.at };
        s.sel = action.index;
        if (activate) return { kind: 'activate', entry: Object.freeze({ ...entry }) };
        break;
      }
      case 'search': {
        search = (action.at - searchAt > 0.8 ? '' : search) + action.text.toLocaleLowerCase();
        searchAt = action.at;
        const found = list.findIndex((entry) => entry.label.toLocaleLowerCase().startsWith(search));
        if (found >= 0) s.sel = found;
        reveal();
        break;
      }
      case 'viewport':
        rows = Math.max(1, Math.floor(action.rows));
        break;
      case 'scroll':
        s.top += action.delta;
        break;
      case 'reveal':
        reveal();
        break;
      case 'clear-click':
        lastClick = undefined;
        break;
      case 'reconcile': {
        const reset = epoch !== files.epoch;
        epoch = files.epoch;
        if (reset) {
          history = [];
          future = [];
          s.sel = -1;
          s.top = 0;
          lastClick = undefined;
          search = '';
        }
        const folder = files.getFolder(s.folder);
        const missing = !folder || folder.deleted;
        if (missing) {
          s.folder = 'root';
          s.sel = -1;
          lastClick = undefined;
        }
        if (reset || missing) return { kind: 'reset', reason: reset ? 'epoch' : 'missing-folder' };
        break;
      }
      case 'notice':
        s.notice = action.message;
        break;
      case 'report':
        s.notice = action.result.error || files.notice;
        if (!action.result.ok)
          return {
            kind: 'failed',
            message: action.result.error || 'The operation could not be completed.',
          };
        break;
    }
    return { kind: 'handled' };
  }
  return {
    get state(): Readonly<ComputerBrowseState> {
      return Object.freeze({ ...s });
    },
    entries(path = s.path, folder = s.folder): readonly ComputerEntry[] {
      const list =
        path === s.path && folder === s.folder ? visibleEntries() : entries(path, folder);
      return Object.freeze(list.map((entry) => Object.freeze({ ...entry })));
    },
    writable(): boolean {
      const folder = files.getFolder(s.folder);
      return s.path === 'documents' && !!folder && !folder.deleted && !folder.readonly;
    },
    canModify(entry: ComputerEntry | undefined): boolean {
      if (entry?.fileId) return !files.get(entry.fileId)?.readonly;
      return !!entry?.folder?.startsWith('folder:');
    },
    title(): string {
      return s.path === 'documents' ? files.folderPath(s.folder) : TITLES[s.path];
    },
    dispatch(action: ComputerAction): ComputerResult {
      const result = apply(action);
      clamp();
      return result;
    },
  };
}
