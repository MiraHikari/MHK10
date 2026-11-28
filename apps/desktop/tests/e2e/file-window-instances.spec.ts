import { expect, test, type Locator, type Page } from '@playwright/test';
import { desktopIconGrid } from '../../src/lib/os/desktop/desktop-icon-layout';
import { bootDesktop, clickPixel } from './helpers';

async function openDesktopFile(page: Page, canvas: Locator, fileId: string) {
  const files = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('doom95.files.v1') ?? '{}') as {
      files: { id: string; folder: string; deleted: boolean }[];
    };
    return saved.files
      .filter((file) => file.folder === 'desktop' && !file.deleted)
      .map((file) => file.id);
  });
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({
    width: element.width,
    height: element.height,
  }));
  const position = desktopIconGrid(files, size.width, size.height - 22).find(
    (file) => file.id === fileId,
  );
  if (!position) throw new Error(`Desktop file is missing: ${fileId}`);
  await clickPixel(canvas, position.x + 42, position.y + 18);
  await canvas.press('Enter');
}

async function closeHome(page: Page) {
  const canvas = await bootDesktop(page);
  await canvas.press('Control+F4');
  await expect(page.locator('iframe[data-html-window]')).toHaveCount(0);
  return canvas;
}

test('Reader keeps separate desktop file windows and can reopen one without replacing the other', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/favicon.svg');
  await page.evaluate(() => {
    localStorage.setItem(
      'doom95.desktop.v1',
      JSON.stringify({
        resolutionMode: 'classic',
        hasVisited: true,
        welcomeCompleted: true,
        showAssistant: false,
        windowAnimations: false,
      }),
    );
    localStorage.setItem(
      'doom95.files.v1',
      JSON.stringify({
        version: 1,
        folders: [],
        desktopInitialized: true,
        files: [
          {
            id: 'reader-first',
            name: 'First Notes.md',
            content: '# First notes\n\nOnly in the first book.',
          },
          {
            id: 'reader-second',
            name: 'Second Notes.md',
            content: '# Second notes\n\nOnly in the second book.',
          },
        ].map((file) => ({
          ...file,
          folder: 'desktop',
          source: 'visitor',
          deleted: false,
          readonly: false,
        })),
      }),
    );
  });
  const canvas = await closeHome(page);
  const firstFrame = page.locator('iframe[data-html-window="blog:file:reader-first"]');
  const secondFrame = page.locator('iframe[data-html-window="blog:file:reader-second"]');
  const first = firstFrame.contentFrame();
  const second = secondFrame.contentFrame();
  await openDesktopFile(page, canvas, 'reader-first');
  await expect(firstFrame).toHaveAttribute('data-html-app', 'blog');
  await expect(first.locator('#reader-prose')).toContainText('Only in the first book.');
  await openDesktopFile(page, canvas, 'reader-second');
  await expect(page.locator('iframe[data-html-app="blog"]')).toHaveCount(2);
  await expect(second.locator('#reader-prose')).toContainText('Only in the second book.');
  await expect(first.locator('#reader-prose')).not.toContainText('Only in the second book.');
  await expect(second.locator('#reader-prose')).not.toContainText('Only in the first book.');
  await openDesktopFile(page, canvas, 'reader-first');
  await expect(page.locator('iframe[data-html-app="blog"]')).toHaveCount(2);
  await expect(first.locator('#reader-feedback')).toHaveText('File opened.');
  await page.screenshot({ path: info.outputPath('reader-independent-file-windows.png') });
  await first.locator('#reader-prose').focus();
  await page.keyboard.press('Control+F4');
  await expect(firstFrame).toHaveCount(0);
  await expect(second.locator('#reader-prose')).toContainText('Only in the second book.');
  await openDesktopFile(page, canvas, 'reader-first');
  await expect(page.locator('iframe[data-html-app="blog"]')).toHaveCount(2);
  await expect(first.locator('#reader-prose')).toContainText('Only in the first book.');
  expect(errors).toEqual([]);
});

