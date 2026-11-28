import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { clockApp } from './clock.app';
import { appTestFixture } from '../testing/app-test-fixture';
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const setup = () => {
  let realTime = 0;
  vi.stubGlobal('performance', { now: () => realTime });
  const c = appTestFixture(
    clockApp,
    { now: () => realTime / 1000 },
    { x: 0, y: 0, w: 236, h: 184 },
  );
  return {
    ...c,
    input: (time: number, typed?: string, key?: string) => {
      realTime = time * 1000;
      c.send({ typed, key }, { t: time });
    },
    setRealTime: (time: number) => {
      realTime = time;
    },
  };
};

describe('Clock session timers', () => {
  it('finishes while the host keeps a window minimized and releases its timer on dispose', () => {
    const { session, input, env, setRealTime } = setup();
    input(0, '3c-----');
    input(1, undefined, ' ');
    // A minimized/background host may stop advancing its animation time.
    setRealTime(3000);
    vi.advanceTimersByTime(250);
    expect(env.play).toHaveBeenCalledExactlyOnceWith('ding');
    session.dispose();
    session.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(env.play).toHaveBeenCalledTimes(1);
  });
  it('keeps stopwatch time while switching views and supports keyboard pause/reset', () => {
    const { session, input } = setup();
    input(0, '3');
    input(1, undefined, ' ');
    input(3, '1');
    input(5, '3');
    expect(session.status()).toBe('Stopwatch running | 00:00:04.00');
    input(6, undefined, ' ');
    input(20);
    expect(session.status()).toBe('Stopwatch paused | 00:00:05.00');
    input(21, 'r');
    expect(session.status()).toBe('Stopwatch paused | 00:00:00.00');
    session.dispose();
  });

  it('announces countdown completion once while another clock view is visible', () => {
    const { env, session, input } = setup();
    input(0, '3c');
    for (let time = 1; time <= 5; time += 1) input(time, '-');
    expect(session.status()).toBe('Countdown ready | 00:00:01');
    input(6, undefined, ' ');
    input(6.5, '1');
    input(10);
    expect(session.status()).toContain('Timer finished');
    input(11);
    expect(env.play).toHaveBeenCalledExactlyOnceWith('ding');
    session.dispose();
    session.dispose();
    input(20);
    expect(env.play).toHaveBeenCalledTimes(1);
    const fresh = setup();
    expect(fresh.session.status()).toContain('Local time');
    fresh.session.dispose();
  });
});
