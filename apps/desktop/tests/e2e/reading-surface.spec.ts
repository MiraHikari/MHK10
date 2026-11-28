import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite-plus';
import type { ReaderSession } from '../../src/lib/apps/reader/reader-session';
import type {
  mountReadingSurface,
  ReadingSurfaceChange,
} from '../../src/lib/apps/reader/reading-surface';

declare global {
  interface Window {
    ReadingSurfaceTest: {
      ReaderSession: typeof ReaderSession;
      mountReadingSurface: typeof mountReadingSurface;
    };
    readingSurfaces: {
      entries: {
        session: ReaderSession;
        surface: ReturnType<typeof mountReadingSurface>;
        changes: ReadingSurfaceChange[];
      }[];
      mount(index: number): ReturnType<typeof mountReadingSurface>;
      observers: Set<ResizeObserver>;
      failObserve: boolean;
      releaseFonts(): void;
    };
  }
}

let bundled: Promise<string> | undefined;
function surfaceBundle() {
  return (bundled ??= (async () => {
    const entry = 'virtual:reading-surface-test';
    const source = [
      ['apps/reader/reader-session.ts', 'ReaderSession'],
      ['apps/reader/reading-surface.ts', 'mountReadingSurface'],
    ]
      .map(
        ([name, exported]) =>
          `export { ${exported} } from ${JSON.stringify(fileURLToPath(new URL(`../../src/lib/${name}`, import.meta.url)).replaceAll('\\', '/'))};`,
      )
      .join('\n');
    const built = await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [
        {
          name: 'reading-surface-test',
          resolveId: (id) => (id === entry ? `\0${entry}` : undefined),
          load: (id) => (id === `\0${entry}` ? source : undefined),
        },
      ],
      build: {
        write: false,
        emptyOutDir: false,
        minify: false,
        lib: { entry, formats: ['iife'], name: 'ReadingSurfaceTest' },
        rolldownOptions: { input: entry },
      },
    });
    const result = Array.isArray(built) ? built[0] : built;
    if (!('output' in result)) throw new Error('Expected in-memory ReadingSurface bundle');
    const script = result.output.find((item) => item.type === 'chunk');
    if (!script) throw new Error('Missing ReadingSurface script');
    return script.code;
  })());
}

async function fixture(page: Page) {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.route('**/__reading-surface', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body></body>',
    }),
  );
  await page.goto('/__reading-surface');
  await page.addStyleTag({
    content: await readFile(
      new URL('../../src/lib/apps/reader/reader.css', import.meta.url),
      'utf8',
    ),
  });
  await page.addStyleTag({
    content: `
    body { display: flex; gap: 20px; margin: 16px; --paper: #fff; --ink: #000; --muted: #808080; --line: #c0c0c0; }
    .reader { display: flex; flex-direction: column; height: 320px; width: 380px; border: 1px solid black; }
    .reader-viewport { height: 100%; }
  `,
  });
  await page.evaluate(() => {
    for (let index = 0; index < 2; index++) {
      const root = document.createElement('section');
      root.className = 'reader';
      root.dataset.fixture = String(index);
      root.innerHTML =
        '<div id="reader-viewport" class="reader-viewport" tabindex="0"><article id="reader-flow" class="reader-flow"><div id="reader-prose" class="reader-prose"><p class="selection-target">Alpha beta gamma delta.</p><h2 id="first">First chapter</h2>' +
        '<p>Reading across the same document keeps each surface independent.</p>'.repeat(18) +
        '<h2 id="last">Last chapter</h2><p>Alpha final paragraph.</p></div></article></div>';
      document.body.append(root);
    }
  });
  await page.addScriptTag({ content: await surfaceBundle() });
  await page.evaluate(() => {
    const observers = new Set<ResizeObserver>();
    let releaseFonts!: () => void;
    const ready = new Promise<void>((resolve) => {
      releaseFonts = resolve;
    });
    Object.defineProperty(document.fonts, 'ready', { configurable: true, get: () => ready });
    const NativeResizeObserver = ResizeObserver;
    window.ResizeObserver = class extends NativeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        super(callback);
        observers.add(this);
      }
      observe(target: Element, options?: ResizeObserverOptions) {
        if (window.readingSurfaces.failObserve) throw new Error('Injected observation failure');
        super.observe(target, options);
      }
      disconnect() {
        super.disconnect();
        observers.delete(this);
      }
    };
    const entries: Window['readingSurfaces']['entries'] = [];
    const mount = (index: number) =>
      window.ReadingSurfaceTest.mountReadingSurface(
        document.querySelector<HTMLElement>(`[data-fixture="${index}"]`)!,
        {
          state: () => entries[index].session.snapshot(),
          changed: (change) => {
            entries[index].changes.push(change);
            if (change.type === 'position')
              entries[index].session.command({ type: 'position', ...change.position });
          },
        },
      );
    window.readingSurfaces = { entries, mount, observers, failObserve: false, releaseFonts };
    for (let index = 0; index < 2; index++) {
      const session = new window.ReadingSurfaceTest.ReaderSession({
        storage: { read: () => undefined, write: () => {} },
        now: () => 123,
        schedule: (callback, delay) => {
          const timer = setTimeout(callback, delay);
          return () => clearTimeout(timer);
        },
      });
      session.open({ id: `book-${index}`, title: `Book ${index}` });
      session.command({
        type: 'annotate',
        id: 'note',
        quote: 'Alpha',
        text: '',
        anchor: '',
        offset: 0,
      });
      entries.push({ session, surface: mount(index), changes: [] });
      entries[index].surface.open();
    }
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.readingSurfaces.entries.every(({ session }) => session.snapshot().pages > 1),
      ),
    )
    .toBe(true);
}

