import { expect, test, type Frame, type Page } from '@playwright/test';
import { parseFusionMessage, type FusionMessage } from '@mhk/site-core/fusion/protocol-model';
import { FUSION_TIMING } from '@mhk/site-core/fusion/fusion-session';
import { FUSION_DESKTOP_ORIGIN, FUSION_GENERAL_ORIGIN } from '../../scripts/verify-config.mjs';
import { clickPixel } from '../../apps/desktop/tests/e2e/helpers';

const ARTICLE = '/blog/colophon/';
const FAILURE_BOUND_MS = FUSION_TIMING.connectionTimeoutMs + 5_000;
const NETWORK_DELAY_MS = 3_000;
const PRIVATE_TEXT = 'LOCAL DOCUMENT / PRODUCTION READINESS PRIVATE SENTINEL';

interface WireEvidence {
  receiver: 'general' | 'desktop';
  message: FusionMessage;
  raw: string;
  keys: string[];
}

declare global {
  interface Window {
    recordProductionFusionMessage(value: unknown): Promise<void>;
  }
}

test.use({ reducedMotion: 'reduce' });

function networkGate() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((release) => {
    resolve = release;
  });
  return { promise, resolve };
}

async function classicReady(page: Page) {
  await expect(page.locator('.fusion-mode-toggle')).toBeVisible();
  await expect(page.locator('#boot-loader')).toBeHidden();
  await expect(page.locator('[data-classic-root]')).toHaveJSProperty('inert', false);
  await expect(page.locator('.prose-mh')).toBeVisible();
  await expect(page.locator('.prose-mh')).toContainText('这个博客的第一篇文章');
}

async function outerDesktop(page: Page): Promise<Frame> {
  const current = () =>
    page
      .frames()
      .find(
        (frame) =>
          frame.parentFrame() === page.mainFrame() &&
          frame.url().startsWith(`${FUSION_DESKTOP_ORIGIN}/`),
      );
  await expect.poll(() => Boolean(current())).toBe(true);
  const frame = current();
  if (!frame) throw new Error('The desktop document disappeared after loading.');
  return frame;
}

async function desktopReady(page: Page): Promise<{ desktop: Frame; reader: Frame }> {
  await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'win95', {
    timeout: FAILURE_BOUND_MS,
  });
  await expect(page.locator('[data-desk-embed]')).toHaveAttribute('data-visible', 'true');
  const desktop = await outerDesktop(page);
  // The full-shell document keeps authored markup but owns no duplicate Reader session.
  await expect(desktop.locator('#microsoft-reader')).not.toHaveAttribute('data-reader-ready', '');
  const current = () =>
    desktop
      .childFrames()
      .find((frame) => frame.url().startsWith(`${FUSION_DESKTOP_ORIGIN}${ARTICLE}`));
  await expect.poll(() => Boolean(current()), { timeout: FAILURE_BOUND_MS }).toBe(true);
  const reader = current();
  if (!reader) throw new Error('The desktop Reader disappeared after loading.');
  await expect(reader.locator('#microsoft-reader')).toHaveAttribute('data-reader-ready', '');
  await expect(reader.locator('#reader-prose')).toContainText('这个博客的第一篇文章');
  await expect(page.locator('[data-desk-embed]')).toHaveAttribute('data-phase', 'ready');
  await expect(desktop.locator('html')).not.toHaveAttribute('data-presentation-suspended', '');
  await expect(page.locator('[data-classic-root]')).toHaveJSProperty('inert', true);
  await expect(page.locator('.presentation-handoff')).toHaveAttribute('data-open', 'false');
  return { desktop, reader };
}

async function observeWire(page: Page): Promise<WireEvidence[]> {
  const evidence: WireEvidence[] = [];
  await page.exposeBinding('recordProductionFusionMessage', (source, raw: unknown) => {
    const url = source.frame.url();
    const receiver = url.startsWith(`${FUSION_GENERAL_ORIGIN}/`)
      ? 'general'
      : url.startsWith(`${FUSION_DESKTOP_ORIGIN}/`)
        ? 'desktop'
        : null;
    const message = parseFusionMessage(raw);
    if (!receiver || !message) return;
    evidence.push({
      receiver,
      message,
      // Keep the original envelope, including unexpected fields, for privacy assertions.
      raw: JSON.stringify(raw),
      keys: Object.keys(raw as Record<string, unknown>),
    });
  });
  await page.addInitScript(
    ({ general, desktop }) => {
      window.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (event.origin !== general && event.origin !== desktop) return;
        void window.recordProductionFusionMessage(event.data);
      });
    },
    { general: FUSION_GENERAL_ORIGIN, desktop: FUSION_DESKTOP_ORIGIN },
  );
  return evidence;
}

