import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createTextClipboard } from './text-clipboard';

afterEach(() => vi.unstubAllGlobals());

describe('shared text clipboard', () => {
  it('keeps an in-memory string when the browser clipboard is missing', async () => {
    vi.stubGlobal('navigator', {});
    const clipboard = createTextClipboard();
    expect(await clipboard.read()).toBeNull();
    expect(await clipboard.write('hello')).toBe(true);
    expect(await clipboard.read()).toBe('hello');
  });

  it('uses a successful browser clipboard and falls back after a rejected read', async () => {
    const writeText = vi.fn(async () => undefined);
    const readText = vi.fn(async () => 'browser');
    vi.stubGlobal('navigator', { clipboard: { writeText, readText } });
    const clipboard = createTextClipboard();
    expect(await clipboard.write('local')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('local');
    expect(await clipboard.read()).toBe('browser');
    readText.mockRejectedValueOnce(new Error('denied'));
    expect(await clipboard.read()).toBe('browser');
  });

  it('keeps the memory copy when the browser write is denied', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn(async () => {
          throw new Error('denied');
        }),
        readText: vi.fn(async () => {
          throw new Error('denied');
        }),
      },
    });
    const clipboard = createTextClipboard();
    expect(await clipboard.read()).toBeNull();
    expect(await clipboard.write('kept')).toBe(true);
    expect(await clipboard.read()).toBe('kept');
  });

  it('pastes the latest internal copy when writing is denied but reading old system text succeeds', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('write denied');
    });
    const readText = vi.fn(async () => 'old system text');
    vi.stubGlobal('navigator', { clipboard: { writeText, readText } });
    const clipboard = createTextClipboard();
    expect(await clipboard.read()).toBe('old system text');
    expect(await clipboard.write('new assistant reply')).toBe(true);
    expect(await clipboard.read()).toBe('new assistant reply');
    expect(await clipboard.read()).toBe('new assistant reply');
    expect(readText).toHaveBeenCalledTimes(1);
  });

  it('uses its copy when the browser offers reading without a write API', async () => {
    const readText = vi.fn(async () => 'old system text');
    vi.stubGlobal('navigator', { clipboard: { readText } });
    const clipboard = createTextClipboard();
    expect(await clipboard.write('internal copy')).toBe(true);
    expect(await clipboard.read()).toBe('internal copy');
    expect(readText).not.toHaveBeenCalled();
  });

  it('returns to normal system reads after a later copy reaches the system clipboard', async () => {
    const writeText = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('write denied'))
      .mockResolvedValue(undefined);
    const readText = vi.fn(async () => 'external clipboard text');
    vi.stubGlobal('navigator', { clipboard: { writeText, readText } });
    const clipboard = createTextClipboard();
    await clipboard.write('internal copy');
    expect(await clipboard.read()).toBe('internal copy');
    await clipboard.write('synchronized copy');
    expect(await clipboard.read()).toBe('external clipboard text');
    expect(readText).toHaveBeenCalledTimes(1);
  });

  it('keeps an immediate paste available while a system write is pending and restores synchronization afterward', async () => {
    const write = Promise.withResolvers<void>();
    const writeText = vi.fn(() => write.promise);
    const readText = vi.fn(async () => 'external clipboard text');
    vi.stubGlobal('navigator', { clipboard: { writeText, readText } });
    const clipboard = createTextClipboard();
    const copy = clipboard.write('pending copy');
    expect(await clipboard.read()).toBe('pending copy');
    write.resolve();
    expect(await copy).toBe(true);
    expect(await clipboard.read()).toBe('external clipboard text');
  });

  it('does not let a slow read replace a later accepted copy', async () => {
    const read = Promise.withResolvers<string>();
    const readText = vi
      .fn()
      .mockReturnValueOnce(read.promise)
      .mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { readText } });
    const clipboard = createTextClipboard();
    const pending = clipboard.read();
    await clipboard.write('new copy');
    read.resolve('old browser text');
    expect(await pending).toBe('old browser text');
    expect(await clipboard.read()).toBe('new copy');
  });

  it('keeps the result of the latest read when reads complete out of order', async () => {
    const first = Promise.withResolvers<string>();
    const second = Promise.withResolvers<string>();
    const readText = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { readText } });
    const clipboard = createTextClipboard();
    const oldRead = clipboard.read();
    const newRead = clipboard.read();
    second.resolve('new text');
    expect(await newRead).toBe('new text');
    first.resolve('old text');
    expect(await oldRead).toBe('old text');
    expect(await clipboard.read()).toBe('new text');
  });
});
