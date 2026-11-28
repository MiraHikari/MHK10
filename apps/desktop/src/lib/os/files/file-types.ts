import { APP_CATALOG, catalogIcon, type FileCategory } from '../../../data/app-catalog';
import { CANVAS_APPS } from '../../../data/app-catalog.generated';
import { NON_CANVAS_APPS } from '../../../data/app-catalog';
import { redirectedArticleFileId } from '../../../data/article-redirects';
import type { FileAssociations } from './file-associations';

export type { FileCategory };
type CatalogEntry = (typeof CANVAS_APPS)[number] | (typeof NON_CANVAS_APPS)[number];
export type FileHandler = Extract<CatalogEntry, { files: unknown }>['id'];
export interface FileType {
  extension: string;
  description: string;
  category: FileCategory;
  icon: string;
  application?: FileHandler;
}
interface TypeRow {
  extensions: readonly string[];
  description: string;
  category: FileCategory;
  icon: string;
  application?: FileHandler;
}
const RESIDUAL_ROWS: readonly TypeRow[] = [
  { extensions: ['.url', '.lnk'], description: 'Shortcut', category: 'shortcut', icon: 'i_doc' },
  {
    extensions: ['.exe', '.com', '.bat'],
    description: 'Application',
    category: 'application',
    icon: 'i_exe',
  },
];
const HANDLER_ROWS: readonly TypeRow[] = APP_CATALOG.flatMap((app) =>
  (app.files ?? []).map((group) => ({
    extensions: group.extensions,
    description: group.description,
    category: group.category,
    icon: catalogIcon(app.id),
    application: app.id as FileHandler,
  })),
);
const rowSpan = (row: TypeRow) => Math.max(...row.extensions.map((suffix) => suffix.length));
/** Longest registered suffix wins; a recording remains a recording despite its .txt envelope. */
const TYPES: readonly TypeRow[] = [...HANDLER_ROWS, ...RESIDUAL_ROWS].sort(
  (a, b) => rowSpan(b) - rowSpan(a),
);

export function fileType(name: string): FileType {
  const normalized = name.toLowerCase();
  for (const type of TYPES) {
    const extension = type.extensions.find((suffix) => normalized.endsWith(suffix));
    if (extension)
      return {
        extension,
        description: type.description,
        category: type.category,
        icon: type.icon,
        application: type.application,
      };
  }
  const dot = normalized.lastIndexOf('.');
  return {
    extension: dot > 0 ? normalized.slice(dot) : '',
    description: 'File',
    category: 'binary',
    icon: 'i_doc',
  };
}
export function fileHandlers(name: string): readonly FileHandler[] {
  const type = fileType(name);
  if (type.category === 'text')
    return type.application === 'blog' ? ['blog', 'notepad'] : ['notepad', 'blog'];
  return type.application ? [type.application] : [];
}

