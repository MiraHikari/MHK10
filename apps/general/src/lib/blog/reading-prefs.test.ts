import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ReaderModel } from '@mhk/site-core/fusion/reading-model';
import { SHARED_READING_STORAGE_KEY } from '@mhk/site-core/fusion/reading-storage';

import {
  getLineWidth,
  getZenMode,
  isLineWidth,
  LINE_WIDTH_CHAR,
  LINE_WIDTH_PROSE,
  LINE_WIDTHS,
  setLineWidth,
  setZenMode,
} from '@/lib/blog/reading-prefs';

describe('blog-reading-prefs', () => {
  it('行宽默认舒适档', () => {
    expect(getLineWidth()).toBe('comfortable');
  });

  it('专注模式默认关闭', () => {
    expect(getZenMode()).toBe(false);
  });

  it('setLineWidth 在内存中生效并可往返切换', () => {
    setLineWidth('wide');
    expect(getLineWidth()).toBe('wide');
    setLineWidth('compact');
    expect(getLineWidth()).toBe('compact');
  });

  it('setZenMode 在内存中生效并可往返切换', () => {
    setZenMode(true);
    expect(getZenMode()).toBe(true);
    setZenMode(false);
    expect(getZenMode()).toBe(false);
  });

  it('isLineWidth 白名单校验', () => {
    expect(isLineWidth('compact')).toBe(true);
    expect(isLineWidth('comfortable')).toBe(true);
    expect(isLineWidth('wide')).toBe(true);
    expect(isLineWidth('huge')).toBe(false);
    expect(isLineWidth(undefined)).toBe(false);
    expect(isLineWidth(42)).toBe(false);
  });

  it('暴露三档行宽映射', () => {
    expect(LINE_WIDTHS).toEqual(['compact', 'comfortable', 'wide']);
    expect(LINE_WIDTH_CHAR.compact).toBe(58);
    expect(LINE_WIDTH_CHAR.comfortable).toBe(70);
    expect(LINE_WIDTH_CHAR.wide).toBe(84);
  });

  it('暴露窄视口阅读密度映射（字号随档位递增）', () => {
    expect(Object.keys(LINE_WIDTH_PROSE)).toEqual(['compact', 'comfortable', 'wide']);
    expect(LINE_WIDTH_PROSE.compact.size).toBe('0.9375rem');
    expect(LINE_WIDTH_PROSE.comfortable.size).toBe('1rem');
    expect(LINE_WIDTH_PROSE.wide.size).toBe('1.0625rem');
    expect(LINE_WIDTH_PROSE.compact.lineHeight).toBeLessThan(
      LINE_WIDTH_PROSE.comfortable.lineHeight,
    );
    expect(LINE_WIDTH_PROSE.comfortable.lineHeight).toBeLessThan(LINE_WIDTH_PROSE.wide.lineHeight);
  });
});