test('ACDSee keeps local images and transforms inside their desktop file windows', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/favicon.svg');
  await page.evaluate(async () => {
    localStorage.setItem(
      'doom95.desktop.v1',
      JSON.stringify({
        resolutionMode: 'classic',
        hasVisited: true,
        welcomeCompleted: true,
        showAssistant: false,
        windowAnimations: false,
      }),
    );
    const seeds = [
      {
        id: 'image-first',
        name: 'First Image.png',
        path: '/images/previews/profile/avatar.png',
      },
      {
        id: 'image-second',
        name: 'Second Image.png',
        path: '/images/previews/projects/xengine.png',
      },
    ];
    const assets = await Promise.all(
      seeds.map(async (seed) => ({ ...seed, blob: await (await fetch(seed.path)).blob() })),
    );
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('doom95.assets.v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('assets', { keyPath: 'id' });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('assets', 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onerror = transaction.onabort = () => reject(transaction.error);
        for (const asset of assets)
          transaction.objectStore('assets').put({ id: asset.id, blob: asset.blob });
      });
    } finally {
      database.close();
    }
    localStorage.setItem(
      'doom95.files.v1',
      JSON.stringify({
        version: 1,
        folders: [],
        desktopInitialized: true,
        files: assets.map((asset) => ({
          id: asset.id,
          name: asset.name,
          content: '',
          folder: 'desktop',
          source: 'visitor',
          deleted: false,
          readonly: false,
          kind: 'image',
          mime: 'image/png',
          size: asset.blob.size,
          assetId: asset.id,
        })),
      }),
    );
  });
  const canvas = await closeHome(page);
  const firstFrame = page.locator('iframe[data-html-window="acdsee:file:image-first"]');
  const secondFrame = page.locator('iframe[data-html-window="acdsee:file:image-second"]');
  const first = firstFrame.contentFrame();
  const second = secondFrame.contentFrame();
  await openDesktopFile(page, canvas, 'image-first');
  await expect(firstFrame).toHaveAttribute('data-html-app', 'acdsee');
  await expect(first.locator('#image-title')).toHaveText('First Image.png');
  await expect(first.locator('#image-view')).toHaveAttribute('src', /^blob:/);
  await first.locator('.image-toolbar [data-command="rotate-right"]').click();
  await expect(first.locator('#image-view')).toHaveAttribute('data-rotation', '90');
  await openDesktopFile(page, canvas, 'image-second');
  await expect(page.locator('iframe[data-html-app="acdsee"]')).toHaveCount(2);
  await expect(second.locator('#image-title')).toHaveText('Second Image.png');
  await expect(second.locator('#image-view')).toHaveAttribute('src', /^blob:/);
  await expect(second.locator('#image-view')).toHaveAttribute('data-rotation', '0');
  const firstUrl = await first.locator('#image-original').getAttribute('href');
  const secondUrl = await second.locator('#image-original').getAttribute('href');
  expect(firstUrl).not.toBe(secondUrl);
  await openDesktopFile(page, canvas, 'image-first');
  await expect(page.locator('iframe[data-html-app="acdsee"]')).toHaveCount(2);
  await expect(first.locator('#image-view')).toHaveAttribute('data-rotation', '90');
  await page.screenshot({ path: info.outputPath('acdsee-independent-file-windows.png') });
  await first.locator('#image-stage').focus();
  await page.keyboard.press('Control+F4');
  await expect(firstFrame).toHaveCount(0);
  await expect(second.locator('#image-title')).toHaveText('Second Image.png');
  await expect(second.locator('#image-view')).toHaveAttribute('data-rotation', '0');
  await expect(second.locator('#image-original')).toHaveAttribute('href', secondUrl!);
  await openDesktopFile(page, canvas, 'image-first');
  await expect(page.locator('iframe[data-html-app="acdsee"]')).toHaveCount(2);
  await expect(first.locator('#image-title')).toHaveText('First Image.png');
  await expect(first.locator('#image-view')).toHaveAttribute('data-rotation', '0');
  expect(errors).toEqual([]);
});
