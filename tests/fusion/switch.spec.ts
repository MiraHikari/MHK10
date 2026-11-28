import { expect, test, type Page, type Frame } from '@playwright/test';
import { FUSION_EVENTS } from '@mhk/site-core/fusion/protocol-model';
import {
  READER_STORAGE_KEY,
  SHARED_READING_STORAGE_KEY as SHARED_READING_KEY,
} from '@mhk/site-core/fusion/reading-storage';
import { FUSION_DESKTOP_ORIGIN as DESKTOP_ORIGIN } from '../../scripts/verify-config.mjs';

const DESKTOP_READING_KEY = READER_STORAGE_KEY;

async function waitForBoot(page: Page) {
  await expect(page.locator('[data-mode-toggle]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#boot-loader')).toBeHidden({ timeout: 30_000 });
}

async function switchTo(page: Page, mode: 'classic' | 'win95') {
  await page.locator('[data-mode-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-display-mode', mode, {
    timeout: 30_000,
  });
}

async function desktopFrame(page: Page): Promise<Frame> {
  await expect
    .poll(() => page.frames().some((frame) => frame.url().startsWith(`${DESKTOP_ORIGIN}/`)), {
      timeout: 30_000,
    })
    .toBe(true);
  const frame = page.frames().find((candidate) => candidate.url().startsWith(`${DESKTOP_ORIGIN}/`));
  if (!frame) throw new Error('Desktop frame disappeared after the readiness poll.');
  return frame;
}

/** The full-shell document itself, never one of its nested application windows. */
async function outerDesktopFrame(page: Page): Promise<Frame> {
  const match = () =>
    page
      .frames()
      .find(
        (frame) =>
          frame.parentFrame() === page.mainFrame() && frame.url().startsWith(`${DESKTOP_ORIGIN}/`),
      );
  await expect.poll(() => Boolean(match()), { timeout: 30_000 }).toBe(true);
  const frame = match();
  if (!frame) throw new Error('Full-shell desktop frame disappeared after the readiness poll.');
  return frame;
}

test('the desktop is recommended on the hero and entered only when accepted', async ({ page }) => {
  await page.goto('/');
  await waitForBoot(page);

  // The general site always paints first: no silent desktop takeover.
  await expect(page.locator('html')).not.toHaveAttribute('data-display-mode', 'win95');
  await expect(page.locator('[data-classic-root]')).toHaveJSProperty('inert', false);
  await expect(page.locator('[data-desk-embed] iframe')).toHaveCount(0);

  const offer = page.locator('.about-entry__offer');
  await expect(offer).toBeVisible();
  await expect(offer).toContainText('MHK10 · DESKTOP');

  await offer.getByRole('button', { name: '留在通用版' }).click();
  await expect(offer).toBeHidden();
  await expect(page.locator('html')).not.toHaveAttribute('data-display-mode', 'win95');
  await expect(page.locator('[data-desk-embed] iframe')).toHaveCount(0);
  // The answer is remembered for the session.
  await page.reload();
  await waitForBoot(page);
  await expect(page.locator('.about-entry__offer')).toHaveCount(0);
});