test('ReadingSurface owns selection, search and highlights independently across remounts', async ({
  page,
}, info) => {
  await fixture(page);
  const first = page.locator('[data-fixture="0"]');
  await first.locator('.selection-target').dblclick({ position: { x: 8, y: 8 } });
  await expect
    .poll(() =>
      page.evaluate(() => window.readingSurfaces.entries[0].surface.snapshot().selection?.quote),
    )
    .toBe('Alpha');
  expect(
    await page.evaluate(() => window.readingSurfaces.entries[1].surface.snapshot().selection),
  ).toBeUndefined();
  const nativeSelection = await page.evaluate(() => {
    const before = document.getSelection()?.toString();
    window.readingSurfaces.entries[1].surface.command({ type: 'clear-selection', native: true });
    return { before, after: document.getSelection()?.toString() };
  });
  expect(nativeSelection.before?.trim()).toBe('Alpha');
  expect(nativeSelection.after).toBe(nativeSelection.before);
  const results = await page.evaluate(() => {
    const [left, right] = window.readingSurfaces.entries;
    const hits = left.surface.find('Alpha');
    right.surface.find('Alpha');
    left.surface.command({ type: 'search-step', direction: -1 });
    return {
      hits,
      left: left.surface.snapshot().search,
      right: right.surface.snapshot().search,
      immutable: Object.isFrozen(hits) && Object.isFrozen(hits[0]),
      annotations: CSS.highlights.get('reader-annotations')?.size,
      searches: CSS.highlights.get('reader-search')?.size,
    };
  });
  expect(results).toMatchObject({
    left: { count: 2, selected: 1 },
    right: { count: 2, selected: -1 },
    immutable: true,
    annotations: 2,
    searches: 4,
  });
  expect(results.hits.map((hit) => Object.keys(hit))).toEqual([
    ['index', 'excerpt'],
    ['index', 'excerpt'],
  ]);
  const remaining = await page.evaluate(() => {
    const [left, right] = window.readingSurfaces.entries;
    const oldDispose = left.surface.dispose;
    oldDispose();
    oldDispose();
    const before = {
      annotations: CSS.highlights.get('reader-annotations')?.size,
      searches: CSS.highlights.get('reader-search')?.size,
      observers: window.readingSurfaces.observers.size,
      releasedLayout: document.querySelector('[data-fixture="0"]')?.getAttribute('data-layout'),
    };
    left.surface = window.readingSurfaces.mount(0);
    left.surface.open();
    oldDispose();
    right.surface.command({ type: 'anchor', anchor: 'last' });
    return before;
  });
  expect(remaining).toEqual({ annotations: 1, searches: 2, observers: 1, releasedLayout: null });
  await expect.poll(() => page.evaluate(() => window.readingSurfaces.observers.size)).toBe(2);
  await expect
    .poll(() =>
      page.evaluate(() => window.readingSurfaces.entries[1].session.snapshot().document?.progress),
    )
    .toBeGreaterThan(0.9);
  await info.attach('Independent Reader surfaces', {
    body: await page.screenshot({ path: info.outputPath('reader-surfaces.png') }),
    contentType: 'image/png',
  });
});

