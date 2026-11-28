import { STORAGE_KEYS } from '../../../data/storage-keys';
import {
  FILE_FOLDERS,
  MAX_FILES,
  MAX_DESKTOP_SHORTCUTS,
  MAX_TEXT,
  MAX_CUSTOM_FOLDERS,
  validName,
  initialFolder,
  cloneFile,
  validShortcut,
  validBinary,
  parseSavedFiles,
  desktopSeed,
  type FolderId,
  type FileFolder,
  type FileResult,
  type FolderResult,
  type SandboxFile,
  type TransferResult,
} from './filesystem-records';
export { FILE_FOLDERS } from './filesystem-records';
export type {
  FolderId,
  FileFolder,
  FileResult,
  FolderResult,
  SandboxFile,
  TransferResult,
} from './filesystem-records';
export interface FileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface FileSystemOptions {
  now?: () => number;
  library?: {
    folders: readonly FileFolder[];
    files: readonly SandboxFile[];
    /** Load immutable publication text only when an operation needs its body. */
    readText?: (id: string) => Promise<string | undefined>;
  };
  /** Catalog-owned defaults are materialized once as ordinary mutable shortcut files. */
  desktopShortcuts?: readonly { appId: string; name: string }[];
  /** Release only binary references removed by a successful durable replacement. */
  releaseAssets?: (ids: readonly string[]) => void;
}
export type FileTextResult = { ok: true; text: string } | { ok: false; error: string };
export const folderName = (id: FolderId): string =>
  FILE_FOLDERS.find((folder) => folder.id === id)?.name ?? 'Folder';

// The visitor's local sandbox. Personal site links never enter the writable store.
export const FILES_KEY = STORAGE_KEYS.files;
const LEGACY_DIARY_KEY = STORAGE_KEYS.diary;
export const ORIGINAL_DIARY =
  'Dear diary,\n\nDay 1: the loss curve goes down.\nI am told this is good.\n\nDay 2: the paperclip asked if I\nwanted help. I said no.\nIt helped anyway.\n\nDay 3: P(doom) is 5%.\nIt feels higher.';
