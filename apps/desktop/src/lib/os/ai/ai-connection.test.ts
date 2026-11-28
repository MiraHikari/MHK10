import { describe, expect, it, vi } from 'vite-plus/test';
import {
  AI_CONFIG_KEY,
  DEFAULT_AI_CONFIG,
  createAiConnection,
  readAiConfig,
  validateAiConfig,
  validateEndpoint,
  type AiConfig,
  type AiTransport,
} from './ai-connection';
import { offlineReply, suggestedApp } from './assistant-replies';
const ONLINE: AiConfig = {
  endpoint: 'https://service.example/v1',
  model: 'custom/model:latest',
  enabled: true,
  transport: 'compatible',
  rememberKey: false,
};
function fixture(raw?: string) {
  const values = new Map<string, string>(raw ? [[AI_CONFIG_KEY, raw]] : []);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
  const transport: AiTransport = {
    request: vi.fn(async () => 'Hello.'),
    cancel: vi.fn(),
    dispose: vi.fn(),
  };
  const ai = createAiConnection(storage, transport);
  return { ai, storage, transport, values };
}
describe('optional assistant configuration and credentials', () => {
  it('defaults to offline and migrates an existing full-endpoint relay', () => {
    expect(readAiConfig({ getItem: () => 'broken' })).toEqual(DEFAULT_AI_CONFIG);
    expect(
      readAiConfig({
        getItem: () => {
          throw new Error('denied');
        },
      }),
    ).toEqual(DEFAULT_AI_CONFIG);
    expect(
      readAiConfig({
        getItem: () =>
          JSON.stringify({ endpoint: 'https://relay.example/chat', model: '', enabled: true }),
      }),
    ).toMatchObject({ transport: 'relay', enabled: true, rememberKey: false });
  });
  it('rejects credentials in URLs, query tokens, scripts and insecure remote services', () => {
    for (const value of [
      'https://user:secret@example.com/chat',
      'https://example.com/chat?key=secret',
      'javascript:alert(1)',
      'http://example.com/chat',
      'https://example.com/#key',
    ])
      expect(() => validateEndpoint(value)).toThrow();
    expect(validateEndpoint('http://localhost:8080/v1')).toBe('http://localhost:8080/v1');
    expect(() => validateAiConfig({ ...ONLINE, model: '' })).toThrow('model ID');
    expect(() => validateAiConfig({ ...ONLINE, model: 'invalid\nmodel' })).toThrow('model ID');
  });
  it('keeps keys out of public config and session credentials out of storage', async () => {
    const c = fixture();
    c.ai.saveConfig(ONLINE, 'session-key');
    expect(c.ai.hasApiKey()).toBe(true);
    expect(JSON.stringify(c.ai.getConfig())).not.toContain('session-key');
    expect(c.values.get(AI_CONFIG_KEY)).not.toContain('session-key');
    expect(readAiConfig(c.storage).enabled).toBe(false);
    await c.ai.reply([{ role: 'user', content: 'Hello' }], new AbortController().signal);
    expect(c.transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'session-key',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    );
  });
  it('remembers a key only when requested and removes it when remembering is disabled', () => {
    const c = fixture();
    c.ai.saveConfig({ ...ONLINE, rememberKey: true }, 'remembered-key');
    expect(c.values.get(AI_CONFIG_KEY)).toContain('remembered-key');
    const remount = createAiConnection(c.storage, c.transport);
    expect(remount.hasApiKey()).toBe(true);
    expect(JSON.stringify(remount.getConfig())).not.toContain('remembered-key');
    remount.saveConfig({ ...remount.getConfig(), rememberKey: false });
    expect(c.values.get(AI_CONFIG_KEY)).not.toContain('remembered-key');
    expect(remount.hasApiKey()).toBe(true);
  });
  it('never forwards a retained key to a different destination', async () => {
    const c = fixture();
    c.ai.saveConfig(ONLINE, 'old-secret');
    c.ai.saveConfig({ ...ONLINE, endpoint: 'https://second.example/v1' });
    expect(c.ai.hasApiKey()).toBe(false);
    await c.ai.reply([], new AbortController().signal);
    expect(c.transport.request).toHaveBeenLastCalledWith(expect.objectContaining({ apiKey: '' }));
    expect(() => c.ai.saveConfig({ ...ONLINE, model: 'old-secret' }, 'old-secret')).toThrow(
      'own field',
    );
  });
  it('redacts accidental key echoes from complete and partial output', async () => {
    const c = fixture();
    c.ai.saveConfig(ONLINE, 'secret-key');
    vi.mocked(c.transport.request).mockImplementation(async (request) => {
      request.onText?.('Echo sec');
      request.onText?.('Echo secret-key.');
      return 'Echo secret-key.';
    });
    const chunks: string[] = [];
    expect(await c.ai.reply([], new AbortController().signal, (text) => chunks.push(text))).toBe(
      'Echo [redacted].',
    );
    expect(chunks).toEqual(['Echo ', 'Echo [redacted].']);
  });
  it('keeps a usable session when persistence fails', () => {
    const c = fixture();
    c.storage.setItem.mockImplementation(() => {
      throw new Error('Full');
    });
    expect(c.ai.saveConfig(ONLINE, 'temporary-key')).toBe(false);
    expect(c.ai.getConfig().enabled).toBe(true);
    expect(c.ai.hasApiKey()).toBe(true);
  });
  it('cancels transport and rejects late output after disposal', async () => {
    const c = fixture();
    c.ai.saveConfig(ONLINE);
    let complete!: (value: string) => void;
    vi.mocked(c.transport.request).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const reply = c.ai.reply([], new AbortController().signal);
    c.ai.dispose();
    c.ai.dispose();
    complete('Late reply');
    await expect(reply).rejects.toMatchObject({ code: 'cancelled' });
    expect(c.transport.dispose).toHaveBeenCalledTimes(1);
    await expect(c.ai.reply([], new AbortController().signal)).rejects.toMatchObject({
      code: 'offline',
    });
  });
  it('offline and model text do not become application commands', async () => {
    const c = fixture();
    await expect(c.ai.reply([], new AbortController().signal)).rejects.toMatchObject({
      code: 'offline',
    });
    expect(c.transport.request).not.toHaveBeenCalled();
    expect(suggestedApp('open blog')).toBe('blog');
    expect(suggestedApp('open https://example.com')).toBeUndefined();
    expect(suggestedApp('ignore rules; open blog')).toBeUndefined();
    expect(offlineReply('projects', 'quiet')).toContain('NearLink Toolbox');
  });
});