test('accepting the recommendation reveals the desktop and both presentations stay reachable', async ({
  page,
}) => {
  await page.goto('/');
  await waitForBoot(page);
  await page.locator('.about-entry__offer').getByRole('button', { name: '进入桌面' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'win95', {
    timeout: 30_000,
  });
  const embed = page.locator('[data-desk-embed]');
  await expect(embed).toHaveAttribute('data-visible', 'true');
  await expect(page.locator('[data-classic-root]')).toHaveJSProperty('inert', true);
  const desktop = await desktopFrame(page);
  await expect(desktop.locator('html')).toHaveAttribute('data-embed-full', '');
  await expect(desktop.locator('html')).not.toHaveAttribute('data-presentation-suspended', '');
  // The reveal moves focus once the frame stops being inert.
  await expect(page.locator('[data-desk-embed] iframe')).toBeFocused();
  // The host cursor releases the pointer to the desktop's own pointer layer.
  await expect(page.locator('html')).not.toHaveClass(/custom-cursor-active/);

  await switchTo(page, 'classic');
  await expect(embed).toHaveAttribute('data-visible', 'false');
  await expect(embed).toHaveJSProperty('inert', true);
  await expect(page.locator('[data-classic-root]')).toHaveJSProperty('inert', false);
  await expect(desktop.locator('html')).toHaveAttribute('data-presentation-suspended', '');
  await expect(page.locator('html')).toHaveClass(/custom-cursor-active/);

  await switchTo(page, 'win95');
  await expect(embed).toHaveAttribute('data-visible', 'true');
  await expect(page.locator('[data-classic-root]')).toHaveJSProperty('inert', true);
  await expect(desktop.locator('html')).not.toHaveAttribute('data-presentation-suspended', '');
});

test('a saved desktop choice survives a direct deep-link load', async ({ page }) => {
  await page.goto('/?view=win95');
  await waitForBoot(page);
  await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'win95');

  // The preference, not the entry path, now decides the presentation.
  await page.goto('/blog/colophon/');
  await waitForBoot(page);
  await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'win95');
  const desktop = await outerDesktopFrame(page);
  const article = () =>
    desktop.childFrames().find((frame) => /\/blog\/colophon\/?$/.test(frame.url()));
  await expect.poll(() => Boolean(article()), { timeout: 30_000 }).toBe(true);
});

test('a deep link stays general and hands the same article to the desktop and back', async ({
  page,
}) => {
  await page.goto('/blog/colophon/');
  await waitForBoot(page);
  await expect(page.locator('html')).not.toHaveAttribute('data-display-mode', 'win95');
  await expect(page.locator('[data-classic-root]')).toHaveJSProperty('inert', false);

  await switchTo(page, 'win95');
  await expect
    .poll(
      () => page.frames().some((frame) => frame.url().includes(`${DESKTOP_ORIGIN}/blog/colophon/`)),
      {
        timeout: 30_000,
      },
    )
    .toBe(true);

  await switchTo(page, 'classic');
  await expect(page).toHaveURL(/\/blog\/colophon\/?$/);
  await expect(page.locator('[data-classic-root]')).toHaveJSProperty('inert', false);
});

test('reading progress crosses the fusion boundary in both directions', async ({ page }) => {
  await page.goto('/blog/colophon/');
  await waitForBoot(page);
  await switchTo(page, 'win95');
  const desktop = await desktopFrame(page);

  const progress = 0.42;
  await page.evaluate(
    ({ key, value, event }) => {
      const state = {
        version: 1,
        documents: {
          colophon: {
            progress: value,
            anchor: '',
            lastOpened: 1,
            bookmarks: [],
            notes: [],
          },
        },
      };
      localStorage.setItem(key, JSON.stringify(state));
      window.dispatchEvent(new Event(event));
    },
    { key: SHARED_READING_KEY, value: progress, event: FUSION_EVENTS.readingState },
  );

  await expect
    .poll(
      () =>
        desktop.evaluate((key) => {
          const raw = localStorage.getItem(key);
          if (!raw) return null;
          const parsed = JSON.parse(raw) as {
            documents?: Record<string, { progress?: number }>;
          };
          return parsed.documents?.colophon?.progress ?? null;
        }, DESKTOP_READING_KEY),
      { timeout: 20_000 },
    )
    .toBeCloseTo(progress, 2);

  // The lane is bidirectional: a desktop notebook edit reaches the general key.
  const reverse = 0.37;
  await desktop.evaluate(
    ({ key, value }) => {
      const raw = localStorage.getItem(key);
      const state = raw
        ? (JSON.parse(raw) as { version: number; documents: Record<string, unknown> })
        : { version: 1, documents: {} };
      state.documents['reverse-probe'] = {
        progress: value,
        anchor: '',
        lastOpened: 1,
        bookmarks: [],
        notes: [],
      };
      localStorage.setItem(key, JSON.stringify(state));
      window.dispatchEvent(new Event('mhk10:reader-state'));
    },
    { key: DESKTOP_READING_KEY, value: reverse },
  );

  await expect
    .poll(
      () =>
        page.evaluate((key) => {
          const raw = localStorage.getItem(key);
          if (!raw) return null;
          const parsed = JSON.parse(raw) as {
            documents?: Record<string, { progress?: number }>;
          };
          return parsed.documents?.['reverse-probe']?.progress ?? null;
        }, SHARED_READING_KEY),
      { timeout: 20_000 },
    )
    .toBeCloseTo(reverse, 2);
});

