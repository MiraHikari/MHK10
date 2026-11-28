import { describe, expect, it } from 'vite-plus/test';
import { TaskManagerModel, type ProcessInput } from './task-manager-model';

const windowsOf = (...entries: Partial<ProcessInput>[]): ProcessInput[] =>
  entries.map((entry, index) => ({
    id: entry.id ?? `w${index}`,
    appId: entry.appId ?? 'app',
    title: entry.title ?? `Window ${index}`,
    focused: entry.focused ?? false,
    minimized: entry.minimized ?? false,
    notResponding: entry.notResponding,
  }));

describe('Task Manager live roster', () => {
  it('sorts names deterministically without jumping when focus changes', () => {
    const model = new TaskManagerModel();
    model.sync(windowsOf({ id: 'b', title: 'Zebra', focused: true }, { id: 'a', title: 'Apple' }));
    expect(model.processes().map((row) => row.id)).toEqual(['a', 'b']);
    model.select('b');
    model.sync(windowsOf({ id: 'b', title: 'Zebra' }, { id: 'a', title: 'Apple', focused: true }));
    expect(model.processes().map((row) => row.id)).toEqual(['a', 'b']);
    expect(model.selected()).toBe('b');
    model.setSort('name');
    expect(model.processes().map((row) => row.id)).toEqual(['b', 'a']);
    expect(model.selected()).toBe('b');
  });

  it('reports only states supplied by the roster and sorts them on request', () => {
    const model = new TaskManagerModel();
    model.sync(
      windowsOf(
        { id: 'a', notResponding: true },
        { id: 'b', focused: true },
        { id: 'c', minimized: true },
        { id: 'd' },
      ),
    );
    expect(model.processes().map((row) => row.status)).toEqual([
      'Not Responding',
      'Focused',
      'Minimized',
      'Running',
    ]);
    model.setSort('state');
    expect(model.processes().map((row) => row.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('deduplicates the roster before computing actual window counts', () => {
    const model = new TaskManagerModel();
    model.sync(windowsOf({ id: 'a' }, { id: 'a', minimized: true }, { id: 'b', minimized: true }));
    expect(model.performance()).toEqual({
      totalProcesses: 2,
      activeProcesses: 1,
      minimizedProcesses: 1,
    });
    expect(model.processes()).toHaveLength(2);
  });

  it('keeps input and returned snapshots isolated from later mutations', () => {
    const model = new TaskManagerModel();
    const input = windowsOf({ title: 'Original' });
    model.sync(input);
    input.splice(0);
    expect(model.processes()[0].title).toBe('Original');
    const result = model.processes();
    expect(model.snapshot().processes).not.toBe(result);
    model.sync([]);
    expect(result).toHaveLength(1);
  });

  it('limits oversized host rosters and history capacity', () => {
    const model = new TaskManagerModel(3);
    model.sync(windowsOf(...Array.from({ length: 600 }, (_, i) => ({ id: String(i) }))));
    expect(model.performance().totalProcesses).toBe(512);
    for (let second = 1; second <= 5; second += 1) model.tick(second);
    expect(model.historySamples().map((sample) => sample.tick)).toEqual([3, 4, 5]);
  });
});

describe('Task Manager selection commands', () => {
  it('starts from either boundary, moves by pages and clamps', () => {
    const model = new TaskManagerModel();
    model.sync(windowsOf({ id: 'a' }, { id: 'b' }, { id: 'c' }));
    expect(model.selectRelative(-1)).toBe(true);
    expect(model.selected()).toBe('c');
    expect(model.selectRelative(1)).toBe(false);
    model.clearSelection();
    model.selectRelative(1);
    expect(model.selected()).toBe('a');
    model.selectRelative(8);
    expect(model.selected()).toBe('c');
    expect(model.selectFirst()).toBe(true);
    expect(model.selectLast()).toBe(true);
    expect(model.selectLast()).toBe(false);
  });

  it('cycles matching task initials and preserves selection on an unknown prefix', () => {
    const model = new TaskManagerModel();
    model.sync(
      windowsOf(
        { id: 'a', title: 'Clock' },
        { id: 'b', title: 'Calculator' },
        { id: 'c', title: 'Notepad' },
      ),
    );
    model.selectByPrefix('c');
    expect(model.selected()).toBe('b');
    model.selectByPrefix('C');
    expect(model.selected()).toBe('a');
    expect(model.selectByPrefix('zzz')).toBe(false);
    expect(model.selected()).toBe('a');
  });

  it('requests closing by stable id and clears disappeared selections', () => {
    const model = new TaskManagerModel();
    model.sync(windowsOf({ id: 'a' }, { id: 'b' }));
    expect(model.endTask()).toEqual({ ok: false, reason: 'no-selection' });
    model.select('b');
    expect(model.endTask()).toEqual({ ok: true, id: 'b' });
    expect(model.processes()).toHaveLength(2);
    model.sync(windowsOf({ id: 'a' }));
    expect(model.selected()).toBeNull();
    expect(model.endTask()).toEqual({ ok: false, reason: 'no-selection' });
    model.select('unknown');
    expect(model.selected()).toBeNull();
  });

  it('handles empty rosters and invalid movement', () => {
    const model = new TaskManagerModel();
    expect(model.selectFirst()).toBe(false);
    expect(model.selectLast()).toBe(false);
    expect(model.selectRelative(Number.NaN)).toBe(false);
    expect(model.selectByPrefix('a')).toBe(false);
  });
});

describe('Task Manager activity history', () => {
  it('samples real counts once a second and ignores invalid/backward timestamps', () => {
    const model = new TaskManagerModel();
    model.sync(windowsOf({ id: 'a' }, { id: 'b', minimized: true }));
    model.tick(1);
    model.tick(1.5);
    model.tick(Number.NaN);
    model.tick(-10);
    expect(model.historySamples()).toEqual([
      { tick: 1, totalProcesses: 2, activeProcesses: 1, minimizedProcesses: 1 },
    ]);
    model.sync(windowsOf({ id: 'b', minimized: true }));
    model.tick(2);
    expect(model.historySamples()[1]).toEqual({
      tick: 2,
      totalProcesses: 1,
      activeProcesses: 0,
      minimizedProcesses: 1,
    });
  });

  it('exposes tab, ordering and selected state through one snapshot', () => {
    const model = new TaskManagerModel();
    model.sync(windowsOf({ id: 'a' }));
    model.select('a');
    model.setTab('performance');
    model.tick(1);
    expect(model.snapshot()).toMatchObject({
      tab: 'performance',
      selected: 'a',
      sort: 'name',
      descending: false,
      processes: [{ id: 'a', selected: true }],
    });
    expect(model.snapshot().history).toHaveLength(1);
  });
});
