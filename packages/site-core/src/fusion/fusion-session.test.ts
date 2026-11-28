import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createFusionSession, FUSION_TIMING, type FusionSession } from './fusion-session';
import type { FusionMessage, FusionPayload } from './protocol-model';

const sessionId = 'session-1234';

/** Build an inbound envelope without going through the role adapter. */
function inbound(session: string, request: number, payload: Record<string, unknown>) {
  return { ns: 'mhk-fusion', version: 1, session, request, ...payload };
}
function lastRequest(messages: FusionMessage[]): number {
  return messages.at(-1)!.request;
}

function harness(
  options: { session?: string; timeoutMs?: number; adoptSessionOnHello?: boolean } = {},
) {
  const messages: FusionMessage[] = [];
  const session: FusionSession = createFusionSession({
    transmit: (message) => messages.push(message),
    session: options.session ?? sessionId,
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.adoptSessionOnHello !== undefined
      ? { adoptSessionOnHello: options.adoptSessionOnHello }
      : {}),
  });
  return { session, messages };
}

describe('fusion session mechanics', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('numbers outgoing requests monotonically on one session', () => {
    const { session, messages } = harness();
    expect(session.next({ type: 'hello' })).toBe(1);
    expect(session.next({ type: 'resume' })).toBe(2);
    expect(messages).toMatchObject([
      { ns: 'mhk-fusion', version: 1, session: sessionId, request: 1, type: 'hello' },
      { ns: 'mhk-fusion', version: 1, session: sessionId, request: 2, type: 'resume' },
    ]);
    expect(session.session).toBe(sessionId);
  });

  it('stays silent without a session and consumes a request when the transport throws', () => {
    const without = harness({ session: '' });
    expect(without.session.next({ type: 'hello' })).toBeUndefined();
    expect(without.messages).toHaveLength(0);

    let broken = true;
    const failing = createFusionSession({
      session: sessionId,
      transmit: () => {
        if (broken) throw new Error('transport down');
      },
    });
    expect(failing.next({ type: 'hello' })).toBeUndefined();
    broken = false;
    // A thrown transmit still consumed its request number.
    expect(failing.next({ type: 'hello' })).toBe(2);
  });

  it('accepts only valid envelopes from its session and maintains the watermark', () => {
    const { session } = harness();
    expect(session.accept({ ...inbound(sessionId, 1, { type: 'ready' }), ns: 'other' })).toBeNull();
    expect(session.accept({ ...inbound(sessionId, 1, { type: 'ready' }), version: 2 })).toBeNull();
    expect(session.accept(inbound('session-5678', 1, { type: 'ready' }))).toBeNull();
    expect(session.accept(inbound(sessionId, 2, { type: 'ready' }))).toMatchObject({ request: 2 });
    expect(session.accept(inbound(sessionId, 2, { type: 'startup' }))).toBeNull();
    expect(session.accept(inbound(sessionId, 1, { type: 'startup' }))).toBeNull();
    expect(session.accept(inbound(sessionId, 3, { type: 'startup' }))).toMatchObject({
      request: 3,
    });
  });

  it('adopts a new parent session only when enabled and only through hello', () => {
    const { session } = harness({ adoptSessionOnHello: true });
    session.accept(inbound(sessionId, 5, { type: 'ready' }));
    expect(session.accept(inbound('session-5678', 6, { type: 'resume' }))).toBeNull();
    expect(session.accept(inbound('session-5678', 1, { type: 'hello' }))).toMatchObject({
      session: 'session-5678',
      request: 1,
    });
    expect(session.session).toBe('session-5678');
    // The adopted session restarts the outgoing sequence from zero.
    expect(session.next({ type: 'ready' })).toBe(1);
    // Its watermark restarted too: a request the old session already passed is new.
    expect(session.accept(inbound('session-5678', 9, { type: 'resume' }))).not.toBeNull();
  });

  it('rejects a foreign hello by default without resetting session, watermark or waits', async () => {
    const { session, messages } = harness();
    session.accept(inbound(sessionId, 1, { type: 'ready' }));
    const pending = session.wait({ type: 'navigate', destination: { kind: 'home' } });
    const request = lastRequest(messages);
    expect(session.accept(inbound('session-5678', 50, { type: 'hello' }))).toBeNull();
    expect(session.session).toBe(sessionId);
    expect(vi.getTimerCount()).toBe(1);
    // The watermark stayed at 1: a request below the rejected hello still lands.
    session.accept(
      inbound(sessionId, request + 1, {
        type: 'ready',
        acknowledged: request,
      }),
    );
    await expect(pending).resolves.toMatchObject({ type: 'ready', acknowledged: request });
  });

  it('resolves a wait with the matching acknowledgement message', async () => {
    const { session, messages } = harness();
    const pending = session.wait({ type: 'navigate', destination: { kind: 'home' } });
    const request = lastRequest(messages);
    expect(
      session.accept(inbound(sessionId, request + 1, { type: 'ready', acknowledged: request })),
    ).not.toBeNull();
    await expect(pending).resolves.toMatchObject({ type: 'ready', acknowledged: request });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resolves a suspension acknowledgement with its destination', async () => {
    const { session, messages } = harness();
    const pending = session.wait({ type: 'suspend' });
    const request = lastRequest(messages);
    session.accept(
      inbound(sessionId, request + 1, {
        type: 'suspended',
        acknowledged: request,
        destination: { kind: 'article', id: 'notes' },
      }),
    );
    await expect(pending).resolves.toMatchObject({
      type: 'suspended',
      destination: { kind: 'article', id: 'notes' },
    });
  });

  it('rejects a matching failure with the caller text and no role-specific copy', async () => {
    const { session, messages } = harness();
    const pending = session.wait(
      { type: 'navigate', destination: { kind: 'home' } },
      { failureMessage: 'Desktop content could not open.' },
    );
    const request = lastRequest(messages);
    session.accept(inbound(sessionId, request + 1, { type: 'failed', acknowledged: request }));
    await expect(pending).rejects.toThrow('Desktop content could not open.');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores acknowledgement types outside the default set', async () => {
    const { session, messages } = harness();
    const pending = session.wait({ type: 'navigate', destination: { kind: 'home' } });
    const request = lastRequest(messages);
    session.accept(
      inbound(sessionId, request + 1, {
        type: 'reading-ack',
        acknowledged: request,
        state: { version: 1, documents: {} },
      }),
    );
    // An unrelated acknowledgement advances the watermark but leaves the wait pending.
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(100);
    session.accept(
      inbound(sessionId, request + 2, {
        type: 'ready',
        acknowledged: request,
      }),
    );
    await expect(pending).resolves.toMatchObject({ type: 'ready', acknowledged: request });
  });

  it('honors a role-specific acknowledgement expectation', async () => {
    const { session, messages } = harness();
    const pending = session.wait({ type: 'suspend' }, { expect: ['suspended', 'failed'] });
    const request = lastRequest(messages);
    session.accept(inbound(sessionId, request + 1, { type: 'ready', acknowledged: request }));
    expect(vi.getTimerCount()).toBe(1);
    session.accept(
      inbound(sessionId, request + 2, {
        type: 'suspended',
        acknowledged: request,
        destination: { kind: 'blog' },
      }),
    );
    await expect(pending).resolves.toMatchObject({
      type: 'suspended',
      destination: { kind: 'blog' },
    });
  });

  it('times out with the caller message and releases its timer', async () => {
    const { session } = harness({ timeoutMs: 1000 });
    const pending = session.wait(
      { type: 'suspend' },
      { timeoutMs: 250, timeoutMessage: 'Desktop did not confirm suspension.' },
    );
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(250);
    await expect(pending).rejects.toThrow('Desktop did not confirm suspension.');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back to the factory timeout and a default message', async () => {
    const { session } = harness({ timeoutMs: 300 });
    const pending = session.wait({ type: 'navigate', destination: { kind: 'home' } });
    vi.advanceTimersByTime(300);
    await expect(pending).rejects.toThrow('Desktop did not acknowledge the request.');
  });

  it('rejects an aborted wait, releases everything, and ignores a late acknowledgement', async () => {
    const { session, messages } = harness();
    const controller = new AbortController();
    const pending = session.wait(
      { type: 'navigate', destination: { kind: 'home' } },
      { signal: controller.signal },
    );
    controller.abort();
    await expect(pending).rejects.toThrow('Handoff cancelled.');
    expect(vi.getTimerCount()).toBe(0);
    expect(
      session.accept(inbound(sessionId, 2, { type: 'ready', acknowledged: lastRequest(messages) })),
    ).not.toBeNull();
  });

  it('does not send or register a wait on an already aborted signal', async () => {
    const { session, messages } = harness();
    const controller = new AbortController();
    controller.abort();
    await expect(session.wait({ type: 'suspend' }, { signal: controller.signal })).rejects.toThrow(
      'Handoff cancelled.',
    );
    expect(messages).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases a wait whose transport throws', async () => {
    const session = createFusionSession({
      session: sessionId,
      transmit: () => {
        throw new Error('transport down');
      },
    });
    await expect(session.wait({ type: 'hello' })).rejects.toThrow('Desktop is unavailable.');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports the request before transmitting so synchronous replies stay correlated', async () => {
    const requests: number[] = [];
    let session!: FusionSession;
    session = createFusionSession({
      session: sessionId,
      transmit: (message) => {
        if (message.type !== 'suspend') return;
        // A synchronous transport answers before send() returns.
        session.accept(
          inbound(sessionId, message.request + 1, {
            type: 'suspended',
            acknowledged: message.request,
            destination: { kind: 'home' },
          }),
        );
      },
    });
    const pending = session.wait(
      { type: 'suspend' },
      { onRequest: (request) => requests.push(request) },
    );
    expect(requests).toEqual([1]);
    await expect(pending).resolves.toMatchObject({ type: 'suspended' });
  });

  it('reports the request even when the transport throws', async () => {
    const requests: number[] = [];
    const session = createFusionSession({
      session: sessionId,
      transmit: () => {
        throw new Error('transport down');
      },
    });
    await expect(
      session.wait({ type: 'suspend' }, { onRequest: (request) => requests.push(request) }),
    ).rejects.toThrow('Desktop is unavailable.');
    expect(requests).toEqual([1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reset rejects pending waits, adopts the given session and restarts numbering', async () => {
    const { session, messages } = harness();
    const pending = session.wait({ type: 'suspend' });
    expect(lastRequest(messages)).toBe(1);
    session.reset('session-5678');
    await expect(pending).rejects.toThrow('Desktop connection closed.');
    expect(session.session).toBe('session-5678');
    expect(session.next({ type: 'hello' })).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reset without a session generates a fresh valid one', () => {
    const { session } = harness();
    session.reset();
    expect(session.session).not.toBe(sessionId);
    expect(session.session).toMatch(/^[a-zA-Z0-9-]{8,80}$/);
  });

  it('dispose is idempotent, rejects pending waits, and ignores later traffic', async () => {
    const { session, messages } = harness();
    const request = 1;
    const pending: Promise<FusionMessage> = session.wait({ type: 'suspend' });
    expect(lastRequest(messages)).toBe(request);
    session.dispose();
    session.dispose();
    await expect(pending).rejects.toThrow('Desktop connection closed.');
    expect(vi.getTimerCount()).toBe(0);
    expect(session.next({ type: 'resume' })).toBeUndefined();
    expect(
      session.accept(inbound(sessionId, 2, { type: 'ready', acknowledged: request })),
    ).toBeNull();
    await expect(session.wait({ type: 'hello' } as FusionPayload)).rejects.toThrow(
      'Desktop is unavailable.',
    );
  });

  it('keeps guest readiness ahead of the host connection timeout', () => {
    expect(FUSION_TIMING.readinessTimeoutMs).toBeLessThan(FUSION_TIMING.connectionTimeoutMs);
    expect(FUSION_TIMING.helloIntervalMs).toBeGreaterThan(0);
    expect(FUSION_TIMING.readinessPollMs).toBeGreaterThan(0);
  });
});
