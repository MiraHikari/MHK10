import { expect, test, type Frame, type Page } from '@playwright/test';
import { DEFAULT_READER_PREFERENCES, type ReaderState } from '@mhk/site-core/fusion/reading-model';
import { SHARED_READING_STORAGE_KEY } from '@mhk/site-core/fusion/reading-storage';
import { FUSION_EVENTS } from '@mhk/site-core/fusion/protocol-model';
import { FUSION_DESKTOP_ORIGIN, FUSION_GENERAL_ORIGIN } from '../../scripts/verify-config.mjs';

const GENERAL_PORT = new URL(FUSION_GENERAL_ORIGIN).port;
const QUOTE = '这个博客的第一篇文章';
const retained = [
  { id: 'long', quote: 'x'.repeat(600), text: 'Long annotation', progress: 0.3, anchor: '' },
  { id: 'plain', quote: '', text: 'Text-only annotation', progress: 0.3, anchor: '' },
  {
    id: 'cross',
    quote: 'never present across\nseparate paragraphs',
    text: 'Cross-block annotation',
    progress: 0.3,
    anchor: '',
  },
  {
    id: 'stale',
    quote: 'Authored text that no longer exists',
    text: 'Keep stale anchor',
    progress: 0.3,
    anchor: '',
    block: { block: 999, start: 0, end: 10 },
  },
];

async function ready(page: Page) {
  await expect(page.locator('[data-mode-toggle]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#boot-loader')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('.prose-mh')).toBeVisible();
}

async function notebook(page: Page): Promise<ReaderState | null> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SHARED_READING_STORAGE_KEY);
}

test('general edits preserve every unrenderable annotation and progress saves leave marks and scrolling intact', async ({
  page,
}, info) => {
  const initial: ReaderState = {
    version: 1,
    preferences: { ...DEFAULT_READER_PREFERENCES },
    documents: {
      colophon: {
        progress: 0,
        anchor: '',
        lastOpened: 1,
        bookmarks: [],
        notes: [
          { id: 'visible', quote: QUOTE, text: '', progress: 0, anchor: '', offset: 9999 },
          ...retained,
        ],
      },
    },
  };
  await page.addInitScript(
    ({ key, state, generalPort }) => {
      if (location.port === generalPort) localStorage.setItem(key, JSON.stringify(state));
    },
    { key: SHARED_READING_STORAGE_KEY, state: initial, generalPort: GENERAL_PORT },
  );
  await page.goto('/blog/colophon/');
  await ready(page);
  const mark = page.locator('mark.reading-highlight');
  await expect(mark).toHaveCount(1);
  await expect(mark).toHaveAttribute('data-note-id', 'visible');
  await mark.scrollIntoViewIfNeeded();
  const currentMark = await mark.elementHandle();
  const scrolling = await page.evaluate(
    ({ key, event }) => {
      const content = document.querySelector('.prose-mh')!;
      const scroll = content.closest('.section-scroll') ?? document.scrollingElement!;
      const top = scroll.scrollTop;
      const state = JSON.parse(localStorage.getItem(key)!);
      state.documents.colophon.progress = 0.9;
      localStorage.setItem(key, JSON.stringify(state));
      window.dispatchEvent(new Event(event));
      return { before: top, after: scroll.scrollTop };
    },
    { key: SHARED_READING_STORAGE_KEY, event: FUSION_EVENTS.readingState },
  );
  expect(scrolling.after).toBe(scrolling.before);
  expect(await currentMark!.evaluate((element) => element.isConnected)).toBe(true);
  await mark.click();
  await expect(mark).toHaveCount(0);
  await expect.poll(async () => (await notebook(page))?.documents.colophon.notes).toEqual(retained);
  await page.screenshot({ path: info.outputPath('general-preserved-annotations.png') });
});

test('a general selection creates a block note that desktop Reader renders without changing its saved progress', async ({
  page,
}, info) => {
  const slug = 'colophon';
  await page.goto(`/blog/${slug}/`);
  await ready(page);
  const paragraph = page.locator('.prose-mh p').first();
  await paragraph.scrollIntoViewIfNeeded();
  const points = await paragraph.evaluate((element) => {
    const node = element.firstChild!;
    const first = document.createRange();
    first.setStart(node, 0);
    first.setEnd(node, 1);
    const last = document.createRange();
    last.setStart(node, 11);
    last.setEnd(node, 12);
    const start = first.getBoundingClientRect();
    const end = last.getBoundingClientRect();
    return {
      x1: start.left,
      y1: start.top + start.height / 2,
      x2: end.right,
      y2: end.top + end.height / 2,
    };
  });
  await page.mouse.move(points.x1, points.y1);
  await page.mouse.down();
  await page.mouse.move(points.x2, points.y2, { steps: 12 });
  await page.mouse.up();
  const before = (await notebook(page))?.documents[slug]?.progress ?? 0;
  await page.getByRole('button', { name: '高亮', exact: true }).click();
  await expect(page.locator('mark.reading-highlight[data-note-id]')).toHaveCount(1);
  const saved = (await notebook(page))!.documents[slug];
  expect(saved.progress).toBe(before);
  expect(saved.notes).toHaveLength(1);
  expect(saved.notes[0].block).toBeDefined();
  expect(saved.notes[0].offset).toBeUndefined();
  await page.locator('[data-mode-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'win95');
  let reader: Frame | undefined;
  await expect
    .poll(
      () => {
        reader = page
          .frames()
          .find(
            (frame) =>
              frame.url() === `${FUSION_DESKTOP_ORIGIN}/blog/colophon/` ||
              frame.url() === `${FUSION_DESKTOP_ORIGIN}/blog/colophon`,
          );
        return Boolean(reader);
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect(reader!.locator('#microsoft-reader')).toHaveAttribute('data-reader-ready', '');
  await expect
    .poll(() => reader!.evaluate(() => CSS.highlights?.get('reader-annotations')?.size ?? 0))
    .toBe(1);
  await page.screenshot({ path: info.outputPath('desktop-general-block-note.png') });
});

test('shared width and focus preferences take effect immediately on a new general article', async ({
  page,
}, info) => {
  await page.addInitScript(
    ({ key, preferences, generalPort }) => {
      if (location.port === generalPort)
        localStorage.setItem(key, JSON.stringify({ version: 1, preferences, documents: {} }));
    },
    {
      key: SHARED_READING_STORAGE_KEY,
      preferences: { ...DEFAULT_READER_PREFERENCES, width: 'narrow', focus: true },
      generalPort: GENERAL_PORT,
    },
  );
  await page.goto('/blog/colophon/');
  await expect(page.locator('#boot-loader')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('html')).toHaveClass(/reading-zen/);
  await expect(page.locator('html')).toHaveCSS('--article-reading-width', '58ch');
  await page.screenshot({ path: info.outputPath('general-shared-reader-preferences.png') });
});
