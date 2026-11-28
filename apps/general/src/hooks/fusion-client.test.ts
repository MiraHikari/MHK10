import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { parseReaderState, type ReaderState } from '@mhk/site-core/fusion/reading-model';
import type { FusionDestination, FusionMessage } from '@mhk/site-core/fusion/protocol-model';
import { FUSION_TIMING } from '@mhk/site-core/fusion/fusion-session';
import type { FusionReadingStore } from '@mhk/site-core/fusion/reading-sync-model';
import {
  createFusionClient,
  needsDesktopNavigation,
  type FusionClientEvents,
} from './fusion-client';

const session = 'session-1234';
const article: FusionDestination = { kind: 'article', id: 'notes', anchor: 'part-one' };
const profile: FusionDestination = { kind: 'profile' };

function state(progress: number): ReaderState {
  const value = parseReaderState(null);
  value.documents.book = {
    progress,
    anchor: '',
    lastOpened: 1,
    bookmarks: [],
    notes: [],
  };
  return value;
}

function harness(options: { wireError?: (error: string) => string; sharedTiming?: boolean } = {}) {
  const messages: FusionMessage[] = [];
  let current = state(0.1);
  let listener: (() => void) | undefined;
  const merge = vi.fn<FusionReadingStore['merge']>(() => ({ status: 'merged' }));
  const reading: FusionReadingStore = {
    read: () => current,
    merge,
    subscribe: (next) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
  };
  const events: FusionClientEvents = {
    onStartup: vi.fn(),
    onReady: vi.fn(),
    onFailure: vi.fn(),
    onRequestClassic: vi.fn(),
    onSyncError: vi.fn(),
  };
  const client = createFusionClient({
    session,
    initialDestination: { kind: 'home' },
    transmit: (message) => messages.push(message),
    reading,
    events,
    ...(options.sharedTiming ? {} : { timeoutMs: 1000, helloIntervalMs: 100 }),
    ...(options.wireError ? { wireError: options.wireError } : {}),
  });
  return {
    client,
    messages,
    events,
    merge,
    setState(next: ReaderState) {
      current = next;
    },
    notify() {
      listener?.();
    },
    get subscribed() {
      return listener !== undefined;
    },
  };
}

function incoming(payload: Record<string, unknown>): Record<string, unknown> {
  return { ns: 'mhk-fusion', version: 1, session, ...payload };
}
function ofType(messages: FusionMessage[], type: FusionMessage['type']) {
  return messages.filter((message) => message.type === type);
}
function ready(host: ReturnType<typeof harness>) {
  host.client.start();
  host.client.receive(incoming({ request: 1, type: 'ready' }));
}

