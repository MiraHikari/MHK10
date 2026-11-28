export interface ProjectRecord {
  readonly id: string;
  readonly title: string;
  /** ISO calendar date, as authored in the project's time element. */
  readonly date: string;
  readonly tags: readonly string[];
  readonly description: string;
  readonly summary: string;
  readonly highlights: readonly string[];
}

export type ProjectSort = 'curated' | 'newest' | 'name';
export type ProjectNavigationKey = 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';

export interface ProjectBrowserConfiguration {
  query?: string;
  tag?: string;
  sort?: ProjectSort;
}

export interface ProjectBrowserSnapshot<T extends ProjectRecord = ProjectRecord> {
  readonly items: readonly T[];
  readonly selected: T | undefined;
  readonly query: string;
  readonly tag: string;
  readonly sort: ProjectSort;
  readonly tags: readonly string[];
  readonly total: number;
}

const nameOrder = new Intl.Collator('zh-CN', { sensitivity: 'base', numeric: true });
const normalize = (value: string): string => value.normalize('NFKC').toLowerCase();

/** Filtering, selection and deep links share one project browsing session. */
export class ProjectBrowser<T extends ProjectRecord = ProjectRecord> {
  private readonly records: readonly T[];
  private readonly tags: readonly string[];
  private query = '';
  private tag = '';
  private sort: ProjectSort = 'curated';
  private selectedId: string | undefined;

  constructor(records: readonly T[]) {
    this.records = [...records];
    this.tags = [...new Set(records.flatMap((record) => record.tags))];
    this.selectedId = records[0]?.id;
  }

  private items(): T[] {
    const terms = normalize(this.query).trim().split(/\s+/u).filter(Boolean);
    const tag = normalize(this.tag).trim();
    const items = this.records.filter((record) => {
      if (tag && !record.tags.some((value) => normalize(value).trim() === tag)) return false;
      const content = normalize(
        [
          record.id,
          record.title,
          record.date,
          ...record.tags,
          record.description,
          record.summary,
          ...record.highlights,
        ].join('\n'),
      );
      return terms.every((term) => content.includes(term));
    });
    if (this.sort === 'newest') items.sort((a, b) => b.date.localeCompare(a.date));
    else if (this.sort === 'name')
      items.sort((a, b) => nameOrder.compare(normalize(a.title), normalize(b.title)));
    return items;
  }

  snapshot(): ProjectBrowserSnapshot<T> {
    const items = this.items();
    return {
      items,
      selected: items.find((record) => record.id === this.selectedId),
      query: this.query,
      tag: this.tag,
      sort: this.sort,
      tags: [...this.tags],
      total: this.records.length,
    };
  }

  configure(configuration: ProjectBrowserConfiguration): void {
    if (configuration.query !== undefined)
      this.query = Array.from(configuration.query).slice(0, 120).join('');
    if (configuration.tag !== undefined) this.tag = configuration.tag;
    if (configuration.sort !== undefined) this.sort = configuration.sort;
    const items = this.items();
    if (!items.some((record) => record.id === this.selectedId)) this.selectedId = items[0]?.id;
  }

  select(id: string): boolean {
    if (!this.items().some((record) => record.id === id)) return false;
    this.selectedId = id;
    return true;
  }

  /** A valid explicit link clears filters without changing the chosen ordering. */
  reveal(id: string): boolean {
    if (!this.records.some((record) => record.id === id)) return false;
    this.query = '';
    this.tag = '';
    this.selectedId = id;
    return true;
  }

  move(key: ProjectNavigationKey): void {
    const items = this.items();
    if (!items.length) {
      this.selectedId = undefined;
      return;
    }
    const current = Math.max(
      0,
      items.findIndex((record) => record.id === this.selectedId),
    );
    const next =
      key === 'Home'
        ? 0
        : key === 'End'
          ? items.length - 1
          : Math.max(0, Math.min(items.length - 1, current + (key === 'ArrowDown' ? 1 : -1)));
    this.selectedId = items[next].id;
  }
}
