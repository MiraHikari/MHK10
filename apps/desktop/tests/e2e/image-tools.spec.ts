import { expect, test, type Download, type FrameLocator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { bootDesktop, clickPixel } from './helpers';

interface PngImage {
  width: number;
  height: number;
  data: Buffer;
}
const {
  PNG,
}: {
  PNG: {
    new (options: { width: number; height: number }): PngImage;
    sync: { write(image: PngImage): Buffer; read(buffer: Buffer): PngImage };
  };
} = createRequire(import.meta.url)('pngjs');

declare global {
  interface Window {
    imageToolEncoding: { ready: boolean; release(): void; restore(): void };
    imageToolRelease?: () => void;
    imageToolFetchRestore?: () => void;
  }
}

const sourcePixels = [
  255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0, 64, 64, 64, 128, 255, 255, 255, 255,
];
function sampleImage(width = 2, height = 3): Buffer {
  const image = new PNG({ width, height });
  if (width === 2 && height === 3) image.data.set(sourcePixels);
  else image.data.fill(255);
  return PNG.sync.write(image);
}
async function client(page: Page, width = 560, height = 310): Promise<FrameLocator> {
  await page.route('**/__image-tools-client', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body style="margin:8px"><iframe title="ACDSee tools" src="/acdsee/" style="width:${width}px;height:${height}px;border:0"></iframe></body></html>`,
    }),
  );
  await page.goto('/__image-tools-client');
  const viewer = page.frameLocator('iframe');
  await expect(viewer.locator('#image-position')).not.toBeEmpty();
  return viewer;
}
async function openSample(viewer: FrameLocator, multiple = false): Promise<void> {
  await expect(viewer.locator('#image-browser')).toHaveAttribute('aria-busy', 'false');
  const files = [{ name: 'colours.png', mimeType: 'image/png', buffer: sampleImage() }];
  if (multiple) files.push({ name: 'second.png', mimeType: 'image/png', buffer: sampleImage() });
  await viewer.locator('#image-open').setInputFiles(files);
  await expect(viewer.locator('#image-title')).toHaveText('colours.png');
  await expect(viewer.locator('#image-view')).toHaveAttribute('data-rotation', '0');
  await expect
    .poll(() =>
      viewer.locator('#image-view').evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(2);
}

test('ACDSee processes a same-origin display copy and obeys the desktop reduced-motion preference', async ({
  page,
}, info) => {
  const viewer = await client(page);
  await viewer.locator('#image-list [data-media-id]').first().dblclick();
  const source = await viewer.locator('#image-view').getAttribute('src');
  expect(source).toMatch(/^\/images\//);
  await adjust(viewer);
  await viewer.locator('#image-brightness').press('ArrowRight');
  await expect(viewer.locator('#image-adjusted')).toBeVisible();
  const exportPending = page.waitForEvent('download');
  await viewer
    .locator('#image-adjustments')
    .getByRole('button', { name: 'Export PNG copy…', exact: true })
    .click();
  expect((await downloadedImage(await exportPending)).width).toBeGreaterThan(0);
  await viewer.locator('#image-adjustments [data-command="close-adjustments"]').click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await viewer.locator('#image-browser').evaluate(() => {
    document.documentElement.dataset.reducedMotion = 'true';
  });
  await expect(viewer.locator('.image-toolbar [data-command="slideshow"]')).toBeDisabled();
  await page.screenshot({ path: info.outputPath('acdsee-same-origin-adjustment.png') });
});

test('ACDSee keeps every tool reachable at 320 px and reflects its current view', async ({
  page,
}, info) => {
  const viewer = await client(page, 320, 300);
  await openSample(viewer, true);
  const toolbar = viewer.locator('.image-toolbar');
  expect(
    await toolbar.locator('button, a').evaluateAll((controls) =>
      controls.every((control) => {
        const bounds = control.getBoundingClientRect();
        const toolbar = control.closest('[role="toolbar"]')!.getBoundingClientRect();
        return (
          bounds.width > 0 &&
          bounds.height > 0 &&
          bounds.left >= toolbar.left &&
          bounds.right <= toolbar.right &&
          bounds.top >= toolbar.top &&
          bounds.bottom <= toolbar.bottom
        );
      }),
    ),
  ).toBe(true);
  await expect(toolbar.getByRole('button', { name: 'Fit to window', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(viewer.locator('#image-zoom')).toHaveText('Fit');
  await toolbar.getByRole('button', { name: 'Actual size', exact: true }).click();
  await expect(toolbar.getByRole('button', { name: 'Actual size', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(toolbar.getByRole('button', { name: 'Fit to window', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await toolbar.getByRole('button', { name: 'Browse / View', exact: true }).click();
  await expect(viewer.locator('.image-body')).toHaveAttribute('data-mode', 'view');
  await expect(toolbar.getByRole('button', { name: 'Browse / View', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await toolbar.getByRole('button', { name: 'Rotate right', exact: true }).click();
  await expect(viewer.locator('#image-view')).toHaveAttribute('data-rotation', '90');
  await toolbar.getByRole('button', { name: 'Properties', exact: true }).click();
  await expect(viewer.locator('#image-properties')).toBeVisible();
  await viewer.getByRole('button', { name: 'Close image properties', exact: true }).click();
  await toolbar.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(viewer.locator('#image-view')).toHaveAttribute('data-rotation', '0');
  await expect(toolbar.getByRole('button', { name: 'Fit to window', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await viewer.locator('#image-stage').press('Escape');
  await expect(viewer.locator('.image-body')).toHaveAttribute('data-mode', 'browse');
  await expect(toolbar.getByRole('button', { name: 'Browse / View', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(viewer.locator('#image-original')).toHaveAttribute('href', /^blob:/);
  const open = toolbar.getByRole('button', { name: 'Open files', exact: true });
  await open.focus();
  await open.press('ArrowRight');
  await expect(toolbar.getByRole('button', { name: 'Browse / View', exact: true })).toBeFocused();
  await expect(viewer.locator('.image-body')).toHaveAttribute('data-mode', 'browse');
  await toolbar.getByRole('button', { name: 'Browse / View', exact: true }).press('End');
  const original = viewer.locator('#image-original');
  await expect(original).toBeFocused();
  const pendingOriginal = page.waitForEvent('download');
  await original.press('Enter');
  expect([...(await downloadedImage(await pendingOriginal)).data]).toEqual(sourcePixels);
  await expect(viewer.locator('.image-body')).toHaveAttribute('data-mode', 'browse');
  await page.locator('iframe').screenshot({ path: info.outputPath('acdsee-all-tools-narrow.png') });
});

test('ACDSee keeps selection, empty search and colour tools usable in the smallest client', async ({
  page,
}, info) => {
  const viewer = await client(page, 274, 155);
  await openSample(viewer, true);
  const first = viewer.getByRole('option', { name: /^colours\.png/ });
  const second = viewer.getByRole('option', { name: /^second\.png/ });
  await first.focus();
  await first.press('End');
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute('aria-selected', 'true');
  await second.press('Home');
  await expect(first).toBeFocused();
  await first.press('Enter');
  await expect(viewer.locator('.image-body')).toHaveAttribute('data-mode', 'view');
  await expect(viewer.locator('#image-stage')).toBeFocused();
  await viewer.locator('#image-stage').press('Escape');
  await expect(first).toBeFocused();

  const search = viewer.getByRole('searchbox', { name: 'Find', exact: true });
  await search.fill('no-image-matches-this');
  await expect(viewer.locator('#image-list-empty')).toContainText('No images found.');
  await expect(viewer.locator('#image-position')).toHaveText('0 / 0');
  await viewer.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  await expect(viewer.locator('#image-list [role="option"]')).toHaveCount(2);
  await expect(viewer.locator('#image-list-empty')).toBeHidden();
  expect(
    await viewer.locator('#image-browser').evaluate((element) => ({
      fitsWidth: element.scrollWidth <= element.clientWidth,
      scrolls: element.scrollHeight > element.clientHeight,
      fitsHeight: element.getBoundingClientRect().height <= window.innerHeight,
      statusVisible:
        element.querySelector('.image-status')!.getBoundingClientRect().bottom <=
        window.innerHeight,
    })),
  ).toEqual({ fitsWidth: true, scrolls: false, fitsHeight: true, statusVisible: true });

  await adjust(viewer);
  const dialog = viewer.locator('#image-adjustments');
  await dialog.getByRole('slider', { name: 'Saturation', exact: true }).press('Home');
  await expect(viewer.locator('#image-saturation-value')).toHaveText('0%');
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export PNG copy…', exact: true }).click();
  const exported = await downloadedImage(await pending);
  expect([exported.width, exported.height]).toEqual([2, 3]);
  await expect(viewer.locator('#image-copy-status')).toContainText('2 × 3');
  await page
    .locator('iframe')
    .screenshot({ path: info.outputPath('acdsee-smallest-colour-tools.png') });
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await viewer.locator('.image-toolbar [data-command="fit"]').focus();
  await page.locator('iframe').screenshot({ path: info.outputPath('acdsee-smallest-browser.png') });
});
async function adjust(viewer: FrameLocator): Promise<void> {
  await viewer.locator('.image-toolbar [data-command="adjustments"]').click();
  await expect(viewer.locator('#image-adjustments')).toBeVisible();
}
async function downloadedImage(download: Download): Promise<PngImage> {
  const path = await download.path();
  if (!path) throw new Error('The PNG copy has no local download.');
  return PNG.sync.read(await readFile(path));
}
async function holdEncoding(viewer: FrameLocator): Promise<void> {
  await viewer.locator('#image-browser').evaluate(() => {
    const encode = HTMLCanvasElement.prototype.toBlob;
    const work: Window['imageToolEncoding'] = (window.imageToolEncoding = {
      ready: false,
      release: () => {},
      restore: () => {
        HTMLCanvasElement.prototype.toBlob = encode;
      },
    });
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      encode.call(
        this,
        (blob) => {
          work.release = () => callback(blob);
          if (window.top) window.top.imageToolRelease = work.release;
          work.ready = true;
        },
        type,
        quality,
      );
    };
  });
}
async function waitForEncoding(viewer: FrameLocator): Promise<void> {
  await expect
    .poll(() => viewer.locator('#image-browser').evaluate(() => window.imageToolEncoding.ready))
    .toBe(true);
}
async function releaseEncoding(page: Page): Promise<void> {
  await page.evaluate(async () => {
    window.imageToolRelease?.();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

test('ACDSee exports the actual transformed colour pixels and keeps comparison and source independent', async ({
  page,
}, info) => {
  const viewer = await client(page);
  await openSample(viewer);
  const originalUrl = await viewer.locator('#image-original').getAttribute('href');
  await viewer.locator('.image-toolbar [data-command="rotate-right"]').click();
  await viewer
    .locator('.image-menubar summary')
    .filter({ hasText: /^Image$/ })
    .click();
  await viewer.locator('[data-command="flip-x"]').click();
  await adjust(viewer);
  const dialog = viewer.locator('#image-adjustments');
  await dialog.getByRole('button', { name: 'Grayscale', exact: true }).click();
  const expected = [
    255, 255, 255, 255, 0, 0, 0, 0, 182, 182, 182, 255, 64, 64, 64, 128, 18, 18, 18, 255, 54, 54,
    54, 255,
  ];
  await expect(viewer.locator('#image-adjusted')).toBeVisible();
  expect(
    await viewer
      .locator('#image-adjusted')
      .evaluate((canvas: HTMLCanvasElement) => [
        ...canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data,
      ]),
  ).toEqual(expected);
  await dialog.getByRole('button', { name: 'Compare original', exact: true }).click();
  await expect(viewer.locator('#image-adjusted')).toBeHidden();
  await expect(viewer.locator('#image-view')).toHaveCSS('visibility', 'visible');
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export PNG copy…', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('colours-edited.png');
  const exported = await downloadedImage(download);
  expect([exported.width, exported.height]).toEqual([3, 2]);
  expect([...exported.data]).toEqual(expected);
  await expect(viewer.locator('#image-copy-status')).toContainText('3 × 2');
  await expect(viewer.locator('#image-original')).toHaveAttribute('href', originalUrl!);
  const original = await viewer
    .locator('#image-browser')
    .evaluate(
      async (_root, url) => [...new Uint8Array(await (await fetch(url!)).arrayBuffer())],
      originalUrl,
    );
  expect(Buffer.from(original)).toEqual(sampleImage());
  await dialog.getByRole('button', { name: 'Compare original', exact: true }).click();
  await viewer.locator('#image-browser').evaluate(() => {
    const readPixels = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function () {
      CanvasRenderingContext2D.prototype.getImageData = readPixels;
      throw new Error('Injected preview pixel read failure');
    };
  });
  await dialog.getByRole('slider', { name: 'Brightness', exact: true }).press('ArrowRight');
  await expect(viewer.locator('#image-adjusted')).toBeHidden();
  await expect(viewer.locator('#image-feedback')).toContainText('Pixel processing is unavailable');
  await dialog.getByRole('button', { name: 'Grayscale', exact: true }).click();
  await expect(viewer.locator('#image-adjusted')).toBeVisible();
  expect(
    await viewer
      .locator('#image-adjusted')
      .evaluate((canvas: HTMLCanvasElement) => [
        ...canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data,
      ]),
  ).toEqual(expected);
  await expect(viewer.locator('#image-feedback')).not.toContainText('could not be rendered');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('iframe').screenshot({ path: info.outputPath('acdsee-adjusted-copy.png') });
});

test('ACDSee colour controls reset cleanly and large PNG copies report their bounded dimensions', async ({
  page,
}, info) => {
  const viewer = await client(page, 360, 300);
  await openSample(viewer);
  await adjust(viewer);
  const dialog = viewer.locator('#image-adjustments');
  await dialog.getByRole('slider', { name: 'Brightness', exact: true }).press('End');
  await expect(viewer.locator('#image-brightness-value')).toHaveText('100%');
  await dialog.getByRole('slider', { name: 'Contrast', exact: true }).press('Home');
  await expect(viewer.locator('#image-contrast-value')).toHaveText('0%');
  await dialog.getByRole('button', { name: 'Vivid', exact: true }).click();
  await expect(viewer.locator('#image-saturation-value')).toHaveText('125%');
  await dialog.getByRole('button', { name: 'Reset colours', exact: true }).click();
  await expect(viewer.locator('#image-brightness-value')).toHaveText('0%');
  await expect(viewer.locator('#image-contrast-value')).toHaveText('100%');
  await expect(viewer.locator('#image-saturation-value')).toHaveText('100%');
  await expect(viewer.locator('#image-adjusted')).toBeHidden();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page
    .locator('iframe')
    .screenshot({ path: info.outputPath('acdsee-colour-tools-narrow.png') });
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await viewer
    .locator('#image-open')
    .setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: sampleImage(5000, 2) });
  await expect(viewer.locator('#image-title')).toHaveText('wide.png');
  await adjust(viewer);
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export PNG copy…', exact: true }).click();
  const exported = await downloadedImage(await pending);
  expect([exported.width, exported.height]).toEqual([4096, 1]);
  await expect(viewer.locator('#image-copy-status')).toContainText('4096 × 1 (scaled');
});

test('ACDSee recovers from source and PNG encoder failures without changing the source', async ({
  page,
}) => {
  const viewer = await client(page);
  await openSample(viewer);
  await adjust(viewer);
  const dialog = viewer.locator('#image-adjustments');
  await viewer.locator('#image-browser').evaluate(() => {
    const fetchOriginal = window.fetch.bind(window);
    const source = document.querySelector<HTMLAnchorElement>('#image-original')!.href;
    window.imageToolFetchRestore = () => {
      window.fetch = fetchOriginal;
    };
    window.fetch = (input, init) =>
      input === source
        ? Promise.resolve(new Response('Unavailable', { status: 503 }))
        : fetchOriginal(input, init);
  });
  await dialog.getByRole('button', { name: 'Export PNG copy…', exact: true }).click();
  await expect(viewer.locator('#image-copy-status')).toContainText(
    'original image could not be read',
  );
  await viewer.locator('#image-browser').evaluate(() => {
    window.imageToolFetchRestore?.();
    const encode = HTMLCanvasElement.prototype.toBlob;
    window.imageToolEncoding = {
      ready: false,
      release: () => {},
      restore: () => {
        HTMLCanvasElement.prototype.toBlob = encode;
      },
    };
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      callback(null);
    };
  });
  await dialog.getByRole('button', { name: 'Export PNG copy…', exact: true }).click();
  await expect(viewer.locator('#image-copy-status')).toContainText('could not be encoded');
  await viewer.locator('#image-browser').evaluate(() => window.imageToolEncoding.restore());
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export PNG copy…', exact: true }).click();
  expect([...(await downloadedImage(await pending)).data]).toEqual(sourcePixels);
});

for (const reason of ['adjustment', 'selection', 'rotation', 'cancel'] as const) {
  test(`ACDSee invalidates a pending PNG on ${reason} and never downloads its late result`, async ({
    page,
  }) => {
    const viewer = await client(page);
    await openSample(viewer, true);
    await adjust(viewer);
    await holdEncoding(viewer);
    const downloads: Download[] = [];
    page.on('download', (download) => downloads.push(download));
    const dialog = viewer.locator('#image-adjustments');
    const exportButton = dialog.getByRole('button', { name: 'Export PNG copy…', exact: true });
    await exportButton.click();
    await waitForEncoding(viewer);
    await expect(exportButton).toBeDisabled();
    if (reason === 'adjustment')
      await dialog.getByRole('slider', { name: 'Brightness', exact: true }).press('ArrowRight');
    else if (reason === 'cancel')
      await dialog.getByRole('button', { name: 'Cancel export', exact: true }).click();
    else {
      await dialog.getByRole('button', { name: 'Done', exact: true }).click();
      if (reason === 'rotation') {
        await viewer.locator('.image-toolbar [data-command="rotate-right"]').click();
        await expect(viewer.locator('#image-view')).toHaveAttribute('data-rotation', '90');
      } else {
        await viewer.locator('.image-toolbar [data-command="next"]').click();
        await expect(viewer.locator('#image-title')).toHaveText('second.png');
      }
    }
    await expect(viewer.locator('#image-browser')).toHaveAttribute('aria-busy', 'false');
    await releaseEncoding(page);
    expect(downloads).toHaveLength(0);
    await expect(viewer.locator('#image-feedback')).toContainText('Export cancelled');
  });
}

test('closing ACDSee cancels a pending PNG before its native encoding callback arrives', async ({
  page,
}) => {
  const canvas = await bootDesktop(page, '/acdsee/');
  const viewer = page.frameLocator('iframe[data-html-window="acdsee"]');
  await openSample(viewer);
  await adjust(viewer);
  await holdEncoding(viewer);
  const downloads: Download[] = [];
  page.on('download', (download) => downloads.push(download));
  const dialog = viewer.locator('#image-adjustments');
  await dialog.getByRole('button', { name: 'Export PNG copy…', exact: true }).click();
  await waitForEncoding(viewer);
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toBeHidden();
  // Use the visible window chrome: this scenario tests cancellation on close,
  // independently of when the iframe's document-load shortcut bridge attaches.
  const close = await page.locator('iframe[data-html-window="acdsee"]').evaluate((frame) => ({
    x: Number.parseFloat(frame.style.left) + Number.parseFloat(frame.style.width) - 10,
    y: Number.parseFloat(frame.style.top) - 10,
  }));
  await clickPixel(canvas, close.x, close.y);
  await expect(page.locator('iframe[data-html-window="acdsee"]')).toHaveCount(0);
  await releaseEncoding(page);
  expect(downloads).toHaveLength(0);
});
