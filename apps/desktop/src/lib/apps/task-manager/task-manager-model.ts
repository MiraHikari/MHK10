/** A task is a live MHK10 window. All facts come from the host's roster. */
export interface ProcessInput {
  readonly id: string;
  readonly appId: string;
  readonly title: string;
  readonly focused: boolean;
  readonly minimized: boolean;
  readonly notResponding?: boolean;
}
export type ProcessStatus = 'Focused' | 'Minimized' | 'Running' | 'Not Responding';
export interface ProcessView extends ProcessInput {
  readonly status: ProcessStatus;
  readonly selected: boolean;
}
export type TaskManagerTab = 'applications' | 'performance';
export type TaskSort = 'name' | 'state';
export interface PerformanceSnapshot {
  readonly activeProcesses: number;
  readonly minimizedProcesses: number;
  readonly totalProcesses: number;
}
export interface PerformanceSample extends PerformanceSnapshot {
  readonly tick: number;
}
export type EndTaskResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: 'no-selection' | 'not-found' };
export interface TaskManagerSnapshot {
  readonly tab: TaskManagerTab;
  readonly processes: readonly ProcessView[];
  readonly selected: string | null;
  readonly performance: PerformanceSnapshot;
  readonly history: readonly PerformanceSample[];
  readonly sort: TaskSort;
  readonly descending: boolean;
}

function status(process: ProcessInput): ProcessStatus {
  return process.notResponding
    ? 'Not Responding'
    : process.minimized
      ? 'Minimized'
      : process.focused
        ? 'Focused'
        : 'Running';
}
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Owns stable selection, list ordering and bounded one-second activity samples.
 * CPU and heap usage are deliberately absent: window counts cannot measure them.
 */
export class TaskManagerModel {
  private readonly historyCap: number;
  private tab: TaskManagerTab = 'applications';
  private selectedId: string | null = null;
  private order: ProcessInput[] = [];
  private history: PerformanceSample[] = [];
  private sort: TaskSort = 'name';
  private descending = false;

  constructor(historyCap = 60) {
    this.historyCap = Number.isFinite(historyCap)
      ? Math.max(1, Math.min(3600, Math.floor(historyCap)))
      : 60;
  }
  sync(windows: readonly ProcessInput[]): void {
    const seen = new Set<string>();
    this.order = windows
      .filter((process) => {
        if (seen.has(process.id) || seen.size >= 512) return false;
        seen.add(process.id);
        return true;
      })
      .map((process) => ({ ...process }));
    this.sortRows();
    if (this.selectedId !== null && !seen.has(this.selectedId)) this.selectedId = null;
  }
  private sortRows(): void {
    this.order.sort((a, b) => {
      const byState = this.sort === 'state' ? compare(status(a), status(b)) : 0;
      const result =
        byState ||
        compare(a.title.toLowerCase(), b.title.toLowerCase()) ||
        compare(a.title, b.title) ||
        compare(a.id, b.id);
      return this.descending ? -result : result;
    });
  }
  setSort(sort: TaskSort): void {
    this.descending = this.sort === sort ? !this.descending : false;
    this.sort = sort;
    this.sortRows();
  }
  tick(tick: number): void {
    if (!Number.isFinite(tick)) return;
    const last = this.history.at(-1);
    if (last && tick - last.tick < 1) return;
    this.history.push({ tick, ...this.performance() });
    if (this.history.length > this.historyCap) this.history.shift();
  }
  setTab(tab: TaskManagerTab): void {
    this.tab = tab;
  }
  select(id: string): void {
    this.selectedId = this.order.some((process) => process.id === id) ? id : null;
  }
  clearSelection(): void {
    this.selectedId = null;
  }
  selectFirst(): boolean {
    return this.selectIndex(0);
  }
  selectLast(): boolean {
    return this.selectIndex(this.order.length - 1);
  }
  private selectIndex(index: number): boolean {
    const process = this.order[Math.max(0, Math.min(this.order.length - 1, index))];
    if (!process || process.id === this.selectedId) return false;
    this.selectedId = process.id;
    return true;
  }
  selectRelative(delta: number): boolean {
    if (!Number.isFinite(delta)) return false;
    const index = this.order.findIndex((process) => process.id === this.selectedId);
    return this.selectIndex(
      index < 0 ? (delta > 0 ? 0 : this.order.length - 1) : index + Math.trunc(delta),
    );
  }
  selectByPrefix(prefix: string): boolean {
    const needle = prefix.trim().toLowerCase();
    if (!needle) return false;
    const current = this.order.findIndex((process) => process.id === this.selectedId);
    for (let offset = 1; offset <= this.order.length; offset += 1) {
      const index = (current + offset) % this.order.length;
      if (this.order[index].title.toLowerCase().startsWith(needle)) return this.selectIndex(index);
    }
    return false;
  }
  selected(): string | null {
    return this.selectedId;
  }
  processes(): readonly ProcessView[] {
    return this.order.map((process) => ({
      ...process,
      status: status(process),
      selected: process.id === this.selectedId,
    }));
  }
  performance(): PerformanceSnapshot {
    const minimized = this.order.filter((process) => process.minimized).length;
    return {
      totalProcesses: this.order.length,
      activeProcesses: this.order.length - minimized,
      minimizedProcesses: minimized,
    };
  }
  historySamples(): readonly PerformanceSample[] {
    return this.history.map((sample) => ({ ...sample }));
  }
  endTask(): EndTaskResult {
    if (this.selectedId === null) return { ok: false, reason: 'no-selection' };
    if (!this.order.some((process) => process.id === this.selectedId))
      return { ok: false, reason: 'not-found' };
    return { ok: true, id: this.selectedId };
  }
  snapshot(): TaskManagerSnapshot {
    return {
      tab: this.tab,
      processes: this.processes(),
      selected: this.selectedId,
      performance: this.performance(),
      history: this.historySamples(),
      sort: this.sort,
      descending: this.descending,
    };
  }
}
