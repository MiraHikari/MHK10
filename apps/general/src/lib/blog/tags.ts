import type { TagCount } from './types';

/**
 * Tag frequency across a set of posts, most frequent first, ties alphabetical.
 * Shared by the server-side tag index and the client-side blog section so the
 * two never drift.
 */
export function countTags(items: readonly { readonly tags: readonly string[] }[]): TagCount[] {
  const counts = Map.groupBy(
    items.flatMap((item) => item.tags),
    (tag) => tag,
  );
  return Array.from(counts, ([tag, list]) => ({ tag, count: list.length })).toSorted(
    // Code-unit order is locale-independent: the server and the hydrated
    // client must produce the same tie order or the tag list remounts.
    (a, b) => b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0),
  );
}