const PERSONAL: SandboxFile[] = [
  ['about', 'profile', 'MiraHikari'],
  ['blog', 'blog', 'Blog'],
  ['gallery', 'gallery', 'Gallery'],
  ['skills', 'skills', 'Skills'],
].map(([id, appId, name]) => ({
  id: `personal:${id}`,
  name,
  appId,
  content: '',
  folder: 'root',
  source: 'personal',
  deleted: false,
  readonly: true,
  kind: 'shortcut',
  target: { appId },
}));
function initialFiles(diary = ORIGINAL_DIARY): SandboxFile[] {
  return [
    {
      id: 'diary',
      name: 'diary.txt',
      content: diary,
      folder: 'root',
      source: 'visitor',
      deleted: false,
      readonly: false,
    },
  ];
}
export function createFileSystem(
  storage: FileStorage | null,
  options: FileSystemOptions = {},
): FileSystem {
  const now = options.now ?? Date.now;
  const libraryFolders = (options.library?.folders ?? []).map((folder) => ({
    ...folder,
    readonly: true,
  }));
  const libraryFiles = (options.library?.files ?? []).map((file) => ({
    ...cloneFile(file),
    source: 'personal' as const,
    readonly: true,
    deleted: false,
  }));
  const libraryTextReads = new Map<string, Promise<FileTextResult>>();
  const loadedLibraryText = new Set<string>();
  let folders: FileFolder[] = [];
  let files = initialFiles(),
    revision = 0,
    epoch = 0,
    serial = 0;
  let storedSnapshot: string | null = null;
  let notice = '',
    recoveryRaw: string | undefined,
    persisted = false;
  let desktopInitialized = false;
  try {
    if (!storage) throw new Error('No storage');
    const raw = storage.getItem(FILES_KEY);
    storedSnapshot = raw;
    if (raw !== null) {
      recoveryRaw = raw;
      const parsed = parseSavedFiles(JSON.parse(raw));
      if (!parsed) throw new Error('Invalid save');
      files = parsed.files;
      folders = parsed.folders;
      desktopInitialized = parsed.desktopInitialized;
      recoveryRaw = undefined;
      persisted = true;
    } else {
      const diary = storage.getItem(LEGACY_DIARY_KEY);
      if (diary !== null) {
        files = initialFiles(diary.slice(0, MAX_TEXT));
        if (diary.length > MAX_TEXT) {
          recoveryRaw = JSON.stringify({ legacyDiary: diary });
          notice = 'Saved diary is too large. Export a backup before Reset.';
        }
      }
    }
  } catch {
    notice =
      recoveryRaw === undefined
        ? 'Storage unavailable. Session only; export to keep files.'
        : 'Saved data is damaged. Export a backup before Reset.';
  }
  const persist = () => {
    if (recoveryRaw !== undefined) {
      persisted = false;
      return false;
    }
    try {
      if (!storage) throw new Error('No storage');
      // Reject a stale tab's whole snapshot. This synchronous check is not a
      // cross-tab transaction: truly simultaneous read/write requires a lock.
      if (storage.getItem(FILES_KEY) !== storedSnapshot) {
        persisted = false;
        notice = 'Files changed in another tab. Session copy kept; export your edits, then reload.';
        return false;
      }
      const nextSnapshot = JSON.stringify({
        version: 1,
        files: files.filter((file) => !file.transient),
        ...(folders.length ? { folders } : {}),
        ...(desktopInitialized ? { desktopInitialized: true } : {}),
      });
      storage.setItem(FILES_KEY, nextSnapshot);
      storedSnapshot = nextSnapshot;
      persisted = true;
      notice = 'Saved on this computer.';
      return true;
    } catch {
      persisted = false;
      notice = 'Storage unavailable. Session only; export to keep files.';
      return false;
    }
  };
  const versions = new Map(files.map((file) => [file.id, 0]));
  const fail = (error: string): FileResult => ({ ok: false, persisted, error });
  const finish = (file?: SandboxFile, touched: readonly SandboxFile[] = []): FileResult => {
    revision++;
    if (file) versions.set(file.id, revision);
    for (const changed of touched) versions.set(changed.id, revision);
    persist();
    if (file?.transient || touched.some((changed) => changed.transient))
      notice = 'File available for this session. Export it to keep a copy.';
    return { ok: true, persisted: persisted && !file?.transient, file: file && cloneFile(file) };
  };
  const writable = (id: string) => files.find((file) => file.id === id && !file.deleted);
  const visitorFileCount = () => files.filter((file) => !desktopSeed(file)).length;
  const allFolders = (): FileFolder[] => [...FILE_FOLDERS, ...folders, ...libraryFolders];
  const getFolder = (id: string) => allFolders().find((folder) => folder.id === id);
  const writableFolder = (id: string) => {
    const folder = getFolder(id);
    return folder && !folder.deleted && !folder.readonly;
  };
  const isFolder = (id: unknown): id is FolderId => typeof id === 'string' && !!getFolder(id);
  const childOf = (id: string, ancestor: string): boolean => {
    const seen = new Set<string>();
    let folder = getFolder(id);
    while (folder?.parent && !seen.has(folder.id)) {
      if (folder.parent === ancestor) return true;
      seen.add(folder.id);
      folder = getFolder(folder.parent);
    }
    return false;
  };
  const availableParent = (id: FolderId): FolderId => {
    let folder = getFolder(id);
    while (folder && !writableFolder(folder.id))
      folder = folder.parent ? getFolder(folder.parent) : undefined;
    return folder?.id ?? 'root';
  };
  const nameExists = (name: string, parent: FolderId | null, except?: string): boolean =>
    files.some(
      (file) =>
        !file.deleted &&
        file.id !== except &&
        file.folder === parent &&
        file.name.toLowerCase() === name.toLowerCase(),
    ) ||
    allFolders().some(
      (folder) =>
        !folder.deleted &&
        folder.id !== except &&
        (folder.parent ?? null) === parent &&
        folder.name.toLowerCase() === name.toLowerCase(),
    );
  const newId = (kind: 'file' | 'folder') => {
    let id: string;
    do {
      id = `${kind}:${now().toString(36)}:${serial++}`;
    } while (files.some((file) => file.id === id) || isFolder(id));
    return id;
  };
  const uniqueName = (name: string, folder: FolderId, except?: string) => {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 ? name.slice(dot) : '',
      stem = dot > 0 ? name.slice(0, dot) : name;
    let candidate = name,
      n = 2;
    while (nameExists(candidate, folder, except)) {
      const suffix = ` (${n++})`,
        extension = ext.slice(0, 63 - suffix.length);
      candidate = stem.slice(0, 64 - suffix.length - extension.length) + suffix + extension;
    }
    return candidate;
  };
  const create = (
    name: string,
    content: string,
    folder: FolderId,
    generated?: { source: 'chat' | 'story'; key: string },
    extra?: Pick<SandboxFile, 'kind' | 'mime' | 'size' | 'assetId' | 'target' | 'transient'>,
  ): FileResult => {
    name = name.trim();
    if (!writableFolder(folder)) return fail('Choose a writable destination folder.');
    if (!validName(name)) return fail('Use 1-64 characters without / \\ : * ? " < > |.');
    if (content.length > MAX_TEXT) return fail('Text files can contain up to 20,000 characters.');
    if (visitorFileCount() >= MAX_FILES)
      return fail('The sandbox is full. Empty the Recycle Bin first.');
    if (uniqueName(name, folder) !== name)
      return fail('A file with this name already exists in this folder.');
    const id = newId('file');
    const file: SandboxFile = {
      id,
      name,
      content,
      folder,
      source: generated?.source ?? 'visitor',
      deleted: false,
      readonly: false,
      ...(generated ? { generatedKey: generated.key } : {}),
      ...extra,
    };
    files.push(file);
    return finish(file);
  };
  let clipboard: {
    id: string;
    mode: 'copy' | 'cut';
    kind: 'file' | 'folder';
    epoch: number;
  } | null = null;
  const materializeDesktop = (): SandboxFile[] | undefined => {
    if (options.desktopShortcuts === undefined || desktopInitialized) return;
    desktopInitialized = true;
    const created: SandboxFile[] = [];
    for (const seed of options.desktopShortcuts.slice(0, MAX_DESKTOP_SHORTCUTS)) {
      const id = `desktop:app:${seed.appId}`;
      if (
        !validShortcut({ appId: seed.appId }) ||
        !validName(seed.name) ||
        files.some(
          (file) =>
            file.id === id ||
            (file.folder === 'desktop' && file.target?.appId === seed.appId && !file.target.fileId),
        )
      )
        continue;
      const file: SandboxFile = {
        id,
        name: uniqueName(seed.name, 'desktop'),
        content: '',
        folder: 'desktop',
        source: 'visitor',
        deleted: false,
        readonly: false,
        kind: 'shortcut',
        target: { appId: seed.appId },
      };
      files.push(file);
      created.push(file);
    }
    return created;
  };
  /** Destructive replacements become visible only after the durable snapshot commits. */
  const replaceSnapshot = (
    replacementFiles: SandboxFile[],
    replacementFolders: FileFolder[],
    initialized: boolean,
    invalidateSessions = true,
  ): FileResult => {
    const previous = { files, folders, desktopInitialized, recoveryRaw };
    files = replacementFiles;
    folders = replacementFolders;
    desktopInitialized = initialized;
    recoveryRaw = undefined;
    materializeDesktop();
    if (!persist()) {
      files = previous.files;
      folders = previous.folders;
      desktopInitialized = previous.desktopInitialized;
      recoveryRaw = previous.recoveryRaw;
      return fail(`${notice} Existing files were kept.`);
    }
    revision++;
    if (invalidateSessions) {
      epoch++;
      clipboard = null;
      versions.clear();
      files.forEach((file) => versions.set(file.id, revision));
    } else {
      for (const id of versions.keys())
        if (!files.some((file) => file.id === id)) versions.delete(id);
    }
    const retained = new Set(files.flatMap((file) => (file.assetId ? [file.assetId] : [])));
    const removed = [
      ...new Set(
        previous.files.flatMap((file) =>
          file.assetId && !retained.has(file.assetId) ? [file.assetId] : [],
        ),
      ),
    ];
    try {
      options.releaseAssets?.(removed);
    } catch {
      /* Durable files remain authoritative. */
    }
    return { ok: true, persisted: true };
  };
  const folderFailure = (error: string): FolderResult => ({ ok: false, persisted, error });
  const uniqueFolderName = (name: string, parent: FolderId, except?: string): string => {
    let candidate = name,
      suffix = 2;
    while (nameExists(candidate, parent, except)) {
      const tail = ` (${suffix++})`;
      candidate = name.slice(0, 64 - tail.length) + tail;
    }
    return candidate;
  };
  const copyTree = async (id: FolderId, destination: FolderId): Promise<FolderResult> => {
    const source = getFolder(id);
    if (!source || source.deleted) return folderFailure('The source folder is missing.');
    if (!writableFolder(destination)) return folderFailure('Choose a writable destination folder.');
    if (id === destination || childOf(destination, id))
      return folderFailure('A folder cannot be copied into itself.');
    const tree = allFolders().filter(
      (folder) => !folder.deleted && (folder.id === id || childOf(folder.id, id)),
    );
    const ids = new Set(tree.map((folder) => folder.id));
    const contents = [...files, ...libraryFiles].filter(
      (file) => !file.deleted && ids.has(file.folder),
    );
    const publications = contents.filter(
      (file) =>
        file.source === 'personal' &&
        (!file.kind || file.kind === 'text') &&
        options.library?.readText,
    );
    if (publications.length) {
      const acceptedEpoch = epoch;
      const loaded = await Promise.all(publications.map((file) => api.readText(file.id)));
      const failure = loaded.find((result) => !result.ok);
      if (failure && !failure.ok) return folderFailure(failure.error);
      if (acceptedEpoch !== epoch)
        return folderFailure('Files were reset while the folder was loading. Try copying again.');
      if (!writableFolder(destination))
        return folderFailure('The destination folder is no longer available.');
    }
    if (
      folders.length + tree.length > MAX_CUSTOM_FOLDERS ||
      visitorFileCount() + contents.length > MAX_FILES
    )
      return folderFailure('There is not enough space in the directory.');
    if (contents.some((file) => file.content.length > MAX_TEXT))
      return folderFailure('This document is too large to copy into My Documents.');
    const replacements = new Map(tree.map((folder) => [folder.id, newId('folder') as FolderId]));
    const created = tree.map((folder): FileFolder => ({
      id: replacements.get(folder.id)!,
      name: folder.id === id ? uniqueFolderName(folder.name, destination) : folder.name,
      parent: folder.id === id ? destination : replacements.get(folder.parent!)!,
    }));
    const copied = contents.map((file): SandboxFile => {
      const copy = {
        ...cloneFile(file),
        id: newId('file'),
        folder: replacements.get(file.folder)!,
        source: 'visitor' as const,
        readonly: false,
        deleted: false,
      };
      if (copy.appId) {
        copy.kind = 'shortcut';
        copy.target = { appId: copy.appId };
        delete copy.appId;
      }
      delete copy.generatedKey;
      delete copy.deletedWith;
      return copy;
    });
    folders.push(...created);
    files.push(...copied);
    finish(undefined, copied);
    return {
      ok: true,
      persisted: persisted && copied.every((file) => !file.transient),
      folder: { ...created.find((folder) => folder.id === replacements.get(id))! },
    };
  };
  const api = {
    folders(parent?: FolderId | null): FileFolder[] {
      return allFolders()
        .filter(
          (folder) =>
            !folder.deleted && (parent === undefined || (folder.parent ?? null) === parent),
        )
        .map((folder) => ({ ...folder }));
    },
    getFolder(id: string): FileFolder | undefined {
      const folder = getFolder(id);
      return folder && { ...folder };
    },
    folderPath(id: FolderId): string {
      const parts: string[] = [],
        seen = new Set<string>();
      let folder = getFolder(id);
      while (folder && !seen.has(folder.id)) {
        parts.unshift(folder.name);
        seen.add(folder.id);
        folder = folder.parent ? getFolder(folder.parent) : undefined;
      }
      return parts.join('\\');
    },
    folderName(id: FolderId): string {
      return api.folders().find((folder) => folder.id === id)?.name ?? 'Folder';
    },
    createFolder(name?: string, parent: FolderId = 'root'): FolderResult {
      if (!writableFolder(parent)) return folderFailure('Choose a writable destination folder.');
      if (folders.length >= MAX_CUSTOM_FOLDERS)
        return folderFailure('The folder directory is full. Empty the Recycle Bin first.');
      let chosen = name?.trim() ?? 'New Folder';
      if (!validName(chosen))
        return { ok: false, persisted, error: 'Use 1-64 characters without / \\ : * ? " < > |.' };
      const exists = (value: string) => nameExists(value, parent);
      if (name !== undefined && exists(chosen))
        return { ok: false, persisted, error: 'A folder with this name already exists.' };
      let suffix = 2;
      while (exists(chosen)) chosen = `New Folder (${suffix++})`;
      const id = newId('folder') as FolderId;
      const folder = { id, name: chosen, parent };
      folders.push(folder);
      finish();
      return { ok: true, persisted, folder: { ...folder } };
    },
    renameFolder(id: FolderId, name: string): FolderResult {
      const folder = folders.find((entry) => entry.id === id && !entry.deleted);
      name = name.trim();
      if (!folder) return { ok: false, persisted, error: 'This folder cannot be renamed.' };
      if (!validName(name)) return { ok: false, persisted, error: 'Choose a valid folder name.' };
      if (nameExists(name, folder.parent ?? 'root', id))
        return { ok: false, persisted, error: 'A folder with this name already exists.' };
      folder.name = name;
      finish();
      return { ok: true, persisted, folder: { ...folder } };
    },
    moveFolder(id: FolderId, parent: FolderId): FolderResult {
      const folder = folders.find((entry) => entry.id === id && !entry.deleted);
      if (!folder) return folderFailure('This folder cannot be moved.');
      if (!writableFolder(parent)) return folderFailure('Choose a writable destination folder.');
      if (id === parent || childOf(parent, id))
        return folderFailure('A folder cannot be moved into itself.');
      if (folder.parent === parent) return { ok: true, persisted, folder: { ...folder } };
      if (nameExists(folder.name, parent, id))
        return folderFailure('An item with this name already exists in that folder.');
      folder.parent = parent;
      finish();
      return { ok: true, persisted, folder: { ...folder } };
    },
    copyFolder: copyTree,
    removeFolder(id: FolderId): FolderResult {
      const folder = folders.find((entry) => entry.id === id && !entry.deleted);
      if (!folder) return folderFailure('This folder cannot be deleted.');
      const descendants = folders.filter(
        (entry) => !entry.deleted && (entry.id === id || childOf(entry.id, id)),
      );
      const ids = new Set(descendants.map((entry) => entry.id));
      const changed = files.filter((file) => !file.deleted && ids.has(file.folder));
      for (const entry of descendants) {
        entry.deleted = true;
        entry.deletedWith = id;
      }
      for (const file of changed) {
        file.deleted = true;
        file.deletedWith = id;
      }
      finish(undefined, changed);
      return { ok: true, persisted, folder: { ...folder } };
    },
    deletedFolders(): FileFolder[] {
      return folders
        .filter(
          (folder) => folder.deleted && (!folder.deletedWith || folder.deletedWith === folder.id),
        )
        .map((folder) => ({ ...folder }));
    },
    restoreFolder(id: FolderId): FolderResult {
      const folder = folders.find((entry) => entry.id === id && entry.deleted);
      if (!folder) return folderFailure('This folder is not in the Recycle Bin.');
      const parent = availableParent(folder.parent ?? 'root');
      folder.name = uniqueFolderName(folder.name, parent, id);
      folder.parent = parent;
      const group = folder.deletedWith ?? id;
      const descendants = folders.filter(
        (entry) =>
          entry.id === id ||
          (entry.deleted && entry.deletedWith === group && childOf(entry.id, id)),
      );
      const ids = new Set(descendants.map((entry) => entry.id));
      const changed = files.filter(
        (file) => file.deleted && file.deletedWith === group && ids.has(file.folder),
      );
      for (const entry of descendants) {
        entry.deleted = false;
        delete entry.deletedWith;
      }
      for (const file of changed) {
        file.deleted = false;
        delete file.deletedWith;
      }
      finish(undefined, changed);
      return { ok: true, persisted, folder: { ...folder } };
    },
    get notice() {
      return notice;
    },
    get revision() {
      return revision;
    },
    get epoch() {
      return epoch;
    },
    get persisted() {
      return persisted;
    },
    list(location: 'documents' | 'personal' | 'bin', folder: FolderId = 'root'): SandboxFile[] {
      return (
        location === 'personal'
          ? folder.startsWith('library:')
            ? libraryFiles.filter((file) => file.folder === folder)
            : PERSONAL
          : [...files, ...libraryFiles].filter((file) =>
              location === 'bin' ? file.deleted : !file.deleted && file.folder === folder,
            )
      ).map(cloneFile);
    },
    findByName(name: string, folder: FolderId = 'root'): SandboxFile | undefined {
      const file = [...files, ...libraryFiles].find(
        (file) =>
          !file.deleted &&
          file.folder === folder &&
          file.name.toLowerCase() === name.trim().toLowerCase(),
      );
      return file && cloneFile(file);
    },
    get(id: string): SandboxFile | undefined {
      const file = [...PERSONAL, ...libraryFiles, ...files].find((file) => file.id === id);
      return file && cloneFile(file);
    },
    getVersion(id: string): number | undefined {
      return files.some((file) => file.id === id)
        ? versions.get(id)
        : api.get(id)?.readonly
          ? 0
          : undefined;
    },
    async readText(id: string): Promise<FileTextResult> {
      const file = api.get(id);
      if (!file || file.deleted) return { ok: false, error: 'The source file is missing.' };
      if (file.kind && file.kind !== 'text')
        return { ok: false, error: 'This file does not contain text.' };
      const publication = libraryFiles.find((entry) => entry.id === id);
      const provider = options.library?.readText;
      if (!publication || !provider || loadedLibraryText.has(id))
        return { ok: true, text: file.content };
      let pending = libraryTextReads.get(id);
      if (!pending) {
        pending = Promise.resolve()
          .then(() => provider(id))
          .then(
            (text): FileTextResult => {
              if (text === undefined)
                return { ok: false, error: 'The publication text is unavailable.' };
              publication.content = text;
              loadedLibraryText.add(id);
              return { ok: true, text };
            },
            (): FileTextResult => ({
              ok: false,
              error: 'The publication text could not be loaded.',
            }),
          );
        libraryTextReads.set(id, pending);
      }
      const result = await pending;
      libraryTextReads.delete(id);
      return result;
    },
    createText(name: string, content = '', folder: FolderId = 'root'): FileResult {
      return create(name, content, folder);
    },
    createBinary(
      name: string,
      asset: {
        kind: 'image' | 'audio';
        mime: string;
        size: number;
        assetId: string;
        persisted: boolean;
      },
      folder: FolderId = 'root',
    ): FileResult {
      if (!validBinary(asset)) return fail('The file data is invalid or too large.');
      return create(name, '', folder, undefined, {
        kind: asset.kind,
        mime: asset.mime,
        size: asset.size,
        assetId: asset.assetId,
        ...(!asset.persisted ? { transient: true } : {}),
      });
    },
    createShortcut(
      name: string,
      target: { appId: string; fileId?: string },
      folder: FolderId = 'root',
    ): FileResult {
      if (!validShortcut(target)) return fail('Choose a registered application shortcut.');
      return create(name, '', folder, undefined, { kind: 'shortcut', target: { ...target } });
    },
    async copy(id: string, folder: FolderId): Promise<FileResult> {
      let source = api.get(id);
      if (!source || source.deleted) return fail('The source file is missing.');
      if (!writableFolder(folder)) return fail('Choose a writable destination folder.');
      if (
        source.source === 'personal' &&
        (!source.kind || source.kind === 'text') &&
        options.library?.readText
      ) {
        const acceptedEpoch = epoch;
        const loaded = await api.readText(id);
        if (!loaded.ok) return fail(loaded.error);
        if (acceptedEpoch !== epoch)
          return fail('Files were reset while the document was loading. Try copying again.');
        if (!writableFolder(folder)) return fail('The destination folder is no longer available.');
        source = { ...source, content: loaded.text };
      }
      const extra: Pick<
        SandboxFile,
        'kind' | 'mime' | 'size' | 'assetId' | 'target' | 'transient'
      > = {};
      for (const key of ['kind', 'mime', 'size', 'assetId', 'transient'] as const)
        if (source[key] !== undefined) Object.assign(extra, { [key]: source[key] });
      if (source.target) extra.target = { ...source.target };
      if (source.appId) {
        extra.kind = 'shortcut';
        extra.target = { appId: source.appId };
      }
      return create(uniqueName(source.name, folder), source.content, folder, undefined, extra);
    },
    setClipboard(id: string, mode: 'copy' | 'cut', kind?: 'file' | 'folder'): TransferResult {
      const file = kind === 'folder' ? undefined : api.get(id);
      const folder = kind === 'file' || file ? undefined : getFolder(id);
      if ((!folder || folder.deleted) && (!file || file.deleted))
        return { ok: false, persisted, error: 'The selected item is missing.' };
      if (
        mode === 'cut' &&
        ((folder && (!folders.some((entry) => entry.id === id) || folder.readonly)) ||
          file?.readonly)
      )
        return { ok: false, persisted, error: 'This item cannot be moved.' };
      clipboard = { id, mode, kind: folder ? 'folder' : 'file', epoch };
      return {
        ok: true,
        persisted,
        entry: folder
          ? { kind: 'folder', folder: { ...folder } }
          : { kind: 'file', file: cloneFile(file!) },
      };
    },
    clipboard: () => clipboard && { ...clipboard },
    async paste(destination: FolderId): Promise<TransferResult> {
      if (!clipboard || clipboard.epoch !== epoch)
        return { ok: false, persisted, error: 'The Clipboard is empty.' };
      if (!writableFolder(destination))
        return { ok: false, persisted, error: 'Choose a writable destination folder.' };
      const accepted = clipboard;
      const source = accepted.kind === 'folder' ? getFolder(accepted.id) : undefined;
      if (source) {
        const result =
          accepted.mode === 'cut'
            ? api.moveFolder(source.id, destination)
            : await copyTree(source.id, destination);
        if (!result.ok) return result;
        if (accepted.mode === 'cut' && clipboard === accepted) clipboard = null;
        return {
          ok: true,
          persisted: result.persisted,
          entry: { kind: 'folder', folder: result.folder },
        };
      }
      const result =
        accepted.mode === 'cut'
          ? api.move(accepted.id, destination)
          : await api.copy(accepted.id, destination);
      if (!result.ok || !result.file)
        return { ok: false, persisted, error: result.error ?? 'The item could not be pasted.' };
      if (accepted.mode === 'cut' && clipboard === accepted) clipboard = null;
      return { ok: true, persisted: result.persisted, entry: { kind: 'file', file: result.file } };
    },
    newText(folder: FolderId = 'root'): FileResult {
      return api.createText(uniqueName('Untitled.txt', folder), '', folder);
    },
    saveTextAs(
      name: string,
      content: string,
      folder: FolderId = 'root',
      options: { overwriteId?: string; expectedVersion?: number } = {},
    ): FileResult {
      if (options.overwriteId === undefined) return api.createText(name, content, folder);
      name = name.trim();
      if (!writableFolder(folder) || !validName(name))
        return fail('Choose a valid folder and filename.');
      const target = writable(options.overwriteId);
      if (!target || target.folder !== folder || target.name.toLowerCase() !== name.toLowerCase())
        return fail('The overwrite target changed. Choose the file again.');
      return api.writeText(target.id, content, options);
    },
    writeText(id: string, content: string, options: { expectedVersion?: number } = {}): FileResult {
      if (api.get(id)?.readonly) return fail('Personal content is read-only.');
      const file = writable(id);
      if (!file) return fail('File is deleted or missing. Create a new document.');
      if (file.kind && file.kind !== 'text')
        return fail('This file cannot be saved as plain text.');
      if (options.expectedVersion !== undefined && versions.get(id) !== options.expectedVersion)
        return fail('File changed elsewhere. Use Save As...');
      if (content.length > MAX_TEXT) return fail('Text files can contain up to 20,000 characters.');
      file.content = content;
      file.size = new TextEncoder().encode(content).byteLength;
      return finish(file);
    },
    rename(id: string, name: string): FileResult {
      if (api.get(id)?.readonly) return fail('Personal content is read-only.');
      const file = writable(id);
      name = name.trim();
      if (!file) return fail('File is deleted or missing.');
      if (!validName(name)) return fail('Use 1-64 characters without / \\ : * ? " < > |.');
      if (uniqueName(name, file.folder, id) !== name)
        return fail('A file with this name already exists in this folder.');
      file.name = name;
      return finish(file);
    },
    move(id: string, folder: FolderId): FileResult {
      if (api.get(id)?.readonly) return fail('Personal content is read-only.');
      if (!writableFolder(folder)) return fail('Choose a writable destination folder.');
      const file = writable(id);
      if (!file) return fail('File is deleted or missing.');
      if (file.folder === folder)
        return { ok: true, persisted: persisted && !file.transient, file: cloneFile(file) };
      if (uniqueName(file.name, folder, id) !== file.name)
        return fail('A file with this name already exists in that folder.');
      file.folder = folder;
      return finish(file);
    },
    remove(id: string): FileResult {
      if (api.get(id)?.readonly) return fail('Personal content is read-only.');
      const file = writable(id);
      if (!file) return fail('File is deleted or missing.');
      file.deleted = true;
      return finish(file);
    },
    restore(id: string): FileResult {
      const file = files.find((entry) => entry.id === id && entry.deleted);
      if (!file) return fail('This file is not in the Recycle Bin.');
      file.folder = availableParent(file.folder);
      file.name = uniqueName(file.name, file.folder);
      file.deleted = false;
      delete file.deletedWith;
      return finish(file);
    },
    emptyBin(): FileResult {
      return replaceSnapshot(
        files.filter((file) => !file.deleted),
        folders.filter((folder) => !folder.deleted),
        desktopInitialized,
        false,
      );
    },
    saveGeneratedText(
      key: string,
      name: string,
      content: string,
      source: 'chat' | 'story',
    ): FileResult {
      if (!key || key.length > 100) return fail('Invalid generated file key.');
      const existing = files.find((file) => file.generatedKey === key && file.source === source);
      if (existing) {
        if (existing.deleted) return fail('Saved file is in the Recycle Bin. Restore it first.');
        return api.writeText(existing.id, content);
      }
      const folder = initialFolder(source);
      return create(uniqueName(name.trim(), folder), content, folder, { source, key });
    },
    exportData(): string {
      return JSON.stringify(
        {
          version: 1,
          files,
          ...(folders.length ? { folders } : {}),
          ...(desktopInitialized ? { desktopInitialized: true } : {}),
          ...(recoveryRaw === undefined ? {} : { recoveryRaw }),
        },
        null,
        2,
      );
    },
    reset(): FileResult {
      const result = replaceSnapshot(
        initialFiles(),
        [],
        options.desktopShortcuts === undefined ? desktopInitialized : false,
      );
      if (result.persisted) {
        try {
          storage?.removeItem(LEGACY_DIARY_KEY);
        } catch {
          /* The new snapshot takes precedence. */
        }
      }
      return result;
    },
    importData(input: unknown): FileResult {
      const parsed = parseSavedFiles(input);
      if (!parsed)
        return fail('This backup contains invalid file records. Existing files were kept.');
      return replaceSnapshot(parsed.files, parsed.folders, parsed.desktopInitialized);
    },
  };
  const desktopFiles = materializeDesktop();
  if (desktopFiles !== undefined && finish(undefined, desktopFiles).persisted) notice = '';
  return api;
}
/** File operations, revision state and transaction results available to callers. */
export interface FileSystem {
  folders: (parent?: FolderId | null) => FileFolder[];
  getFolder: (id: string) => FileFolder | undefined;
  folderPath: (id: FolderId) => string;
  folderName: (id: FolderId) => string;
  createFolder: (name?: string, parent?: FolderId) => FolderResult;
  renameFolder: (id: FolderId, name: string) => FolderResult;
  moveFolder: (id: FolderId, parent: FolderId) => FolderResult;
  copyFolder: (id: FolderId, destination: FolderId) => Promise<FolderResult>;
  removeFolder: (id: FolderId) => FolderResult;
  deletedFolders: () => FileFolder[];
  restoreFolder: (id: FolderId) => FolderResult;
  readonly notice: string;
  readonly revision: number;
  readonly epoch: number;
  readonly persisted: boolean;
  /** Replace visitor files from a validated backup; failed commits preserve sessions and epochs. */
  importData(input: unknown): FileResult;
  list: (location: 'documents' | 'personal' | 'bin', folder?: FolderId) => SandboxFile[];
  findByName: (name: string, folder?: FolderId) => SandboxFile | undefined;
  get: (id: string) => SandboxFile | undefined;
  getVersion: (id: string) => number | undefined;
  readText: (id: string) => Promise<FileTextResult>;
  createText: (name: string, content?: string, folder?: FolderId) => FileResult;
  createBinary: (
    name: string,
    asset: {
      kind: 'image' | 'audio';
      mime: string;
      size: number;
      assetId: string;
      persisted: boolean;
    },
    folder?: FolderId,
  ) => FileResult;
  createShortcut: (
    name: string,
    target: { appId: string; fileId?: string },
    folder?: FolderId,
  ) => FileResult;
  copy: (id: string, folder: FolderId) => Promise<FileResult>;
  setClipboard: (id: string, mode: 'copy' | 'cut', kind?: 'file' | 'folder') => TransferResult;
  clipboard: () => {
    id: string;
    mode: 'copy' | 'cut';
    kind: 'file' | 'folder';
    epoch: number;
  } | null;
  paste: (destination: FolderId) => Promise<TransferResult>;
  newText: (folder?: FolderId) => FileResult;
  saveTextAs: (
    name: string,
    content: string,
    folder?: FolderId,
    options?: { overwriteId?: string; expectedVersion?: number },
  ) => FileResult;
  writeText: (id: string, content: string, options?: { expectedVersion?: number }) => FileResult;
  rename: (id: string, name: string) => FileResult;
  move: (id: string, folder: FolderId) => FileResult;
  remove: (id: string) => FileResult;
  restore: (id: string) => FileResult;
  emptyBin: () => FileResult;
  saveGeneratedText: (
    key: string,
    name: string,
    content: string,
    source: 'chat' | 'story',
  ) => FileResult;
  exportData: () => string;
  reset: () => FileResult;
}