for (const fault of ['blocked', '503'] as const) {
  test(`a ${fault} desktop falls back within the real handshake deadline and a fresh retry keeps the article`, async ({
    page,
  }, info) => {
    let unavailable = true;
    let documents = 0;
    let connectionStarted = 0;
    await page.route(`${FUSION_DESKTOP_ORIGIN}/**`, async (route) => {
      const request = route.request();
      if (
        request.resourceType() === 'document' &&
        request.frame().parentFrame() === page.mainFrame()
      ) {
        documents++;
        if (!connectionStarted) connectionStarted = Date.now();
      }
      if (!unavailable) {
        await route.continue();
      } else if (fault === 'blocked') {
        await route.abort('blockedbyclient');
      } else {
        await route.fulfill({
          status: 503,
          contentType: 'text/html',
          body: '<!doctype html><html><head><title>Service unavailable</title></head><body>Service unavailable</body></html>',
        });
      }
    });

    if (fault === '503') {
      // The initial desktop target also exercises release of the first-page boot mask.
      await page.goto(`${ARTICLE}?view=win95`, { waitUntil: 'domcontentloaded' });
    } else {
      await page.goto(ARTICLE);
      await classicReady(page);
      await page.locator('[data-mode-toggle]').click();
    }
    const retiredFrame = await page.locator('[data-desk-embed] iframe').elementHandle();
    await expect(page.getByRole('button', { name: '重试桌面', exact: true })).toBeVisible({
      timeout: FAILURE_BOUND_MS,
    });
    await expect(page.getByRole('button', { name: '继续阅读', exact: true })).toBeVisible();
    expect(connectionStarted).toBeGreaterThan(0);
    expect(Date.now() - connectionStarted).toBeLessThan(FAILURE_BOUND_MS);
    await expect(page.locator('.fusion-failure:not(.fusion-failure--reading)')).toContainText(
      '本次切换未完成，已返回通用版。',
    );
    await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'classic');
    await classicReady(page);
    await expect(page.locator('[data-desk-embed]')).toHaveAttribute('data-visible', 'false');
    await expect(page.locator('.presentation-handoff')).toHaveAttribute('data-open', 'false');
    expect(new URL(page.url()).pathname).toBe(ARTICLE);
    await page.screenshot({ path: info.outputPath(`desktop-${fault}-classic-fallback.png`) });

    unavailable = false;
    if (fault === '503') await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '重试桌面', exact: true }).click();
    if (fault === '503') {
      const notice = page.getByRole('dialog', { name: '这个桌面原本是为鼠标设计的' });
      await expect(notice).toBeVisible();
      await expect(page.locator('[data-desk-embed] iframe')).toHaveCount(0);
      expect(documents).toBe(1);
      await page.screenshot({ path: info.outputPath('failed-desktop-mobile-retry-consent.png') });
      await notice.getByRole('button', { name: '仍要进入桌面', exact: true }).click();
    }
    await desktopReady(page);
    expect(documents).toBeGreaterThanOrEqual(2);
    if (retiredFrame) {
      expect(await retiredFrame.evaluate((frame) => frame.isConnected)).toBe(false);
      await retiredFrame.dispose();
    }
    await expect(page.locator('.fusion-failure:not(.fusion-failure--reading)')).toBeHidden();
    expect(new URL(page.url()).pathname).toBe(ARTICLE);
    await page.screenshot({ path: info.outputPath(`desktop-${fault}-retry-ready.png`) });
    await page.locator('[data-mode-toggle]').click();
    await classicReady(page);
    expect(new URL(page.url()).pathname).toBe(ARTICLE);
  });
}