export const FILE_HANDLER_LABELS: Record<FileHandler, string> = Object.fromEntries(
  APP_CATALOG.filter((app) => app.files?.length && app.handlerLabel).map((app) => [
    app.id as FileHandler,
    app.handlerLabel!,
  ]),
) as Record<FileHandler, string>;
export function fileHandlerLabel(id: FileHandler): string {
  return FILE_HANDLER_LABELS[id] ?? id;
}
/** Resolve preferences only within compatible candidates, preserving compound suffixes. */
export function defaultHandler(
  associations: FileAssociations,
  name: string,
  orderedCandidates: readonly FileHandler[],
): FileHandler | undefined {
  const stored = associations[fileType(name).extension];
  return stored && orderedCandidates.includes(stored) ? stored : orderedCandidates[0];
}
export function displayedFileName(name: string, showExtensions = true): string {
  const type = fileType(name);
  return !showExtensions && type.application && type.extension
    ? name.slice(0, -type.extension.length)
    : name;
}
export function fileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown';
  if (bytes < 1024) return `${Math.floor(bytes)} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileReference {
  id: string;
  name: string;
  content: string;
  deleted: boolean;
  readonly: boolean;
  source: string;
  appId?: string;
  kind?: string;
  assetId?: string;
  target?: { appId: string; fileId?: string };
}
interface FileLookup {
  get(id: string): FileReference | undefined;
  folders(): readonly { id: string }[];
}
export type FileOpenTarget =
  | { kind: 'folder'; id: string }
  | { kind: 'application'; application: string; fileId?: string }
  | { kind: 'choose'; id: string; name: string; applications: readonly FileHandler[] }
  | { kind: 'failed'; error: string };
const registered = (id: string) =>
  APP_CATALOG.some((app) => app.id === id && (app.kind === 'canvas' || app.kind === 'html'));
/** The ordered applications that can open a resolved file (default first). */
function candidateHandlers(file: FileReference): readonly FileHandler[] {
  const hasAsset = !!file.assetId;
  if (file.kind === 'image' && hasAsset) return ['acdsee'];
  if (file.kind === 'audio' && hasAsset) return ['media-player'];
  return fileHandlers(file.name);
}
/** Resolve the full Open With list for a file on demand (context menu action). */
export function fileOpenChoices(
  files: FileLookup,
  id: string,
  associations: FileAssociations = {},
): { name: string; applications: readonly FileHandler[] } | undefined {
  const file = files.get(id);
  if (!file || file.deleted || file.target) return undefined;
  const choices = candidateHandlers(file);
  const textFallback = !file.assetId && (!file.kind || file.kind === 'text');
  const fallback = choices.length ? choices : textFallback ? (['notepad', 'blog'] as const) : [];
  const preferred = defaultHandler(associations, file.name, fallback);
  const applications = preferred
    ? [preferred, ...fallback.filter((candidate) => candidate !== preferred)]
    : fallback;
  return applications.length ? { name: file.name, applications } : undefined;
}
/** Both desktop and standalone hosts resolve the same links, types and Open With choices. */
export function resolveFileOpen(
  files: FileLookup,
  id: string,
  requested?: string,
  visited = new Set<string>(),
  associations: FileAssociations = {},
): FileOpenTarget {
  if (visited.has(id) || visited.size >= 8)
    return { kind: 'failed', error: 'The shortcut target contains a loop.' };
  visited.add(id);
  const file = files.get(id);
  if (!file) {
    const replacementId = redirectedArticleFileId(id);
    const replacement = replacementId ? files.get(replacementId) : undefined;
    if (replacement?.readonly && replacement.source === 'personal')
      return resolveFileOpen(files, replacement.id, requested, visited, associations);
  }
  if (!file && files.folders().some((folder) => folder.id === id)) return { kind: 'folder', id };
  if (!file || file.deleted)
    return { kind: 'failed', error: 'The file is missing or in Recycle Bin.' };
  if (file.target) {
    if (file.target.fileId)
      return resolveFileOpen(files, file.target.fileId, file.target.appId, visited, associations);
    return registered(file.target.appId)
      ? { kind: 'application', application: file.target.appId }
      : { kind: 'failed', error: 'The application is not installed.' };
  }
  const type = fileType(file.name);
  if (file.readonly && file.source === 'personal' && file.appId && !requested && !type.extension)
    return registered(file.appId)
      ? { kind: 'application', application: file.appId }
      : { kind: 'failed', error: 'The application is not installed.' };
  const hasAsset = !!file.assetId;
  const choices = candidateHandlers(file);
  const textFallback = !hasAsset && (!file.kind || file.kind === 'text');
  const preferred = choices.length
    ? defaultHandler(associations, file.name, choices)
    : textFallback && associations[type.extension]
      ? defaultHandler(associations, file.name, ['notepad', 'blog'])
      : undefined;
  const application = requested ?? preferred;
  if (!application)
    return textFallback
      ? { kind: 'choose', id, name: file.name, applications: ['notepad', 'blog'] }
      : { kind: 'failed', error: 'No compatible application is installed.' };
  if (
    !choices.includes(application as FileHandler) &&
    !(textFallback && ['notepad', 'blog'].includes(application))
  )
    return { kind: 'failed', error: 'This application cannot open the file type.' };
  return registered(application)
    ? { kind: 'application', application, fileId: id }
    : { kind: 'failed', error: 'The application is not installed.' };
}
