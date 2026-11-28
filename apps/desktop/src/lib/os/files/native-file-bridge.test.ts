import { afterEach, expect, it, vi } from 'vite-plus/test';
import {
  createNativeFileClient,
  mountNativeFileHost,
  parseNativeFileRequest,
  parseNativeFileResult,
  type NativeFileServices,
  type NativeFileResult,
} from './native-file-bridge';
const base = { type: 'doom95:file-request', session: 'test-session', requestId: 1 };
it('accepts only bounded typed file operations', () => {
  expect(parseNativeFileRequest({ ...base, operation: 'read', fileId: 'diary' })).toMatchObject({
    operation: 'read',
    fileId: 'diary',
  });
  expect(
    parseNativeFileRequest({
      ...base,
      operation: 'write',
      fileId: 'diary',
      content: 'Hello',
      revision: 2,
    }),
  ).not.toBeNull();
  for (const value of [
    { ...base, operation: 'execute', fileId: 'x' },
    { ...base, operation: 'read', fileId: {} },
    { ...base, operation: 'write', fileId: 'x', content: 'x', revision: NaN },
    { ...base, operation: 'save-as', name: 'x', content: 'x'.repeat(200001) },
  ])
    expect(parseNativeFileRequest(value)).toBeNull();
});
it('does not adopt malformed file responses or claim nonpersistent saves are durable', () => {
  const file = {
    kind: 'text',
    id: 'notes',
    title: 'Notes.txt',
    text: 'Text',
    revision: 3,
    readonly: false,
  };
  expect(parseNativeFileResult({ status: 'saved', file, persisted: false })).toEqual({
    status: 'saved',
    file,
    persisted: false,
  });
  expect(
    parseNativeFileResult({ status: 'read', file: { ...file, readonly: 'false' } }),
  ).toBeNull();
  expect(parseNativeFileResult({ status: 'saved', file })).toBeNull();
});

