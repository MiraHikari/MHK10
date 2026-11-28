import { expect, test } from '@playwright/test';
import { STORAGE_KEYS } from '../../apps/general/src/lib/storage/keys';
import { FUSION_DESKTOP_ORIGIN } from '../../scripts/verify-config.mjs';

interface BootEvidence {
  contentReadySignals: number;
  favicons: { kind: string | null; previous: string | null }[];
  inline: {
    instant: boolean;
    transition: string;
    animations: string[];
  } | null;
}

declare global {
  interface Window {
    bootEvidence: BootEvidence;
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const evidence: BootEvidence = { contentReadySignals: 0, favicons: [], inline: null };
    window.bootEvidence = evidence;
    window.addEventListener('portfolio:boot-ready', () => {
      evidence.contentReadySignals += 1;
    });
    window.addEventListener('portfolio:loader-ready', () => {
      const loader = document.getElementById('boot-loader');
      if (!loader) return;
      evidence.inline = {
        instant: loader.classList.contains('boot-loader--instant'),
        transition: getComputedStyle(loader).transitionDuration,
        animations: Array.from(
          loader.querySelectorAll('.boot-loader__brand line, .boot-loader__cursor'),
          (element) => getComputedStyle(element).animationName,
        ),
      };
    });
    new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target;
        if (!(target instanceof HTMLLinkElement) || !target.hasAttribute('data-site-favicon'))
          continue;
        evidence.favicons.push({
          kind: target.getAttribute('data-site-favicon'),
          previous: record.oldValue,
        });
      }
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ['href'],
      attributeOldValue: true,
    });
  });
});

test('a slow project deep link waits for its own first section before signalling readiness', async ({
  page,
}) => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/_astro/ProjectsSection.*.js', async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.goto('/projects/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('astro-island[component-url*="/App."]')).not.toHaveAttribute('ssr');
    // The normal minimum is 600 ms. Hold the chunk past that boundary while
    // staying inside the loader's independent 3-second safety deadline.
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => window.bootEvidence.contentReadySignals)).toBe(0);
    await expect(page.locator('#boot-loader')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('projects-waiting.png') });
    release();
    await expect(page.getByRole('heading', { name: '精选项目' })).toBeVisible();
    await expect(page.locator('#boot-loader')).toBeHidden();
    await page.screenshot({ path: test.info().outputPath('projects-ready.png') });
  } finally {
    release();
  }
});

test('saved reduced motion reaches the inline loader before the application bundle', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript((key) => localStorage.setItem(key, 'reduced'), STORAGE_KEYS.motionLevel);
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/_astro/App.*.js', async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.goto('/projects/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveClass(/motion-suppressed/);
    await expect.poll(() => page.evaluate(() => window.bootEvidence.inline)).not.toBeNull();
    const inline = await page.evaluate(() => window.bootEvidence.inline);
    expect(inline?.instant).toBe(true);
    expect(inline?.transition).toBe('0s');
    expect(inline?.animations.every((animation) => animation === 'none')).toBe(true);
    await expect(page.locator('#boot-loader')).toBeHidden();
  } finally {
    release();
  }
});

test('an explicit full-motion choice keeps the boot performance on a reduced-motion system', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((key) => localStorage.setItem(key, 'full'), STORAGE_KEYS.motionLevel);
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/_astro/App.*.js', async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.goto('/projects/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveClass(/motion-forced/);
    await expect(page.locator('#boot-loader')).not.toHaveClass(/boot-loader--instant/);
    expect(
      await page
        .locator('.boot-loader__brand line')
        .first()
        .evaluate((line) => getComputedStyle(line).animationName),
    ).toBe('loader-assemble');
    await expect(page.locator('#boot-loader')).toBeVisible();
  } finally {
    release();
  }
});

test('hydration preserves the prepainted desktop favicon until an explicit return', async ({
  page,
}) => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${FUSION_DESKTOP_ORIGIN}/**`, async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.goto('/?view=win95', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('astro-island[component-url*="/App."]')).not.toHaveAttribute('ssr');
    await expect(page.locator('link[data-site-favicon="icon"]')).toHaveAttribute(
      'href',
      '/favicon-pixel-32.png?v=win95',
    );
    const changes = await page.evaluate(() => window.bootEvidence.favicons);
    for (const kind of ['icon', 'apple']) {
      const previous = changes
        .filter((change) => change.kind === kind)
        .map((change) => change.previous);
      expect(previous.length).toBeGreaterThan(0);
      // The first write changes SSR classic to the selected desktop target.
      // Every later write must preserve it throughout hydration and startup.
      expect(previous.slice(1).every((href) => href?.includes('?v=win95'))).toBe(true);
    }
    release();
    await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'win95');
    await expect(page.locator('#boot-loader')).toBeHidden();
    await page.locator('[data-mode-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'classic');
    await expect(page.locator('link[data-site-favicon="icon"]')).toHaveAttribute(
      'href',
      '/favicon.webp?v=classic',
    );
  } finally {
    release();
  }
});

test('a selected desktop landing is static and can be cancelled before the desktop responds', async ({
  page,
}) => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${FUSION_DESKTOP_ORIGIN}/**`, async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.goto('/?view=win95', { waitUntil: 'domcontentloaded' });
    const waiting = page.locator('.presentation-handoff');
    await expect(waiting).toBeVisible();
    await expect(waiting).toContainText('正在连接 MHK10');
    await expect(page.locator('html')).toHaveAttribute('data-desktop-landing', '');
    await expect(page.locator('[data-classic-root]')).toHaveCSS('opacity', '0');
    await expect(page.locator('#boot-loader [data-loader-percentage]')).toHaveCount(0);
    await expect(page.locator('[data-entry-prism]')).toHaveCount(0);
    await waiting.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'classic');
    await expect(page.locator('html')).not.toHaveAttribute('data-desktop-landing', '');
    await expect(page.locator('#boot-loader')).toBeHidden();
    await expect(page.locator('[data-classic-root]')).toHaveCSS('opacity', '1');
    await expect(page.locator('[data-mode-toggle]')).toBeFocused();
    expect(await page.evaluate(() => window.bootEvidence.contentReadySignals)).toBe(1);
  } finally {
    release();
  }
});
