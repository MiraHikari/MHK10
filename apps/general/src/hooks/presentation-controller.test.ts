import { describe, expect, it } from 'vite-plus/test';
import {
  createPresentation,
  disposePresentation,
  getPresentation,
  type PresentationPorts,
} from './presentation-controller';
import type { DisplayMode } from './display-mode-model';

interface InitialPresentation {
  target: DisplayMode;
  visible: DisplayMode;
  failedThisSession?: unknown;
}

function fakePorts(initial: InitialPresentation = { target: 'classic', visible: 'classic' }) {
  const calls: string[] = [];
  const payloads: unknown[][] = [];
  const push = (name: string, ...args: unknown[]) => {
    calls.push(name);
    payloads.push(args);
  };
  const ports: PresentationPorts = {
    readInitial() {
      push('readInitial');
      return initial;
    },
    storage: {
      writeDisplayMode: (mode) => push('writeDisplayMode', mode),
      writeCooldown: (mode) => push('writeCooldown', mode),
      clearCooldown: () => push('clearCooldown'),
    },
    dom: {
      paint: (target, visible) => push('paint', target, visible),
      bootReady: () => push('bootReady'),
      focus: (selector) => push('focus', selector),
      flushReading: () => push('flushReading'),
      restoreReading: (destination) => push('restoreReading', destination),
    },
    consumeViewParam: () => push('consumeViewParam'),
  };
  return { ports, calls, payloads };
}

function payloadFor(payloads: unknown[][], calls: string[], name: string): unknown[] | undefined {
  const index = calls.indexOf(name);
  return index === -1 ? undefined : payloads[index];
}

describe('presentation controller: boot', () => {
  it('reads the prehydration facts, consumes the query once, then boots', () => {
    const { ports, calls, payloads } = fakePorts({ target: 'win95', visible: 'classic' });
    const controller = createPresentation(ports);
    controller.start();
    expect(calls).toEqual(['readInitial', 'consumeViewParam', 'paint']);
    expect(payloadFor(payloads, calls, 'paint')).toEqual(['win95', 'classic']);
    expect(controller.getSnapshot()).toMatchObject({
      target: 'win95',
      visible: 'classic',
      phase: 'connecting',
    });
  });

  it('is idempotent: repeated start calls read and consume once', () => {
    const { ports, calls } = fakePorts();
    const controller = createPresentation(ports);
    controller.start();
    controller.start();
    expect(calls.filter((call) => call === 'readInitial')).toHaveLength(1);
    expect(calls.filter((call) => call === 'consumeViewParam')).toHaveLength(1);
  });

  it('applies the failed-session cooldown passed by the inline reader', () => {
    const { ports, calls, payloads } = fakePorts({
      target: 'win95',
      visible: 'classic',
      failedThisSession: 'win95',
    });
    const controller = createPresentation(ports);
    controller.start();
    expect(controller.getSnapshot()).toMatchObject({
      target: 'classic',
      visible: 'classic',
      phase: 'idle',
      cooldown: 'win95',
    });
    expect(payloadFor(payloads, calls, 'paint')).toEqual(['classic', 'classic']);
  });

  it('never writes datasets or storage when presentation is disabled', () => {
    const { ports, calls } = fakePorts({ target: 'win95', visible: 'classic' });
    const controller = createPresentation(ports, { enabled: false });
    controller.start();
    controller.send({ type: 'request', target: 'win95' });
    expect(calls).toEqual(['readInitial', 'consumeViewParam']);
    expect(controller.getSnapshot()).toMatchObject({ target: 'classic', visible: 'classic' });
  });
});