const origin = 'https://www.example.com';
const file = {
  kind: 'text',
  id: 'notes',
  title: 'Notes.txt',
  text: 'Text',
  revision: 3,
  readonly: false,
} as const;
function message(target: EventTarget, data: unknown, source: object, from = origin) {
  const event = new Event('message');
  Object.assign(event, { data, source, origin: from });
  target.dispatchEvent(event);
}
function browser() {
  vi.useFakeTimers();
  const parent = { postMessage: vi.fn() };
  const host = Object.assign(new EventTarget(), { parent, setTimeout: globalThis.setTimeout });
  vi.stubGlobal('window', host);
  vi.stubGlobal('location', { origin, href: `${origin}/` });
  return { parent, host };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('binds replies to source, session, operation and exact file identity', async () => {
  const { parent, host } = browser();
  const client = createNativeFileClient();
  const read = client.read('notes');
  const request = parent.postMessage.mock.calls[0][0];
  const result = { ...request, type: 'doom95:file-result', result: { status: 'read', file } };
  message(host, result, parent, 'https://other.example');
  message(host, result, {});
  message(host, { ...result, session: 'stale-mount' }, parent);
  message(host, { ...result, result: { status: 'read', file: { ...file, id: 'other' } } }, parent);
  message(host, { ...result, result: { status: 'opened' } }, parent);
  message(host, result, parent);
  expect(await read).toEqual({ status: 'read', file });
  expect(vi.getTimerCount()).toBe(0);
  client.dispose();
});

it('times out reads, cancels waiting Save As on disposal and ignores late replies after remount', async () => {
  const { parent, host } = browser();
  const first = createNativeFileClient();
  const timedOut = first.read('notes');
  const old = parent.postMessage.mock.calls[0][0];
  await vi.advanceTimersByTimeAsync(15000);
  expect(await timedOut).toMatchObject({ status: 'failed' });
  const waiting = first.saveAs('Notes.txt', 'Text');
  await vi.advanceTimersByTimeAsync(60000);
  first.dispose();
  first.dispose();
  expect(await waiting).toEqual({ status: 'cancelled' });
  expect(vi.getTimerCount()).toBe(0);
  const second = createNativeFileClient();
  const read = second.read('notes');
  const current = parent.postMessage.mock.calls.at(-1)![0];
  message(host, { ...old, type: 'doom95:file-result', result: { status: 'read', file } }, parent);
  message(
    host,
    {
      ...current,
      type: 'doom95:file-result',
      result: { status: 'read', file: { ...file, text: 'New mount' } },
    },
    parent,
  );
  expect(await read).toMatchObject({ file: { text: 'New mount' } });
  second.dispose();
});

it('settles messaging failures immediately without retaining a timeout', async () => {
  const { parent } = browser();
  parent.postMessage.mockImplementation(() => {
    throw new Error('Gone');
  });
  const client = createNativeFileClient();
  expect(await client.read('notes')).toMatchObject({ status: 'failed' });
  expect(vi.getTimerCount()).toBe(0);
  client.dispose();
});

it('deduplicates accepted host writes and drops replies after a frame navigates away', async () => {
  const { host } = browser();
  const source = { postMessage: vi.fn() };
  const frame = {
    contentWindow: source,
    dataset: { htmlWindow: 'blog' },
    src: `${origin}/blog/`,
    isConnected: true,
  };
  vi.stubGlobal('document', { querySelectorAll: () => [frame] });
  const completion = Promise.withResolvers<NativeFileResult>();
  const services: NativeFileServices = {
    read: vi.fn((): NativeFileResult => ({ status: 'read', file })),
    write: vi.fn(() => completion.promise),
    saveAs: async () => ({ status: 'cancelled' }),
    open: () => ({ status: 'opened' }),
  };
  const dispose = mountNativeFileHost(services);
  const request = {
    ...base,
    operation: 'write',
    fileId: 'notes',
    content: 'New text',
    revision: 3,
  };
  message(host, request, {});
  message(host, request, source);
  message(host, request, source);
  await Promise.resolve();
  expect(services.write).toHaveBeenCalledTimes(1);
  frame.src = `${origin}/blog/other/`;
  completion.resolve({ status: 'saved', file, persisted: true });
  await vi.runAllTimersAsync();
  expect(source.postMessage).not.toHaveBeenCalled();
  dispose();
  dispose();
  message(host, { ...request, requestId: 2 }, source);
  await Promise.resolve();
  expect(services.write).toHaveBeenCalledTimes(1);
});

it('does not dispatch a file mutation if the accepted sender navigates before dispatch', async () => {
  const { host } = browser();
  const source = { postMessage: vi.fn() };
  const frame = {
    contentWindow: source,
    dataset: { htmlWindow: 'blog' },
    src: `${origin}/blog/`,
    isConnected: true,
  };
  vi.stubGlobal('document', { querySelectorAll: () => [frame] });
  const services: NativeFileServices = {
    read: () => ({ status: 'read', file }),
    write: vi.fn(() => ({ status: 'saved' as const, file, persisted: true })),
    saveAs: async () => ({ status: 'cancelled' }),
    open: () => ({ status: 'opened' }),
  };
  const dispose = mountNativeFileHost(services);
  message(
    host,
    { ...base, operation: 'write', fileId: 'notes', content: 'Stale', revision: 3 },
    source,
  );
  frame.src = `${origin}/about/`;
  await vi.runAllTimersAsync();
  expect(services.write).not.toHaveBeenCalled();
  expect(source.postMessage).not.toHaveBeenCalled();
  dispose();
});

it.each([
  { appId: 'blog', instance: 'blog:file:notes', stable: true, path: '/blog/?file=notes' },
  { appId: 'acdsee', instance: 'acdsee:file:photo', stable: true, path: '/acdsee/?file=photo' },
  { appId: 'blog', instance: 'blog', stable: false, path: '/blog/?file=notes' },
  { appId: 'acdsee', instance: 'acdsee', stable: false, path: '/acdsee/?file=photo' },
])('serves $instance through its validated application identity', async (client) => {
  const { host } = browser();
  const source = { postMessage: vi.fn() };
  const frame = {
    contentWindow: source,
    dataset: { htmlWindow: client.instance, ...(client.stable ? { htmlApp: client.appId } : {}) },
    src: `${origin}${client.path}`,
    isConnected: true,
  };
  vi.stubGlobal('document', { querySelectorAll: () => [frame] });
  const result: NativeFileResult =
    client.appId === 'blog'
      ? { status: 'read', file }
      : {
          status: 'read',
          file: {
            kind: 'image',
            id: 'photo',
            title: 'Photo.png',
            blob: new Blob(['image'], { type: 'image/png' }),
            mime: 'image/png',
            revision: 0,
            readonly: false,
          },
        };
  const services: NativeFileServices = {
    read: vi.fn(() => result),
    write: vi.fn(() => ({ status: 'cancelled' as const })),
    saveAs: async () => ({ status: 'cancelled' }),
    open: () => ({ status: 'opened' }),
  };
  const dispose = mountNativeFileHost(services);
  const request = { ...base, operation: 'read', fileId: result.file.id };
  message(host, request, {});
  message(host, request, source, 'https://other.example');
  await vi.runAllTimersAsync();
  expect(services.read).not.toHaveBeenCalled();
  message(host, request, source);
  await vi.runAllTimersAsync();
  expect(services.read).toHaveBeenCalledExactlyOnceWith(result.file.id);
  expect(source.postMessage).toHaveBeenCalledExactlyOnceWith(
    { type: 'doom95:file-result', session: base.session, requestId: base.requestId, result },
    origin,
  );
  dispose();
});

it.each([
  { htmlWindow: 'blog:file:notes', htmlApp: 'blog', path: '/acdsee/' },
  { htmlWindow: 'acdsee:file:photo', htmlApp: 'acdsee', path: '/blog/' },
  { htmlWindow: 'blog', htmlApp: 'unknown', path: '/blog/' },
  { htmlWindow: 'blog:file:notes', path: '/blog/' },
  { htmlWindow: 'acdsee:file:photo', path: '/acdsee/' },
  { htmlWindow: 'blog:file:notes', htmlApp: 'blog', path: '/apps/notepad/' },
  {
    htmlWindow: 'blog:file:notes',
    htmlApp: 'blog',
    path: '/blog/',
    frameOrigin: 'https://other.example',
  },
])('rejects an unregistered or mismatched host client %j', async (client) => {
  const { host } = browser();
  const source = { postMessage: vi.fn() };
  const { path, frameOrigin, ...dataset } = client;
  const frame = {
    contentWindow: source,
    dataset,
    src: `${frameOrigin ?? origin}${path}`,
    isConnected: true,
  };
  vi.stubGlobal('document', { querySelectorAll: () => [frame] });
  const services: NativeFileServices = {
    read: vi.fn(() => ({ status: 'read' as const, file })),
    write: vi.fn(() => ({ status: 'cancelled' as const })),
    saveAs: async () => ({ status: 'cancelled' }),
    open: () => ({ status: 'opened' }),
  };
  const dispose = mountNativeFileHost(services);
  message(host, { ...base, operation: 'read', fileId: 'notes' }, source);
  await vi.runAllTimersAsync();
  expect(services.read).not.toHaveBeenCalled();
  expect(source.postMessage).not.toHaveBeenCalled();
  dispose();
});

it.each(['blog', 'acdsee'])(
  'keeps replies and pending lifetimes separate for two %s file windows',
  async (appId) => {
    const { host } = browser();
    const first = { postMessage: vi.fn() };
    const second = { postMessage: vi.fn() };
    const frames = [first, second].map((source, index) => ({
      contentWindow: source,
      dataset: { htmlWindow: `${appId}:file:${index}`, htmlApp: appId },
      src: `${origin}${appId === 'blog' ? '/blog/' : '/acdsee/'}?file=${index}`,
      isConnected: true,
    }));
    vi.stubGlobal('document', { querySelectorAll: () => frames });
    const completions = [
      Promise.withResolvers<NativeFileResult>(),
      Promise.withResolvers<NativeFileResult>(),
    ];
    const services: NativeFileServices = {
      read: vi.fn((id) => completions[Number(id)].promise),
      write: () => ({ status: 'cancelled' }),
      saveAs: async () => ({ status: 'cancelled' }),
      open: () => ({ status: 'opened' }),
    };
    const dispose = mountNativeFileHost(services);
    message(host, { ...base, operation: 'read', fileId: '0' }, first);
    message(host, { ...base, operation: 'read', fileId: '1' }, second);
    await Promise.resolve();
    expect(services.read).toHaveBeenCalledTimes(2);
    completions[1].resolve({ status: 'read', file: { ...file, id: '1', text: 'Second file' } });
    await vi.runAllTimersAsync();
    expect(first.postMessage).not.toHaveBeenCalled();
    expect(second.postMessage).toHaveBeenCalledExactlyOnceWith(
      {
        type: 'doom95:file-result',
        session: base.session,
        requestId: base.requestId,
        result: { status: 'read', file: { ...file, id: '1', text: 'Second file' } },
      },
      origin,
    );
    frames[0].isConnected = false;
    completions[0].resolve({ status: 'read', file: { ...file, id: '0', text: 'First file' } });
    await vi.runAllTimersAsync();
    expect(first.postMessage).not.toHaveBeenCalled();
    message(host, { ...base, requestId: 2, operation: 'read', fileId: '1' }, second);
    await vi.runAllTimersAsync();
    expect(services.read).toHaveBeenCalledTimes(3);
    expect(second.postMessage).toHaveBeenCalledTimes(2);
    dispose();
  },
);
