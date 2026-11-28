export const MAX_FILES = 200;
export const MAX_DESKTOP_SHORTCUTS = 64;
export const MAX_TEXT = 20000;
export const MAX_CUSTOM_FOLDERS = 64;
export const FILE_FOLDERS = [
  { id: 'root', name: 'My Documents', parent: null },
  { id: 'notes', name: 'Notes', parent: 'root' },
  { id: 'chat', name: 'Chat Logs', parent: 'root' },
  { id: 'evidence', name: 'Evidence', parent: 'root' },
  { id: 'desktop', name: 'Desktop', parent: null },
] as const;
export type FolderId =
  | (typeof FILE_FOLDERS)[number]['id']
  | `folder:${string}`
  | `library:${string}`;
export interface FileFolder {
  id: FolderId;
  name: string;
  parent?: FolderId | null;
  readonly?: boolean;
  deleted?: boolean;
  deletedWith?: string;
}
export interface SandboxFile {
  id: string;
  name: string;
  content: string;
  folder: FolderId;
  source: 'visitor' | 'chat' | 'story' | 'personal';
  deleted: boolean;
  readonly: boolean;
  appId?: string;
  generatedKey?: string;
  kind?: 'text' | 'image' | 'audio' | 'shortcut';
  mime?: string;
  size?: number;
  assetId?: string;
  target?: { appId: string; fileId?: string };
  deletedWith?: string;
  /** A session-only blob must never leave a durable metadata entry behind. */
  transient?: boolean;
}
export interface FileResult {
  ok: boolean;
  persisted: boolean;
  file?: SandboxFile;
  error?: string;
}
export type FolderResult =
  | { ok: true; persisted: boolean; folder: FileFolder }
  | { ok: false; persisted: boolean; error: string };
export type TransferResult =
  | {
      ok: true;
      persisted: boolean;
      entry: { kind: 'file'; file: SandboxFile } | { kind: 'folder'; folder: FileFolder };
    }
  | { ok: false; persisted: boolean; error: string };

export function validName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 64 &&
    !/[<>:"/\\|?*]/.test(name) &&
    !Array.from(name).some((char) => char.charCodeAt(0) < 32) &&
    !/[. ]$/.test(name) &&
    name !== '.' &&
    name !== '..'
  );
}
export const initialFolder = (source: SandboxFile['source']): FolderId =>
  source === 'chat' ? 'chat' : source === 'story' ? 'evidence' : 'root';
export const cloneFile = (file: SandboxFile): SandboxFile => ({
  ...file,
  ...(file.target ? { target: { ...file.target } } : {}),
});
const identifier = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 100 &&
  !/[\u0000-\u001f]/.test(value);
export function validShortcut(value: unknown): value is { appId: string; fileId?: string } {
  if (!value || typeof value !== 'object') return false;
  const target = value as Record<string, unknown>;
  return (
    typeof target.appId === 'string' &&
    /^[a-z][a-z0-9-]{0,47}$/.test(target.appId) &&
    (target.fileId === undefined || identifier(target.fileId))
  );
}
/** Reserved seed IDs retain a bounded allowance independent of visitor files. */
export function desktopSeed(file: Pick<SandboxFile, 'id' | 'kind' | 'target'>): boolean {
  return (
    file.kind === 'shortcut' &&
    !!file.target &&
    !file.target.fileId &&
    file.id === `desktop:app:${file.target.appId}`
  );
}
export function validBinary(value: {
  kind?: unknown;
  mime?: unknown;
  size?: unknown;
  assetId?: unknown;
}): boolean {
  return (
    (value.kind === 'image' || value.kind === 'audio') &&
    typeof value.mime === 'string' &&
    value.mime.startsWith(`${value.kind}/`) &&
    /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(value.mime) &&
    typeof value.size === 'number' &&
    Number.isSafeInteger(value.size) &&
    value.size >= 0 &&
    value.size <= 32 * 1024 * 1024 &&
    identifier(value.assetId)
  );
}

