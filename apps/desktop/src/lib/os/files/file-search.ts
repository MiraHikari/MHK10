import type { FolderId, SandboxFile } from './filesystem-records';
import type { FileOpenTarget } from './file-types';

/** A detached file record. Search reads it and does not write it back. */
export interface FileSearchRecord {
  id: string;
  name: string;
  content: string;
  deleted?: boolean;
  readonly?: boolean;
  source?: 'visitor' | 'chat' | 'story' | 'personal';
  kind?: SandboxFile['kind'];
}
export interface FileSearchHit {
  id: string;
  name: string;
  readonly: boolean;
}
export interface DocumentSearchSource {
  list(location: 'documents' | 'personal', folder?: FolderId): readonly FileSearchRecord[];
  folders(parent?: FolderId | null): readonly { id: FolderId; deleted?: boolean }[];
}
export type FindHit =
  | { kind: 'program'; id: string; label: string }
  | { kind: 'file'; id: string; label: string };
export type FindOpenAction =
  | { kind: 'program'; id: string }
  | { kind: 'file'; id: string; target: FileOpenTarget }
  | { kind: 'failed'; error: string };

const PROGRAM_ID = /^[a-z][a-z0-9-]{0,47}$/;

function rememberFile(
  records: FileSearchRecord[],
  seen: Set<string>,
  file: FileSearchRecord,
): void {
  if (file.deleted || typeof file.id !== 'string' || !file.id || seen.has(file.id)) return;
  if (typeof file.name !== 'string') return;
  seen.add(file.id);
  records.push({
    id: file.id,
    name: file.name,
    content: typeof file.content === 'string' ? file.content : '',
    deleted: false,
    readonly: file.readonly === true,
    source: file.source,
    kind: file.kind,
  });
}

/** My Documents, nested folders, and mounted personal publications. Desktop and the bin are omitted. */
export function myDocumentsSnapshot(source: DocumentSearchSource): FileSearchRecord[] {
  const records: FileSearchRecord[] = [];
  const seenFiles = new Set<string>();
  const seenFolders = new Set<string>();
  const walk = (folder: FolderId) => {
    if (seenFolders.has(folder)) return;
    seenFolders.add(folder);
    for (const file of source.list('documents', folder)) rememberFile(records, seenFiles, file);
    for (const child of source.folders(folder)) if (!child.deleted) walk(child.id);
  };
  walk('root');
  for (const folder of source.folders(null)) {
    if (!folder.deleted && folder.id.startsWith('library:')) walk(folder.id);
  }
  for (const file of source.list('personal', 'root')) rememberFile(records, seenFiles, file);
  return records;
}

/** Case-insensitive match on file name or text content. An empty query lists every included file. */
export function searchFiles(files: readonly FileSearchRecord[], query: string): FileSearchHit[] {
  const needle = query.trim().toLowerCase();
  const hits: FileSearchHit[] = [];
  for (const file of files) {
    if (file.deleted || typeof file.id !== 'string' || !file.id || typeof file.name !== 'string')
      continue;
    const content = typeof file.content === 'string' ? file.content : '';
    if (
      needle &&
      !file.name.toLowerCase().includes(needle) &&
      !content.toLowerCase().includes(needle)
    )
      continue;
    hits.push({ id: file.id, name: file.name, readonly: file.readonly === true });
  }
  return hits;
}

/**
 * Turn a hit into a program id or a file id plus resolveFileOpen's result.
 * File text is never treated as a command.
 */
export function findOpenAction(
  hit: FindHit,
  resolve: (fileId: string) => FileOpenTarget,
): FindOpenAction {
  if (hit.kind === 'program') {
    return PROGRAM_ID.test(hit.id)
      ? { kind: 'program', id: hit.id }
      : { kind: 'failed', error: 'The application is not installed.' };
  }
  const target = resolve(hit.id);
  if (target.kind === 'failed') return { kind: 'failed', error: target.error };
  return { kind: 'file', id: hit.id, target };
}
