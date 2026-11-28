import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { build } from 'vite-plus';
import type { mountReader } from '../../src/lib/apps/reader/reader';
import type { mountHybridUi } from '../../src/lib/ui/browser/hybrid-ui';
import type { mountReaderNavigation } from '../../src/lib/apps/reader/reader-navigation';
import type { createLifetime } from '../../src/lib/ui/browser/lifetime';
import type {
  ReaderNavigationEntry,
  ReaderNavigationTarget,
} from '../../src/lib/apps/reader/reader-navigation-model';
import { bootDesktop } from './helpers';

async function choose(frame: FrameLocator, label: string, value: string): Promise<void> {
  await frame
    .getByRole('combobox', { name: label, exact: true })
    .and(frame.locator('button'))
    .click();
  await frame.getByRole('option', { name: value, exact: true }).click();
}

async function openBook(page: Page): Promise<FrameLocator> {
  await bootDesktop(page, '/blog/colophon/');
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  // The shell can reveal server-rendered content before the Reader module has mounted.
  await expect(reader.locator('#reader-estimate')).toHaveText(/^Est\. .* min left$/);
  return reader;
}

async function openJump(reader: FrameLocator, query = ''): Promise<void> {
  await reader.locator('#reader-viewport').press('Control+k');
  await expect(reader.getByRole('dialog', { name: 'Jump To', exact: true })).toBeVisible();
  await reader.getByRole('combobox', { name: 'Find a destination' }).fill(query);
}

for (const mode of ['scroll', 'pages'] as const) {
  test(`Reader Jump To navigates chapters and returns focus in ${mode} layout`, async ({
    page,
  }, info) => {
    const reader = await openBook(page);
    const viewport = reader.locator('#reader-viewport');
    const original = await reader.locator('#reader-prose').textContent();
    if (mode === 'pages') {
      await reader.locator('.reader-tools [data-reader-command="options"]').click();
      await choose(reader, 'Layout', 'Pages');
      await reader.locator('[data-reader-command="close-options"]').click();
      await expect(reader.locator('#microsoft-reader')).toHaveAttribute('data-layout', 'pages');
    }
    await openJump(reader);
    const query = reader.getByRole('combobox', { name: 'Find a destination' });
    await expect(query).toBeFocused();
    const first = await query.getAttribute('aria-activedescendant');
    await query.press('ArrowDown');
    await expect(query).not.toHaveAttribute('aria-activedescendant', first!);
    await query.press('ArrowUp');
    await expect(query).toHaveAttribute('aria-activedescendant', first!);
    const chapter = reader.locator('#reader-contents a').last();
    const title = (await chapter.textContent())!.trim();
    await query.fill(title);
    await expect(reader.locator('#reader-jump-results [role="option"]')).toHaveCount(1);
    await info.attach(`Reader Jump To ${mode}`, {
      body: await page.screenshot({ path: info.outputPath(`reader-jump-${mode}.png`) }),
      contentType: 'image/png',
    });
    await query.press('Enter');
    await expect(reader.locator('#reader-jump')).not.toBeVisible();
    await expect(viewport).toBeFocused();
    await expect(chapter).toHaveAttribute('aria-current', 'location');

    await openJump(reader, 'no-destination-791bd');
    await expect(reader.locator('#reader-jump-count')).toHaveText('No matching destinations.');
    await expect(reader.locator('#reader-jump-go')).toBeDisabled();
    await query.press('Enter');
    await expect(reader.locator('#reader-jump')).toBeVisible();
    await query.press('Escape');
    await expect(viewport).toBeFocused();

    const trigger = reader.locator('.reader-tools [data-reader-command="jump"]');
    await trigger.click();
    await reader.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(trigger).toBeFocused();
    expect(await reader.locator('#reader-prose').textContent()).toBe(original);
  });
}

