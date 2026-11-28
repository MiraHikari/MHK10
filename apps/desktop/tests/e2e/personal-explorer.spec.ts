import { expect, test } from '@playwright/test';
import { bootDesktop } from './helpers';
import { build } from 'vite-plus';
import { fileURLToPath } from 'node:url';
import type { mountPersonalExplorer } from '../../src/lib/apps/home/personal-explorer';

declare global {
  interface Window {
    ExplorerLifetimeTest: { mountPersonalExplorer: typeof mountPersonalExplorer };
  }
}

test('Home releases registered listeners after partial initialization and remounts', async ({
  page,
}) => {
  const response = await page.request.get('/');
  const html = await response.text();
  await page.route('**/__explorer-lifetime', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
  );
  await page.goto('/__explorer-lifetime');
  await page.evaluate((html) => {
    const source = new DOMParser().parseFromString(html, 'text/html');
    const root = source.querySelector('[data-personal-explorer]');
    if (!root) throw new Error('Missing explorer');
    document.body.replaceChildren(document.importNode(root, true));
  }, html);
  const path = fileURLToPath(
    new URL('../../src/lib/apps/home/personal-explorer.ts', import.meta.url),
  ).replaceAll('\\', '/');
  const entry = 'virtual:explorer-lifetime';
  const built = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'explorer-lifetime',
        resolveId: (id) => (id === entry ? `\0${entry}` : undefined),
        load: (id) =>
          id === `\0${entry}`
            ? `export { mountPersonalExplorer } from ${JSON.stringify(path)};`
            : undefined,
      },
    ],
    build: {
      write: false,
      emptyOutDir: false,
      minify: false,
      lib: { entry, formats: ['iife'], name: 'ExplorerLifetimeTest' },
      rolldownOptions: { input: entry },
    },
  });
  const result = Array.isArray(built) ? built[0] : built;
  if (!('output' in result)) throw new Error('No explorer bundle');
  const script = result.output.find((item) => item.type === 'chunk');
  if (!script) throw new Error('No explorer script');
  await page.addScriptTag({ content: script.code });
  const outcome = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-personal-explorer]')!;
    const address = root.querySelector<HTMLInputElement>('#personal-location')!;
    const placeholder = document.createElement('span');
    address.replaceWith(placeholder);
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    const listeners = new Set<EventListenerOrEventListenerObject>();
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      add.call(this, type, listener, options);
      if (listener) listeners.add(listener);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      remove.call(this, type, listener, options);
      if (listener) listeners.delete(listener);
    };
    let error = '';
    try {
      window.ExplorerLifetimeTest.mountPersonalExplorer(root);
    } catch (caught) {
      error = String(caught);
    }
    const retained = listeners.size;
    const restored = !root.classList.contains('explorer-ready');
    EventTarget.prototype.addEventListener = add;
    EventTarget.prototype.removeEventListener = remove;
    placeholder.replaceWith(address);
    const dispose = window.ExplorerLifetimeTest.mountPersonalExplorer(root);
    const mounted = root.classList.contains('explorer-ready');
    dispose();
    return { error, retained, restored, mounted };
  });
  expect(outcome.error).not.toBe('');
  expect(outcome).toMatchObject({ retained: 0, restored: true, mounted: true });
});

test('Home separates selection from activation and supports folder and item keyboard navigation', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await bootDesktop(page);
  const home = page.frameLocator('iframe[data-html-window="home"]');
  await expect(home.locator('[data-personal-explorer]')).toHaveClass(/explorer-ready/);
  await home.locator('[data-explorer-item="projects"]').click();
  await expect(home.locator('[data-preview="projects"]')).toBeVisible();
  await expect(home.locator('#personal-location')).toHaveValue('MiraHikari\\Home');
  await expect(page.locator('iframe[data-html-window="profile"]')).toHaveCount(0);
  await home.getByRole('toolbar').getByRole('button', { name: 'Open', exact: true }).click();
  await expect(home.locator('#personal-location')).toHaveValue('MiraHikari\\Projects');
  const first = home.locator('[data-folder-items="projects"] [data-explorer-item]').first();
  await expect(first).toBeFocused();
  await first.press('End');
  const last = home.locator('[data-folder-items="projects"] [data-explorer-item]').last();
  await expect(last).toBeFocused();
  await last.press('Home');
  await first.press('ArrowDown');
  const engine = home.locator(
    '[data-folder-items="projects"] [data-explorer-item="project-xengine"]',
  );
  await expect(engine).toHaveAttribute('aria-selected', 'true');
  await engine.press('Enter');
  const profile = page.frameLocator('iframe[data-html-window="profile"]');
  await expect(profile.locator('[data-personal-properties]')).toHaveClass(/properties-ready/);
  await expect(profile.locator('#project-xengine')).toBeVisible();
  await profile.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('iframe[data-html-window="profile"]')).toHaveCount(0);
  await home.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(home.locator('#personal-location')).toHaveValue('MiraHikari\\Home');
  await home.getByRole('treeitem', { name: 'Projects', exact: true }).click();
  await home.getByRole('button', { name: 'Up', exact: true }).click();
  await expect(home.locator('#personal-location')).toHaveValue('MiraHikari\\Home');
  await page.screenshot({ path: info.outputPath('home-explorer.png') });
  expect(errors).toEqual([]);
});

