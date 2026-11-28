import { describe, expect, it, onTestFinished, vi } from 'vite-plus/test';
import {
  AI_CONFIG_KEY,
  AiReplyError,
  DEFAULT_AI_CONFIG,
  createAiConnection,
  type AiTransport,
} from '../../os/ai/ai-connection';
import { appTestFixture } from '../testing/app-test-fixture';
import type { AppServices } from '../../os/host/app-contracts';

async function fixture() {
  const values = new Map<string, string>();
  const transport = {
    request: vi.fn<AiTransport['request']>(),
    cancel: vi.fn<AiTransport['cancel']>(),
    dispose: vi.fn<AiTransport['dispose']>(),
  } satisfies AiTransport;
  const ai = createAiConnection(
    {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    },
    transport,
  );
  onTestFinished(() => ai.dispose());
  const { connectionApp } = await import('./connection.app');
  const msg = vi.fn<AppServices['msg']>();
  const c = appTestFixture(connectionApp, { ai, msg }, { x: 0, y: 0, w: 404, h: 218 });
  const fill = () => {
    c.fillAt(110, 58, 'https://custom.example/v1');
    c.fillAt(110, 86, 'custom-model');
    c.fillAt(110, 114, 'PRIVATE_KEY_SENTINEL');
  };
  const enable = () => {
    fill();
    c.click('Enable');
    msg.mock.calls.at(-1)![0].onBtn?.(0, c.env);
  };
  return { ...c, ai, transport, values, fill, enable, msg };
}

