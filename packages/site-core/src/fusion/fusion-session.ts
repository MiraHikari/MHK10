import {
  fusionMessage,
  parseFusionMessage,
  type FusionMessage,
  type FusionPayload,
} from './protocol-model';

/**
 * One timing table for both roles. The guest reports failed readiness before the
 * parent gives up, so `readinessTimeoutMs` must stay below the connection
 * timeout. Hello retries and readiness polling remain role-specific rhythms.
 */
export const FUSION_TIMING = {
  connectionTimeoutMs: 20_000,
  readinessTimeoutMs: 16_000,
  helloIntervalMs: 400,
  readinessPollMs: 50,
} as const;

export interface FusionTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

export interface FusionWaitOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Role-facing timeout text; payload-specific wording belongs to the caller. */
  timeoutMessage?: string;
  /** Role-facing rejection text for a correlated `failed` acknowledgement. */
  failureMessage?: string;
  /** Acknowledgement types that may settle this wait; unrelated acks are ignored. */
  expect?: readonly FusionMessage['type'][];
  /** Receives the request synchronously after the waiter is registered, before transmit. */
  onRequest?(request: number): void;
}

/**
 * Session, request correlation and watermark mechanics shared by the classic
 * client and the embedded desktop host. Handshake meaning (hello polling,
 * readiness, failure UI) stays with each role; this module only owns the parts
 * that are identical in both directions.
 */
export interface FusionSession {
  readonly session: string;
  next(payload: FusionPayload): number | undefined;
  accept(raw: unknown): FusionMessage | null;
  wait(payload: FusionPayload, options?: FusionWaitOptions): Promise<FusionMessage>;
  reset(session?: string): void;
  dispose(): void;
}

const defaultTimers: FusionTimers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof globalThis.setTimeout>),
  setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
  clearInterval: (id) => globalThis.clearInterval(id as ReturnType<typeof globalThis.setInterval>),
};

const DEFAULT_TIMEOUT_MESSAGE = 'Desktop did not acknowledge the request.';
const DEFAULT_FAILURE_MESSAGE = 'The peer rejected the request.';
const DEFAULT_EXPECTED_TYPES: readonly FusionMessage['type'][] = ['ready', 'failed', 'suspended'];

export function createFusionSession(options: {
  transmit(message: FusionMessage): void;
  session?: string;
  timeoutMs?: number;
  timers?: FusionTimers;
  /** The desktop host adopts a replacement parent session through hello; the parent never does. */
  adoptSessionOnHello?: boolean;
}): FusionSession {
  const timers = options.timers ?? defaultTimers;
  const timeoutMs = options.timeoutMs ?? FUSION_TIMING.connectionTimeoutMs;
  const adoptSessionOnHello = options.adoptSessionOnHello ?? false;
  // An empty session is a real host state before the first authenticated hello.
  let session = options.session ?? crypto.randomUUID();
  let sequence = 0;
  let received = -1;
  let disposed = false;
  const waits = new Map<
    number,
    {
      resolve(message: FusionMessage): void;
      reject(error: Error): void;
      failureMessage: string;
      expect: ReadonlySet<FusionMessage['type']>;
    }
  >();

  function send(
    payload: FusionPayload,
    beforeTransmit?: (request: number) => void,
  ): number | undefined {
    if (disposed || !session) return undefined;
    const request = ++sequence;
    beforeTransmit?.(request);
    try {
      options.transmit(fusionMessage(session, request, payload));
    } catch {
      return undefined;
    }
    return request;
  }

  function rejectPending(error: Error): void {
    for (const waiter of [...waits.values()]) waiter.reject(error);
    waits.clear();
  }

  function resetSession(nextSession?: string): void {
    if (disposed) return;
    session = nextSession ?? crypto.randomUUID();
    sequence = 0;
    received = -1;
    rejectPending(new Error('Desktop connection closed.'));
  }

  return {
    get session() {
      return session;
    },
    next(payload): number | undefined {
      return send(payload);
    },
    accept(raw): FusionMessage | null {
      if (disposed) return null;
      const message = parseFusionMessage(raw);
      if (!message) return null;
      if (message.session !== session) {
        // The desktop host may adopt a replacement parent session through hello;
        // the parent role rejects a foreign hello without touching its state.
        if (!adoptSessionOnHello || message.type !== 'hello') return null;
        resetSession(message.session);
      }
      if (message.request <= received) return null;
      received = message.request;
      if ('acknowledged' in message && message.acknowledged !== undefined) {
        const waiter = waits.get(message.acknowledged);
        if (waiter && waiter.expect.has(message.type)) {
          if (message.type === 'failed') waiter.reject(new Error(waiter.failureMessage));
          else waiter.resolve(message);
        }
      }
      return message;
    },
    wait(payload, waitOptions = {}): Promise<FusionMessage> {
      const signal = waitOptions.signal;
      const waitTimeoutMs = waitOptions.timeoutMs ?? timeoutMs;
      const timeoutMessage = waitOptions.timeoutMessage ?? DEFAULT_TIMEOUT_MESSAGE;
      const failureMessage = waitOptions.failureMessage ?? DEFAULT_FAILURE_MESSAGE;
      const expected = new Set(waitOptions.expect ?? DEFAULT_EXPECTED_TYPES);
      if (disposed) return Promise.reject(new Error('Desktop is unavailable.'));
      if (signal?.aborted) return Promise.reject(new Error('Handoff cancelled.'));

      return new Promise<FusionMessage>((resolve, reject) => {
        let settled = false;
        /** Request whose waiter/timer/listener are installed, if any. */
        let registered: number | undefined;
        let timer: unknown;
        const finish = (action: () => void) => {
          if (settled) return;
          settled = true;
          if (timer !== undefined) timers.clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          if (registered !== undefined) waits.delete(registered);
          action();
        };
        const abort = () => finish(() => reject(new Error('Handoff cancelled.')));
        const request = send(payload, (sent) => {
          registered = sent;
          timer = timers.setTimeout(
            () => finish(() => reject(new Error(timeoutMessage))),
            waitTimeoutMs,
          );
          waits.set(sent, {
            resolve: (message) => finish(() => resolve(message)),
            reject: (error) => finish(() => reject(error)),
            failureMessage,
            expect: expected,
          });
          signal?.addEventListener('abort', abort, { once: true });
          // Synchronous transports may answer during transmit; the caller must
          // already know the request so it can classify correlated failures.
          waitOptions.onRequest?.(sent);
        });
        if (request === undefined) {
          // Disposed, no session, or the transport threw. A registered waiter is
          // released here so a failed send cannot leave a timer behind.
          finish(() => reject(new Error('Desktop is unavailable.')));
        }
      });
    },
    reset(nextSession): void {
      resetSession(nextSession);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      rejectPending(new Error('Desktop connection closed.'));
    },
  };
}
