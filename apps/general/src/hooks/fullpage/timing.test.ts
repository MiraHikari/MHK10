import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { delay } from './timing';

afterEach(() => vi.useRealTimers());

describe('a fullpage transition wait', () => {
  it('retains the full score until its deadline', async () => {
    vi.useFakeTimers();
    const wait = delay(320);
    await vi.advanceTimersByTimeAsync(319);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await wait).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases its timer when its scene is disposed', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const wait = delay(320, controller.signal);
    controller.abort();
    expect(await wait).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not arm a timer for an already disposed scene', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    controller.abort();
    expect(await delay(320, controller.signal)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