test('Reader Jump To reuses bookmarks and notes while other dialogs keep their input', async ({
  page,
}) => {
  const reader = await openBook(page);
  const viewport = reader.locator('#reader-viewport');
  await viewport.press('End');
  await viewport.press('Control+d');
  await expect(reader.locator('#reader-bookmarks .reader-notebook-item')).toHaveCount(1);
  await reader.locator('.reader-tools [data-reader-command="note"]').click();
  const noteText = reader.locator('#reader-note-text');
  await noteText.fill('Jump navigation regression note.');
  await reader.locator('[data-reader-command="save-note"]').click();
  await viewport.press('Home');
  await openJump(reader, 'bookmark');
  const bookmark = reader.locator('#reader-jump-results [data-reader-jump^="bookmark:"]');
  await expect(bookmark).toHaveCount(1);
  await bookmark.click();
  await expect(reader.locator('#reader-contents a').last()).toHaveAttribute(
    'aria-current',
    'location',
  );
  await expect(viewport).toBeFocused();

  await openJump(reader, 'regression note');
  await reader.locator('#reader-jump-query').press('Enter');
  await expect(reader.getByRole('dialog', { name: 'Text Note', exact: true })).toBeVisible();
  await expect(noteText).toHaveValue('Jump navigation regression note.');
  await expect(noteText).toBeFocused();
  await noteText.press('Control+k');
  await expect(reader.locator('#reader-jump')).not.toBeVisible();
  await expect(noteText).toBeFocused();
  await noteText.press('Control+f');
  await expect(reader.locator('#reader-find')).not.toBeVisible();
  await expect(noteText).toHaveValue('Jump navigation regression note.');
  await reader.locator('[data-reader-command="close-note"]').click();
  await expect(reader.locator('#reader-notes .reader-notebook-item')).toHaveCount(1);
});

test('Reader resumes the quoted note destination after leaving a different chapter fragment', async ({
  page,
}, info) => {
  const reader = await openBook(page);
  const paragraph = reader.locator('#reader-prose h2 + p').first();
  await paragraph.scrollIntoViewIfNeeded();
  await paragraph.dblclick({ position: { x: 12, y: 8 } });
  await reader.locator('.reader-tools [data-reader-command="note"]').click();
  const quoteField = reader.locator('#reader-note-quote');
  await expect(quoteField).not.toHaveValue('');
  const quote = await quoteField.inputValue();
  await reader.locator('#reader-note-text').fill('Return to the first chapter quotation.');
  await reader.locator('[data-reader-command="save-note"]').click();

  const lastChapter = reader.locator('#reader-contents a').last();
  const lastAnchor = await lastChapter.getAttribute('data-reader-anchor');
  await openJump(reader, (await lastChapter.textContent())!.trim());
  await reader.locator('#reader-jump-query').press('Enter');
  const fragment = () =>
    reader.locator('#microsoft-reader').evaluate(() => decodeURIComponent(location.hash.slice(1)));
  await expect.poll(fragment).toBe(lastAnchor);
  await openJump(reader, 'first chapter quotation');
  await reader.locator('#reader-jump-query').press('Enter');
  await expect(quoteField).toHaveValue(quote);
  await expect.poll(fragment).toBe('');
  await reader.locator('[data-reader-command="close-note"]').click();
  const quotationVisible = () =>
    paragraph.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const viewport = document.getElementById('reader-viewport')!.getBoundingClientRect();
      return box.top < viewport.bottom && box.bottom > viewport.top;
    });
  await expect.poll(quotationVisible).toBe(true);
  await expect(reader.locator('#reader-contents a').first()).toHaveAttribute(
    'aria-current',
    'location',
  );

  await page.reload();
  await page.locator('#screen').focus();
  await page.keyboard.press('Escape');
  await expect(reader.locator('#reader-estimate')).toHaveText(/^Est\. .* min left$/);
  await expect.poll(fragment).toBe('');
  await expect.poll(quotationVisible).toBe(true);
  await expect(reader.locator('#reader-contents a').first()).toHaveAttribute(
    'aria-current',
    'location',
  );
  await info.attach('Reader quotation location after reload', {
    body: await page.screenshot({ path: info.outputPath('reader-quote-reload.png') }),
    contentType: 'image/png',
  });
});

test('Reader estimates use body text and position while layout and annotations leave the counts unchanged', async ({
  page,
}, info) => {
  const reader = await openBook(page);
  const viewport = reader.locator('#reader-viewport');
  await openJump(reader, 'book properties');
  await reader.locator('#reader-jump-query').press('Enter');
  await expect(reader.getByRole('dialog', { name: 'Book Properties', exact: true })).toBeVisible();
  const counts = await reader.locator('#reader-info-text').textContent();
  const total = await reader.locator('#reader-info-estimate').textContent();
  expect(counts).toMatch(/[\d,]+ CJK characters · [\d,]+ other words/);
  expect(total).toMatch(/^Est\. .* min total$/);
  await expect(reader.locator('.reader-estimate-method')).toContainText(
    'not measured reading activity',
  );
  await info.attach('Reader text estimates and assumptions', {
    body: await page.screenshot({ path: info.outputPath('reader-statistics.png') }),
    contentType: 'image/png',
  });
  await reader.locator('[data-reader-command="close-properties"]').click();
  await viewport.press('Home');
  await expect(reader.locator('#reader-estimate')).toHaveText(/^Est\. .* min left$/);
  await expect(reader.locator('#reader-estimate')).not.toHaveText('Est. 0 min left');
  await viewport.press('End');
  await expect(reader.locator('#reader-estimate')).toHaveText('Est. 0 min left');
  await viewport.press('Control+d');
  await openJump(reader, 'reading options');
  await reader.locator('#reader-jump-query').press('Enter');
  await choose(reader, 'Layout', 'Pages');
  await choose(reader, 'Text size', '200% · 24 px');
  await reader.locator('[data-reader-command="close-options"]').click();
  await viewport.press('End');
  await expect(reader.locator('#reader-estimate')).toHaveText('Est. 0 min left');
  await openJump(reader, 'book properties');
  await reader.locator('#reader-jump-query').press('Enter');
  await expect(reader.locator('#reader-info-text')).toHaveText(counts!);
  await expect(reader.locator('#reader-info-estimate')).toHaveText(total!);
});

