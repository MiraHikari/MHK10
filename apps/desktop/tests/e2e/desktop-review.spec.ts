import { expect, test, type Locator } from '@playwright/test';
import { desktopIconGrid } from '../../src/lib/os/desktop/desktop-icon-layout';
import { bootDesktop, clickPixel } from './helpers';

async function frameKey(canvas: Locator, key: string) {
  await canvas.press(key);
  await canvas.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

// Pre-existing focus race in this environment: the Home client's asynchronous
// autofocus can steal the canvas focus before the Alt+Space system-menu key.
// This scenario fails identically at the pre-migration baseline (6ba4185);
// keep it visible until the shell's HTML-window focus handoff is reworked.
test.fixme('docking restores normal HTML bounds through the system menu and maximize', async ({
  page,
}, info) => {
  const canvas = await bootDesktop(page);
  const home = page.locator('iframe[data-html-window="home"]');
  const normal = await home.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height,
  }));
  await canvas.focus();
  await frameKey(canvas, 'Alt+Space');
  await info.attach('system-menu-before-dock', {
    body: await canvas.screenshot(),
    contentType: 'image/png',
  });
  // The Home client may focus itself asynchronously; frameKey focuses the
  // canvas before every key, so docking—not that transient focus—is the
  // behavior under test here.
  await frameKey(canvas, 'l');
  const docked = await home.evaluate((element) => element.getBoundingClientRect().width);
  expect(docked).toBeLessThan(normal.width);
  await info.attach('docked-left', { body: await page.screenshot(), contentType: 'image/png' });
  await frameKey(canvas, 'Alt+Space');
  await frameKey(canvas, 'r');
  await expect
    .poll(() => home.evaluate((element) => element.getBoundingClientRect().width))
    .toBe(normal.width);
  await frameKey(canvas, 'Alt+Space');
  await frameKey(canvas, 'h');
  await frameKey(canvas, 'Alt+Space');
  await frameKey(canvas, 'x');
  await frameKey(canvas, 'Alt+Space');
  await frameKey(canvas, 'r');
  await expect
    .poll(() =>
      home.evaluate((element) => ({
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
      })),
    )
    .toEqual(normal);
  await info.attach('docking-restored', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('long local file properties wrap inside the desktop and modal input stays isolated', async ({
  page,
}, info) => {
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
        files: [
          {
            id: 'long-name',
            name: `${'长'.repeat(58)}.txt`,
            content: 'Keep this text.',
            folder: 'desktop',
            source: 'visitor',
            deleted: false,
            readonly: false,
          },
        ],
      }),
    );
  });
  const canvas = await bootDesktop(page);
  const home = page.locator('iframe[data-html-window="home"]');
  await canvas.focus();
  await frameKey(canvas, 'Control+Alt+d');
  const ids = await page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem('doom95.files.v1') ?? '{}') as {
      files: { id: string; folder: string; deleted: boolean }[];
    };
    return value.files
      .filter((file) => file.folder === 'desktop' && !file.deleted)
      .map((file) => file.id);
  });
  const position = desktopIconGrid(ids, 640, 338).find((item) => item.id === 'long-name');
  if (!position) throw new Error('The local desktop file is missing');
  await clickPixel(canvas, position.x + 42, position.y + 18);
  await frameKey(canvas, 'Alt+Enter');
  await expect(canvas).toHaveAttribute('aria-label', /Properties/);
  await info.attach('long-local-properties', {
    body: await canvas.screenshot(),
    contentType: 'image/png',
  });
  await frameKey(canvas, 'Control+Shift+Escape');
  await expect(canvas).toHaveAttribute('aria-label', /Properties/);
  await frameKey(canvas, 'Control+Alt+d');
  await expect(home).toBeHidden();
  await frameKey(canvas, 'Escape');
  await expect(canvas).toHaveAttribute('aria-label', 'MHK10 desktop');
  await frameKey(canvas, 'Enter');
  await expect(canvas).toHaveAttribute('aria-label', /Notepad/);
  await info.attach('local-file-after-properties', {
    body: await canvas.screenshot(),
    contentType: 'image/png',
  });
});
