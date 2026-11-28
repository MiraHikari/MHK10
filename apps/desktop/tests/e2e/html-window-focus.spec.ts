import { expect, test } from '@playwright/test';
import { bootDesktop } from './helpers';

declare global {
  interface Window {
    earlyShortcutListeners: Set<EventListenerOrEventListenerObject>;
  }
}

test('an interactive HTML window receives shell shortcuts before its image finishes loading', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const listeners = (window.earlyShortcutListeners =
      new Set<EventListenerOrEventListenerObject>());
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      add.call(this, type, listener, options);
      const capture = typeof options === 'boolean' ? options : !!options?.capture;
      if (this === document && type === 'keydown' && capture && listener) listeners.add(listener);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      remove.call(this, type, listener, options);
      const capture = typeof options === 'boolean' ? options : !!options?.capture;
      if (this === document && type === 'keydown' && capture && listener)
        listeners.delete(listener);
    };
  });
  let releaseImage = () => {};
  const heldImage = new Promise<void>((resolve) => {
    releaseImage = resolve;
  });
  const imagePath = '/images/gallery/west-lake-vista-display.webp';
  await page.route(
    (url) => url.pathname === '/acdsee/',
    async (route) => {
      if (!route.request().frame().parentFrame()) {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const html = await response.text();
      const imageTags = html.match(/<img\b[^>]*\bid="image-view"[^>]*>/g);
      expect(imageTags).toHaveLength(1);
      const imageTag = imageTags![0];
      // The viewer assigns its source asynchronously. Make this specific stage image parser-loaded
      // so the fixture always holds document load, regardless of application startup timing.
      await route.fulfill({
        response,
        body: html.replace(
          imageTag,
          imageTag.replace('<img', `<img src="${imagePath}" loading="eager"`),
        ),
      });
    },
  );
  let requested = false;
  await page.route(`**${imagePath}`, async (route) => {
    if (route.request().frame().parentFrame()) {
      requested = true;
      await heldImage;
    }
    await route.continue();
  });
  try {
    // Only DOM readiness is needed: the test deliberately keeps an iframe image pending.
    await page.goto('/acdsee/?media=gallery--west-lake-vista-display', {
      waitUntil: 'domcontentloaded',
    });
    const canvas = page.locator('#screen');
    await expect(canvas).toBeVisible();
    await expect(page.locator('#boot-hint')).toHaveCount(0);
    await canvas.press('Escape');
    await expect(canvas).toHaveAttribute('aria-busy', 'false');
    const frame = page.locator('iframe[data-html-window="acdsee"]');
    const viewer = page.frameLocator('iframe[data-html-window="acdsee"]');
    await expect(viewer.locator('#image-position')).not.toBeEmpty();
    await expect.poll(() => requested).toBe(true);
    await expect(viewer.locator('#image-view')).toHaveJSProperty('complete', false);
    expect(await viewer.locator('html').evaluate(() => document.readyState)).not.toBe('complete');
    const field = viewer.getByRole('textbox', { name: 'Current image folder', exact: true });
    await field.click();
    await page.keyboard.press('Control+Shift+Escape');
    await expect(canvas).toHaveAttribute('aria-label', /Task Manager/);
    await expect(canvas).toBeFocused();
    expect(await viewer.locator('html').evaluate(() => window.earlyShortcutListeners.size)).toBe(1);

    releaseImage();
    await expect
      .poll(() => viewer.locator('html').evaluate(() => document.readyState))
      .toBe('complete');
    expect(await viewer.locator('html').evaluate(() => window.earlyShortcutListeners.size)).toBe(1);
    expect(
      await viewer
        .locator('html')
        .evaluate(
          () =>
            [...document.querySelectorAll('style')].filter(
              (style) => style.textContent === 'html, html * { cursor: none !important; }',
            ).length,
        ),
    ).toBe(1);
    await viewer.locator('html').evaluate(() => {
      window.parent.postMessage({ type: 'doom95:focus', id: 'acdsee' }, location.origin);
    });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(canvas).toHaveAttribute('aria-label', /Task Manager/);
    await canvas.press('Control+F4');
    await expect(canvas).not.toHaveAttribute('aria-label', /Task Manager/);
    await expect(frame).toBeVisible();
    await field.click();
    await page.keyboard.press('Control+F4');
    await expect(frame).toHaveCount(0);
  } finally {
    releaseImage();
  }
});

test('late embedded focus messages cannot redirect a Canvas close shortcut', async ({ page }) => {
  const canvas = await bootDesktop(page);
  const home = page.locator('iframe[data-html-window="home"]');
  const heading = page
    .frameLocator('iframe[data-html-window="home"]')
    .getByRole('heading', { level: 1 });
  await heading.click();
  await page.keyboard.press('Control+Shift+Escape');
  await expect(canvas).toHaveAttribute('aria-label', /Task Manager/);
  await canvas.focus();
  const child = await (await home.elementHandle())!.contentFrame();
  if (!child) throw new Error('Home document was not mounted');
  // Replay a delayed public bridge message from the original iframe after
  // focus moved. No application state or window-manager state is modified.
  await child.evaluate(() => {
    window.parent.postMessage({ type: 'doom95:focus', id: 'home' }, location.origin);
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await expect(canvas).toHaveAttribute('aria-label', /Task Manager/);
  await canvas.press('Control+F4');
  await expect(canvas).not.toHaveAttribute('aria-label', /Task Manager/);
  await expect(home).toBeVisible();
  await canvas.press('Control+Shift+Escape');
  await expect(canvas).toHaveAttribute('aria-label', /Task Manager/);
  await heading.click();
  await expect(canvas).toHaveAttribute('aria-label', /MHK10 — Home/);
});