test('a slow profile image cannot fail an already usable desktop at the readiness deadline', async ({
  page,
}, info) => {
  const wire = await observeWire(page);
  const gate = networkGate();
  let held = 0;
  await page.route('**/profile/avatar.webp*', async (route) => {
    const request = route.request();
    if (
      request.resourceType() === 'image' &&
      request.frame().parentFrame()?.parentFrame() === page.mainFrame()
    ) {
      held++;
      await gate.promise;
    }
    await route.continue();
  });
  try {
    await page.goto('/about/');
    await expect(page.locator('#boot-loader')).toBeHidden();
    await expect(page.locator('[data-mode-toggle]')).toBeVisible();
    await expect(page.locator('[data-classic-root]')).toHaveJSProperty('inert', false);
    await page.locator('[data-mode-toggle]').click();
    await expect.poll(() => held).toBeGreaterThan(0);
    await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'win95');
    const desktop = await outerDesktop(page);
    const current = () =>
      desktop
        .childFrames()
        .find((frame) => frame.url().startsWith(`${FUSION_DESKTOP_ORIGIN}/about/`));
    await expect.poll(() => Boolean(current())).toBe(true);
    const profile = current();
    if (!profile) throw new Error('The desktop profile document disappeared.');
    await profile.waitForLoadState('domcontentloaded');
    await expect(profile.locator('[data-personal-properties]')).toHaveClass(/properties-ready/);
    const image = profile.locator('.identity-avatar-well img');
    // The profile avatar uses the browser's eager default rather than lazy loading.
    await expect(image).not.toHaveAttribute('loading', 'lazy');
    await expect(image).toHaveJSProperty('complete', false);
    await expect(profile.getByRole('heading', { name: 'MiraHikari', exact: true })).toBeVisible();
    await expect
      .poll(() =>
        wire.some((entry) => entry.receiver === 'general' && entry.message.type === 'ready'),
      )
      .toBe(true);
    // Hold the actual image past the guest deadline. The document and profile UI are
    // interactive, so this unrelated download must not undo a successful handoff.
    await page.waitForTimeout(FUSION_TIMING.readinessTimeoutMs + 1_000);
    await expect(image).toHaveJSProperty('complete', false);
    await expect(page.locator('[data-desk-embed]')).toHaveAttribute('data-visible', 'true');
    await expect(page.locator('.presentation-handoff')).toHaveAttribute('data-open', 'false');
    await expect(page.locator('.fusion-failure:not(.fusion-failure--reading)')).toBeHidden();
    await page.screenshot({ path: info.outputPath('desktop-interactive-with-slow-image.png') });
    gate.resolve();
    await expect(image).toHaveJSProperty('complete', true);
    await page.locator('[data-mode-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'classic');
    await expect(page.locator('[data-classic-root]')).toHaveJSProperty('inert', false);
    await expect(page.locator('#boot-loader')).toBeHidden();
    expect(new URL(page.url()).pathname).toBe('/about/');
  } finally {
    gate.resolve();
  }
});

for (const resource of ['document', 'script'] as const) {
  test(`a cold desktop ${resource} delayed for several seconds stays hidden until its real startup`, async ({
    page,
  }, info) => {
    const gate = networkGate();
    let held = 0;
    await page.route(`${FUSION_DESKTOP_ORIGIN}/**`, async (route) => {
      const request = route.request();
      if (
        request.resourceType() === resource &&
        request.frame().parentFrame() === page.mainFrame()
      ) {
        held++;
        await gate.promise;
      }
      await route.continue();
    });
    try {
      await page.goto(ARTICLE);
      await classicReady(page);
      await page.locator('[data-mode-toggle]').click();
      await expect.poll(() => held).toBeGreaterThan(0);
      await expect(page.locator('.presentation-handoff')).toHaveAttribute('data-open', 'true');
      await page.waitForTimeout(NETWORK_DELAY_MS);
      await expect(page.locator('[data-desk-embed]')).toHaveAttribute('data-visible', 'false');
      await expect(page.locator('[data-desk-embed]')).toHaveJSProperty('inert', true);
      await expect(page.locator('[data-desk-embed] iframe')).toHaveAttribute('tabindex', '-1');
      await expect(page.locator('[data-classic-root]')).toHaveJSProperty('inert', false);
      await page.locator('.prose-mh').click({ trial: true });
      await expect(page.locator('.fusion-failure:not(.fusion-failure--reading)')).toBeHidden();
      await page.screenshot({ path: info.outputPath(`desktop-slow-${resource}-waiting.png`) });
      gate.resolve();
      await desktopReady(page);
      await expect(page.locator('.fusion-failure:not(.fusion-failure--reading)')).toBeHidden();
      expect(new URL(page.url()).pathname).toBe(ARTICLE);
      await page.screenshot({ path: info.outputPath(`desktop-slow-${resource}-ready.png`) });
    } finally {
      gate.resolve();
    }
  });
}

