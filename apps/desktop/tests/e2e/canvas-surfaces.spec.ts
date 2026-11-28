import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { build } from 'vite-plus';
import type { mountAppHost } from '../../src/lib/os/host/app-host';

declare global {
  interface Window {
    CanvasSurfaceTest: { mountAppHost: typeof mountAppHost };
    canvasSurfaceHosts: NonNullable<Awaited<ReturnType<typeof mountAppHost>>>[];
  }
}

let bundled: Promise<{ script: string; styles: string[] }> | undefined;
function hostBundle() {
  return (bundled ??= (async () => {
    const entry = 'virtual:canvas-surface-hosts';
    const path = fileURLToPath(
      new URL('../../src/lib/os/host/app-host.ts', import.meta.url),
    ).replaceAll('\\', '/');
    const fixture = fileURLToPath(
      new URL('./fixtures/canvas-surfaces-app.ts', import.meta.url),
    ).replaceAll('\\', '/');
    const built = await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [
        {
          name: 'canvas-surface-hosts',
          enforce: 'pre',
          resolveId(id, importer) {
            if (id === entry) return `\0${entry}`;
            if (
              id === '../../apps' &&
              importer?.replaceAll('\\', '/').endsWith('/os/host/app-host.ts')
            )
              return fixture;
          },
          load: (id) =>
            id === `\0${entry}`
              ? `export { mountAppHost } from ${JSON.stringify(path)};`
              : undefined,
        },
      ],
      build: {
        write: false,
        emptyOutDir: false,
        minify: false,
        lib: { entry, formats: ['iife'], name: 'CanvasSurfaceTest' },
        rolldownOptions: { input: entry },
      },
    });
    const result = Array.isArray(built) ? built[0] : built;
    if (!('output' in result)) throw new Error('Expected in-memory host bundle');
    const script = result.output.find((item) => item.type === 'chunk');
    if (!script) throw new Error('Missing host JavaScript');
    const styles = result.output.flatMap((item) =>
      item.type === 'asset' && item.fileName.endsWith('.css')
        ? [typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source)]
        : [],
    );
    return { script: script.code, styles };
  })());
}

async function fixture(page: Page) {
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/__canvas-surfaces', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/themes.css"><body></body>',
    }),
  );
  await page.goto('/__canvas-surfaces');
  const bundle = await hostBundle();
  for (const content of bundle.styles) await page.addStyleTag({ content });
  await page.addStyleTag({
    content:
      'body{display:flex;align-items:flex-start;gap:20px;margin:20px}.host{width:max-content;max-width:none}.host canvas{width:var(--canvas-width);height:auto;max-width:none;image-rendering:pixelated}.host [data-app-status]{white-space:pre;font:12px monospace;min-height:18px}.host [data-app-menu]{min-height:22px}',
  });
  await page.evaluate(() => {
    for (const id of ['notepad', 'calculator']) {
      const root = document.createElement('main');
      root.className = 'host';
      root.dataset.app = id;
      root.innerHTML =
        '<nav data-app-menu></nav><div class="canvas-stage"><canvas tabindex="0"></canvas></div><p data-app-status></p><dialog></dialog>';
      document.body.append(root);
    }
  });
  await page.addScriptTag({ content: bundle.script });
  await page.evaluate(async () => {
    window.canvasSurfaceHosts = [];
    for (const root of document.querySelectorAll<HTMLElement>('.host')) {
      const host = await window.CanvasSurfaceTest.mountAppHost(root);
      if (!host) throw new Error('Canvas host did not mount');
      window.canvasSurfaceHosts.push(host);
    }
  });
  await expect(page.locator('[data-app="calculator"] [data-app-status]')).toContainText('std');
}

async function clickAt(canvas: Locator, x: number, y: number) {
  const bounds = await canvas.boundingBox();
  const size = await canvas.evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width,
    height: canvas.height,
  }));
  await canvas.click({
    position: { x: (x * bounds!.width) / size.width, y: (y * bounds!.height) / size.height },
  });
}

async function menu(host: Locator, name: string) {
  await host.locator('summary').click();
  await host.getByRole('menuitem', { name, exact: true }).click();
}

test('two Canvas hosts share one JavaScript environment without sharing text focus, dragging, themes or effects', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await fixture(page);
  const first = page.locator('[data-app="notepad"]');
  const second = page.locator('[data-app="calculator"]');
  const firstCanvas = first.locator('canvas');
  const secondCanvas = second.locator('canvas');
  await clickAt(firstCanvas, 20, 40);
  await firstCanvas.pressSequentially('Alpha');
  await expect(first.locator('[data-app-status]')).toContainText('Alpha |');
  await clickAt(secondCanvas, 20, 40);
  await secondCanvas.pressSequentially('Beta');
  await expect(second.locator('[data-app-status]')).toContainText('Beta |');
  await clickAt(secondCanvas, 200, 100);
  await firstCanvas.focus();
  await firstCanvas.pressSequentially('Z');
  await expect(first.locator('[data-app-status]')).toContainText('AlphaZ |');
  await expect(second.locator('[data-app-status]')).toContainText('Beta |');

  const bounds = await firstCanvas.boundingBox();
  const scale =
    bounds!.width / (await firstCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.width));
  await page.mouse.move(bounds!.x + 82 * scale, bounds!.y + 70 * scale);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 230 * scale, bounds!.y + 70 * scale, { steps: 5 });
  await expect(first.locator('[data-app-status]')).toContainText('| 100 |');
  await expect(second.locator('[data-app-status]')).toContainText('| 50 |');
  await page.mouse.up();
  const unchanged = await secondCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await menu(first, 'Switch theme');
  await expect(first).toHaveAttribute('data-theme', 'phosphor');
  await expect(second).toHaveAttribute('data-theme', 'std');
  await menu(first, 'Toggle flash');
  expect(await secondCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(
    unchanged,
  );
  const heights = await Promise.all(
    [firstCanvas, secondCanvas].map((canvas) =>
      canvas.evaluate((canvas: HTMLCanvasElement) => canvas.height),
    ),
  );
  expect(heights[0]).not.toBe(heights[1]);
  for (const host of [first, second]) {
    const size = await host
      .locator('canvas')
      .evaluate((canvas: HTMLCanvasElement) => `${canvas.width}×${canvas.height}`);
    await expect(host.locator('[data-app-status]')).toContainText(size);
  }
  await menu(second, 'Toggle status');
  await expect(second.locator('[data-app-status]')).toBeHidden();
  await expect
    .poll(() => secondCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.height))
    .toBeGreaterThan(heights[1]);
  await menu(second, 'Toggle status');
  await expect(second.locator('[data-app-status]')).toBeVisible();
  await expect
    .poll(() => secondCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.height))
    .toBe(heights[1]);
  await page.screenshot({ path: info.outputPath('independent-canvas-hosts.png') });
  const beforeDisposal = await firstCanvas.evaluate((canvas: HTMLCanvasElement) =>
    canvas.toDataURL(),
  );
  await page.evaluate(() => window.canvasSurfaceHosts[0].dispose());
  expect(await firstCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(
    beforeDisposal,
  );
  await clickAt(secondCanvas, 100, 40);
  await secondCanvas.press('End');
  await secondCanvas.pressSequentially(' after disposal');
  await expect(second.locator('[data-app-status]')).toContainText('Beta after disposal |');
  await page.evaluate(() => window.canvasSurfaceHosts[1].dispose());
  expect(errors).toEqual([]);
});
