import {
  sameDestination,
  type FusionDestination,
  type FusionMessage,
  type FusionPayload,
} from '@mhk/site-core/fusion/protocol-model';
import {
  createFusionSession,
  FUSION_TIMING,
  type FusionTimers,
} from '@mhk/site-core/fusion/fusion-session';
import {
  createFusionReadingSync,
  type FusionReadingStore,
} from '@mhk/site-core/fusion/reading-sync-model';

export type { FusionTimers } from '@mhk/site-core/fusion/fusion-session';

export const FUSION_CONNECTION_TIMEOUT_MS = FUSION_TIMING.connectionTimeoutMs;
export const FUSION_HELLO_INTERVAL_MS = FUSION_TIMING.helloIntervalMs;

export interface FusionReply {
  destination?: FusionDestination;
}
export interface FusionClientEvents {
  /**
   * The trusted desktop document is alive and has started its own startup
   * sequence. The parent may reveal it now: the desktop boot/splash is the
   * loading surface. Content readiness still arrives later as `ready`.
   */
  onStartup?(): void;
  /** The trusted desktop completed its content handshake. */
  onReady(): void;
  /** The handshake failed or timed out while the visitor still wants the desktop. */
  onFailure(): void;
  /** The desktop Start menu asked to hand control back to the classic site. */
  onRequestClassic(destination: FusionDestination): void;
  onSyncError(error: string): void;
}
export interface FusionClientOptions {
  transmit(message: FusionMessage): void;
  reading: FusionReadingStore;
  events: FusionClientEvents;
  initialDestination: FusionDestination;
  /** Peer-facing text for reading conflicts; the local toast keeps the detail. */
  wireError?: (error: string) => string;
  session?: string;
  timeoutMs?: number;
  helloIntervalMs?: number;
  timers?: FusionTimers;
}
export interface FusionClient {
  readonly session: string;
  readonly connected: boolean;
  /** A suspend was requested and no resume has been sent since. */
  readonly parked: boolean;
  /** Last destination the desktop reported; used to detect drift before entry. */
  readonly desktopDestination: FusionDestination;
  /** Destination the desktop was last confirmed to show. */
  readonly deliveredDestination: FusionDestination | null;
  start(): void;
  /** (Re)arm the handshake after a previous attempt failed while staying hidden. */
  beginAttempt(): void;
  receive(raw: unknown): void;
  share(force?: boolean): void;
  navigate(destination: FusionDestination, signal?: AbortSignal): Promise<void>;
  suspend(signal?: AbortSignal): Promise<FusionDestination>;
  /** Suspend without waiting; skipped when the desktop is already parked. */
  suspendOnly(): void;
  resume(): void;
  markDelivered(destination: FusionDestination): void;
  dispose(): void;
}

const defaultTimers: FusionTimers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof globalThis.setTimeout>),
  setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
  clearInterval: (id) => globalThis.clearInterval(id as ReturnType<typeof globalThis.setInterval>),
};

/** A navigation is acknowledged by readiness; a suspension by `suspended`. */
const NAVIGATION_REPLIES = ['ready', 'failed'] as const;
const SUSPENSION_REPLIES = ['suspended', 'failed'] as const;

/**
 * Desktop entry requires the desktop to actually show the classic site's current
 * destination, not merely the last destination this client asked for. A desktop
 * that navigated internally (or a cancelled return) therefore gets re-targeted
 * instead of resuming on stale content.
 */
export function needsDesktopNavigation(
  target: FusionDestination,
  desktopDestination: FusionDestination,
  deliveredDestination: FusionDestination | null,
): boolean {
  return (
    deliveredDestination === null ||
    !sameDestination(deliveredDestination, target) ||
    !sameDestination(desktopDestination, target)
  );
}

/**
 * One classic-site session with the embedded desktop: monotonic request
 * correlation, bounded waits, reading synchronization and presentation commands.
 * The transport and storage stay outside, so the state machine is independent of
 * the iframe and testable without a DOM.
 */
