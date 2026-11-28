import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { AiConfig } from '../../os/ai/ai-connection';
import type { AssistantCommand } from '../../os/host/app-contracts';
import { appTestFixture } from '../testing/app-test-fixture';
import { openSaveDialog } from '../../os/files/save-dialog';

let cleanup: (() => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  });
});
afterEach(() => {
  cleanup.forEach((close) => close());
  cleanup = [];
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ONLINE: AiConfig = {
  endpoint: 'https://relay.example/chat',
  model: 'first-model',
  enabled: true,
  transport: 'relay',
  rememberKey: false,
};
const response = (reply: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }), { status: 200 });
function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const settle = () => vi.advanceTimersByTimeAsync(0);

async function chat(config?: AiConfig) {
  const { chatApp } = await import('./chat.app');
  const { connectionApp } = await import('../connection/connection.app');
  const { createAiConnection } = await import('../../os/ai/ai-connection');
  const { createFileSystem } = await import('../../os/files/filesystem');
  const { ASSISTANT_CONTEXT } = await import('../../os/ai/assistant-replies');
  const fetcher = vi.fn<typeof fetch>();
  const files = createFileSystem(localStorage);
  const { createBrowserAiTransport } = await import('../../os/ai/browser-ai-transport');
  const ai = createAiConnection(localStorage, createBrowserAiTransport(fetcher));
  if (config) ai.saveConfig(config);
  const c = appTestFixture(chatApp, { ai, files }, { x: 0, y: 0, w: 394, h: 178 });
  c.env.openSaveDialog = (frame, request, save) => openSaveDialog(frame, request, c.env, save);
  cleanup.push(() => {
    c.session.dispose();
    ai.dispose();
  });
  const assistant = (command: AssistantCommand) => c.session.assistantCommand!(command);
  const assistantView = () => c.session.assistantView!()!;
  const draft = (text: string, selection?: { start: number; end: number }) =>
    assistant({ kind: 'draft', text, selection });
  const chooseOnline = () => assistant({ kind: 'mode', mode: 'online' });
  const send = (message: string) => {
    draft(message);
    assistant({ kind: 'send' });
  };
  const offline = () => {
    const connection = appTestFixture(connectionApp, { ai }, { x: 0, y: 0, w: 404, h: 218 });
    connection.click('Work Offline');
    connection.session.dispose();
  };
  const payload = (index = fetcher.mock.calls.length - 1) => {
    const value: unknown = JSON.parse(String(fetcher.mock.calls[index][1]?.body));
    if (
      !value ||
      typeof value !== 'object' ||
      !('messages' in value) ||
      !Array.isArray(value.messages)
    )
      throw new Error('Expected a serialized chat request');
    return {
      messages: value.messages as unknown[],
      model: 'model' in value ? value.model : undefined,
    };
  };
  const transcript = () => {
    c.command('save-as');
    return vi.mocked(c.env.saveText).mock.calls.at(-1)![0].content;
  };
  return {
    ...c,
    draw: () => c.frame(),
    assistant,
    assistantView,
    draft,
    chooseOnline,
    send,
    close: () => c.session.dispose(),
    offline,
    fetcher,
    payload,
    transcript,
    getAiConfig: ai.getConfig,
    saveAiConfig: ai.saveConfig,
    fs: files,
    ASSISTANT_CONTEXT,
  };
}