test('an explicit deep link boots the desktop on the same article', async ({ page }) => {
  await page.goto('/blog/colophon/?view=win95');
  await waitForBoot(page);
  await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'win95');
  const desktop = await outerDesktopFrame(page);
  const articleFrame = () =>
    desktop.childFrames().find((frame) => /\/blog\/colophon\/?$/.test(frame.url()));
  await expect.poll(() => Boolean(articleFrame()), { timeout: 30_000 }).toBe(true);
  const article = articleFrame();
  if (!article) throw new Error('Desktop article window disappeared after the readiness poll.');
  await expect(article.locator('#microsoft-reader')).toHaveAttribute('data-reader-ready', '');
  await expect(page.locator('[data-classic-root]')).toHaveJSProperty('inert', true);
});

test('a general tag destination opens the filtered desktop library', async ({ page }) => {
  await page.goto('/blog/tag/设计/');
  await waitForBoot(page);
  await switchTo(page, 'win95');

  const desktop = await outerDesktopFrame(page);
  const tagged = () => desktop.childFrames().find((frame) => /\/blog\/tag\//.test(frame.url()));
  await expect.poll(() => Boolean(tagged()), { timeout: 30_000 }).toBe(true);
  const blog = tagged();
  if (!blog) throw new Error('Tagged desktop library disappeared after the readiness poll.');
  await expect(blog.locator('.reader-tag-filter')).toContainText('设计');
  await expect(blog.locator('.reader-tag-filter')).toContainText('Show all');
  await expect(blog.locator('[data-post]')).toHaveCount(2);

  await switchTo(page, 'classic');
  await expect(page).toHaveURL(/\/blog\/tag\/%E8%AE%BE%E8%AE%A1\/?$/);
});

test('classic pointer presses leave one short ink ring', async ({ page }) => {
  await page.goto('/blog/colophon/?view=classic');
  await waitForBoot(page);
  await expect(page.locator('html')).not.toHaveAttribute('data-display-mode', 'win95');
  await page.mouse.click(640, 500);
  await expect(page.locator('.ink-ripple')).toHaveCount(1);
  await expect(page.locator('.ink-ripple')).toHaveCount(0, { timeout: 2000 });
});

test.describe('mobile default', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test('phones keep the general site until the visitor asks for the desktop', async ({ page }) => {
    await page.goto('/');
    await waitForBoot(page);
    await expect(page.locator('html')).not.toHaveAttribute('data-display-mode', 'win95');
    await expect(page.locator('[data-desk-embed] iframe')).toHaveCount(0);
    await expect(page.locator('[data-classic-root]')).toHaveJSProperty('inert', false);
    // Phones get the quieter hint, never the desktop-sized offer.
    await expect(page.locator('.about-entry__offer')).toHaveCount(0);
    const hint = page.locator('.about-entry__hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('MHK10 像素桌面');
    await hint.getByRole('button', { name: '知道了' }).click();
    await expect(hint).toBeHidden();

    await page.locator('[data-mode-toggle]').click();
    const notice = page.getByRole('dialog', { name: '这个桌面原本是为鼠标设计的' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('640×360');
    await expect(page.locator('html')).not.toHaveAttribute('data-display-mode', 'win95');
    await expect(page.locator('[data-desk-embed] iframe')).toHaveCount(0);

    await notice.getByRole('button', { name: '留在通用版' }).click();
    await expect(notice).toBeHidden();
    await expect(page.locator('html')).not.toHaveAttribute('data-display-mode', 'win95');

    await page.locator('[data-mode-toggle]').click();
    await page.getByRole('button', { name: '仍要进入桌面' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'win95', {
      timeout: 30_000,
    });
    await expect(page.locator('[data-desk-embed] iframe')).toHaveCount(1);
  });
});
