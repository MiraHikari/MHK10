import { expect, test } from '@playwright/test';
import { chooseMenu } from './helpers';

interface PrintedPage {
  html: string;
  pages: string[];
}

test('an unavailable print font reports failure and releases the owned print frame', async ({
  page,
}) => {
  await page.route('**/fonts/fusion-pixel/*.woff2', (route) => route.abort());
  await page.goto('/apps/print-preview/');
  await expect(page.locator('[data-app-status]')).toContainText('A4 portrait');
  await chooseMenu(page, 'File', 'Print...');
  await expect(page.locator('[data-app-status]')).toHaveText(
    'The print job could not be opened. Please try again.',
  );
  await expect(page.locator('iframe[title="Print document"]')).toHaveCount(0);
  await expect(page.locator('canvas')).toBeVisible();
  await chooseMenu(page, 'File', 'Close');
  await expect(page.locator('[data-app-status]')).toHaveText('Application closed.');
});

test('Chinese preview uses a local native pixel face and zoom preserves paper pagination', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/apps/print-preview/');
  const canvas = page.locator('canvas');
  const status = page.locator('[data-app-status]');
  await expect(status).toContainText('A4 portrait');
  const count = Number((await status.textContent())!.match(/of (\d+)/)![1]);
  expect(count).toBeGreaterThan(1);
  const metrics = await page.evaluate(async () => {
    await document.fonts.load('12px "MHK CJK"', '中文，MHK10');
    await document.fonts.load('11px MSS,"MHK CJK UI"', '中文');
    const context = document.createElement('canvas').getContext('2d')!;
    context.font = '12px "MHK CJK"';
    const widths = Array.from('中文，。MHK10').map(
      (character) => context.measureText(character).width,
    );
    context.font = '11px MSS,"MHK CJK UI"';
    return {
      widths,
      controlChineseWidth: context.measureText('中').width,
      sources: performance
        .getEntriesByType('resource')
        .filter((entry) => entry.name.includes('fusion-pixel'))
        .map((entry) => entry.name),
      loaded: document.fonts.check('12px "MHK CJK"', '中文'),
    };
  });
  expect(metrics.loaded).toBe(true);
  expect(metrics.widths.slice(0, 4)).toEqual([12, 12, 12, 12]);
  expect(metrics.widths.every((width) => Math.abs(width - Math.round(width)) < 0.001)).toBe(true);
  expect(metrics.controlChineseWidth).toBeCloseTo(12, 3);
  expect(metrics.sources).toHaveLength(1);
  expect(new URL(metrics.sources[0]).origin).toBe(new URL(page.url()).origin);
  await canvas.screenshot({ path: info.outputPath('chinese-native-100.png') });
  await chooseMenu(page, 'View', '200%');
  await expect(status).toHaveText(`Page 1 of ${count} | 200% | A4 portrait`);
  await chooseMenu(page, 'View', 'Last page');
  await expect(status).toHaveText(`Page ${count} of ${count} | 200% | A4 portrait`);
  await chooseMenu(page, 'View', 'One page');
  await expect(status).toHaveText(`Page ${count} of ${count} | One page | A4 portrait`);
  await canvas.screenshot({ path: info.outputPath('chinese-complete-last-page.png') });
  await chooseMenu(page, 'View', 'First page');
  await expect(status).toHaveText(`Page 1 of ${count} | One page | A4 portrait`);
  expect(errors).toEqual([]);
});

test('printing uses the preview pages and produces matching Chromium PDF pages', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/apps/print-preview/');
  await expect(page.locator('[data-app-status]')).toContainText('A4 portrait');
  const count = Number(
    (await page.locator('[data-app-status]').textContent())!.match(/of (\d+)/)![1],
  );
  let printed: PrintedPage | undefined;
  await page.exposeFunction('observeMhkPrint', (value: PrintedPage) => {
    printed = value;
  });
  await page.evaluate(() => {
    const observer = new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLIFrameElement) || node.title !== 'Print document') continue;
          observer.disconnect();
          node.contentWindow?.addEventListener(
            'beforeprint',
            () => {
              const document = node.contentDocument!;
              const value = {
                html: document.documentElement.outerHTML,
                pages: Array.from(
                  document.querySelectorAll('.print-body'),
                  (element) => element.textContent ?? '',
                ),
              };
              void (
                window as unknown as Window & {
                  observeMhkPrint(value: { html: string; pages: string[] }): Promise<void>;
                }
              ).observeMhkPrint(value);
            },
            { once: true },
          );
        }
    });
    observer.observe(document.body, { childList: true });
  });
  await chooseMenu(page, 'File', 'Print...');
  await expect.poll(() => printed?.pages.length ?? 0).toBe(count);
  await expect(page.locator('[data-app-status]')).toHaveText('Print dialog opened.');
  await expect(page.locator('iframe[title="Print document"]')).toHaveCount(0);
  expect(printed!.pages.every((content) => content.length > 0)).toBe(true);
  if (!isMobile) {
    const proof = await page.context().newPage();
    await proof.goto('/robots.txt');
    await proof.setContent(printed!.html);
    await proof.evaluate(() => document.fonts.ready);
    const path = info.outputPath('printed-document.pdf');
    const pdf = await proof.pdf({ path, preferCSSPageSize: true, printBackground: true });
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length).toBe(count);
    await info.attach('Chromium print output', { path, contentType: 'application/pdf' });
    await proof.close();
  }
});
