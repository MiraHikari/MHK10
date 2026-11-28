import { STORAGE_KEYS } from '../../../data/storage-keys';
import { fileType, type FileHandler } from './file-types';
export { defaultHandler } from './file-types';

/**
 * Persisted "extension → default Open With handler" choices. The map is stored as a
 * JSON object keyed by lower-case extensions with their leading dot, e.g. `{".txt":"notepad"}`.
 * Keys are bounded and value ids are validated against the installed handlers so a
 * tampered or stale blob can never poison the open path.
 */
export const ASSOCIATIONS_STORAGE_KEY = STORAGE_KEYS.associations;
/** Keys carry the leading dot, optional interior dots (`.snd.txt` envelopes) and stay within 16 characters. */
const EXTENSION_PATTERN = /^\.[a-z0-9]+(?:\.[a-z0-9]+)*$/;
const isExtensionKey = (key: string) => key.length <= 16 && EXTENSION_PATTERN.test(key);
export type FileAssociations = Readonly<Record<string, FileHandler>>;
export interface AssociationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}
export interface FileAssociationStore {
  snapshot(): FileAssociations;
  setDefault(name: string, handler: FileHandler): AssociationUpdateResult;
  clear(name: string): AssociationUpdateResult;
}
export type AssociationUpdateResult =
  | { ok: true; persisted: boolean }
  | { ok: false; persisted: false; error: string };
export type AssociationsResult =
  | { ok: true; associations: FileAssociations; dropped: number }
  | { ok: false; associations: FileAssociations; dropped: number };

export function parseAssociations(input: unknown, known: readonly string[]): AssociationsResult {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return { ok: false, associations: {}, dropped: 0 };
  const associations: Record<string, FileHandler> = {};
  let dropped = 0;
  for (const [extension, handler] of Object.entries(input)) {
    if (!isExtensionKey(extension) || typeof handler !== 'string' || !known.includes(handler)) {
      dropped++;
      continue;
    }
    associations[extension] = handler as FileHandler;
  }
  return { ok: true, associations, dropped };
}

/** Store a default for an extension, normalizing case and ignoring malformed keys. */
export function withDefault(
  associations: FileAssociations,
  extension: string,
  handler: FileHandler,
): FileAssociations {
  const key = extension.toLowerCase();
  return isExtensionKey(key) ? { ...associations, [key]: handler } : associations;
}

export function serializeAssociations(associations: FileAssociations): string {
  return JSON.stringify(associations);
}

/** Browser composition owns this persistence seam; tests can provide an in-memory Storage. */
export function createFileAssociationStore(
  storage: AssociationStorage | null | undefined,
  known: readonly string[],
): FileAssociationStore {
  let associations: FileAssociations = {};
  try {
    const raw = storage?.getItem(ASSOCIATIONS_STORAGE_KEY);
    if (raw !== null && raw !== undefined) {
      const parsed = parseAssociations(JSON.parse(raw) as unknown, known);
      associations = parsed.associations;
    }
  } catch {
    associations = {};
  }
  const persist = (): AssociationUpdateResult => {
    try {
      if (!storage) return { ok: true, persisted: false };
      storage.setItem(ASSOCIATIONS_STORAGE_KEY, serializeAssociations(associations));
      return { ok: true, persisted: true };
    } catch {
      return { ok: true, persisted: false };
    }
  };
  return {
    snapshot: () => ({ ...associations }),
    setDefault(name, handler) {
      const extension = fileType(name).extension;
      if (!known.includes(handler))
        return { ok: false, persisted: false, error: 'The application is not installed.' };
      const next = withDefault(associations, extension, handler);
      if (next === associations)
        return { ok: false, persisted: false, error: 'This file has no supported extension.' };
      associations = next;
      return persist();
    },
    clear(name) {
      const extension = fileType(name).extension;
      if (!extension || !(extension in associations))
        return { ok: false, persisted: false, error: 'This file has no saved association.' };
      const next = { ...associations };
      delete next[extension];
      associations = next;
      return persist();
    },
  };
}
