import { createServer } from 'node:http';
import { once } from 'node:events';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { chooseMenu, clickPixel } from './helpers';

async function enter(page: Page, canvas: Locator, y: number, value: string) {
  await clickPixel(canvas, 160, y);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await canvas.press('Control+a');
  await page.keyboard.type(value, { delay: 8 });
}

test('custom-model AI requires consent, streams through the SDK and falls back on an authentication error', async ({
  page,
}, info) => {
  const requests: {
    path: string;
    model: unknown;
    stream: unknown;
    authorized: boolean;
    roles: unknown[];
    contents: unknown[];
  }[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let fail = false;
  const chunk = (content: string, finish: string | null = null) =>
    `data: ${JSON.stringify({ id: 'browser-fixture', object: 'chat.completion.chunk', created: 1, model: 'custom/model:latest', choices: [{ index: 0, delta: { content }, finish_reason: finish }] })}\n\n`;
  const server = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', request.headers.origin ?? '*');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method !== 'POST') {
      response.writeHead(405);
      response.end();
      return;
    }
    const chunks: Buffer[] = [];
    request.on('data', (value: Buffer) => chunks.push(value));
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString()) as {
        model?: unknown;
        stream?: unknown;
        messages: { role: unknown; content: unknown }[];
      };
      requests.push({
        path: request.url ?? '',
        model: body.model,
        stream: body.stream,
        authorized: request.headers.authorization === 'Bearer LOCAL_FIXTURE_KEY',
        roles: body.messages.map((message) => message.role),
        contents: body.messages.map((message) => message.content),
      });
      if (fail) {
        response.writeHead(401, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            error: { message: 'LOCAL_FIXTURE_KEY PRIVATE_RESPONSE', type: 'authentication_error' },
          }),
        );
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write(chunk('Fixture model: '));
      const timer = setTimeout(() => {
        timers.delete(timer);
        response.write(chunk('custom/model:latest. Connection verified.', 'stop'));
        response.end('data: [DONE]\n\n');
      }, 1800);
      timers.add(timer);
      response.on('close', () => {
        clearTimeout(timer);
        timers.delete(timer);
      });
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture service has no address');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('/apps/connection/');
    let canvas = page.locator('canvas');
    await expect(canvas).toHaveAttribute('width', '404');
    await clickPixel(canvas, 333, 16);
    await expect(page.locator('[data-app-status]')).toHaveText(
      'Enable this connection before testing.',
    );
    expect(requests).toHaveLength(0);
    await enter(page, canvas, 60, `http://127.0.0.1:${address.port}/v1`);
    await enter(page, canvas, 88, 'custom/model:latest');
    await enter(page, canvas, 115, 'LOCAL_FIXTURE_KEY');
    await canvas.screenshot({ path: info.outputPath('masked-key.png') });
    await clickPixel(canvas, 20, 142);
    await clickPixel(canvas, 260, 188);
    const dialog = page.getByRole('dialog', { name: 'Connect MHK10 Assistant' });
    await expect(dialog).toBeVisible();
    expect(requests).toHaveLength(0);
    await expect(dialog).toHaveCSS('background-color', 'rgb(192, 192, 192)');
    await expect(dialog).toContainText(`127.0.0.1:${address.port}`);
    await page.screenshot({ path: info.outputPath('connection-consent.png') });
    await dialog.getByRole('button', { name: 'Enable', exact: true }).click();
    await expect(page.locator('[data-app-status]')).toHaveText('Connection enabled.');
    await clickPixel(canvas, 333, 16);
    await expect(page.locator('[data-app-status]')).toHaveText('Testing connection...');
    await expect(page.locator('[data-app-status]')).toHaveText(
      'Connection verified. Model: custom/model:latest.',
    );
    await canvas.screenshot({ path: info.outputPath('verified-connection.png') });
    await page.goto('/apps/chat/');
    canvas = page.locator('canvas');
    await expect(canvas).toHaveAttribute('width', '394');
    const message = page.getByRole('textbox', { name: 'Message', exact: true });
    const local = page.getByRole('radio', { name: 'Desktop guide' });
    await expect(local).toBeChecked();
    await message.fill('项目 LOCAL_GUIDE_ONLY');
    await message.press('Enter');
    await expect(page.locator('[data-app-status]')).toHaveText('Desktop guide answered offline.');
    expect(requests).toHaveLength(1);
    await page.getByRole('radio', { name: /Online · 127\.0\.0\.1/ }).check();
    await message.fill('打开计算器');
    await message.press('Enter');
    await page
      .getByRole('dialog', { name: 'MHK10 Assistant' })
      .getByRole('button', { name: 'Cancel' })
      .click();
    expect(requests).toHaveLength(1);
    await message.fill('Verify my custom model connection.');
    await message.press('Enter');
    await expect(page.locator('[data-app-status]')).toHaveText('Online AI is responding...');
    await canvas.screenshot({ path: info.outputPath('streaming.png') });
    await expect(page.locator('[data-app-status]')).toHaveText('Reply received from online AI.');
    await canvas.screenshot({ path: info.outputPath('online-reply.png') });
    fail = true;
    await message.fill('Check the failed connection.');
    await message.press('Enter');
    await expect(page.locator('[data-app-status]')).toHaveText(
      'Authentication failed. Check the API key.',
    );
    await canvas.screenshot({ path: info.outputPath('offline-fallback.png') });
    fail = false;
    await chooseMenu(page, 'Edit', 'Retry online question');
    await expect(page.locator('[data-app-status]')).toHaveText('Reply received from online AI.');
    await canvas.screenshot({ path: info.outputPath('retry-reply.png') });
    await chooseMenu(page, 'File', 'Save transcript');
    await expect(page.locator('[data-app-status]')).toHaveText('Transcript saved in My Documents.');
    const files = await page.evaluate(() => localStorage.getItem('doom95.files.v1'));
    expect(files).toContain('Online AI');
    expect(files).toContain('Offline reply:');
    expect(files).not.toContain('LOCAL_FIXTURE_KEY');
    expect(files).not.toContain('PRIVATE_RESPONSE');
    expect(requests).toHaveLength(4);
    expect(requests[0]).toMatchObject({
      path: '/v1/chat/completions',
      model: 'custom/model:latest',
      stream: true,
      authorized: true,
      roles: ['system', 'user'],
    });
    // The connection diagnostic and local guide never enter online conversation history.
    expect(requests[1].roles).toEqual(['system', 'user']);
    expect(requests[2].roles).toEqual(['system', 'user', 'assistant', 'user']);
    expect(requests[3].roles).toEqual(['system', 'user', 'assistant', 'user']);
    expect(JSON.stringify(requests.map((entry) => entry.contents))).not.toContain(
      'LOCAL_GUIDE_ONLY',
    );
    await message.fill('Stop this response.');
    await message.press('Enter');
    await expect(page.locator('[data-app-status]')).toHaveText('Online AI is responding...');
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(page.locator('[data-app-status]')).toHaveText('Request cancelled.');
    await local.check();
    await message.fill('帮助');
    await message.press('Enter');
    await expect(page.locator('[data-app-status]')).toHaveText('Desktop guide answered offline.');
    expect(requests).toHaveLength(5);
    expect(errors).toEqual([]);
  } finally {
    timers.forEach((timer) => clearTimeout(timer));
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