test('cancelling before the desktop document arrives parks its late load and re-entry reuses the frame', async ({
  page,
}, info) => {
  const gate = networkGate();
  let documents = 0;
  await page.route(`${FUSION_DESKTOP_ORIGIN}/**`, async (route) => {
    const request = route.request();
    if (
      request.resourceType() === 'document' &&
      request.frame().parentFrame() === page.mainFrame()
    ) {
      documents++;
      await gate.promise;
    }
    await route.continue();
  });
  try {
    await page.goto(ARTICLE);
    await classicReady(page);
    await page.locator('[data-mode-toggle]').click();
    await expect.poll(() => documents).toBe(1);
    const retained = await page.locator('[data-desk-embed] iframe').elementHandle();
    if (!retained) throw new Error('The pending desktop iframe is missing.');
    await page
      .locator('.presentation-handoff')
      .getByRole('button', { name: '取消', exact: true })
      .click();
    await classicReady(page);
    await expect(page.locator('[data-mode-toggle]')).toBeFocused();
    await expect(page.locator('.presentation-handoff')).toHaveAttribute('data-open', 'false');
    gate.resolve();
    const desktop = await outerDesktop(page);
    await expect(desktop.locator('#screen')).toBeAttached();
    await expect(desktop.locator('html')).toHaveAttribute('data-presentation-suspended', '');
    await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'classic');
    await expect(page.locator('[data-desk-embed]')).toHaveAttribute('data-visible', 'false');
    await expect(page.locator('.fusion-failure:not(.fusion-failure--reading)')).toBeHidden();
    await page.screenshot({ path: info.outputPath('cancelled-desktop-late-load-parked.png') });
    await page.locator('[data-mode-toggle]').click();
    await desktopReady(page);
    expect(documents).toBe(1);
    expect(await retained.evaluate((frame) => frame.isConnected)).toBe(true);
    await retained.dispose();
    await page.screenshot({ path: info.outputPath('cancelled-desktop-reentry-ready.png') });
  } finally {
    gate.resolve();
  }
});

test('a warm return parks the desktop, retains Reader and keeps visitor files outside the fusion wire', async ({
  page,
}, info) => {
  const wire = await observeWire(page);
  await page.goto(ARTICLE);
  await classicReady(page);
  await page.locator('[data-mode-toggle]').click();
  const { desktop, reader } = await desktopReady(page);
  await expect
    .poll(() =>
      wire.some((entry) => entry.receiver === 'general' && entry.message.type === 'ready'),
    )
    .toBe(true);
  const initialSession = wire.find(
    (entry) => entry.receiver === 'general' && entry.message.type === 'ready',
  )!.message.session;
  const retainedReader = await reader.locator('#microsoft-reader').elementHandle();
  if (!retainedReader) throw new Error('The active Reader has no document node.');

  const canvas = desktop.locator('#screen');
  await canvas.focus();
  await canvas.press('Control+Escape');
  await canvas.press('r');
  await expect(canvas).toHaveAttribute('aria-label', /Run/);
  await page.keyboard.type('notepad');
  await canvas.press('Enter');
  await expect(canvas).toHaveAttribute('aria-label', /Notepad/);
  await clickPixel(canvas, 214, 112);
  await canvas.press('Control+a');
  await page.keyboard.type(PRIVATE_TEXT);
  await canvas.press('Control+s');
  await expect
    .poll(() => desktop.evaluate(() => localStorage.getItem('doom95.files.v1')))
    .toContain(PRIVATE_TEXT);
  await canvas.press('Control+F4');
  await expect(reader.locator('#microsoft-reader')).toBeVisible();
  await reader.locator('#reader-viewport').press('End');
  await expect(reader.locator('#reader-progress')).toHaveText('100%');
  const position = await reader.locator('#reader-viewport').evaluate((viewport) => ({
    top: viewport.scrollTop,
    left: viewport.scrollLeft,
  }));
  await page.locator('[data-mode-toggle]').click();
  await classicReady(page);
  await expect(desktop.locator('html')).toHaveAttribute('data-presentation-suspended', '');
  await expect(page.locator('[data-desk-embed]')).toHaveJSProperty('inert', true);
  expect(new URL(page.url()).pathname).toBe(ARTICLE);
  await page.screenshot({ path: info.outputPath('warm-desktop-suspended-classic.png') });
  const startupCount = () =>
    wire.filter((entry) => entry.receiver === 'general' && entry.message.type === 'startup').length;
  const coldStartups = startupCount();
  await page.locator('[data-mode-toggle]').click();
  const resumed = await desktopReady(page);
  expect(startupCount()).toBe(coldStartups);
  expect(resumed.desktop).toBe(desktop);
  expect(resumed.reader).toBe(reader);
  expect(await retainedReader.evaluate((element) => element.isConnected)).toBe(true);
  await retainedReader.dispose();
  await expect(reader.locator('#reader-progress')).toHaveText('100%');
  expect(
    await reader.locator('#reader-viewport').evaluate((viewport) => ({
      top: viewport.scrollTop,
      left: viewport.scrollLeft,
    })),
  ).toEqual(position);
  await expect
    .poll(() =>
      wire.some((entry) => entry.receiver === 'desktop' && entry.message.type === 'resume'),
    )
    .toBe(true);
  expect(new Set(wire.map((entry) => entry.message.session))).toEqual(new Set([initialSession]));
  expect(wire.map((entry) => entry.raw).join('\n')).not.toContain(PRIVATE_TEXT);
  for (const entry of wire)
    for (const key of ['story', 'files', 'logs', 'credentials', 'apiKey', 'assets'])
      expect(entry.keys).not.toContain(key);
  await page.screenshot({ path: info.outputPath('warm-desktop-same-reader-resumed.png') });
});

