import type { FileFolder, FolderId } from './filesystem-records';

/** Shared destination policy for the Canvas and DOM Save As presentations. */
export function writableSaveFolders(folders: readonly FileFolder[]): FileFolder[] {
  return folders.filter((folder) => !folder.readonly && !folder.deleted);
}

export function isWritableSaveFolder(folders: readonly FileFolder[], id: unknown): id is FolderId {
  return typeof id === 'string' && writableSaveFolders(folders).some((folder) => folder.id === id);
}

export function defaultSaveFolder(folders: readonly FileFolder[], requested?: string): FolderId {
  return isWritableSaveFolder(folders, requested) ? requested : 'root';
}