describe('classic-site fusion client', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('completes the handshake once and publishes reading after readiness', () => {
    const host = harness();
    host.client.start();
    expect(host.client.connected).toBe(false);
    expect(ofType(host.messages, 'hello')).toHaveLength(1);
    vi.advanceTimersByTime(200);
    expect(ofType(host.messages, 'hello')).toHaveLength(3);
    host.client.receive(incoming({ request: 1, type: 'ready' }));
    expect(host.client.connected).toBe(true);
    expect(host.events.onReady).toHaveBeenCalledOnce();
    expect(ofType(host.messages, 'reading')).toHaveLength(1);
    vi.advanceTimersByTime(500);
    expect(ofType(host.messages, 'hello')).toHaveLength(3);
    host.client.receive(incoming({ request: 2, type: 'ready' }));
    expect(host.events.onReady).toHaveBeenCalledOnce();
    expect(ofType(host.messages, 'reading')).toHaveLength(1);
  });
  it('surfaces desktop startup without claiming content readiness', () => {
    const host = harness();
    host.client.start();
    host.client.receive(incoming({ request: 1, type: 'startup' }));
    expect(host.events.onStartup).toHaveBeenCalledOnce();
    expect(host.events.onReady).not.toHaveBeenCalled();
    expect(host.client.connected).toBe(false);
    host.client.receive(incoming({ request: 2, type: 'ready' }));
    expect(host.client.connected).toBe(true);
    host.client.receive(incoming({ request: 3, type: 'startup' }));
    expect(host.events.onStartup).toHaveBeenCalledOnce();
  });
  it('fails immediately when the desktop rejects the handshake instead of waiting out the timeout', () => {
    const host = harness();
    host.client.start();
    host.client.receive(incoming({ request: 1, type: 'failed', acknowledged: 1 }));
    expect(host.events.onFailure).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(2000);
    expect(host.events.onFailure).toHaveBeenCalledOnce();
    expect(ofType(host.messages, 'hello')).toHaveLength(1);
    // A new entry attempt re-arms the bounded handshake and can report again.
    host.client.beginAttempt();
    expect(ofType(host.messages, 'hello')).toHaveLength(2);
    vi.advanceTimersByTime(1000);
    expect(host.events.onFailure).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(300);
    expect(ofType(host.messages, 'hello').length).toBeGreaterThan(2);
  });
  it('marks the ready guest parked so a revealed startup resumes after readiness', () => {
    const host = harness();
    host.client.start();
    host.client.receive(incoming({ request: 1, type: 'startup' }));
    host.client.receive(incoming({ request: 2, type: 'ready' }));
    expect(host.client.connected).toBe(true);
    expect(host.client.parked).toBe(true);
    host.client.resume();
    expect(host.client.parked).toBe(false);
    expect(ofType(host.messages, 'resume')).toHaveLength(1);
  });
  it('correlates a navigation failure with its pending reply and keeps the session', () => {
    const host = harness();
    ready(host);
    const navigation = host.client.navigate(article);
    const request = ofType(host.messages, 'navigate').at(-1)!.request;
    host.client.receive(incoming({ request: 2, type: 'failed', acknowledged: request }));
    expect(host.events.onFailure).not.toHaveBeenCalled();
    expect(host.client.connected).toBe(true);
    return expect(navigation).rejects.toThrow('Desktop content could not open.');
  });
  it('ignores stale sessions, stale requests and uncorrelated failures', () => {
    const host = harness();
    host.client.start();
    host.client.receive({ ...incoming({ request: 1, type: 'ready' }), session: 'other-session' });
    expect(host.client.connected).toBe(false);
    host.client.receive(incoming({ request: 1, type: 'ready' }));
    host.client.receive(incoming({ request: 1, type: 'request-classic', destination: article }));
    expect(host.events.onRequestClassic).not.toHaveBeenCalled();
    host.client.receive(incoming({ request: 2, type: 'failed', acknowledged: 99 }));
    expect(host.events.onFailure).not.toHaveBeenCalled();
    expect(host.client.connected).toBe(true);
    host.client.receive(incoming({ request: 3, type: 'request-classic', destination: article }));
    expect(host.events.onRequestClassic).toHaveBeenCalledWith(article);
    expect(host.client.desktopDestination).toEqual(article);
  });
  it('stops handshake polling while a boot is suspended and re-arms on entry', async () => {
    const host = harness();
    host.client.start();
    vi.advanceTimersByTime(200);
    const suspension = host.client.suspend();
    const request = ofType(host.messages, 'suspend').at(-1)!.request;
    host.client.receive(
      incoming({ request: 2, type: 'suspended', acknowledged: request, destination: article }),
    );
    await expect(suspension).resolves.toEqual(article);
    const hellos = ofType(host.messages, 'hello').length;
    vi.advanceTimersByTime(1000);
    expect(ofType(host.messages, 'hello')).toHaveLength(hellos);
    host.client.beginAttempt();
    expect(ofType(host.messages, 'hello')).toHaveLength(hellos + 1);
  });
  it('parks a second cancelled connection even while the same document is still booting', () => {
    const host = harness();
    host.client.start();
    host.client.suspendOnly();
    host.client.beginAttempt();
    const hellos = ofType(host.messages, 'hello').length;

    host.client.suspendOnly();
    vi.advanceTimersByTime(FUSION_TIMING.connectionTimeoutMs);
    expect(ofType(host.messages, 'suspend')).toHaveLength(2);
    expect(ofType(host.messages, 'hello')).toHaveLength(hellos);
    expect(host.events.onFailure).not.toHaveBeenCalled();
  });
  it('resolves a suspension with the destination the desktop reports', async () => {
    const host = harness();
    ready(host);
    const suspension = host.client.suspend();
    const request = ofType(host.messages, 'suspend').at(-1)!.request;
    host.client.receive(
      incoming({ request: 2, type: 'suspended', acknowledged: request, destination: article }),
    );
    await expect(suspension).resolves.toEqual(article);
    expect(host.client.desktopDestination).toEqual(article);
  });
  it('rejects aborted and unanswered handoffs and ignores late acknowledgements', async () => {
    const host = harness();
    ready(host);
    const controller = new AbortController();
    const aborted = host.client.navigate(profile, controller.signal);
    const abortedRequest = ofType(host.messages, 'navigate').at(-1)!.request;
    controller.abort();
    await expect(aborted).rejects.toThrow('Handoff cancelled.');
    host.client.receive(incoming({ request: 2, type: 'ready', acknowledged: abortedRequest }));
    const timedOut = host.client.navigate(article);
    vi.advanceTimersByTime(1000);
    await expect(timedOut).rejects.toThrow('did not acknowledge');
    const suspended = host.client.suspend();
    vi.advanceTimersByTime(1000);
    await expect(suspended).rejects.toThrow('did not confirm suspension.');
  });
  it('keeps a stale delayed acknowledgement from resolving a later suspension', async () => {
    const host = harness();
    ready(host);
    const first = host.client.navigate(article);
    const firstRequest = ofType(host.messages, 'navigate').at(-1)!.request;
    vi.advanceTimersByTime(1000);
    await expect(first).rejects.toThrow('did not acknowledge');
    const suspension = host.client.suspend();
    const suspendRequest = ofType(host.messages, 'suspend').at(-1)!.request;
    host.client.receive(incoming({ request: 2, type: 'ready', acknowledged: firstRequest }));
    host.client.receive(
      incoming({
        request: 3,
        type: 'suspended',
        acknowledged: suspendRequest,
        destination: profile,
      }),
    );
    await expect(suspension).resolves.toEqual(profile);
  });
  it('detects destination drift before deciding the desktop is already there', () => {
    expect(needsDesktopNavigation(article, article, null)).toBe(true);
    expect(needsDesktopNavigation(article, article, article)).toBe(false);
    expect(needsDesktopNavigation(article, profile, article)).toBe(true);
    expect(needsDesktopNavigation(article, article, profile)).toBe(true);
  });
  it('clears a rejected reading snapshot so the next local edit syncs', () => {
    const host = harness();
    ready(host);
    const pending = ofType(host.messages, 'reading').at(-1)!;
    host.setState(state(0.4));
    host.client.share();
    expect(ofType(host.messages, 'reading')).toHaveLength(1);
    host.client.receive(
      incoming({
        request: 2,
        type: 'sync-error',
        acknowledged: pending.request,
        error: 'Conflict',
      }),
    );
    expect(host.events.onSyncError).toHaveBeenCalledWith('Conflict');
    host.setState(state(0.6));
    host.client.share();
    expect(ofType(host.messages, 'reading')).toHaveLength(2);
    expect(ofType(host.messages, 'reading').at(-1)).toMatchObject({ state: state(0.6) });
  });
  it('clears outgoing when the acknowledgement merge fails', () => {
    const host = harness();
    ready(host);
    const pending = ofType(host.messages, 'reading').at(-1)!;
    host.merge.mockReturnValue({ status: 'failed', error: 'changed elsewhere' });
    host.client.receive(
      incoming({
        request: 2,
        type: 'reading-ack',
        acknowledged: pending.request,
        state: state(0.1),
      }),
    );
    expect(host.events.onSyncError).toHaveBeenCalledWith('changed elsewhere');
    host.setState(state(0.8));
    host.client.share();
    expect(ofType(host.messages, 'reading')).toHaveLength(2);
  });
  it('keeps conflict detail local while sending the presentation-owned message to the peer', () => {
    const host = harness({ wireError: () => 'friendly conflict' });
    ready(host);
    host.merge.mockReturnValue({ status: 'failed', error: 'detailed conflict' });
    host.client.receive(
      incoming({
        request: 2,
        type: 'reading',
        baseline: parseReaderState(null),
        state: state(0.2),
      }),
    );
    expect(host.events.onSyncError).toHaveBeenCalledWith('detailed conflict');
    expect(ofType(host.messages, 'sync-error').at(-1)).toMatchObject({
      error: 'friendly conflict',
    });
  });
  it('parks the desktop once, resumes on demand, and releases everything on dispose', async () => {
    const host = harness();
    ready(host);
    host.client.resume();
    expect(host.client.parked).toBe(false);
    host.client.suspendOnly();
    host.client.suspendOnly();
    expect(host.client.parked).toBe(true);
    expect(ofType(host.messages, 'suspend')).toHaveLength(1);
    host.client.resume();
    expect(host.client.parked).toBe(false);
    host.client.suspendOnly();
    expect(ofType(host.messages, 'suspend')).toHaveLength(2);
    const pending = host.client.navigate(article);
    host.client.dispose();
    host.client.dispose();
    await expect(pending).rejects.toThrow('Desktop connection closed.');
    expect(host.subscribed).toBe(false);
    expect(ofType(host.messages, 'suspend').at(-1)).toBeDefined();
    const hellos = ofType(host.messages, 'hello').length;
    vi.advanceTimersByTime(1000);
    expect(ofType(host.messages, 'hello')).toHaveLength(hellos);
    host.client.beginAttempt();
    expect(ofType(host.messages, 'hello')).toHaveLength(hellos);
  });
  it('stays parked after an aborted suspension so the caller can wake it again', async () => {
    const host = harness();
    ready(host);
    const controller = new AbortController();
    const suspension = host.client.suspend(controller.signal);
    controller.abort();
    await expect(suspension).rejects.toThrow('Handoff cancelled.');
    expect(host.client.parked).toBe(true);
    host.client.resume();
    expect(host.client.parked).toBe(false);
    expect(ofType(host.messages, 'resume')).toHaveLength(1);
  });
  it('rejects a foreign-session hello without touching its session, watermark or waits', async () => {
    const host = harness();
    ready(host);
    const navigation = host.client.navigate(article);
    const request = ofType(host.messages, 'navigate').at(-1)!.request;
    host.client.receive({ ...incoming({ request: 50, type: 'hello' }), session: 'other-session' });
    expect(host.client.session).toBe(session);
    expect(host.client.connected).toBe(true);
    // The rejected hello did not advance the watermark: a normal request still lands.
    host.client.receive(incoming({ request: 2, type: 'ready', acknowledged: request }));
    await expect(navigation).resolves.toBeUndefined();
  });
  it('does not settle a navigation on an unrelated acknowledgement type', async () => {
    const host = harness();
    ready(host);
    const navigation = host.client.navigate(article);
    const request = ofType(host.messages, 'navigate').at(-1)!.request;
    host.client.receive(
      incoming({ request: 2, type: 'reading-ack', acknowledged: request, state: state(0.1) }),
    );
    vi.advanceTimersByTime(1000);
    await expect(navigation).rejects.toThrow('did not acknowledge');
    host.client.dispose();
  });
  it('drives handshake and wait timing from the shared fusion table', async () => {
    const host = harness({ sharedTiming: true });
    host.client.start();
    expect(ofType(host.messages, 'hello')).toHaveLength(1);
    vi.advanceTimersByTime(FUSION_TIMING.helloIntervalMs - 1);
    expect(ofType(host.messages, 'hello')).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(ofType(host.messages, 'hello')).toHaveLength(2);
    const navigation = host.client.navigate(article);
    vi.advanceTimersByTime(FUSION_TIMING.connectionTimeoutMs);
    await expect(navigation).rejects.toThrow('Desktop did not acknowledge content readiness.');
    expect(host.events.onFailure).toHaveBeenCalledOnce();
    host.client.dispose();
  });
});