describe('shared-notebook reading preferences', () => {
  afterEach(() => vi.unstubAllGlobals());
  function harness(records: Map<string, string>) {
    let writable = true;
    const target = Object.assign(new EventTarget(), {
      localStorage: {
        getItem: (key: string) => records.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (writable) records.set(key, value);
        },
        removeItem: (key: string) => records.delete(key),
      },
    });
    vi.stubGlobal('window', target);
    return {
      target,
      deny: () => {
        writable = false;
      },
    };
  }
  it('uses shared desktop choices immediately without writing local preference keys', async () => {
    vi.resetModules();
    const model = new ReaderModel();
    model.configure({ width: 'narrow', focus: true });
    const records = new Map([[SHARED_READING_STORAGE_KEY, JSON.stringify(model.serialize())]]);
    harness(records);
    const prefs = await import('./reading-prefs');
    expect(prefs.getLineWidth()).toBe('compact');
    expect(prefs.getZenMode()).toBe(true);
    // The shared notebook is the single owner: hydration creates no side copies.
    expect(records.size).toBe(1);
  });
  it('writes line width and focus through to the shared notebook', async () => {
    vi.resetModules();
    const records = new Map<string, string>();
    harness(records);
    const prefs = await import('./reading-prefs');
    expect(prefs.getLineWidth()).toBe('comfortable');
    prefs.setLineWidth('wide');
    prefs.setZenMode(true);
    const shared = JSON.parse(records.get(SHARED_READING_STORAGE_KEY)!);
    expect(shared.preferences).toMatchObject({ width: 'wide', focus: true });
    expect(records.size).toBe(1);
  });
  it('falls back to defaults when the shared notebook is damaged and preserves it', async () => {
    vi.resetModules();
    const records = new Map([[SHARED_READING_STORAGE_KEY, '{broken']]);
    harness(records);
    const prefs = await import('./reading-prefs');
    expect(prefs.getLineWidth()).toBe('comfortable');
    expect(prefs.getZenMode()).toBe(false);
    expect(records.get(SHARED_READING_STORAGE_KEY)).toBe('{broken');
  });
  it('propagates a peer notebook change to subscribed preferences', async () => {
    vi.resetModules();
    const records = new Map<string, string>();
    const host = harness(records);
    const prefs = await import('./reading-prefs');
    const rendered: Array<[string, boolean]> = [];
    const unsubscribe = prefs.subscribe(() =>
      rendered.push([prefs.getLineWidth(), prefs.getZenMode()]),
    );

    const model = new ReaderModel();
    model.configure({ width: 'wide', focus: true });
    records.set(SHARED_READING_STORAGE_KEY, JSON.stringify(model.serialize()));
    const event = new Event('storage');
    Object.defineProperty(event, 'key', { value: SHARED_READING_STORAGE_KEY });
    host.target.dispatchEvent(event);

    expect(prefs.getLineWidth()).toBe('wide');
    expect(prefs.getZenMode()).toBe(true);
    expect(rendered).toEqual([['wide', true]]);

    // An identical event must not notify again.
    host.target.dispatchEvent(event);
    expect(rendered).toEqual([['wide', true]]);
    unsubscribe();
  });
  it('does not let a late subscriber change what earlier subscribers render', async () => {
    vi.resetModules();
    const records = new Map<string, string>();
    const host = harness(records);
    const prefs = await import('./reading-prefs');
    const first: Array<[string, boolean]> = [];
    const unsubscribeFirst = prefs.subscribe(() =>
      first.push([prefs.getLineWidth(), prefs.getZenMode()]),
    );

    // Diverge the mounted store from durable storage: the write is rejected, so
    // the visitor's in-session choice is not persisted. This is the state in
    // which an unconditional re-read on subscribe would silently flip an
    // already-mounted component.
    host.deny();
    prefs.setZenMode(true);
    expect(prefs.getLineWidth()).toBe('comfortable');
    expect(prefs.getZenMode()).toBe(true);
    expect(records.has(SHARED_READING_STORAGE_KEY)).toBe(false);
    expect(first).toEqual([['comfortable', true]]);

    const second: Array<[string, boolean]> = [];
    const unsubscribeSecond = prefs.subscribe(() =>
      second.push([prefs.getLineWidth(), prefs.getZenMode()]),
    );

    // Joining must not adopt durable storage while another subscriber is
    // mounted: both subscribers keep rendering the session value.
    expect(prefs.getLineWidth()).toBe('comfortable');
    expect(prefs.getZenMode()).toBe(true);
    expect(first).toEqual([['comfortable', true]]);
    expect(second).toEqual([]);
    unsubscribeFirst();
    unsubscribeSecond();
  });
  it('adopts the durable value on a remount after a rejected write', async () => {
    vi.resetModules();
    const records = new Map<string, string>();
    const host = harness(records);
    const prefs = await import('./reading-prefs');
    const unsubscribeFirst = prefs.subscribe(() => {});
    host.deny();
    prefs.setZenMode(true);
    expect(prefs.getZenMode()).toBe(true);
    unsubscribeFirst();
    // The durable notebook never received the write.
    expect(records.has(SHARED_READING_STORAGE_KEY)).toBe(false);

    // With no subscriber mounted, the remount adopts the only durable source:
    // the rejected write is not a persisted preference.
    const unsubscribeSecond = prefs.subscribe(() => {});
    expect(prefs.getZenMode()).toBe(false);
    unsubscribeSecond();
  });
  it('adopts a peer change that landed while nothing was subscribed', async () => {
    vi.resetModules();
    const records = new Map<string, string>();
    harness(records);
    const prefs = await import('./reading-prefs');
    const unsubscribe = prefs.subscribe(() => {});
    unsubscribe();

    // No storage subscription exists between unmount and remount.
    const model = new ReaderModel();
    model.configure({ width: 'wide', focus: true });
    records.set(SHARED_READING_STORAGE_KEY, JSON.stringify(model.serialize()));

    const rendered: Array<[string, boolean]> = [];
    const unsubscribeAgain = prefs.subscribe(() =>
      rendered.push([prefs.getLineWidth(), prefs.getZenMode()]),
    );
    expect(prefs.getLineWidth()).toBe('wide');
    expect(prefs.getZenMode()).toBe(true);
    expect(rendered).toEqual([]);
    unsubscribeAgain();
  });
});
