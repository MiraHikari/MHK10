import { describe, expect, it, vi } from 'vite-plus/test';
import {
  BOOT_CONTENT_TIMEOUT_MS,
  BOOT_INLINE_EXIT_TAIL_MS,
  BOOT_LAST_RESORT_MS,
  BOOT_MASK_SAFETY_MS,
  BOOT_READY_BUFFER_MS,
  createBootSequence,
  type BootTimers,
} from './boot-sequence';

/** Minimal timer port so timeout behaviour is driven without real waiting. */
function createTimers() {
  let nextId = 1;
  const pending = new Map<number, { callback: () => void; delay: number }>();

  const timers: BootTimers = {
    setTimeout: (callback, delay) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (handle) => {
      if (typeof handle === 'number') pending.delete(handle);
    },
  };

  return {
    timers,
    pendingCount: () => pending.size,
    pendingDelays: () => [...pending.values()].map((entry) => entry.delay),
    runAll() {
      const entries = [...pending.values()];
      pending.clear();
      for (const entry of entries) entry.callback();
    },
  };
}

describe('createBootSequence', () => {
  for (const [first, second] of [
    ['inline', 'app'],
    ['app', 'inline'],
  ] as const) {
    it(`lets the first completer win when ${first} completes first`, () => {
      const fake = createTimers();
      const sequence = createBootSequence({ timers: fake.timers });
      const calls: string[] = [];
      sequence.subscribe(() => calls.push('complete'));

      sequence.complete(first);
      sequence.complete(second);

      expect(sequence.completed).toBe(true);
      expect(sequence.owner).toBe(first);
      expect(calls).toEqual(['complete']);
      expect(fake.pendingCount()).toBe(0);
    });
  }

  it('treats repeated completion by the same owner as a no-op', () => {
    const fake = createTimers();
    const sequence = createBootSequence({ timers: fake.timers });
    let calls = 0;
    sequence.subscribe(() => {
      calls += 1;
    });

    sequence.complete('inline');
    sequence.complete('inline');
    sequence.complete('inline');

    expect(calls).toBe(1);
    expect(sequence.completed).toBe(true);
    expect(sequence.owner).toBe('inline');
  });

  it('has no winner while it is still open', () => {
    const fake = createTimers();
    const sequence = createBootSequence({ timers: fake.timers });
    expect(sequence.owner).toBeUndefined();
  });

  it('fires a late subscriber immediately and keeps unsubscribe idempotent', () => {
    const fake = createTimers();
    const sequence = createBootSequence({ timers: fake.timers });
    sequence.complete('inline');

    let calls = 0;
    const unsubscribe = sequence.subscribe(() => {
      calls += 1;
    });

    expect(calls).toBe(1);
    unsubscribe();
    unsubscribe();
    expect(calls).toBe(1);
  });

  it('stops notifying an unsubscribed listener', () => {
    const fake = createTimers();
    const sequence = createBootSequence({ timers: fake.timers });
    let calls = 0;
    const unsubscribe = sequence.subscribe(() => {
      calls += 1;
    });

    unsubscribe();
    sequence.complete('inline');

    expect(calls).toBe(0);
  });

  it('dispose releases listeners and the pending timeout exactly once', () => {
    const fake = createTimers();
    const sequence = createBootSequence({ timers: fake.timers });
    let calls = 0;
    sequence.subscribe(() => {
      calls += 1;
    });

    expect(fake.pendingCount()).toBe(1);
    sequence.dispose();
    sequence.dispose();
    expect(fake.pendingCount()).toBe(0);

    fake.runAll();
    expect(calls).toBe(0);
    expect(sequence.completed).toBe(false);

    sequence.complete('inline');
    expect(calls).toBe(0);
  });

  it('keeps fanning out when a subscriber throws', () => {
    const fake = createTimers();
    const sequence = createBootSequence({ timers: fake.timers });
    const order: string[] = [];

    sequence.subscribe(() => {
      order.push('first');
      throw new Error('subscriber failed');
    });
    sequence.subscribe(() => {
      order.push('second');
    });

    expect(() => sequence.complete('inline')).not.toThrow();
    expect(order).toEqual(['first', 'second']);
  });

  it('completes itself as the app owner after the content timeout', () => {
    const fake = createTimers();
    const sequence = createBootSequence({ timers: fake.timers });
    let calls = 0;
    sequence.subscribe(() => {
      calls += 1;
    });

    expect(fake.pendingDelays()).toEqual([BOOT_CONTENT_TIMEOUT_MS]);
    fake.runAll();

    expect(sequence.completed).toBe(true);
    expect(sequence.owner).toBe('app');
    expect(calls).toBe(1);

    sequence.complete('inline');
    expect(sequence.owner).toBe('app');
    expect(calls).toBe(1);
  });

  it('hands content over strictly before the inline deadline can fire', () => {
    expect(BOOT_CONTENT_TIMEOUT_MS + BOOT_READY_BUFFER_MS).toBeLessThan(BOOT_LAST_RESORT_MS);
  });

  it('keeps the mask release after every inline path has finished', () => {
    // The inline script completes at BOOT_LAST_RESORT_MS, then dismiss() holds
    // and runs an exit transition before removing the element.
    expect(BOOT_MASK_SAFETY_MS).toBeGreaterThanOrEqual(
      BOOT_LAST_RESORT_MS + BOOT_INLINE_EXIT_TAIL_MS,
    );
  });

  it('calls the global timers with the global receiver', async () => {
    // Browsers reject `timers.setTimeout(...)` on a stored `window.setTimeout`
    // with "Illegal invocation" because the receiver is the timer port object.
    // Record the receiver so a regression to the object-literal port fails here.
    const receivers: unknown[] = [];
    vi.stubGlobal('setTimeout', function (this: unknown) {
      receivers.push(this);
      return 1;
    });
    vi.stubGlobal('clearTimeout', function (this: unknown) {
      receivers.push(this);
    });
    try {
      vi.resetModules();
      const fresh = await import('./boot-sequence');
      const sequence = fresh.createBootSequence();
      sequence.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(receivers).toEqual([globalThis, globalThis]);
  });
});