describe('Chat privacy and request lifecycle', () => {
  it('starts local with a saved connection and keeps all six guide buttons local while online', async () => {
    const c = await chat(ONLINE);
    const { ASSISTANT_PROMPTS } = await import('../../os/ai/assistant-replies');
    expect(c.assistantView()).toMatchObject({
      mode: 'guide',
      onlineHost: 'relay.example',
      messages: [],
    });
    c.send('项目');
    expect(c.assistantView().messages.at(-1)?.text).toContain('NearLink Toolbox');
    c.send('Will it rain in Paris?');
    expect(c.assistantView().messages.at(-1)?.text).toContain('explicitly select Online');
    expect(c.fetcher).not.toHaveBeenCalled();
    c.draft('Keep this drafted question.');
    c.chooseOnline();
    expect(c.assistantView()).toMatchObject({
      mode: 'online',
      draft: 'Keep this drafted question.',
    });
    for (const prompt of ASSISTANT_PROMPTS) {
      c.assistant({ kind: 'toggle-guide' });
      expect(c.assistantView().guideOpen).toBe(true);
      c.assistant({ kind: 'prompt', id: prompt.id });
      expect(c.assistantView()).toMatchObject({
        guideOpen: false,
        draft: 'Keep this drafted question.',
      });
      expect(c.session.status()).toBe('Desktop guide answered offline.');
    }
    expect(c.fetcher).not.toHaveBeenCalled();
    const saved = c.transcript();
    for (const prompt of ASSISTANT_PROMPTS) expect(saved).toContain(`You: ${prompt.message}`);
    c.fetcher.mockResolvedValueOnce(response('Draft received.'));
    c.assistant({ kind: 'send' });
    c.assistant({ kind: 'send' });
    await settle();
    expect(c.fetcher).toHaveBeenCalledTimes(1);
    expect(c.payload().messages).toEqual([
      { role: 'system', content: c.ASSISTANT_CONTEXT },
      { role: 'user', content: 'Keep this drafted question.' },
    ]);
    c.assistant({ kind: 'connection' });
    expect(c.env.open).toHaveBeenCalledWith('connection');
  });

  it('confirms Chinese application requests, reports cancellation and rejects unavailable launches', async () => {
    const c = await chat();
    c.saveAiConfig(ONLINE);
    c.chooseOnline();
    c.send('请帮我打开计算器。');
    let dialog = vi.mocked(c.env.msg).mock.calls.at(-1)![0];
    expect(dialog.lines).toEqual(['Open Calculator on this desktop?']);
    expect(c.session.status()).toBe('Awaiting application confirmation...');
    expect(c.env.open).not.toHaveBeenCalled();
    dialog.onBtn!(1, c.env);
    expect(c.session.status()).toBe('Opening Calculator cancelled.');
    c.send('打开计算器');
    dialog = vi.mocked(c.env.msg).mock.calls.at(-1)![0];
    dialog.onBtn!(0, c.env);
    expect(c.env.open).toHaveBeenCalledWith('calculator');
    expect(c.session.status()).toBe('Opening Calculator.');
    c.send('启动记事本');
    vi.mocked(c.env.open).mockReturnValueOnce({ accepted: false, reason: 'unavailable' });
    vi.mocked(c.env.msg).mock.calls.at(-1)![0].onBtn!(0, c.env);
    expect(c.session.status()).toBe('Notepad could not be opened on this desktop.');
    expect(c.fetcher).not.toHaveBeenCalled();
  });

  it('dismissal unblocks application requests and cleared or disposed dialogs cannot open apps', async () => {
    const c = await chat();
    c.send('打开计算器');
    const dismissed = vi.mocked(c.env.msg).mock.calls.at(-1)![0];
    dismissed.onDismiss!();
    expect(c.session.status()).toBe('Opening Calculator cancelled.');
    c.send('打开博客');
    const cleared = vi.mocked(c.env.msg).mock.calls.at(-1)![0];
    c.command('clear');
    const clear = vi.mocked(c.env.msg).mock.calls.at(-1)![0];
    clear.onBtn!(0, c.env);
    cleared.onBtn!(0, c.env);
    cleared.onDismiss!();
    expect(c.session.status()).toBe('Conversation cleared.');
    c.send('启动记事本');
    const closed = vi.mocked(c.env.msg).mock.calls.at(-1)![0];
    c.close();
    closed.onBtn!(0, c.env);
    closed.onDismiss!();
    expect(c.env.open).not.toHaveBeenCalled();
  });

  it('copies an entire multiline reply and exports the complete conversation with visitor labels', async () => {
    const c = await chat();
    const { offlineReply } = await import('../../os/ai/assistant-replies');
    const write = vi.spyOn(c.env.clipboard, 'write');
    c.send('skills');
    c.command('copy-latest', 'Edit');
    await settle();
    expect(write).toHaveBeenLastCalledWith(offlineReply('skills', 'quiet'));
    expect(c.session.status()).toContain('Reply copied.');
    c.command('copy-all', 'Edit');
    await settle();
    const content = write.mock.calls.at(-1)![0];
    expect(content).toContain('You: skills');
    expect(content).toContain(`Assistant: ${offlineReply('skills', 'quiet')}`);
    expect(content).not.toContain('MiraHikari: skills');
    c.command('export');
    expect(c.env.downloadText).toHaveBeenCalledWith('Chat transcript.txt', content);
    expect(c.session.status()).toBe('Transcript exported.');
    expect(c.fetcher).not.toHaveBeenCalled();
  });

  it('keeps UTF-16 selection offsets after an astral character', async () => {
    const c = await chat();
    c.draft('🙂 hello', { start: 3, end: 8 });
    vi.spyOn(c.env.clipboard, 'read').mockResolvedValueOnce('bye');
    c.command('paste', 'Edit');
    await settle();
    expect(c.assistantView().draft).toBe('🙂 bye');
  });

  it('pastes through the shared clipboard into the selection without sending until Enter', async () => {
    const c = await chat();
    c.saveAiConfig(ONLINE);
    c.chooseOnline();
    c.draft('Replace this draft.', { start: 0, end: 19 });
    vi.spyOn(c.env.clipboard, 'read').mockResolvedValueOnce('Pasted\nquestion.');
    c.command('paste', 'Edit');
    c.assistant({ kind: 'send' });
    await settle();
    expect(c.session.status()).toBe('Pasted into message. Press Enter to send.');
    expect(c.fetcher).not.toHaveBeenCalled();
    c.fetcher.mockResolvedValueOnce(response('Pasted question accepted.'));
    c.assistant({ kind: 'send' });
    await settle();
    expect(c.payload().messages).toEqual([
      { role: 'system', content: c.ASSISTANT_CONTEXT },
      { role: 'user', content: 'Pasted question.' },
    ]);
  });

  it('Paste into message cannot overwrite a newer draft or revive a closed session', async () => {
    const c = await chat();
    const paste = Promise.withResolvers<string | null>();
    const next = Promise.withResolvers<string | null>();
    vi.spyOn(c.env.clipboard, 'read')
      .mockReturnValueOnce(paste.promise)
      .mockReturnValueOnce(next.promise);
    c.draft('Draft');
    c.command('paste', 'Edit');
    expect(c.session.status()).toBe('Reading clipboard...');
    c.draft('Draft edited');
    paste.resolve('STALE CLIPBOARD');
    await settle();
    expect(c.session.status()).toBe('Message changed while reading the clipboard. Paste again.');
    c.assistant({ kind: 'send' });
    expect(c.transcript()).toContain('You: Draft edited');
    expect(c.transcript()).not.toContain('STALE CLIPBOARD');
    c.command('paste', 'Edit');
    c.close();
    next.resolve('CLOSED CLIPBOARD');
    await settle();
    expect(c.session.closed).toBe(true);
    expect(c.session.status()).toBeUndefined();
  });

  it('includes native submissions made before painting in the saved transcript', async () => {
    const c = await chat();
    const { offlineReply } = await import('../../os/ai/assistant-replies');
    c.draft('skills');
    c.assistant({ kind: 'send' });
    c.command('save');
    const file = c.fs.list('documents', 'chat').find((entry) => entry.source === 'chat');
    expect(file?.content).toContain('You: skills');
    expect(file?.content).toContain(`Assistant: ${offlineReply('skills', 'quiet')}`);
  });

  it('reports failed and session-only saves while retaining an exportable conversation', async () => {
    const c = await chat();
    c.send('hello');
    vi.spyOn(c.fs, 'saveGeneratedText').mockReturnValueOnce({
      ok: false,
      persisted: false,
      error: 'Disk unavailable.',
    });
    c.command('save');
    expect(c.session.status()).toBe('Disk unavailable.');
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    c.command('save');
    expect(c.session.status()).toBe('Transcript saved for this session. Export to keep.');
    c.command('export');
    expect(c.env.downloadText).toHaveBeenCalledWith(
      'Chat transcript.txt',
      expect.stringContaining('You: hello'),
    );
  });

  it('preserves earlier messages beyond the old draw limit and scrolls them through real input', async () => {
    const c = await chat();
    for (let index = 0; index < 55; index++) {
      c.send(`MESSAGE_${index}`);
    }
    const content = c.transcript();
    expect(content).toContain('You: MESSAGE_0');
    expect(content).toContain('You: MESSAGE_54');
    const visible = () => {
      c.text.mockClear();
      c.draw();
      return c.text.mock.calls
        .filter(([, x, y]) => x > 40 && x < 360 && y > 26)
        .map(([value]) => value)
        .join('\n');
    };
    const latest = visible();
    expect(latest).not.toContain('MESSAGE_0');
    c.input.queueInput({ px: 100, py: 50, wheel: -120 });
    c.draw();
    const earlier = visible();
    expect(earlier).not.toBe(latest);
    c.send('NEW_MESSAGE_WHILE_READING');
    expect(visible()).toBe(earlier);
    c.input.queueInput({ px: 379, py: 94, down: true });
    c.draw();
    c.input.queueInput({ py: 39 });
    c.draw();
    c.input.queueInput({ down: false });
    c.draw();
    expect(visible()).toContain('MESSAGE_0');
    c.key('End');
    expect(visible()).not.toContain('MESSAGE_0');
    expect(c.transcript()).toContain(content);
  });

  it('draws visible integer scrollbar arrows and dims only unavailable directions', async () => {
    const c = await chat();
    c.send('help');
    c.key('End');
    const poly = vi.spyOn(c.surface.draw, 'poly');
    c.draw();
    expect(poly.mock.calls).toHaveLength(2);
    const [up, down] = poly.mock.calls;
    for (const [points] of [up, down]) {
      expect(points).toHaveLength(3);
      expect(points.flat().every(Number.isInteger)).toBe(true);
      expect(new Set(points.map(([x]) => x)).size).toBeGreaterThan(1);
      expect(new Set(points.map(([, y]) => y)).size).toBeGreaterThan(1);
    }
    expect(up[0][1][1]).toBeLessThan(up[0][0][1]);
    expect(down[0][2][1]).toBeGreaterThan(down[0][0][1]);
    expect(up[1]).toBe(c.surface.draw.TH.text);
    expect(down[1]).toBe(c.surface.draw.TH.shadow);
    c.clickAt(379, 31);
    poly.mockClear();
    c.draw();
    expect(poly.mock.calls[1][1]).toBe(c.surface.draw.TH.text);
  });

  it('refuses oversized local saves explicitly but copies and exports every character', async () => {
    const c = await chat();
    const write = vi.spyOn(c.env.clipboard, 'write');
    c.saveAiConfig(ONLINE);
    c.chooseOnline();
    for (let index = 0; index < 5; index++) {
      c.fetcher.mockResolvedValueOnce(response(`RESPONSE_${index} ${'long text '.repeat(800)}`));
      c.send(`LONG_QUESTION_${index}`);
      await settle();
    }
    c.command('save');
    expect(c.session.status()).toContain('exceeds 20,000 characters');
    expect(c.fs.list('documents', 'chat').filter((entry) => entry.source === 'chat')).toHaveLength(
      0,
    );
    c.command('save-as');
    expect(c.env.saveText).not.toHaveBeenCalled();
    c.command('copy-all', 'Edit');
    await settle();
    const complete = write.mock.calls.at(-1)![0];
    expect(complete.length).toBeGreaterThan(20000);
    expect(complete).toContain('You: LONG_QUESTION_0');
    expect(complete).toContain('Online AI: RESPONSE_4');
    c.command('export');
    expect(c.env.downloadText).toHaveBeenCalledWith('Chat transcript.txt', complete);
  });

  it('retries only the failed online question and preserves the draft while stopping a request', async () => {
    const c = await chat();
    c.send('PRIVATE OFFLINE MESSAGE');
    c.saveAiConfig(ONLINE);
    c.chooseOnline();
    c.fetcher.mockRejectedValueOnce(new TypeError('Network unavailable'));
    c.send('Retry this online question.');
    await settle();
    expect(c.assistantView().canRetry).toBe(true);
    expect(c.assistantView().announcement?.text).toContain(
      'offline reply is in the conversation history',
    );
    c.assistant({ kind: 'mode', mode: 'guide' });
    c.assistant({ kind: 'retry' });
    expect(c.fetcher).toHaveBeenCalledTimes(1);
    c.chooseOnline();
    c.fetcher.mockResolvedValueOnce(response('Retry succeeded.'));
    c.command('retry', 'Edit');
    await settle();
    expect(c.payload().messages).toEqual([
      { role: 'system', content: c.ASSISTANT_CONTEXT },
      { role: 'user', content: 'Retry this online question.' },
    ]);
    const stopped = deferredResponse();
    c.fetcher.mockReturnValueOnce(stopped.promise);
    c.send('Stop this response.');
    const signal = c.fetcher.mock.calls.at(-1)![1]?.signal;
    c.draft('Retained next question.');
    c.assistant({ kind: 'stop' });
    expect(signal?.aborted).toBe(true);
    expect(c.session.status()).toBe('Request cancelled.');
    const cancelled = c.transcript();
    stopped.resolve(response('STOPPED LATE RESPONSE'));
    await settle();
    expect(c.transcript()).toBe(cancelled);
    c.fetcher.mockResolvedValueOnce(response('Next question accepted.'));
    c.assistant({ kind: 'send' });
    await settle();
    expect(c.payload().messages.at(-1)).toEqual({
      role: 'user',
      content: 'Retained next question.',
    });
    expect(c.transcript()).not.toContain('STOPPED LATE RESPONSE');
  });

  it('clearing an active request drops its reply and retry operation without reviving the window', async () => {
    const c = await chat();
    c.saveAiConfig(ONLINE);
    c.chooseOnline();
    const late = deferredResponse();
    c.fetcher.mockReturnValueOnce(late.promise);
    c.send('Clear this request.');
    const signal = c.fetcher.mock.calls.at(-1)![1]?.signal;
    c.command('clear');
    const dismissed = vi.mocked(c.env.msg).mock.calls.at(-1)![0];
    expect(dismissed).toMatchObject({ title: 'Clear conversation?', def: 1 });
    expect(signal?.aborted).toBe(false);
    dismissed.onDismiss!();
    expect(c.assistantView().messages).toEqual([{ role: 'You', text: 'Clear this request.' }]);
    c.draft('An unsent draft.');
    c.command('clear');
    vi.mocked(c.env.msg).mock.calls.at(-1)![0].onBtn!(0, c.env);
    expect(signal?.aborted).toBe(true);
    late.resolve(response('CLEARED LATE RESPONSE'));
    await settle();
    expect(c.session.status()).toBe('Conversation cleared.');
    expect(c.assistantView()).toMatchObject({ messages: [], draft: 'An unsent draft.' });
    expect(c.session.menus()?.Edit).toContainEqual(
      expect.objectContaining({ command: 'retry', disabled: true }),
    );
    c.command('retry', 'Edit');
    expect(c.fetcher).toHaveBeenCalledTimes(1);
    c.command('export');
    expect(c.env.downloadText).not.toHaveBeenCalled();
  });

  it('uses saveText when the host omits its optional Save As presentation', async () => {
    const c = await chat();
    c.env.openSaveDialog = undefined;
    c.send('Retain this transcript');
    c.command('save-as');
    expect(c.env.saveText).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Chat transcript.txt',
        content: expect.stringContaining('Retain this transcript'),
      }),
    );
  });
  it('sends public context and online input without offline history or local document contents', async () => {
    const c = await chat();
    c.fs.createText('private-note.txt', 'PRIVATE FILE SENTINEL');
    c.fs.saveGeneratedText('private-log', 'SYSTEM.LOG', 'PRIVATE STORY SENTINEL', 'story');
    c.send('PRIVATE OFFLINE SENTINEL');
    expect(c.fetcher).not.toHaveBeenCalled();
    expect(c.transcript()).toContain('PRIVATE OFFLINE SENTINEL');
    c.saveAiConfig(ONLINE);
    c.chooseOnline();
    c.fetcher.mockResolvedValueOnce(response('Public reply.'));
    c.send('Tell me about the public projects.');
    await settle();
    expect(c.payload().messages).toEqual([
      { role: 'system', content: c.ASSISTANT_CONTEXT },
      { role: 'user', content: 'Tell me about the public projects.' },
    ]);
    expect(JSON.stringify(c.payload())).not.toContain('PRIVATE');
    expect(c.fs.list('documents').find((file) => file.name === 'private-note.txt')?.content).toBe(
      'PRIVATE FILE SENTINEL',
    );
  });

  it('Work Offline aborts the active relay, clears online context, and ignores a late reply', async () => {
    const c = await chat();
    c.saveAiConfig(ONLINE);
    c.chooseOnline();
    c.fetcher.mockResolvedValueOnce(response('First online reply.'));
    c.send('First online question.');
    await settle();
    expect(c.transcript()).toContain('First online reply.');
    const late = deferredResponse();
    c.fetcher.mockReturnValueOnce(late.promise);
    c.send('Second online question.');
    const signal = c.fetcher.mock.calls[1][1]?.signal;
    c.offline();
    expect(c.getAiConfig().enabled).toBe(false);
    expect(c.assistantView()).toMatchObject({ mode: 'guide', onlineHost: null });
    expect(signal?.aborted).toBe(true);
    expect(c.session.status()).not.toContain('Connecting');
    const log = c.transcript(),
      notice = c.session.status();
    vi.mocked(c.env.play).mockClear();
    late.resolve(response('LATE RELAY SENTINEL'));
    await settle();
    expect(c.transcript()).toBe(log);
    expect(c.session.status()).toBe(notice);
    expect(c.env.play).not.toHaveBeenCalled();
    c.saveAiConfig(ONLINE);
    expect(c.assistantView()).toMatchObject({ mode: 'guide', onlineHost: 'relay.example' });
    c.chooseOnline();
    c.fetcher.mockResolvedValueOnce(response('Fresh reply.'));
    c.send('Fresh question.');
    await settle();
    expect(c.payload().messages).toEqual([
      { role: 'system', content: c.ASSISTANT_CONTEXT },
      { role: 'user', content: 'Fresh question.' },
    ]);
  });

  it('changing an enabled relay cannot let an old callback clear or overwrite its replacement request', async () => {
    const c = await chat();
    c.saveAiConfig(ONLINE);
    c.chooseOnline();
    const old = deferredResponse(),
      next = deferredResponse();
    c.fetcher.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    c.send('Old destination question.');
    const oldSignal = c.fetcher.mock.calls[0][1]?.signal;
    c.draft('Draft waiting before configuration changes.');
    c.saveAiConfig({ ...ONLINE, endpoint: 'https://second.example/chat', model: 'second-model' });
    expect(oldSignal?.aborted).toBe(true);
    expect(c.assistantView()).toMatchObject({
      mode: 'guide',
      onlineHost: 'second.example',
      draft: 'Draft waiting before configuration changes.',
    });
    c.chooseOnline();
    c.send('New destination question.');
    const active = c.fetcher.mock.calls[1][1]?.signal;
    old.resolve(response('OLD DESTINATION SENTINEL'));
    await settle();
    expect(c.session.status()).toContain('Connecting');
    expect(active?.aborted).toBe(false);
    expect(c.transcript()).not.toContain('OLD DESTINATION SENTINEL');
    expect(c.fetcher.mock.calls[1][0]).toBe('https://second.example/chat');
    expect(c.payload().model).toBe('second-model');
    expect(c.payload().messages).toEqual([
      { role: 'system', content: c.ASSISTANT_CONTEXT },
      { role: 'user', content: 'New destination question.' },
    ]);
    next.resolve(response('New destination reply.'));
    await settle();
    expect(c.session.status()).not.toContain('Connecting');
    expect(c.transcript()).toContain('New destination reply.');
  });

  it('closing Chat aborts the request and detaches configuration updates before late completion', async () => {
    const c = await chat();
    c.saveAiConfig(ONLINE);
    c.chooseOnline();
    const late = deferredResponse();
    c.fetcher.mockReturnValueOnce(late.promise);
    c.send('Close while pending.');
    const signal = c.fetcher.mock.calls[0][1]?.signal;
    const log = c.transcript();
    c.close();
    expect(signal?.aborted).toBe(true);
    const calls = vi.mocked(c.env.saveText).mock.calls.length;
    vi.mocked(c.env.play).mockClear();
    c.saveAiConfig({ ...ONLINE, enabled: false });
    late.resolve(response('CLOSED WINDOW SENTINEL'));
    await settle();
    c.draw();
    expect(c.session.closed).toBe(true);
    expect(c.session.assistantView?.()).toBeUndefined();
    expect(c.session.status()).toBeUndefined();
    expect(c.env.saveText).toHaveBeenCalledTimes(calls);
    expect(vi.mocked(c.env.saveText).mock.calls.at(-1)![0].content).toBe(log);
    expect(c.env.play).not.toHaveBeenCalled();
  });

  it('falls back after relay failure without including the fallback conversation in the next payload', async () => {
    const c = await chat();
    c.saveAiConfig(ONLINE);
    c.chooseOnline();
    c.fetcher.mockRejectedValueOnce(new TypeError('Network unavailable'));
    c.send('story');
    await settle();
    expect(c.transcript()).toContain('Offline reply: System state: quiet');
    expect(c.session.status()).not.toContain('Connecting');
    c.fetcher.mockResolvedValueOnce(response('Recovered.'));
    c.send('Try the relay again.');
    await settle();
    expect(c.payload().messages).toEqual([
      { role: 'system', content: c.ASSISTANT_CONTEXT },
      { role: 'user', content: 'Try the relay again.' },
    ]);
    expect(c.transcript()).toContain('Recovered.');
  });

  it('aborts an unresponsive relay after twenty seconds and returns to the offline assistant', async () => {
    const c = await chat();
    c.saveAiConfig(ONLINE);
    c.chooseOnline();
    c.fetcher.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    c.send('help');
    const signal = c.fetcher.mock.calls[0][1]?.signal;
    await vi.advanceTimersByTimeAsync(19999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    expect(c.session.status()).not.toContain('Connecting');
    expect(c.transcript()).toContain('Offline reply:');
    expect(c.session.status()).toContain('timed out');
  });

  it('saves and updates a local transcript without overwriting an existing visitor document or calling the relay', async () => {
    const c = await chat();
    const original = c.fs.createText('Chat transcript.txt', 'VISITOR DOCUMENT', 'chat').file!;
    c.send('hello');
    c.view.menuSel = { menu: 'File', item: 'Save transcript', command: 'save' };
    c.draw();
    c.view.menuSel = null;
    const first = c.fs.list('documents', 'chat').find((file) => file.source === 'chat')!;
    expect(first.content).toContain('You: hello');
    expect(first.content).toContain('Assistant: Hello.');
    expect(c.session.status()).toBe('Transcript saved in My Documents.');
    c.send('skills');
    c.view.menuSel = { menu: 'File', item: 'Save transcript', command: 'save' };
    c.draw();
    const transcripts = c.fs.list('documents', 'chat').filter((file) => file.source === 'chat');
    expect(transcripts).toHaveLength(1);
    expect(transcripts[0].id).toBe(first.id);
    expect(transcripts[0].content).toContain('You: skills');
    expect(c.fs.get(original.id)?.content).toBe('VISITOR DOCUMENT');
    expect(c.fetcher).not.toHaveBeenCalled();
  });

  it('exposes completed messages without streaming updates or executing model text', async () => {
    const c = await chat(ONLINE);
    c.chooseOnline();
    const complete = Promise.withResolvers<string>();
    let receive: ((text: string) => void) | undefined;
    vi.spyOn(c.env.ai, 'reply').mockImplementationOnce((_messages, _signal, onText) => {
      receive = onText;
      return complete.promise;
    });
    c.send('Name a desktop command.');
    const sent = c.assistantView();
    receive!('打开计');
    const streaming = c.assistantView();
    expect(streaming.messages).toBe(sent.messages);
    expect(streaming.announcement).toBe(sent.announcement);
    expect(streaming.status).toBe('Online AI is responding...');
    complete.resolve('打开计算器');
    await settle();
    const answered = c.assistantView();
    expect(answered.messages.at(-1)).toEqual({ role: 'Online AI', text: '打开计算器' });
    expect(answered.announcement).toMatchObject({ text: 'Online AI: 打开计算器' });
    expect(c.assistantView().messages).toBe(answered.messages);
    expect(c.assistantView().announcement).toBe(answered.announcement);
    expect(c.env.msg).not.toHaveBeenCalled();
    expect(c.env.open).not.toHaveBeenCalled();
  });

  it('switching to Desktop guide preserves the partial reply and prevents late completion', async () => {
    const c = await chat(ONLINE);
    c.chooseOnline();
    const finished = Promise.withResolvers<string>();
    let signal: AbortSignal | undefined;
    vi.spyOn(c.env.ai, 'reply').mockImplementationOnce((_messages, requestSignal, onText) => {
      signal = requestSignal;
      onText?.('Retained partial reply');
      return finished.promise;
    });
    c.send('A slow question.');
    c.draft('Still drafting.');
    c.assistant({ kind: 'mode', mode: 'guide' });
    expect(signal?.aborted).toBe(true);
    expect(c.assistantView()).toMatchObject({
      mode: 'guide',
      draft: 'Still drafting.',
      canStop: false,
      canRetry: false,
    });
    expect(c.assistantView().messages.at(-1)).toEqual({
      role: 'Online AI',
      text: 'Retained partial reply\n[Response stopped.]',
    });
    finished.resolve('LATE SENTINEL');
    await settle();
    expect(c.transcript()).not.toContain('LATE SENTINEL');
    c.chooseOnline();
    expect(c.assistantView().canRetry).toBe(true);
  });

  it('uses the current story phase only to answer a local story question', async () => {
    const c = await chat(ONLINE);
    c.story.dispatch('investigate');
    c.story.dispatch('audit');
    const story = c.story.get();
    expect(c.assistantView().messages).toEqual([]);
    c.send('story');
    expect(c.assistantView().messages.at(-1)?.text).toContain('One request is still unsigned.');
    expect(c.story.get()).toEqual(story);
    expect(c.fetcher).not.toHaveBeenCalled();
    c.chooseOnline();
    c.fetcher.mockResolvedValueOnce(response('Online reply.'));
    c.send('One plain online question.');
    await settle();
    expect(JSON.stringify(c.payload())).not.toContain('One request is still unsigned.');
  });

  it('uses theme text for transcript body and labels on Phosphor', async () => {
    const c = await chat();
    c.env.setTheme('phosphor');
    c.draw();
    expect(c.text.mock.calls).toContainEqual([
      'ON DUTY',
      expect.any(Number),
      expect.any(Number),
      { align: 'center', color: c.surface.draw.TH.selText },
    ]);
    expect(c.text.mock.calls).toContainEqual([
      'Try “打开计算器”.',
      expect.any(Number),
      expect.any(Number),
      { color: c.surface.draw.TH.text },
    ]);
    c.send('hello');
    c.text.mockClear();
    c.draw();
    expect(c.text.mock.calls).toContainEqual([
      'Assistant',
      19,
      expect.any(Number),
      { color: c.surface.draw.TH.text, font: 'bold' },
    ]);
    const body = c.text.mock.calls.filter(([text]) =>
      String(text).startsWith('Hello. I’m on duty'),
    );
    expect(body[0]?.[3]?.color).toBe(c.surface.draw.TH.text);
    c.send('项目');
    c.text.mockClear();
    c.draw();
    expect(c.text.mock.calls.map(([text]) => text)).toContain('Assistant');
    expect(c.text.mock.calls.some(([text]) => String(text).includes('NearLink Toolbox'))).toBe(
      true,
    );
    c.text.mockClear();
    c.key('End');
    expect(c.text.mock.calls.map(([text]) => text)).toContain('Assistant');
  });

  it('starts a completed long online reply at its first line and labels scrolled continuations', async () => {
    const c = await chat(ONLINE);
    c.chooseOnline();
    const reply = Array.from({ length: 24 }, (_, index) => `REFERENCE_${index}`).join('\n');
    c.fetcher.mockResolvedValueOnce(response(reply));
    c.send('Give me a longer reply.');
    await settle();
    c.draw();
    expect(c.text.mock.calls.map(([text]) => text)).toEqual(
      expect.arrayContaining(['Online AI', 'REFERENCE_0']),
    );
    c.text.mockClear();
    c.key('End');
    expect(c.text.mock.calls.map(([text]) => text)).toEqual(
      expect.arrayContaining(['Online AI', 'REFERENCE_23']),
    );
    expect(c.text.mock.calls.map(([text]) => text)).not.toContain('REFERENCE_0');
  });
});