test('item context commands and explicit Open activate one Properties window', async ({
  page,
  isMobile,
}, info) => {
  await bootDesktop(page);
  const home = page.frameLocator('iframe[data-html-window="home"]');
  await home.getByRole('treeitem', { name: 'Projects', exact: true }).click();
  const engine = home.locator(
    '[data-folder-items="projects"] [data-explorer-item="project-xengine"]',
  );
  await engine.click();
  const preview = home.locator('[data-preview="project-xengine"] img[data-original-src]');
  await expect
    .poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expect(preview).toHaveAttribute(
    'src',
    (await preview.getAttribute('data-original-src')) ?? '',
  );
  if (isMobile)
    await home.getByRole('toolbar').getByRole('button', { name: 'Open', exact: true }).click();
  else {
    await engine.click({ button: 'right' });
    const menu = home.getByRole('menu', { name: 'Item actions' });
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Open', exact: true }).click();
  }
  await expect(page.locator('iframe[data-html-window="profile"]')).toHaveCount(1);
  const profile = page.frameLocator('iframe[data-html-window="profile"]');
  await expect(profile.locator('[data-personal-properties]')).toHaveClass(/properties-ready/);
  await expect(profile.locator('#project-xengine')).toBeVisible();
  await page.screenshot({ path: info.outputPath('project-properties.png') });
});

test('project deep links and browser history restore selection, while Home and Close retain the desktop', async ({
  page,
}) => {
  await bootDesktop(page, '/about/#project-xengine');
  const profile = page.frameLocator('iframe[data-html-window="profile"]');
  await expect(profile.locator('[data-personal-properties]')).toHaveClass(/properties-ready/);
  await expect(profile.locator('#project-xengine')).toBeVisible();
  await profile.locator('[data-project-select="nearlink-toolbox"]').click();
  await expect(profile.locator('#project-nearlink-toolbox')).toBeVisible();
  // Frame history changes do not trigger a top-document load event.
  await profile
    .locator('[data-personal-properties]')
    .evaluate((element) => element.ownerDocument.defaultView?.history.back());
  await expect(profile.locator('#project-xengine')).toBeVisible();
  await profile.getByRole('link', { name: 'Home', exact: true }).click();
  const home = page.frameLocator('iframe[data-html-window="home"]');
  await expect(home.locator('[data-personal-explorer]')).toBeVisible();
  await expect(page.locator('iframe[data-html-window="home"]')).toHaveCount(1);
  await home.getByRole('link', { name: 'Properties', exact: true }).click();
  await expect(profile.getByRole('tab', { name: 'General', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await profile.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('iframe[data-html-window="profile"]')).toHaveCount(0);
  await expect(page.locator('iframe[data-html-window="home"]')).toHaveCount(1);
});

test('project artwork opens the shared image viewer and returns without losing selection', async ({
  page,
}) => {
  const canvas = await bootDesktop(page, '/about/#project-xengine');
  const profile = page.frameLocator('iframe[data-html-window="profile"]');
  await expect(profile.locator('[data-personal-properties]')).toHaveClass(/properties-ready/);
  await profile.locator('#project-xengine .project-art').click();
  const viewer = page.frameLocator('iframe[data-html-window="acdsee"]');
  await expect(viewer.locator('#image-view')).toBeVisible();
  await expect(viewer.locator('#image-original')).toHaveAttribute('href', /xengine\.webp$/);
  await canvas.focus();
  await canvas.press('Control+F4');
  await expect(page.locator('iframe[data-html-window="acdsee"]')).toHaveCount(0);
  await expect(profile.locator('#project-xengine')).toBeVisible();
});

test('public Properties routes keep every record and native anchors available without JavaScript', async ({
  browser,
  baseURL,
}, info) => {
  if (!baseURL) throw new Error('A site URL is required');
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  try {
    await page.goto(new URL('/about/#project-xengine', baseURL).href);
    await expect(page.locator('[data-project-id]')).toHaveCount(8);
    await expect(page.locator('[role="tabpanel"][hidden]')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Personal site navigation' })).toBeVisible();
    await page.locator('[data-project-select="nearlink-toolbox"]').click();
    await expect(page.locator('#project-nearlink-toolbox h3')).toBeInViewport();
    await expect(page.locator('#project-nearlink-toolbox')).toContainText(
      '使用 Rust 和 Tauri 构建跨平台桌面工具',
    );
    await page.screenshot({ path: info.outputPath('no-script-properties.png') });
  } finally {
    await context.close();
  }
});