describe('presentation controller: effects', () => {
  it('flushes reading and persists before painting the new target', () => {
    const { ports, calls } = fakePorts();
    const controller = createPresentation(ports);
    controller.start();
    controller.send({ type: 'request', target: 'win95' });
    expect(calls.slice(2)).toEqual(['flushReading', 'writeDisplayMode', 'paint']);
  });

  it('paints before it restores reading and focuses on a completed return', () => {
    const { ports, calls } = fakePorts({ target: 'win95', visible: 'classic' });
    const controller = createPresentation(ports);
    controller.start();
    controller.send({ type: 'startup', attempt: 1 });
    calls.length = 0;
    controller.send({
      type: 'classic-restored',
      attempt: 1,
      destination: { kind: 'article', id: 'notes' },
    });
    expect(calls).toEqual(['paint', 'restoreReading', 'focus']);
  });

  it('settles a cancelled handoff by painting classic and releasing the boot mask once', () => {
    const { ports, calls } = fakePorts({ target: 'win95', visible: 'classic' });
    const controller = createPresentation(ports);
    controller.start();
    controller.send({ type: 'request', target: 'classic' });
    calls.length = 0;
    controller.send({ type: 'commit', target: 'classic', attempt: 1 });
    expect(calls).toEqual(['paint', 'bootReady', 'focus']);
    expect(controller.getSnapshot()).toMatchObject({
      target: 'classic',
      visible: 'classic',
      phase: 'idle',
      pending: false,
    });
  });

  it('writes the cooldown, paints classic, signals boot, then focuses on failure', () => {
    const { ports, calls, payloads } = fakePorts({ target: 'win95', visible: 'classic' });
    const controller = createPresentation(ports);
    controller.start();
    calls.length = 0;
    payloads.length = 0;
    controller.send({ type: 'fail' });
    expect(calls).toEqual(['writeCooldown', 'paint', 'bootReady', 'focus']);
    expect(payloadFor(payloads, calls, 'writeCooldown')).toEqual(['win95']);
    expect(payloadFor(payloads, calls, 'paint')).toEqual(['classic', 'classic']);
    expect(controller.getSnapshot()).toMatchObject({
      target: 'classic',
      visible: 'classic',
      phase: 'failed',
      cooldown: 'win95',
    });
  });

  it('does not write a cooldown when a classic-return failure is reported', () => {
    const { ports, calls } = fakePorts({ target: 'win95', visible: 'classic' });
    const controller = createPresentation(ports);
    controller.start();
    controller.send({ type: 'commit', target: 'win95' });
    controller.send({ type: 'request', target: 'classic' });
    calls.length = 0;
    controller.send({ type: 'fail' });
    // The commit already released the boot mask, so the failure only returns
    // to classic and restores focus.
    expect(calls).toEqual(['paint', 'focus']);
    expect(controller.getSnapshot()).toMatchObject({
      target: 'classic',
      visible: 'classic',
      phase: 'failed',
      pending: false,
      cooldown: null,
    });
  });

  it('clears the session cooldown on an explicit retry and preserves it on a settled classic commit', () => {
    const { ports, calls } = fakePorts({ target: 'win95', visible: 'classic' });
    const controller = createPresentation(ports);
    controller.start();
    controller.send({ type: 'fail' });
    controller.send({ type: 'request', target: 'win95' });
    calls.length = 0;
    controller.send({ type: 'commit', target: 'win95' });
    expect(calls).toEqual(['paint']);
    expect(controller.getSnapshot().cooldown).toBeNull();

    // A failure followed by an acknowledgement of the already-visible classic
    // presentation is not a successful handoff: the cooldown must survive.
    controller.send({ type: 'fail' });
    calls.length = 0;
    controller.send({ type: 'commit', target: 'classic' });
    expect(calls).toEqual(['paint']);
    expect(controller.getSnapshot().cooldown).toBe('win95');
  });

  it('reveals the desktop and releases the boot mask once on startup', () => {
    const { ports, calls } = fakePorts({ target: 'win95', visible: 'classic' });
    const controller = createPresentation(ports);
    controller.start();
    calls.length = 0;
    controller.send({ type: 'startup', attempt: 1 });
    expect(calls).toEqual(['paint', 'bootReady']);
    expect(controller.getSnapshot()).toMatchObject({
      target: 'win95',
      visible: 'win95',
      phase: 'startup',
      pending: false,
    });
    calls.length = 0;
    controller.send({ type: 'startup', attempt: 1 });
    expect(calls).toEqual([]);
  });

  it('records readiness without revealing a hidden desktop', () => {
    const { ports, calls } = fakePorts({ target: 'win95', visible: 'classic' });
    const controller = createPresentation(ports);
    controller.start();
    calls.length = 0;
    controller.send({ type: 'ready', attempt: 1 });
    expect(calls).toEqual([]);
    expect(controller.getSnapshot()).toMatchObject({
      visible: 'classic',
      phase: 'ready',
      pending: true,
    });
  });

  it('drops attempt-tagged commits from an abandoned generation', () => {
    const { ports, calls } = fakePorts({ target: 'win95', visible: 'classic' });
    const controller = createPresentation(ports);
    controller.start();
    calls.length = 0;
    controller.send({ type: 'commit', target: 'win95', attempt: 0 });
    expect(calls).toEqual([]);
    controller.send({ type: 'commit', target: 'win95', attempt: 1 });
    expect(calls).toEqual(['paint', 'bootReady']);
  });

  it('dismisses the failure banner without clearing the cooldown', () => {
    const { ports, calls } = fakePorts({ target: 'win95', visible: 'classic' });
    const controller = createPresentation(ports);
    controller.start();
    controller.send({ type: 'fail' });
    calls.length = 0;
    controller.send({ type: 'failure-dismiss' });
    expect(calls).toEqual(['focus']);
    expect(controller.getSnapshot()).toMatchObject({
      target: 'classic',
      visible: 'classic',
      phase: 'idle',
      pending: false,
      cooldown: 'win95',
    });
  });

  it('paints, restores reading and focuses on a classic restoration', () => {
    const { ports, calls } = fakePorts({ target: 'win95', visible: 'classic' });
    const controller = createPresentation(ports);
    controller.start();
    controller.send({ type: 'startup', attempt: 1 });
    calls.length = 0;
    controller.send({
      type: 'classic-restored',
      attempt: 1,
      destination: { kind: 'article', id: 'colophon' },
    });
    expect(calls).toEqual(['paint', 'restoreReading', 'focus']);
    expect(controller.getSnapshot()).toMatchObject({
      target: 'classic',
      visible: 'classic',
      phase: 'idle',
      pending: false,
    });
  });
});