/** Parse and normalize legacy flat folders without trusting newly added capabilities. */
export function parseSavedFiles(
  value: unknown,
): { files: SandboxFile[]; folders: FileFolder[]; desktopInitialized: boolean } | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (
    data.version !== 1 ||
    !Array.isArray(data.files) ||
    data.files.length > MAX_FILES + MAX_DESKTOP_SHORTCUTS ||
    (data.desktopInitialized !== undefined && typeof data.desktopInitialized !== 'boolean')
  )
    return null;
  if (
    data.folders !== undefined &&
    (!Array.isArray(data.folders) || data.folders.length > MAX_CUSTOM_FOLDERS)
  )
    return null;
  const folders: FileFolder[] = [];
  const folderIds = new Set<string>(FILE_FOLDERS.map((folder) => folder.id));
  for (const value of (data.folders ?? []) as unknown[]) {
    if (!value || typeof value !== 'object') return null;
    const item = value as Record<string, unknown>;
    if (
      typeof item.id !== 'string' ||
      !/^folder:[a-z0-9:-]{1,70}$/.test(item.id) ||
      folderIds.has(item.id) ||
      typeof item.name !== 'string' ||
      !validName(item.name) ||
      (item.parent !== undefined && typeof item.parent !== 'string') ||
      (item.readonly !== undefined && item.readonly !== false) ||
      (item.deleted !== undefined && typeof item.deleted !== 'boolean') ||
      (item.deletedWith !== undefined && !identifier(item.deletedWith))
    )
      return null;
    folderIds.add(item.id);
    folders.push({
      id: item.id as FolderId,
      name: item.name,
      parent: (item.parent ?? 'root') as FolderId,
      ...(item.deleted ? { deleted: true } : {}),
      ...(item.deletedWith ? { deletedWith: item.deletedWith as string } : {}),
    });
  }
  const allFolders: readonly FileFolder[] = [...FILE_FOLDERS, ...folders];
  const lookup = new Map(allFolders.map((folder) => [folder.id, folder]));
  const names = new Set<string>();
  for (const folder of folders) {
    if (!folder.parent || !lookup.has(folder.parent)) return null;
    const seen = new Set<string>([folder.id]);
    let current: FileFolder | undefined = folder;
    while (current?.parent) {
      if (seen.has(current.parent)) return null;
      seen.add(current.parent);
      current = lookup.get(current.parent);
      if (!current || (!folder.deleted && current.deleted)) return null;
    }
    if (!folder.deleted) {
      const key = `${folder.parent}:${folder.name.toLowerCase()}`;
      if (
        names.has(key) ||
        FILE_FOLDERS.some(
          (builtin) =>
            builtin.parent === folder.parent &&
            builtin.name.toLowerCase() === folder.name.toLowerCase(),
        )
      )
        return null;
      names.add(key);
    }
    if (
      folder.deletedWith &&
      (!folder.deleted || !lookup.get(folder.deletedWith as FolderId)?.deleted)
    )
      return null;
  }
  const ids = new Set<string>(),
    fileNames = new Set<string>(),
    generated = new Set<string>();
  const files: SandboxFile[] = [];
  for (const value of data.files) {
    if (!value || typeof value !== 'object') return null;
    const file = value as Record<string, unknown>;
    if (
      !identifier(file.id) ||
      file.id.startsWith('personal:') ||
      file.id.startsWith('library:') ||
      ids.has(file.id) ||
      typeof file.name !== 'string' ||
      !validName(file.name) ||
      typeof file.content !== 'string' ||
      file.content.length > MAX_TEXT ||
      !['visitor', 'chat', 'story'].includes(String(file.source)) ||
      file.readonly !== false ||
      typeof file.deleted !== 'boolean' ||
      file.appId !== undefined ||
      (file.mime !== undefined && typeof file.mime !== 'string') ||
      (file.size !== undefined &&
        (typeof file.size !== 'number' || !Number.isSafeInteger(file.size) || file.size < 0)) ||
      (file.generatedKey !== undefined && !identifier(file.generatedKey)) ||
      (file.deletedWith !== undefined && !identifier(file.deletedWith)) ||
      (file.transient !== undefined && file.transient !== false)
    )
      return null;
    if (
      file.kind !== undefined &&
      !['text', 'image', 'audio', 'shortcut'].includes(String(file.kind))
    )
      return null;
    if (file.kind === 'image' || file.kind === 'audio') {
      if (!validBinary(file) || file.content !== '' || file.target !== undefined) return null;
    } else if (file.kind === 'shortcut') {
      if (!validShortcut(file.target) || file.content !== '' || file.assetId !== undefined)
        return null;
    } else if (file.assetId !== undefined || file.target !== undefined) return null;
    const source = file.source as SandboxFile['source'];
    const parent = (file.folder ?? initialFolder(source)) as FolderId;
    const folder = lookup.get(parent);
    if (!folder || (!file.deleted && folder.deleted)) return null;
    if (file.deletedWith && (!file.deleted || !lookup.get(file.deletedWith as FolderId)?.deleted))
      return null;
    const key = `${parent}:${file.name.toLowerCase()}`;
    if (!file.deleted && fileNames.has(key)) return null;
    const generatedKey =
      file.generatedKey === undefined ? undefined : `${source}:${file.generatedKey}`;
    if (generatedKey && generated.has(generatedKey)) return null;
    ids.add(file.id);
    if (!file.deleted) fileNames.add(key);
    if (generatedKey) generated.add(generatedKey);
    files.push({
      id: file.id,
      name: file.name,
      content: file.content,
      folder: parent,
      source,
      deleted: file.deleted,
      readonly: false,
      ...(file.generatedKey ? { generatedKey: file.generatedKey as string } : {}),
      ...(file.kind ? { kind: file.kind as SandboxFile['kind'] } : {}),
      ...(file.mime ? { mime: String(file.mime) } : {}),
      ...(typeof file.size === 'number' && Number.isSafeInteger(file.size) && file.size >= 0
        ? { size: file.size }
        : {}),
      ...(file.assetId ? { assetId: String(file.assetId) } : {}),
      ...(file.target
        ? { target: { ...(file.target as { appId: string; fileId?: string }) } }
        : {}),
      ...(file.deletedWith ? { deletedWith: String(file.deletedWith) } : {}),
    });
  }
  if (
    files.filter(desktopSeed).length > MAX_DESKTOP_SHORTCUTS ||
    files.filter((file) => !desktopSeed(file)).length > MAX_FILES
  )
    return null;
  return { files, folders, desktopInitialized: data.desktopInitialized === true };
}
