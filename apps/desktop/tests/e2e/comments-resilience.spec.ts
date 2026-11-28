import { expect, test, type Page } from '@playwright/test';
import { GISCUS_CONFIG } from '@mhk/site-core/config/giscus';
import { bootDesktop, clickPixel } from './helpers';

const REPOSITORY_URL = `https://github.com/${GISCUS_CONFIG.repo}/discussions`;
const DISCUSSION_URL = `${REPOSITORY_URL}/42`;

type WidgetState = 'ready' | 'missing' | 'failed' | 'malformed' | 'long';

/** The third-party fixture emits its own protocol messages after real user input. */
function widgetHtml(state: WidgetState): string {
  const notice =
    state === 'missing'
      ? { error: 'Discussion not found' }
      : state === 'failed'
        ? { error: 'API rate limit exceeded' }
        : state === 'malformed'
          ? { resizeHeight: '240', discussion: { url: 'https://example.com/discussions/42' } }
          : { discussion: { url: DISCUSSION_URL }, resizeHeight: state === 'long' ? 9000 : 240 };
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body { margin: 8px; font: 14px sans-serif; } textarea { display: block; width: 90%; height: 48px; } button { margin: 4px 0; }</style>
    </head><body>
    <textarea aria-label="Comment"></textarea>
    ${
      state === 'long'
        ? '<div style="height: 8800px" aria-hidden="true"></div><button id="last">Last comment</button><output role="status"></output>'
        : '<button id="resize">Resize discussion</button><button id="created">Create discussion</button><button id="failed">Simulate rate limit</button>'
    }
    <script>
      const theme = document.createElement('link');
      theme.rel = 'stylesheet';
      document.head.append(theme);
      const applyTheme = (url) => { if (typeof url === 'string') theme.href = url; };
      applyTheme(new URL(location.href).searchParams.get('theme'));
      window.addEventListener('message', (event) => {
        if (event.source === parent) applyTheme(event.data?.giscus?.setConfig?.theme);
      });
      const send = (notice) => parent.postMessage({ giscus: notice }, '*');
      document.getElementById('resize')?.addEventListener('click', () => send({ resizeHeight: 320 }));
      document.getElementById('created')?.addEventListener('click', () => send({ discussion: { url: ${JSON.stringify(DISCUSSION_URL)} } }));
      document.getElementById('failed')?.addEventListener('click', () => send({ error: 'API rate limit exceeded' }));
      document.getElementById('last')?.addEventListener('click', () => {
        document.querySelector('output').textContent = 'Last comment reached';
      });
      send(${JSON.stringify(notice)});
      document.body.dataset.noticeSent = 'true';
    </script></body></html>`;
}

async function routeWidget(page: Page, states: WidgetState[] = ['ready']): Promise<string[]> {
  const requests: string[] = [];
  await page.route('https://giscus.app/**', async (route) => {
    const url = route.request().url();
    if (!url.includes('/widget?')) {
      await route.abort();
      return;
    }
    requests.push(url);
    const state = states[Math.min(requests.length - 1, states.length - 1)];
    await route.fulfill({
      contentType: 'text/html',
      headers: { 'Cache-Control': 'no-store' },
      body: widgetHtml(state),
    });
  });
  return requests;
}

async function openDiscussion(page: Page) {
  await bootDesktop(page, '/blog/colophon/');
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  const host = reader.locator('#reader-comments');
  await expect(host).toHaveAttribute('data-comments-bound', 'true');
  const opener = reader.locator('[data-comments-open="reader-comments"]');
  await opener.click();
  await expect(reader.locator('#reader-comments-dialog')).toBeVisible();
  return { reader, host, opener, widget: reader.frameLocator('iframe.comments-frame') };
}

test('Discussion loads on request and preserves a draft until reload is confirmed', async ({
  page,
}, info) => {
  const requests = await routeWidget(page);
  await bootDesktop(page, '/blog/colophon/');
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  const host = reader.locator('#reader-comments');
  await expect(host).toHaveAttribute('data-comments-bound', 'true');
  await expect(reader.locator('iframe.comments-frame')).toHaveCount(0);
  expect(requests).toHaveLength(0);

  const opener = reader.locator('[data-comments-open="reader-comments"]');
  const dialog = reader.locator('#reader-comments-dialog');
  await opener.click();
  await expect(host).toHaveAttribute('data-phase', 'ready');
  const comment = reader.frameLocator('iframe.comments-frame').getByRole('textbox', {
    name: 'Comment',
  });
  await comment.fill('A draft that has not been posted.');
  await reader.locator('[data-comments-close]').click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(comment).toHaveValue('A draft that has not been posted.');
  expect(requests).toHaveLength(1);

  const reload = reader.locator('[data-comments-reload]');
  const prompt = reader.locator('[data-comments-reload-prompt]');
  await reload.click();
  await expect(prompt).toBeVisible();
  expect(requests).toHaveLength(1);
  await info.attach('Discussion reload confirmation', {
    body: await page.screenshot({ path: info.outputPath('reload-confirmation.png') }),
    contentType: 'image/png',
  });
  await reader.locator('[data-comments-cancel-reload]').click();
  await expect(prompt).toBeHidden();
  await expect(reload).toBeFocused();
  await expect(comment).toHaveValue('A draft that has not been posted.');
  expect(requests).toHaveLength(1);

  await reload.press('Enter');
  await reader.locator('[data-comments-cancel-reload]').press('Escape');
  await expect(prompt).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(reload).toBeFocused();
  await expect(comment).toHaveValue('A draft that has not been posted.');
  await reload.press('Enter');
  await reader.locator('[data-comments-confirm-reload]').click();
  await expect.poll(() => requests.length).toBe(2);
  await expect(host).toHaveAttribute('data-phase', 'ready');
  await expect(comment).toHaveValue('');
  await expect(prompt).toBeHidden();
  await reader.locator('[data-comments-close]').press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('Malformed widget data stays loading and initial failures can retry without draft confirmation', async ({
  page,
}) => {
  const requests = await routeWidget(page, ['malformed', 'failed', 'ready']);
  const { reader, host, widget } = await openDiscussion(page);
  await expect(widget.locator('body')).toHaveAttribute('data-notice-sent', 'true');
  await expect(host).toHaveAttribute('data-phase', 'loading');
  const state = reader.locator('[data-comments-state]');
  await expect(state).toBeVisible();
  await expect(state).toHaveAttribute('role', 'status');
  await expect(state).toHaveAttribute('aria-live', 'polite');
  const github = reader.locator('[data-comments-github]');
  await expect(github).toBeVisible();
  await expect(github).toHaveAttribute('href', REPOSITORY_URL);
  await expect(host).toHaveAttribute('data-phase', 'slow');
  await expect(state).toContainText(/slow|waiting/i);
  await reader.locator('[data-comments-reload]').click();
  await expect(reader.locator('[data-comments-reload-prompt]')).toBeHidden();
  await expect.poll(() => requests.length).toBe(2);
  await expect(host).toHaveAttribute('data-phase', 'failed');
  await expect(host).toHaveAttribute('data-has-content', 'false');
  await expect(state).toContainText(/rate limit/i);
  await expect(github).toBeVisible();
  await reader.locator('[data-comments-retry]').click();
  await expect(reader.locator('[data-comments-reload-prompt]')).toBeHidden();
  await expect.poll(() => requests.length).toBe(3);
  await expect(host).toHaveAttribute('data-phase', 'ready');
  await expect(github).toHaveAttribute('href', DISCUSSION_URL);
});

for (const initialState of ['ready', 'missing'] as const) {
  test(`An API error after ${initialState} keeps the draft until reload is confirmed`, async ({
    page,
  }) => {
    const requests = await routeWidget(page, [initialState, 'ready']);
    const { reader, host, opener, widget } = await openDiscussion(page);
    await expect(host).toHaveAttribute('data-phase', initialState);
    const comment = widget.getByRole('textbox', { name: 'Comment' });
    await comment.fill('Keep this draft when GitHub fails.');
    await widget.getByRole('button', { name: 'Simulate rate limit' }).click();
    await expect(host).toHaveAttribute('data-phase', 'failed');
    await expect(host).toHaveAttribute('data-has-content', 'true');
    await expect(reader.locator('[data-comments-state]')).toContainText(/rate limit/i);
    await expect(comment).toBeVisible();
    await expect(comment).toHaveValue('Keep this draft when GitHub fails.');
    await reader.locator('[data-comments-close]').click();
    await opener.click();
    await expect(host).toHaveAttribute('data-phase', 'failed');
    await expect(comment).toBeVisible();
    await expect(comment).toHaveValue('Keep this draft when GitHub fails.');
    expect(requests).toHaveLength(1);

    const prompt = reader.locator('[data-comments-reload-prompt]');
    await reader.locator('[data-comments-retry]').click();
    await expect(prompt).toBeVisible();
    await reader.locator('[data-comments-cancel-reload]').click();
    await expect(prompt).toBeHidden();
    await expect(comment).toHaveValue('Keep this draft when GitHub fails.');
    expect(requests).toHaveLength(1);
    await reader.locator('[data-comments-reload]').click();
    await expect(prompt).toBeVisible();
    await reader.locator('[data-comments-confirm-reload]').click();
    await expect.poll(() => requests.length).toBe(2);
    await expect(host).toHaveAttribute('data-phase', 'ready');
    await expect(comment).toHaveValue('');
  });
}

test('Reader and desktop theme changes update the existing discussion without losing a draft', async ({
  page,
}, info) => {
  const requests = await routeWidget(page);
  const { reader, host, opener, widget } = await openDiscussion(page);
  await expect(host).toHaveAttribute('data-phase', 'ready');
  const comment = widget.getByRole('textbox', { name: 'Comment' });
  await comment.fill('Keep writing across theme changes.');
  await expect(widget.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await reader.locator('[data-comments-close]').click();
  await reader.locator('[data-hybrid-menubar] summary').filter({ hasText: 'View' }).click();
  await reader.locator('[data-hybrid-menubar] [data-reader-command="options"]').click();
  await reader
    .getByRole('combobox', { name: 'Theme', exact: true })
    .and(reader.locator('button'))
    .click();
  await reader.getByRole('option', { name: 'Night', exact: true }).click();
  await reader.locator('[data-reader-command="close-options"]').click();
  await opener.click();
  await expect(widget.locator('body')).toHaveCSS('background-color', 'rgb(0, 128, 128)');
  await expect(widget.locator('body')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(reader.locator('[data-comments-surface]')).toHaveCSS(
    'background-color',
    'rgb(0, 128, 128)',
  );
  await expect(comment).toHaveValue('Keep writing across theme changes.');
  expect(requests).toHaveLength(1);

  await reader.locator('[data-comments-close]').click();
  const canvas = page.locator('#screen');
  await canvas.press('Alt+F2');
  await expect(canvas).toHaveAttribute('aria-label', /Run/);
  await page.keyboard.type('display');
  await canvas.press('Enter');
  await expect(canvas).toHaveAttribute('aria-label', /Display Properties/);
  // Display's registered (140, 30) window has client origin (143, 52).
  await clickPixel(canvas, 318, 184);
  await clickPixel(canvas, 457, 272);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'phosphor');
  await canvas.press('Control+F4');
  await opener.click();
  await expect(widget.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(widget.locator('body')).toHaveCSS('color', 'rgb(0, 255, 0)');
  await expect(reader.locator('[data-comments-surface]')).toHaveCSS(
    'background-color',
    'rgb(0, 0, 0)',
  );
  await expect(comment).toHaveValue('Keep writing across theme changes.');
  expect(requests).toHaveLength(1);
  await info.attach('Existing draft after Night and Phosphor theme changes', {
    body: await page.screenshot({ path: info.outputPath('discussion-phosphor-draft.png') }),
    contentType: 'image/png',
  });
});

test('An empty discussion remains empty after resizing until discussion metadata arrives', async ({
  page,
}) => {
  const requests = await routeWidget(page, ['missing']);
  const { reader, host, widget } = await openDiscussion(page);
  await expect(host).toHaveAttribute('data-phase', 'missing');
  const comment = widget.getByRole('textbox', { name: 'Comment' });
  await comment.fill('The first comment draft.');
  await widget.getByRole('button', { name: 'Resize discussion' }).click();
  await expect(reader.locator('iframe.comments-frame')).toHaveCSS('height', '320px');
  await expect(host).toHaveAttribute('data-phase', 'missing');
  await expect(reader.locator('[data-comments-state]')).toContainText(/no comments yet/i);
  await expect(reader.locator('[data-comments-github]')).toHaveAttribute('href', REPOSITORY_URL);
  await reader.locator('[data-comments-reload]').click();
  await expect(reader.locator('[data-comments-reload-prompt]')).toBeVisible();
  await reader.locator('[data-comments-cancel-reload]').click();
  await expect(comment).toHaveValue('The first comment draft.');
  expect(requests).toHaveLength(1);
  await widget.getByRole('button', { name: 'Create discussion' }).click();
  await expect(host).toHaveAttribute('data-phase', 'ready');
  await expect(reader.locator('[data-comments-github]')).toHaveAttribute('href', DISCUSSION_URL);
});

test('Long discussions keep their last control reachable beyond the frame height limit', async ({
  page,
}) => {
  await routeWidget(page, ['long']);
  const { reader, host, widget } = await openDiscussion(page);
  await expect(host).toHaveAttribute('data-phase', 'ready');
  const frame = reader.locator('iframe.comments-frame');
  await expect(frame).toHaveAttribute('scrolling', 'auto');
  await expect(frame).toHaveCSS('height', '4000px');
  const comment = widget.getByRole('textbox', { name: 'Comment' });
  await comment.click();
  await comment.press('Tab');
  const last = widget.getByRole('button', { name: 'Last comment' });
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(widget.getByRole('status')).toHaveText('Last comment reached');
});

test('The 640 by 360 desktop keeps discussion content and Close inside the Reader client', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'chromium', 'Small desktop geometry scenario');
  await page.setViewportSize({ width: 640, height: 360 });
  await routeWidget(page);
  const { reader, host, opener, widget } = await openDiscussion(page);
  await expect(host).toHaveAttribute('data-phase', 'ready');
  const geometry = await reader.locator('#reader-comments-dialog').evaluate((dialog) => {
    const box = dialog.getBoundingClientRect();
    const close = dialog.querySelector('[data-comments-close]')!.getBoundingClientRect();
    const surface = dialog.querySelector('[data-comments-surface]')!.getBoundingClientRect();
    return {
      fits: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
      closeFits:
        close.left >= box.left &&
        close.top >= box.top &&
        close.right <= box.right &&
        close.bottom <= box.bottom,
      surfaceHeight: surface.height,
      noHorizontalScroll: dialog.scrollWidth <= dialog.clientWidth,
    };
  });
  expect(geometry.fits).toBe(true);
  expect(geometry.closeFits).toBe(true);
  expect(geometry.surfaceHeight).toBeGreaterThanOrEqual(64);
  expect(geometry.noHorizontalScroll).toBe(true);
  await widget.getByRole('textbox', { name: 'Comment' }).fill('Typing in a small desktop.');
  await info.attach('Discussion at 640 by 360', {
    body: await page.screenshot({ path: info.outputPath('discussion-640x360.png') }),
    contentType: 'image/png',
  });
  await reader.locator('[data-comments-close]').click();
  await expect(reader.locator('#reader-comments-dialog')).toBeHidden();
  await expect(opener).toBeFocused();
});
