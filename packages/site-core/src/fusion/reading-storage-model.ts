import {
  parseReaderState,
  parseReaderNoteBlock,
  type ReaderBookmark,
  type ReaderDocumentState,
  type ReaderNote,
  type ReaderState,
} from './reading-model';

export type ReaderStateResult = { ok: true; state: ReaderState } | { ok: false; error: string };
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const equal = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return left.length === right.length && left.every((item, index) => equal(item, right[index]));
  if (object(left) && object(right)) {
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]))
    );
  }
  return false;
};
const damaged = (): ReaderStateResult => ({
  ok: false,
  error:
    'Saved notebook is damaged or uses a newer format. Export a recovery backup before replacing it.',
});

/** Durable and transferred records are validated without silently discarding annotations. */
export function parseStoredReaderState(value: unknown): ReaderStateResult {
  if (value === null || value === undefined) return { ok: true, state: parseReaderState(null) };
  if (!object(value) || value.version !== 1 || !object(value.documents)) return damaged();
  if (Object.keys(value).some((key) => !['version', 'preferences', 'documents'].includes(key)))
    return damaged();
  if (value.preferences !== undefined && !object(value.preferences)) return damaged();
  const state = parseReaderState(value);
  if (Object.keys(value.documents).length !== Object.keys(state.documents).length) return damaged();
  if (object(value.preferences))
    for (const [key, input] of Object.entries(value.preferences)) {
      if (!Object.hasOwn(state.preferences, key)) return damaged();
      if (!equal(input, state.preferences[key as keyof ReaderState['preferences']]))
        return damaged();
    }
  for (const [id, input] of Object.entries(value.documents)) {
    if (!object(input)) return damaged();
    const document = state.documents[id];
    for (const [key, raw] of Object.entries(input)) {
      // Every raw key must be a field the parser understands, and its saved value
      // must survive parsing unchanged. Omitted fields keep their parser defaults,
      // so older records remain readable; unknown keys are never accepted.
      if (!Object.hasOwn(document, key)) return damaged();
      // A malformed optional presentation anchor is ignored, while every notebook
      // field stays strict.
      const expected =
        key !== 'notes' || !Array.isArray(raw)
          ? raw
          : raw.map((note: unknown) => {
              if (!object(note) || note.block === undefined || parseReaderNoteBlock(note.block))
                return note;
              const copy = { ...note };
              delete copy.block;
              return copy;
            });
      if (!equal(expected, (document as unknown as Record<string, unknown>)[key])) return damaged();
    }
  }
  return { ok: true, state };
}

class ReaderConflict extends Error {}
function field<T>(baseline: T, local: T, remote: T, label: string): T {
  if (equal(local, baseline)) return remote;
  if (equal(remote, baseline) || equal(local, remote)) return local;
  throw new ReaderConflict(
    `Notebook changed elsewhere (${label}). Your session copy is kept; export it before reloading.`,
  );
}
function annotations<T extends ReaderBookmark | ReaderNote>(
  baseline: readonly T[],
  local: readonly T[],
  remote: readonly T[],
  label: string,
): T[] {
  const base = new Map(baseline.map((item) => [item.id, item]));
  const own = new Map(local.map((item) => [item.id, item]));
  const latest = new Map(remote.map((item) => [item.id, item]));
  const ids = new Set([...latest.keys(), ...own.keys(), ...base.keys()]);
  return [...ids].flatMap((id) => {
    const before = base.get(id),
      current = own.get(id),
      incoming = latest.get(id);
    let value: T | undefined;
    if (before && current && incoming) {
      value = { ...incoming };
      const keys = new Set([
        ...Object.keys(before),
        ...Object.keys(current),
        ...Object.keys(incoming),
      ]);
      for (const key of keys) {
        const property = key as keyof T;
        const merged = field(
          before[property],
          current[property],
          incoming[property],
          `${label}: ${id}: ${key}`,
        );
        if (merged === undefined) delete value[property];
        else value[property] = merged;
      }
    } else {
      value = field(before, current, incoming, `${label}: ${id}`);
    }
    return value ? [structuredClone(value)] : [];
  });
}
function document(
  baseline: ReaderDocumentState,
  local: ReaderDocumentState,
  remote: ReaderDocumentState,
  id: string,
): ReaderDocumentState {
  const position = field(
    { progress: baseline.progress, anchor: baseline.anchor },
    { progress: local.progress, anchor: local.anchor },
    { progress: remote.progress, anchor: remote.anchor },
    `${id}: reading position`,
  );
  const title = field(baseline.title, local.title, remote.title, `${id}: title`);
  return {
    ...(title === undefined ? {} : { title }),
    ...position,
    lastOpened: Math.max(local.lastOpened, remote.lastOpened),
    bookmarks: annotations(
      baseline.bookmarks,
      local.bookmarks,
      remote.bookmarks,
      `${id}: bookmark`,
    ),
    notes: annotations(baseline.notes, local.notes, remote.notes, `${id}: annotation`),
  };
}

/** Apply only local changes since baseline; remote deletions and unrelated updates survive. */
export function mergeReaderStates(
  baseline: ReaderState,
  local: ReaderState,
  remote: ReaderState,
): ReaderStateResult {
  try {
    const preferences = { ...remote.preferences };
    for (const key of Object.keys(preferences) as (keyof ReaderState['preferences'])[]) {
      Object.assign(preferences, {
        [key]: field(
          baseline.preferences[key],
          local.preferences[key],
          remote.preferences[key],
          key,
        ),
      });
    }
    const documents: ReaderState['documents'] = {};
    const ids = new Set([
      ...Object.keys(remote.documents),
      ...Object.keys(local.documents),
      ...Object.keys(baseline.documents),
    ]);
    for (const id of ids) {
      const base = Object.hasOwn(baseline.documents, id) ? baseline.documents[id] : undefined;
      const own = Object.hasOwn(local.documents, id) ? local.documents[id] : undefined;
      const latest = Object.hasOwn(remote.documents, id) ? remote.documents[id] : undefined;
      // Existing documents merge independently, including annotation deletion.
      // Concurrent new records for one book start from a shared empty baseline.
      const blank: ReaderDocumentState = {
        progress: 0,
        anchor: '',
        lastOpened: 0,
        bookmarks: [],
        notes: [],
      };
      const merged =
        own && latest ? document(base ?? blank, own, latest, id) : field(base, own, latest, id);
      if (merged) documents[id] = structuredClone(merged);
    }
    return parseStoredReaderState({ version: 1, preferences, documents });
  } catch (error) {
    if (!(error instanceof ReaderConflict)) throw error;
    return { ok: false, error: error.message };
  }
}