test('ReadingSurface coalesces scroll and reuses chapter geometry until content changes', async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const queued = await page.evaluate(() => {
    const entry = window.readingSurfaces.entries[0];
    const root = document.querySelector<HTMLElement>('[data-fixture="0"]')!;
    const viewport = root.querySelector<HTMLElement>('#reader-viewport')!;
    const prose = root.querySelector<HTMLElement>('#reader-prose')!;
    const chapters = entry.surface.snapshot().chapters;
    let scans = 0;
    let headingMeasurements = 0;
    const query = prose.querySelectorAll.bind(prose);
    const headings = [...query<HTMLElement>('h2[id],h3[id]')];
    prose.querySelectorAll = function <T extends Element = Element>(
      selector: string,
    ): NodeListOf<T> {
      if (selector === 'h2[id],h3[id]') scans++;
      return query<T>(selector);
    };
    for (const heading of headings) {
      const bounds = heading.getBoundingClientRect.bind(heading);
      heading.getBoundingClientRect = () => {
        headingMeasurements++;
        return bounds();
      };
    }
    entry.changes.length = 0;
    for (const progress of [0.2, 0.5, 0.8]) {
      viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) * progress;
      viewport.dispatchEvent(new Event('scroll'));
    }
    for (let index = 0; index < 20; index++) entry.surface.snapshot();
    const beforeFrame = entry.changes.length;
    return new Promise<{
      beforeFrame: number;
      positions: number;
      progress: number;
      scans: number;
      headingMeasurements: number;
      sameChapters: boolean;
    }>((resolve) =>
      requestAnimationFrame(() => {
        resolve({
          beforeFrame,
          positions: entry.changes.filter((change) => change.type === 'position').length,
          progress: entry.session.snapshot().document!.progress,
          scans,
          headingMeasurements,
          sameChapters: chapters === entry.surface.snapshot().chapters,
        });
      }),
    );
  });
  expect(queued.beforeFrame).toBe(0);
  expect(queued.positions).toBe(1);
  expect(queued.progress).toBeCloseTo(0.8, 2);
  expect(queued.scans).toBe(0);
  expect(queued.headingMeasurements).toBe(0);
  expect(queued.sameChapters).toBe(true);
  const chapters = await page.evaluate(() => {
    const prose = document.querySelector<HTMLElement>('[data-fixture="0"] #reader-prose')!;
    const chapter = document.createElement('h2');
    chapter.id = 'added';
    chapter.textContent = 'Added chapter';
    prose.append(chapter);
    const entry = window.readingSurfaces.entries[0];
    entry.surface.open();
    return entry.surface.snapshot().chapters;
  });
  expect(chapters.at(-1)).toMatchObject({ anchor: 'added', title: 'Added chapter' });
});

test('ReadingSurface flushes the final pending scroll before saving and cancels its frame on dispose', async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const saved = await page.evaluate(() => {
    const entry = window.readingSurfaces.entries[0];
    const viewport = document.querySelector<HTMLElement>('[data-fixture="0"] #reader-viewport')!;
    entry.changes.length = 0;
    viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) * 0.7;
    viewport.dispatchEvent(new Event('scroll'));
    entry.surface.flush();
    entry.session.flush();
    const progress = entry.session.snapshot().document!.progress;
    const changes = entry.changes.length;
    entry.surface.dispose();
    return new Promise<{ progress: number; changes: number; after: number }>((resolve) =>
      requestAnimationFrame(() => resolve({ progress, changes, after: entry.changes.length })),
    );
  });
  expect(saved.progress).toBeCloseTo(0.7, 2);
  expect(saved.changes).toBe(1);
  expect(saved.after).toBe(saved.changes);
});

