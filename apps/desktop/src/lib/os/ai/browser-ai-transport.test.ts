import { createServer, type Server, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createBrowserAiTransport } from './browser-ai-transport';
import { DEFAULT_AI_CONFIG, type AiRequest } from './ai-connection';
const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  vi.restoreAllMocks();
});
interface Received {
  path: string;
  authorization?: string;
  cookie?: string;
  body: Record<string, unknown>;
}
async function service(respond: (response: ServerResponse, request: Received) => void) {
  const received: Received[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const value = {
        path: request.url ?? '',
        authorization: request.headers.authorization,
        cookie: request.headers.cookie,
        body: JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>,
      };
      received.push(value);
      respond(response, value);
    });
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test address');
  const request: AiRequest = {
    config: {
      ...DEFAULT_AI_CONFIG,
      endpoint: `http://127.0.0.1:${address.port}/v1`,
      model: 'custom/model:latest',
      enabled: true,
    },
    apiKey: 'test-key',
    messages: [
      { role: 'system', content: 'Public context' },
      { role: 'user', content: 'Hello' },
    ],
    signal: new AbortController().signal,
  };
  return { received, request };
}
const chunk = (content: string, finish: string | null = null) =>
  `data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'custom/model:latest', choices: [{ index: 0, delta: { content }, finish_reason: finish }] })}\n\n`;
describe('AI SDK browser transport against a controlled HTTP service', () => {
  it('uses the configured base URL, custom model and Bearer header while streaming text', async () => {
    const c = await service((response) => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write(chunk('Hello '));
      setTimeout(() => {
        response.write(chunk('from the custom model.', 'stop'));
        response.end('data: [DONE]\n\n');
      }, 15);
    });
    const transport = createBrowserAiTransport();
    const values: string[] = [];
    expect(await transport.request({ ...c.request, onText: (text) => values.push(text) })).toBe(
      'Hello from the custom model.',
    );
    expect(values).toEqual(['Hello ', 'Hello from the custom model.']);
    expect(c.received[0]).toMatchObject({
      path: '/v1/chat/completions',
      authorization: 'Bearer test-key',
      body: {
        model: 'custom/model:latest',
        stream: true,
        messages: c.request.messages,
        max_tokens: 600,
      },
    });
    expect(c.received[0].cookie).toBeUndefined();
    expect(JSON.stringify(c.received[0].body)).not.toContain('test-key');
    transport.dispose();
  });
  it('aborts the HTTP stream when cancelled and refuses requests after disposal', async () => {
    const c = await service((response) => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write(chunk('Partial response'));
    });
    const controller = new AbortController(),
      transport = createBrowserAiTransport();
    await expect(
      transport.request({
        ...c.request,
        signal: controller.signal,
        onText: () => controller.abort(),
      }),
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(controller.signal.aborted).toBe(true);
    transport.dispose();
    await expect(transport.request(c.request)).rejects.toMatchObject({ code: 'cancelled' });
  });
  it.each([401, 429, 503])(
    'sanitizes HTTP %s without exposing provider bodies or credentials',
    async (status) => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const c = await service((response) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            error: { message: 'test-key PRIVATE PROVIDER BODY', type: 'api_error' },
          }),
        );
      });
      const transport = createBrowserAiTransport();
      let message = '';
      try {
        await transport.request(c.request);
      } catch (error) {
        message = error instanceof Error ? error.message : '';
      }
      expect(c.received).toHaveLength(1);
      expect(message).toContain(
        status === 401 ? 'Authentication failed' : status === 429 ? 'rate limit' : 'HTTP 503',
      );
      expect(message).not.toContain('test-key');
      expect(message).not.toContain('PRIVATE');
      expect(errors).not.toHaveBeenCalled();
      transport.dispose();
    },
  );
  it('rejects an empty streaming response', async () => {
    const c = await service((response) => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end('data: [DONE]\n\n');
    });
    const transport = createBrowserAiTransport();
    await expect(transport.request(c.request)).rejects.toMatchObject({ code: 'response' });
    transport.dispose();
  });
  it('retains legacy full-URL relay responses without adding a chat-completions path', async () => {
    const c = await service((response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ reply: 'Legacy text.' }));
    });
    const transport = createBrowserAiTransport();
    expect(
      await transport.request({
        ...c.request,
        config: { ...c.request.config, transport: 'relay' },
        apiKey: '',
      }),
    ).toBe('Legacy text.');
    expect(c.received[0]).toMatchObject({ path: '/v1', body: { stream: false } });
    expect(c.received[0].authorization).toBeUndefined();
    transport.dispose();
  });
  it('classifies malformed legacy JSON as a response failure without showing its contents', async () => {
    const c = await service((response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('PRIVATE malformed test-key');
    });
    const transport = createBrowserAiTransport();
    await expect(
      transport.request({ ...c.request, config: { ...c.request.config, transport: 'relay' } }),
    ).rejects.toMatchObject({
      code: 'response',
      message: 'The service returned an invalid text response.',
    });
    transport.dispose();
  });
  it('rejects whitespace-only legacy replies', async () => {
    const c = await service((response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: '   ' } }] }));
    });
    const transport = createBrowserAiTransport();
    await expect(
      transport.request({ ...c.request, config: { ...c.request.config, transport: 'relay' } }),
    ).rejects.toMatchObject({ code: 'response', message: 'The service returned no text reply.' });
    transport.dispose();
  });
  it('provides a browser CORS hint for network failures', async () => {
    const transport = createBrowserAiTransport(
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('PRIVATE failed fetch test-key')),
    );
    await expect(
      transport.request({
        config: { ...DEFAULT_AI_CONFIG, transport: 'relay', endpoint: 'https://service.example' },
        apiKey: 'test-key',
        messages: [{ role: 'user', content: 'Connection test.' }],
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: 'connection',
      message: 'Connection failed. Check the service URL and browser CORS permission.',
    });
    transport.dispose();
  });
});