for (const hidden of [false, true]) {
  test(`a native iframe reload ${hidden ? 'while hidden stays classic' : 'while active rebuilds its handshake'} and preserves reading`, async ({
    page,
  }, info) => {
    const wire = await observeWire(page);
    await page.goto(ARTICLE);
    await classicReady(page);
    await page.locator('[data-mode-toggle]').click();
    const initial = await desktopReady(page);
    await initial.desktop.waitForLoadState('load');
    await initial.reader.locator('#reader-viewport').press('End');
    await expect(initial.reader.locator('#reader-progress')).toHaveText('100%');
    await expect
      .poll(() =>
        wire.some((entry) => entry.receiver === 'general' && entry.message.type === 'ready'),
      )
      .toBe(true);
    const firstSession = wire.find(
      (entry) => entry.receiver === 'general' && entry.message.type === 'ready',
    )!.message.session;
    if (hidden) {
      await page.locator('[data-mode-toggle]').click();
      await classicReady(page);
      await expect(initial.desktop.locator('html')).toHaveAttribute(
        'data-presentation-suspended',
        '',
      );
    }
    const request = page.waitForRequest(
      (candidate) =>
        candidate.resourceType() === 'document' &&
        candidate.frame().parentFrame() === page.mainFrame() &&
        candidate.url().startsWith(`${FUSION_DESKTOP_ORIGIN}/`),
    );
    // A native navigation replaces the document; the test never manufactures protocol replies.
    await initial.desktop.evaluate(() => location.reload());
    await request;
    if (hidden) {
      // A hidden replacement may load before its host listener exists. It
      // stays parked until explicit re-entry; no hidden handshake is required.
      await initial.desktop.waitForLoadState('load');
      await classicReady(page);
      await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'classic');
      await expect(initial.desktop.locator('html')).toHaveAttribute(
        'data-presentation-suspended',
        '',
      );
      await expect(page.locator('[data-desk-embed]')).toHaveAttribute('data-visible', 'false');
      await expect(page.locator('[data-desk-embed]')).toHaveJSProperty('inert', true);
      await expect(page.locator('.presentation-handoff')).toHaveAttribute('data-open', 'false');
      await page.screenshot({ path: info.outputPath('hidden-desktop-reload-stays-classic.png') });
      await page.locator('[data-mode-toggle]').click();
    }
    const fresh = await desktopReady(page);
    await expect
      .poll(() =>
        wire.some(
          (entry) =>
            entry.receiver === 'general' &&
            entry.message.type === 'ready' &&
            entry.message.session !== firstSession,
        ),
      )
      .toBe(true);
    await expect(fresh.reader.locator('#reader-progress')).toHaveText('100%');
    await expect(page.locator('.fusion-failure:not(.fusion-failure--reading)')).toBeHidden();
    expect(new URL(page.url()).pathname).toBe(ARTICLE);
    await page.screenshot({
      path: info.outputPath(`desktop-${hidden ? 'hidden' : 'active'}-reload-ready.png`),
    });
  });
}

test('denied Storage property access leaves the general article and explicit presentation switches usable', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    for (const name of ['localStorage', 'sessionStorage'])
      Object.defineProperty(window, name, {
        configurable: true,
        get() {
          throw new DOMException('Storage denied by the production fixture.', 'SecurityError');
        },
      });
  });
  await page.goto(ARTICLE);
  await classicReady(page);
  await expect(page.locator('[data-desk-embed] iframe')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('storage-denied-classic-article.png') });
  await page.locator('[data-mode-toggle]').click();
  const { desktop } = await desktopReady(page);
  await expect(page.locator('#boot-loader')).toBeHidden();
  await expect(page.locator('.fusion-failure:not(.fusion-failure--reading)')).toBeHidden();
  await page.locator('[data-mode-toggle]').click();
  await classicReady(page);
  await expect(desktop.locator('html')).toHaveAttribute('data-presentation-suspended', '');
  expect(new URL(page.url()).pathname).toBe(ARTICLE);
  await page.screenshot({ path: info.outputPath('storage-denied-returned-article.png') });
});