test('Reader leaves library input alone until a book is open', async ({ page }) => {
  await bootDesktop(page, '/blog/');
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  await expect(reader.locator('.reader-tools [data-reader-command="jump"]')).toBeDisabled();
  await expect(reader.locator('#reader-estimate')).not.toBeVisible();
  const search = reader.locator('#library-search');
  await search.fill('AdventureX');
  await search.press('Control+k');
  await expect(reader.locator('#reader-jump')).not.toBeVisible();
  await expect(search).toHaveValue('AdventureX');
  await expect(search).toBeFocused();
});

declare global {
  interface Window {
    ReaderNavigationTest: {
      mountReader: typeof mountReader;
      mountHybridUi: typeof mountHybridUi;
      mountReaderNavigation: typeof mountReaderNavigation;
      createLifetime: typeof createLifetime;
    };
    readerNavigationFixture: {
      mount(): () => void;
      dispose(): void;
      oldDispose(): void;
      disposeUi(): void;
    };
    readerNavigationContract: {
      open(): boolean;
      refresh(): void;
      replaceEntries(entries: ReaderNavigationEntry[]): void;
      activations(): ReaderNavigationTarget[];
      dispose(): void;
    };
  }
}

async function mountReaderFixture(page: Page): Promise<void> {
  const response = await page.request.get('/blog/colophon/');
  expect(response.ok()).toBe(true);
  const html = await response.text();
  await page.route('**/__reader-navigation-test', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>',
    }),
  );
  await page.goto('/__reader-navigation-test');
  await page.evaluate((html) => {
    const source = new DOMParser().parseFromString(html, 'text/html');
    const root = source.querySelector<HTMLElement>('#microsoft-reader')!;
    root
      .querySelectorAll('script:not([type="application/json"])')
      .forEach((script) => script.remove());
    document.documentElement.className = 'is-embedded';
    document.documentElement.dataset.theme = 'std';
    for (const style of source.querySelectorAll('link[rel="stylesheet"], style'))
      document.head.append(document.importNode(style, true));
    document.body.replaceChildren(document.importNode(root, true));
  }, html);
  const entry = 'virtual:reader-navigation-test';
  const source = [
    ['apps/reader/reader.ts', 'mountReader'],
    ['ui/browser/hybrid-ui.ts', 'mountHybridUi'],
    ['apps/reader/reader-navigation.ts', 'mountReaderNavigation'],
    ['ui/browser/lifetime.ts', 'createLifetime'],
  ]
    .map(([name, mount]) => {
      const path = fileURLToPath(new URL(`../../src/lib/${name}`, import.meta.url));
      return `export { ${mount} } from ${JSON.stringify(path.replaceAll('\\', '/'))};`;
    })
    .join('\n');
  const built = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'reader-navigation-test',
        resolveId: (id) => (id === entry ? `\0${entry}` : undefined),
        load: (id) => (id === `\0${entry}` ? source : undefined),
      },
    ],
    build: {
      write: false,
      emptyOutDir: false,
      minify: false,
      lib: { entry, formats: ['iife'], name: 'ReaderNavigationTest' },
      rolldownOptions: { input: entry },
    },
  });
  const result = Array.isArray(built) ? built[0] : built;
  if (!('output' in result)) throw new Error('Expected an in-memory Reader bundle.');
  const script = result.output.find((item) => item.type === 'chunk');
  if (!script) throw new Error('Missing Reader test script.');
  await page.addScriptTag({ content: script.code });
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('#microsoft-reader')!;
    const mount = () => window.ReaderNavigationTest.mountReader(root);
    const disposeUi = window.ReaderNavigationTest.mountHybridUi(root);
    const dispose = mount();
    window.readerNavigationFixture = { mount, dispose, oldDispose: dispose, disposeUi };
  });
}