export function createFusionClient(options: FusionClientOptions): FusionClient {
  const timers = options.timers ?? defaultTimers;
  const helloIntervalMs = options.helloIntervalMs ?? FUSION_HELLO_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? FUSION_CONNECTION_TIMEOUT_MS;
  /** Request numbers whose `wait` Promise is still pending. */
  const awaited = new Set<number>();
  let connected = false;
  let disposed = false;
  let helloTimer: unknown;
  let failureTimer: unknown;
  let failureNotified = false;
  let suspension: 'awake' | 'asleep' = 'awake';
  let desktopDestination = options.initialDestination;
  let delivered: FusionDestination | null = null;

  const fusion = createFusionSession({
    transmit: (message) => options.transmit(message),
    ...(options.session !== undefined ? { session: options.session } : {}),
    timeoutMs,
    timers,
  });

  const reading = createFusionReadingSync({
    store: options.reading,
    post: (payload) => send(payload),
    onError: (error) => options.events.onSyncError(error),
    ...(options.wireError ? { wireError: options.wireError } : {}),
  });

  function send(payload: FusionPayload): number | undefined {
    return fusion.next(payload);
  }
  function clearHandshake(): void {
    if (helloTimer !== undefined) {
      timers.clearInterval(helloTimer);
      helloTimer = undefined;
    }
    if (failureTimer !== undefined) {
      timers.clearTimeout(failureTimer);
      failureTimer = undefined;
    }
  }
  function hello(): void {
    if (!disposed && !connected) send({ type: 'hello' });
  }
  function armFailure(): void {
    if (failureTimer !== undefined || connected || disposed) return;
    failureTimer = timers.setTimeout(() => {
      failureTimer = undefined;
      if (connected || disposed) return;
      // Keep polling on a timeout: the desktop may still be booting, and a late
      // handshake can park the ready desktop for the next toggle. Only the UI
      // notification is one-shot until another entry attempt re-arms it.
      if (failureNotified) return;
      failureNotified = true;
      options.events.onFailure();
    }, timeoutMs);
  }
  function failNow(): void {
    if (failureNotified) return;
    failureNotified = true;
    clearHandshake();
    options.events.onFailure();
  }
  function beginAttempt(): void {
    if (disposed || connected) return;
    suspension = 'awake';
    failureNotified = false;
    if (helloTimer === undefined) helloTimer = timers.setInterval(() => hello(), helloIntervalMs);
    armFailure();
    hello();
  }
  function waitFor(
    payload: FusionPayload,
    signal: AbortSignal | undefined,
    timeoutMessage: string,
    expect: readonly FusionMessage['type'][],
  ): Promise<FusionReply> {
    if (disposed) return Promise.reject(new Error('Desktop is unavailable.'));
    let request: number | undefined;
    const pending = fusion.wait(payload, {
      signal,
      timeoutMs,
      timeoutMessage,
      failureMessage: 'Desktop content could not open.',
      expect,
      onRequest: (sent) => {
        request = sent;
        awaited.add(sent);
      },
    });
    return pending.then(
      (message) => {
        if (request !== undefined) awaited.delete(request);
        return message.type === 'suspended' ? { destination: message.destination } : {};
      },
      (error: unknown) => {
        if (request !== undefined) awaited.delete(request);
        throw error;
      },
    );
  }
  /** A correlated failure already rejected its wait; it must not fail the handshake. */
  function wasAwaited(acknowledged: number | undefined): boolean {
    return acknowledged !== undefined && awaited.has(acknowledged);
  }

  return {
    get session() {
      return fusion.session;
    },
    get connected() {
      return connected;
    },
    get parked() {
      return suspension === 'asleep';
    },
    get desktopDestination() {
      return desktopDestination;
    },
    get deliveredDestination() {
      return delivered;
    },
    start(): void {
      if (disposed) return;
      reading.start();
      beginAttempt();
    },
    beginAttempt,
    receive(raw: unknown): void {
      if (disposed) return;
      const data = fusion.accept(raw);
      if (!data) return;
      switch (data.type) {
        case 'startup':
          if (!connected) options.events.onStartup?.();
          break;
        case 'ready':
          if (!connected) {
            connected = true;
            // A new guest parks at readiness until the parent sends resume,
            // including when its startup was already revealed on screen.
            suspension = 'asleep';
            failureNotified = false;
            clearHandshake();
            reading.connect();
            options.events.onReady();
            reading.publishAll();
          }
          break;
        case 'failed':
          if (!connected && !wasAwaited(data.acknowledged)) {
            // The desktop rejected the handshake itself; retrying the same broken
            // document is pointless, so stop polling until the next entry attempt.
            failNow();
          }
          break;
        case 'suspended':
          desktopDestination = data.destination;
          break;
        case 'request-classic':
          desktopDestination = data.destination;
          options.events.onRequestClassic(data.destination);
          break;
        case 'location':
          desktopDestination = data.destination;
          break;
        case 'reading':
          reading.receive(data);
          break;
        case 'reading-ack':
          reading.acknowledge(data);
          break;
        case 'sync-error':
          reading.fail(data);
          break;
        default:
          break;
      }
    },
    share(force = false): void {
      reading.share(force);
    },
    async navigate(destination, signal): Promise<void> {
      suspension = 'awake';
      await waitFor(
        { type: 'navigate', destination },
        signal,
        'Desktop did not acknowledge content readiness.',
        NAVIGATION_REPLIES,
      );
      delivered = destination;
      desktopDestination = destination;
    },
    async suspend(signal): Promise<FusionDestination> {
      suspension = 'asleep';
      const reply = await waitFor(
        { type: 'suspend' },
        signal,
        'Desktop did not confirm suspension.',
        SUSPENSION_REPLIES,
      );
      // Cancelling during a boot must not keep hello polling awake and wake the
      // parked desktop every interval. A later entry attempt re-arms it.
      clearHandshake();
      return reply.destination ?? desktopDestination;
    },
    suspendOnly(): void {
      if (suspension === 'asleep') return;
      suspension = 'asleep';
      clearHandshake();
      send({ type: 'suspend' });
    },
    resume(): void {
      suspension = 'awake';
      send({ type: 'resume' });
    },
    markDelivered(destination): void {
      delivered = destination;
      desktopDestination = destination;
    },
    dispose(): void {
      if (disposed) return;
      reading.stop();
      clearHandshake();
      if (suspension === 'awake') send({ type: 'suspend' });
      disposed = true;
      fusion.dispose();
    },
  };
}