test('ReadingSurface repaginates after resize and rejects late fonts and partial initialization', async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(() => {
    const first = window.readingSurfaces.entries[0];
    first.session.command({ type: 'position', progress: 0.5 });
    first.session.command({ type: 'configure', preferences: { mode: 'pages', fontSize: 24 } });
    first.surface.update();
  });
  await expect(page.locator('[data-fixture="0"]')).toHaveAttribute('data-layout', 'pages');
  const pages = await page.evaluate(
    () => window.readingSurfaces.entries[0].session.snapshot().pages,
  );
  await page.locator('[data-fixture="0"]').evaluate((root) => {
    (root as HTMLElement).style.width = '240px';
  });
  await expect
    .poll(() => page.evaluate(() => window.readingSurfaces.entries[0].session.snapshot().pages))
    .toBeGreaterThan(pages);
  const state = await page.evaluate(async () => {
    const fixture = window.readingSurfaces;
    const first = fixture.entries[0];
    first.surface.dispose();
    const root = document.querySelector<HTMLElement>('[data-fixture="0"]')!;
    root.dataset.layout = 'disposed';
    const changes = first.changes.length;
    fixture.releaseFonts();
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    fixture.failObserve = true;
    let failed = false;
    try {
      fixture.mount(0);
    } catch {
      failed = true;
    }
    fixture.failObserve = false;
    const observersAfterFailure = fixture.observers.size;
    first.surface = fixture.mount(0);
    first.surface.open();
    return {
      failed,
      observersAfterFailure,
      lateChanged: first.changes.length !== changes,
      layout: root.dataset.layout,
    };
  });
  expect(state).toEqual({
    failed: true,
    observersAfterFailure: 1,
    lateChanged: false,
    layout: 'disposed',
  });
  await expect(page.locator('[data-fixture="0"]')).toHaveAttribute('data-layout', 'pages');
  expect(await page.evaluate(() => window.readingSurfaces.observers.size)).toBe(2);
});

test('ReadingSurface keeps the current passage visible when pages are repaginated', async ({
  page,
}, info) => {
  await fixture(page);
  await page.evaluate(() => {
    const first = window.readingSurfaces.entries[0];
    const prose = document.querySelector<HTMLElement>('[data-fixture="0"] #reader-prose')!;
    prose.innerHTML =
      '<h2 id="first">First chapter</h2>' +
      '<p style="font:12px/18px serif">Reading across the same document keeps each surface independent.</p>'.repeat(
        16,
      ) +
      '<p class="current-passage">Keep this passage visible after changing the text size.</p>' +
      '<p>A later paragraph fills another page.</p>'.repeat(32);
    first.session.command({ type: 'configure', preferences: { mode: 'pages' } });
    first.surface.open();
  });
  await expect(page.locator('[data-fixture="0"]')).toHaveAttribute('data-layout', 'pages');
  await page.evaluate(() => {
    const first = window.readingSurfaces.entries[0];
    first.surface.find('Keep this passage');
    first.surface.command({ type: 'search-index', index: 0 });
  });
  const visible = () =>
    page.locator('[data-fixture="0"] .current-passage').evaluate((passage) => {
      const viewport = passage.closest('.reader-viewport')!.getBoundingClientRect();
      return [...passage.getClientRects()].some(
        (rect) =>
          rect.left < viewport.right &&
          rect.right > viewport.left &&
          rect.top < viewport.bottom &&
          rect.bottom > viewport.top,
      );
    });
  await expect.poll(visible).toBe(true);
  await page.evaluate(() => {
    const first = window.readingSurfaces.entries[0];
    first.session.command({ type: 'configure', preferences: { fontSize: 36 } });
    first.surface.update();
  });
  await expect(page.locator('[data-fixture="0"]')).toHaveCSS('--reader-font', '36px');
  await expect.poll(visible).toBe(true);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('[data-fixture="0"]')!.style.width = '360px';
    window.readingSurfaces.entries[0].surface.update();
  });
  await expect.poll(visible).toBe(true);
  await info.attach('Passage after repagination', {
    body: await page.screenshot({ path: info.outputPath('reader-current-passage.png') }),
    contentType: 'image/png',
  });
});