test('Reader closes Jump To before remount and fits a narrow reading surface', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 360 });
  await mountReaderFixture(page);
  const viewport = page.locator('#reader-viewport');
  const query = page.getByRole('combobox', { name: 'Find a destination' });
  await viewport.press('Control+k');
  await query.fill('options');
  await expect(page.locator('#reader-jump-results [role="option"]')).toHaveCount(1);
  await page.evaluate(() => window.readerNavigationFixture.dispose());
  await expect(page.locator('#reader-jump')).not.toBeVisible();
  await expect(page.locator('#reader-jump-results [role="option"]')).toHaveCount(0);
  await page.evaluate(() => {
    window.readerNavigationFixture.dispose = window.readerNavigationFixture.mount();
  });
  await viewport.press('Control+k');
  await expect(query).toHaveValue('');
  await query.press('ArrowDown');
  await expect(query).toHaveAttribute('aria-activedescendant', 'reader-jump-option-1');
  await page.evaluate(() => window.readerNavigationFixture.oldDispose());
  await expect(page.locator('#reader-jump')).toBeVisible();
  const geometry = await page.locator('#reader-jump').evaluate((dialog) => {
    const bounds = dialog.getBoundingClientRect();
    return {
      x: bounds.x,
      y: bounds.y,
      right: bounds.right,
      bottom: bounds.bottom,
      fits: dialog.scrollWidth <= dialog.clientWidth,
    };
  });
  expect(geometry).toMatchObject({ fits: true });
  expect(geometry.x).toBeGreaterThanOrEqual(0);
  expect(geometry.y).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(320);
  expect(geometry.bottom).toBeLessThanOrEqual(360);
  await info.attach('Reader Jump To at 320 by 360', {
    body: await page.screenshot({ path: info.outputPath('reader-jump-narrow.png') }),
    contentType: 'image/png',
  });
  await query.press('Escape');
  await expect(viewport).toBeFocused();
  expect(
    await page
      .locator('#microsoft-reader')
      .evaluate((root) => root.scrollWidth <= root.clientWidth),
  ).toBe(true);
  await page.evaluate(() => {
    window.readerNavigationFixture.dispose();
    window.readerNavigationFixture.disposeUi();
  });
});

test('Reader navigation revalidates the caller destinations and closes when none remain', async ({
  page,
}) => {
  await mountReaderFixture(page);
  await page.evaluate(() => {
    window.readerNavigationFixture.dispose();
    const root = document.querySelector<HTMLElement>('#microsoft-reader')!;
    const lifetime = window.ReaderNavigationTest.createLifetime();
    let entries: ReaderNavigationEntry[] = [
      {
        id: 'chapter:first',
        label: 'First chapter',
        detail: 'Chapter',
        target: { kind: 'chapter', anchor: 'first' },
      },
      {
        id: 'command:find',
        label: 'Find in book',
        detail: 'Ctrl+F',
        target: { kind: 'command', command: 'find' },
      },
    ];
    const activated: ReaderNavigationTarget[] = [];
    const navigation = window.ReaderNavigationTest.mountReaderNavigation(root, lifetime, {
      entries: () => entries,
      activate: (target) => activated.push(target),
    });
    window.readerNavigationContract = {
      ...navigation,
      replaceEntries: (next) => {
        entries = next;
      },
      activations: () => activated.map((target) => ({ ...target })),
      dispose: lifetime.dispose,
    };
  });
  expect(await page.evaluate(() => window.readerNavigationContract.open())).toBe(true);
  const query = page.getByRole('combobox', { name: 'Find a destination' });
  await expect(query).toBeFocused();
  await page.evaluate(() =>
    window.readerNavigationContract.replaceEntries([
      {
        id: 'command:find',
        label: 'Find in book',
        detail: 'Ctrl+F',
        target: { kind: 'command', command: 'find' },
      },
    ]),
  );
  await query.press('Enter');
  await expect(page.locator('#reader-jump')).toBeVisible();
  await expect(page.locator('#reader-jump-count')).toContainText('no longer available');
  expect(await page.evaluate(() => window.readerNavigationContract.activations())).toEqual([]);
  await query.press('Enter');
  expect(await page.evaluate(() => window.readerNavigationContract.activations())).toEqual([
    { kind: 'command', command: 'find' },
  ]);
  await expect(page.locator('#reader-viewport')).toBeFocused();
  expect(await page.evaluate(() => window.readerNavigationContract.open())).toBe(true);
  await page.evaluate(() => {
    window.readerNavigationContract.replaceEntries([]);
    window.readerNavigationContract.refresh();
  });
  await expect(page.locator('#reader-jump')).not.toBeVisible();
  expect(await page.evaluate(() => window.readerNavigationContract.open())).toBe(false);
  await page.evaluate(() => {
    window.readerNavigationContract.dispose();
    window.readerNavigationFixture.disposeUi();
  });
});
