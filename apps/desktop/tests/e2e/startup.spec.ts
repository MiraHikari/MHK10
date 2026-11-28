import { expect, test, type Page } from '@playwright/test';
import { bootDesktop, clickPixel } from './helpers';

async function observeStartup(page: Page) {
  await page.addInitScript(() => {
    const phases: string[] = [];
    Reflect.set(window, '__e2eStartupPhases', phases);
    const observer = new MutationObserver(() => {
      const phase = document.querySelector<HTMLCanvasElement>('#screen')?.dataset.startupPhase;
      if (phase && phases.at(-1) !== phase) phases.push(phase);
    });
    observer.observe(document, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-startup-phase'],
    });
  });
  return () => page.evaluate(() => Reflect.get(window, '__e2eStartupPhases') as string[]);
}

test('first visit plays startup, returning sessions skip it and completed Welcome does not reopen', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const phases = await observeStartup(page);
  await page.goto('/');
  const canvas = page.locator('#screen');
  const home = page.locator('iframe[data-html-window="home"]');
  await expect(canvas).toHaveAttribute('aria-busy', 'false');
  await expect(canvas).toHaveAttribute('data-startup-mode', 'animation');
  await expect(home).toBeVisible();
  expect(await phases()).toEqual(['boot', 'splash']);
  await canvas.focus();
  await page.keyboard.press('Control+F4');
  await expect(page.locator('iframe[data-html-window]')).toHaveCount(0);
  await clickPixel(canvas, 519, 270);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const settings = JSON.parse(localStorage.getItem('doom95.desktop.v1') ?? '{}') as {
          welcomeCompleted?: boolean;
        };
        return settings.welcomeCompleted === true;
      }),
    )
    .toBe(true);
  await info.attach('First visit completed Welcome', {
    body: await canvas.screenshot(),
    contentType: 'image/png',
  });

  const returned = await bootDesktop(page);
  await expect(home).toBeVisible();
  await expect(returned).toHaveAttribute('data-startup-mode', 'ready');
  expect(await phases()).toEqual([]);
  await info.attach('Returning session goes straight to Home', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await returned.focus();
  await page.keyboard.press('Control+F4');
  await expect(home).toHaveCount(0);
  await expect(page.locator('iframe[data-html-window]')).toHaveCount(0);
});

test('Always starts a visited desktop at POST; the native button consumes a held Enter', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    localStorage.setItem(
      'doom95.desktop.v1',
      JSON.stringify({ startupAnimation: 'always', hasVisited: true, welcomeCompleted: true }),
    );
  });
  const phases = await observeStartup(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const canvas = page.locator('#screen');
  const skip = page.getByRole('button', { name: 'Skip startup' });
  await expect(skip).toBeVisible();
  await expect(canvas).toHaveAttribute('data-startup-phase', 'boot');
  await canvas.focus();
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await expect(canvas).toHaveAttribute('aria-busy', 'true');
  await page.keyboard.up('Enter');
  await expect(canvas).toHaveAttribute('aria-busy', 'false');
  await expect(skip).toBeHidden();
  expect(
    await page.evaluate(() => document.activeElement?.matches('#screen, [data-html-window]')),
  ).toBe(true);
  await expect(page.locator('iframe[data-html-window="home"]')).toBeVisible();
  expect(await phases()).toEqual(['boot']);
});

test('a held click or touch skip opens the direct destination without Home', async ({
  page,
  hasTouch,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const phases = await observeStartup(page);
  await page.goto('/blog/', { waitUntil: 'domcontentloaded' });
  const canvas = page.locator('#screen');
  const skip = page.getByRole('button', { name: 'Skip startup' });
  await expect(skip).toBeVisible();
  const reader = page.locator('iframe[data-html-window="blog"]');
  await expect(reader).toHaveJSProperty('inert', true);
  if (hasTouch) {
    expect((await skip.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await skip.tap();
  } else {
    const screen = await canvas.boundingBox();
    if (!screen) throw new Error('Desktop canvas was not visible');
    await page.mouse.move(screen.x + screen.width / 2, screen.y + screen.height / 2);
    await page.mouse.down();
    await expect(canvas).toHaveAttribute('aria-busy', 'true');
    await expect(reader).toHaveJSProperty('inert', true);
    await page.mouse.up();
  }
  await expect(canvas).toHaveAttribute('aria-busy', 'false');
  await expect(reader).toBeVisible();
  await expect(page.locator('iframe[data-html-window="home"]')).toHaveCount(0);
  expect(await phases()).toEqual(['boot']);
});

test('the Signal Editions print can be skipped straight to a direct article', async ({
  page,
  hasTouch,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/blog/privacy/', { waitUntil: 'domcontentloaded' });
  const canvas = page.locator('#screen');
  await expect(canvas).toHaveAttribute('data-startup-phase', 'splash');
  const skip = page.getByRole('button', { name: 'Skip startup' });
  if (hasTouch) {
    const screen = await canvas.boundingBox();
    const button = await skip.boundingBox();
    if (!screen || !button) throw new Error('Startup controls were not visible');
    expect(button.y).toBeGreaterThan(screen.y + screen.height);
    await skip.tap();
  } else await skip.click();
  await expect(canvas).toHaveAttribute('aria-busy', 'false');
  await expect(
    page
      .frameLocator('iframe[data-html-window="blog"]')
      .locator('#microsoft-reader[data-reader-ready]'),
  ).toBeVisible();
  await expect(page.locator('iframe[data-html-window="home"]')).toHaveCount(0);
});

for (const { name, animation, motion } of [
  { name: 'system reduced motion', animation: 'always', motion: 'reduce' },
  { name: 'explicit skip preference', animation: 'never', motion: 'no-preference' },
] as const) {
  test(`${name} shows the desktop without presenting a decorative phase`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion: motion });
    await page.addInitScript((startupAnimation) => {
      localStorage.setItem('doom95.desktop.v1', JSON.stringify({ startupAnimation }));
    }, animation);
    const phases = await observeStartup(page);
    await page.goto('/blog/');
    const canvas = page.locator('#screen');
    await expect(canvas).toHaveAttribute('data-startup-mode', 'ready');
    await expect(canvas).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByRole('button', { name: 'Skip startup' })).toBeHidden();
    await expect(page.locator('iframe[data-html-window="blog"]')).toBeVisible();
    await expect(page.locator('iframe[data-html-window="home"]')).toHaveCount(0);
    expect(await phases()).toEqual([]);
    if (motion === 'reduce') {
      await info.attach('Reduced motion: direct Reader', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }
  });
}

test('startup keeps keyboard focus on the desktop until a delayed Reader responds', async ({
  page,
}) => {
  await page.clock.install();
  let releaseResponse: (() => void) | undefined;
  const response = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route('**/blog/', async (route) => {
    if (route.request().headers().referer?.endsWith('/blog/')) await response;
    await route.continue();
  });
  await page.goto('/blog/', { waitUntil: 'domcontentloaded' });
  try {
    const canvas = page.locator('#screen');
    const reader = page.locator('iframe[data-html-window="blog"]');
    await expect(canvas).toHaveAttribute('aria-busy', 'false');
    await page.clock.runFor(1200);
    await expect(canvas).toBeFocused();
    expect(await reader.evaluate((frame: HTMLIFrameElement) => frame.contentDocument?.URL)).toBe(
      'about:blank',
    );
    releaseResponse?.();
    await expect(reader.contentFrame().getByRole('heading', { name: 'Library' })).toBeVisible();
    await page.clock.runFor(1200);
    await expect(reader).toBeFocused();
  } finally {
    releaseResponse?.();
  }
});
