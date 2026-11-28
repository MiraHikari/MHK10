export type ReaderNavigationCommand =
  | 'find'
  | 'contents'
  | 'notebook'
  | 'options'
  | 'properties'
  | 'focus';

export type ReaderNavigationTarget =
  | { kind: 'chapter'; anchor: string }
  | { kind: 'bookmark'; id: string }
  | { kind: 'note'; id: string }
  | { kind: 'command'; command: ReaderNavigationCommand };

export interface ReaderNavigationEntry {
  id: string;
  label: string;
  detail: string;
  target: ReaderNavigationTarget;
  keywords?: string;
}

const normalize = (value: string) => value.normalize('NFKC').toLowerCase().trim();
const copyEntry = (entry: ReaderNavigationEntry): ReaderNavigationEntry => ({
  ...entry,
  target: { ...entry.target },
});
const RESULT_LIMIT = 60;

/** One open navigation session: stable targets, bounded results and keyboard selection. */
export class ReaderNavigationModel {
  private results: ReaderNavigationEntry[] = [];
  private activeId: string | undefined;
  private query = '';
  private total = 0;

  /** A changed query selects its best match; refreshed content preserves a surviving selection. */
  update(entries: readonly ReaderNavigationEntry[], query = ''): void {
    const nextQuery = normalize(query.slice(0, 200));
    const tokens = nextQuery.split(/\s+/).filter(Boolean);
    const ids = new Set<string>();
    const matches = entries.flatMap((entry, index) => {
      if (!entry.id || ids.has(entry.id)) return [];
      ids.add(entry.id);
      const label = normalize(entry.label);
      const searchable = normalize(
        `${entry.label} ${entry.detail} ${entry.target.kind} ${entry.keywords ?? ''}`,
      );
      if (!tokens.every((token) => searchable.includes(token))) return [];
      const rank =
        !nextQuery || label === nextQuery
          ? 0
          : label.startsWith(nextQuery)
            ? 1
            : label.includes(nextQuery)
              ? 2
              : 3;
      return [{ entry, rank, index }];
    });
    matches.sort((a, b) => a.rank - b.rank || a.index - b.index);
    this.total = matches.length;
    this.results = matches.slice(0, RESULT_LIMIT).map(({ entry }) => copyEntry(entry));
    if (nextQuery !== this.query || !this.results.some((entry) => entry.id === this.activeId))
      this.activeId = this.results[0]?.id;
    this.query = nextQuery;
  }

  move(direction: -1 | 1): void {
    if (!this.results.length) return;
    const current = this.results.findIndex((entry) => entry.id === this.activeId);
    const next = (current + direction + this.results.length) % this.results.length;
    this.activeId = this.results[next].id;
  }

  snapshot() {
    return {
      results: this.results.map(copyEntry),
      activeId: this.activeId,
      total: this.total,
    };
  }
}