function deferredReply() {
  let resolve!: (reply: string) => void;
  const promise = new Promise<string>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
describe('Connection authorization and secret entry', () => {
  it('requires destination confirmation, masks entry and keeps keys session-only by default', async () => {
    const c = await fixture();
    c.fill();
    c.click('Enable');
    expect(c.ai.getConfig().enabled).toBe(false);
    expect(c.transport.request).not.toHaveBeenCalled();
    const prompt = c.msg.mock.calls.at(-1)![0];
    expect(prompt.lines).toContain('custom.example');
    expect(JSON.stringify(prompt)).not.toContain('PRIVATE_KEY_SENTINEL');
    expect(c.text.mock.calls.some(([text]) => String(text).includes('PRIVATE_KEY_SENTINEL'))).toBe(
      false,
    );
    prompt.onBtn?.(0, c.env);
    expect(c.ai.getConfig()).toMatchObject({
      enabled: true,
      model: 'custom-model',
      transport: 'compatible',
      rememberKey: false,
    });
    expect(c.ai.hasApiKey()).toBe(true);
    expect(c.values.get(AI_CONFIG_KEY)).not.toContain('PRIVATE_KEY_SENTINEL');
  });
  it('remembers a key only after the explicit checkbox and confirmed enable action', async () => {
    const c = await fixture();
    c.fill();
    c.click('Remember API key');
    c.click('Enable');
    expect(c.values.size).toBe(0);
    c.msg.mock.calls.at(-1)![0].onBtn?.(0, c.env);
    expect(c.values.get(AI_CONFIG_KEY)).toContain('PRIVATE_KEY_SENTINEL');
    c.click('Clear key');
    c.click('Enable');
    c.msg.mock.calls.at(-1)![0].onBtn?.(0, c.env);
    expect(c.ai.hasApiKey()).toBe(false);
    expect(c.values.get(AI_CONFIG_KEY)).not.toContain('PRIVATE_KEY_SENTINEL');
  });
  it('rejects stale confirmation after settings change and after disposal', async () => {
    const c = await fixture();
    c.fill();
    c.click('Enable');
    const stale = c.msg.mock.calls.at(-1)![0];
    c.ai.saveConfig(DEFAULT_AI_CONFIG);
    stale.onBtn?.(0, c.env);
    expect(c.ai.getConfig().enabled).toBe(false);
    c.click('Enable');
    const disposed = c.msg.mock.calls.at(-1)![0];
    c.session.dispose();
    disposed.onBtn?.(0, c.env);
    expect(c.ai.getConfig().enabled).toBe(false);
  });
  it('rejects a confirmation whose form was edited and reports a cancelled enablement', async () => {
    const c = await fixture();
    c.fill();
    c.click('Enable');
    const stale = c.msg.mock.calls.at(-1)![0];
    c.fillAt(110, 86, 'edited-model');
    stale.onBtn?.(0, c.env);
    expect(c.ai.getConfig().enabled).toBe(false);
    c.click('Enable');
    c.msg.mock.calls.at(-1)![0].onBtn?.(1, c.env);
    expect(c.ai.getConfig().enabled).toBe(false);
    expect(c.session.status()).toBe('Connection enablement cancelled.');
  });
});

describe('Connection testing', () => {
  it('requires an enabled connection before making any diagnostic request', async () => {
    const c = await fixture();
    c.fill();
    c.click('Test connection');
    expect(c.transport.request).not.toHaveBeenCalled();
    expect(c.session.status()).toBe('Enable this connection before testing.');
  });

  it('verifies the confirmed custom model with a fixed diagnostic rather than a transcript or file', async () => {
    const c = await fixture();
    c.files.createText('private-note.txt', 'PRIVATE FILE SENTINEL');
    c.files.saveGeneratedText('private-chat', 'Transcript.txt', 'PRIVATE CHAT SENTINEL', 'chat');
    c.enable();
    vi.mocked(c.transport.request).mockResolvedValueOnce('OK');
    c.click('Test connection');
    expect(c.session.status()).toBe('Testing connection...');
    expect(c.transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          endpoint: 'https://custom.example/v1',
          model: 'custom-model',
        }),
        messages: [
          { role: 'system', content: 'This is a connection test. Reply with OK only.' },
          { role: 'user', content: 'Connection test.' },
        ],
      }),
    );
    const request = vi.mocked(c.transport.request).mock.calls.at(-1)![0];
    expect(JSON.stringify(request.messages)).not.toContain('PRIVATE');
    await settle();
    expect(c.session.status()).toBe('Connection verified. Model: custom-model.');
  });

  it('asks to enable edited settings before testing instead of sending them to an unconfirmed destination', async () => {
    const c = await fixture();
    c.enable();
    c.fillAt(110, 58, 'https://unconfirmed.example/v1');
    c.click('Test connection');
    expect(c.transport.request).not.toHaveBeenCalled();
    expect(c.session.status()).toBe('Enable the edited settings before testing.');
    expect(c.ai.getConfig().endpoint).toBe('https://custom.example/v1');
  });

  it('does not keep a successful diagnostic status after another window switches the connection offline', async () => {
    const c = await fixture();
    c.enable();
    vi.mocked(c.transport.request).mockResolvedValueOnce('OK');
    c.click('Test connection');
    await settle();
    expect(c.session.status()).toContain('Connection verified.');
    c.ai.saveConfig({ ...c.ai.getConfig(), enabled: false });
    expect(c.session.status()).toBe('Offline mode. No test is running.');
  });

  it.each([
    new AiReplyError('authentication', 'Authentication failed. Check the API key.'),
    new AiReplyError('rate-limit', 'The service rate limit was reached. Try again later.'),
    new AiReplyError('response', 'The service returned no text reply.'),
    new AiReplyError(
      'connection',
      'Connection failed. Check the service URL and browser CORS permission.',
    ),
  ])('shows actionable %s failures and allows another test', async (error) => {
    const c = await fixture();
    c.enable();
    vi.mocked(c.transport.request).mockRejectedValueOnce(error).mockResolvedValueOnce('OK');
    c.click('Test connection');
    await settle();
    expect(c.session.status()).toBe(error.message);
    c.click('Test connection');
    await settle();
    expect(c.transport.request).toHaveBeenCalledTimes(2);
    expect(c.session.status()).toBe('Connection verified. Model: custom-model.');
  });

  it('stops a diagnostic request and ignores its late reply', async () => {
    const c = await fixture();
    c.enable();
    const late = deferredReply();
    vi.mocked(c.transport.request).mockReturnValueOnce(late.promise);
    c.click('Test connection');
    const signal = vi.mocked(c.transport.request).mock.calls.at(-1)![0].signal;
    c.click('Stop test');
    expect(signal.aborted).toBe(true);
    expect(c.session.status()).toBe('Connection test stopped.');
    late.resolve('LATE REPLY');
    await settle();
    expect(c.session.status()).toBe('Connection test stopped.');
  });

  it.each(['Work Offline', 'Clear key'])('cancels a running diagnostic on %s', async (action) => {
    const c = await fixture();
    c.enable();
    const late = deferredReply();
    vi.mocked(c.transport.request).mockReturnValueOnce(late.promise);
    c.click('Test connection');
    const signal = vi.mocked(c.transport.request).mock.calls.at(-1)![0].signal;
    c.click(action);
    expect(signal.aborted).toBe(true);
    expect(c.ai.getConfig().enabled).toBe(false);
    const notice = c.session.status();
    late.resolve('LATE REPLY');
    await settle();
    expect(c.session.status()).toBe(notice);
  });

  it('cancels a running diagnostic when the draft or active configuration changes', async () => {
    const c = await fixture();
    c.enable();
    const draft = deferredReply(),
      active = deferredReply();
    vi.mocked(c.transport.request)
      .mockReturnValueOnce(draft.promise)
      .mockReturnValueOnce(active.promise);
    c.click('Test connection');
    const draftSignal = vi.mocked(c.transport.request).mock.calls.at(-1)![0].signal;
    c.fillAt(110, 86, 'edited-model');
    expect(draftSignal.aborted).toBe(true);
    draft.resolve('LATE DRAFT REPLY');
    await settle();
    expect(c.session.status()).toBe('Connection settings changed. Enable them before testing.');
    c.click('Enable');
    c.msg.mock.calls.at(-1)![0].onBtn?.(0, c.env);
    c.click('Test connection');
    const activeSignal = vi.mocked(c.transport.request).mock.calls.at(-1)![0].signal;
    c.ai.saveConfig({ ...c.ai.getConfig(), model: 'other-model' });
    expect(activeSignal.aborted).toBe(true);
    active.resolve('LATE ACTIVE REPLY');
    await settle();
    expect(c.session.status()).toBe('Connection changed. Test cancelled.');
  });

  it('settles a twenty-second timeout even if a transport has not yet completed', async () => {
    const c = await fixture();
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    c.enable();
    const late = deferredReply();
    vi.mocked(c.transport.request).mockReturnValueOnce(late.promise);
    c.click('Test connection');
    const signal = vi.mocked(c.transport.request).mock.calls.at(-1)![0].signal;
    await vi.advanceTimersByTimeAsync(19999);
    expect(signal.aborted).toBe(false);
    expect(c.session.status()).toBe('Testing connection...');
    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true);
    expect(c.session.status()).toBe('Connection test timed out. Check the service and try again.');
    late.resolve('LATE TIMEOUT REPLY');
    await settle();
    expect(c.session.status()).toContain('timed out');
  });

  it('disposes the diagnostic once and refuses further work after a late reply', async () => {
    const c = await fixture();
    c.enable();
    const late = deferredReply();
    vi.mocked(c.transport.request).mockReturnValueOnce(late.promise);
    c.click('Test connection');
    const signal = vi.mocked(c.transport.request).mock.calls.at(-1)![0].signal;
    c.session.dispose();
    c.session.dispose();
    expect(signal.aborted).toBe(true);
    late.resolve('LATE DISPOSED REPLY');
    await settle();
    c.clickAt(333, 16);
    expect(c.transport.request).toHaveBeenCalledTimes(1);
    expect(c.session.status()).toBeUndefined();
    expect(c.session.closed).toBe(true);
  });
});