describe('presentation controller: subscription and disposal', () => {
  it('notifies only real state changes and unsubscribes', () => {
    const { ports } = fakePorts();
    const controller = createPresentation(ports);
    let notifications = 0;
    const unsubscribe = controller.subscribe(() => {
      notifications += 1;
    });
    controller.start();
    // Boot from classic to classic is not a change.
    expect(notifications).toBe(0);
    controller.send({ type: 'request', target: 'classic' });
    expect(notifications).toBe(0);
    controller.send({ type: 'request', target: 'win95' });
    expect(notifications).toBe(1);
    unsubscribe();
    controller.send({ type: 'request', target: 'classic' });
    expect(notifications).toBe(1);
  });

  it('stops accepting events and clears listeners after dispose', () => {
    const { ports, calls } = fakePorts();
    const controller = createPresentation(ports);
    let notifications = 0;
    controller.subscribe(() => {
      notifications += 1;
    });
    controller.start();
    controller.dispose();
    controller.dispose();
    calls.length = 0;
    controller.send({ type: 'request', target: 'win95' });
    expect(calls).toEqual([]);
    expect(notifications).toBe(0);
    expect(() => controller.dispose()).not.toThrow();
    // Subscribing to a disposed controller yields a harmless unsubscribe.
    const unsubscribe = controller.subscribe(() => undefined);
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe('presentation controller: browser singleton', () => {
  it('constructs and starts without a DOM (SSR-safe)', () => {
    expect(typeof document).toBe('undefined');
    const controller = getPresentation();
    expect(controller.getSnapshot()).toMatchObject({ target: 'classic', visible: 'classic' });
    expect(() => controller.start()).not.toThrow();
  });

  it('recreates a fresh controller after disposal (remount)', () => {
    const first = getPresentation();
    first.start();
    expect(first.isStarted()).toBe(true);
    disposePresentation();
    const second = getPresentation();
    expect(second).not.toBe(first);
    expect(second.isStarted()).toBe(false);
    second.start();
    expect(second.isStarted()).toBe(true);
  });
});
