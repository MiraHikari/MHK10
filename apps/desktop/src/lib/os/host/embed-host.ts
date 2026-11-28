import {
  destinationFromUrl,
  destinationPath,
  FUSION_EVENTS,
  FUSION_QUERY,
  parseFusionOrigins,
  type FusionDestination,
  type FusionPayload,
} from '@mhk/site-core/fusion/protocol-model';
import { createFusionSession, FUSION_TIMING } from '@mhk/site-core/fusion/fusion-session';
import {
  readSharedReaderState,
  mergeSharedReaderState,
  subscribeSharedReaderState,
} from '@mhk/site-core/fusion/browser-reading';
import { createFusionReadingSync } from '@mhk/site-core/fusion/reading-sync-model';

const PARENT_ORIGINS = parseFusionOrigins(
  import.meta.env.PUBLIC_PARENT_ORIGINS?.trim() ||
    import.meta.env.PUBLIC_PARENT_ORIGIN?.trim() ||
    'https://www.example.com',
);
const GENERAL_URL = (import.meta.env.PUBLIC_GENERAL_URL ?? PARENT_ORIGINS[0] ?? '').trim();

export interface EmbedShell {
  setAudioMuted(value: boolean): void;
  setPresentationSuspended(value: boolean): void;
  navigateFusionDestination(destination: FusionDestination): boolean;
  getFusionDestination(): FusionDestination;
  readonly phase: string;
}
let activeHost: { requestClassic(): void } | undefined;

export function requestClassic(): void {
  if (activeHost) {
    activeHost.requestClassic();
    return;
  }
  const destination = destinationFromUrl(new URL(location.href), 'desktop') ?? { kind: 'home' };
  try {
    const target = new URL(destinationPath(destination, 'general'), GENERAL_URL);
    if (!PARENT_ORIGINS.includes(target.origin)) return;
    target.searchParams.set(FUSION_QUERY.view, FUSION_QUERY.classic);
    location.assign(target.href);
  } catch {
    /* Unconfigured standalone deployment retains native content. */
  }
}

/** One authenticated parent session owns presentation and visitor-reading synchronization. */
export function mountEmbedHost(shell: EmbedShell | undefined): () => void {
  let disposed = false;
  let origin = '';
  let readyTimer = 0;
  let readiness = 0;
  let readyRequest = -1;
  let readyDeadline = 0;
  let readyDestination: FusionDestination | undefined;
  // An empty session keeps the host silent until the first authenticated hello.
  const fusion = createFusionSession({
    transmit: (message) => window.parent.postMessage(message, origin),
    session: '',
    adoptSessionOnHello: true,
  });
  const post = (payload: FusionPayload) => fusion.next(payload);
  const reading = createFusionReadingSync({
    store: {
      read: readSharedReaderState,
      merge: mergeSharedReaderState,
      subscribe: subscribeSharedReaderState,
    },
    post,
    onError: (error) =>
      window.dispatchEvent(new CustomEvent(FUSION_EVENTS.syncError, { detail: error })),
  });
  reading.start();
  const flush = () => {
    window.dispatchEvent(new Event(FUSION_EVENTS.flushReading));
    for (const frame of document.querySelectorAll<HTMLIFrameElement>('[data-html-window]')) {
      try {
        frame.contentWindow?.dispatchEvent(new Event(FUSION_EVENTS.flushReading));
      } catch {
        /* foreign frame */
      }
    }
    reading.share(true);
  };
  const host = {
    requestClassic() {
      flush();
      post({
        type: 'request-classic',
        destination: shell?.getFusionDestination() ?? { kind: 'home' },
      });
    },
  };
  const onLocation = () =>
    post({ type: 'location', destination: shell?.getFusionDestination() ?? { kind: 'home' } });
  const announceReady = () => {
    if (disposed || !fusion.session) return;
    if (!shell || Date.now() >= readyDeadline) {
      post({ type: 'failed', acknowledged: readyRequest });
      return;
    }
    if (shell.phase !== 'desktop') {
      readyTimer = window.setTimeout(announceReady, FUSION_TIMING.readinessPollMs);
      return;
    }
    const frames = Array.from(
      document.querySelectorAll<HTMLIFrameElement>('[data-html-window]'),
    ).filter((frame) => {
      if (!readyDestination) return false;
      try {
        const target = destinationFromUrl(new URL(frame.src, window.location.href), 'desktop');
        return (
          target &&
          destinationPath(target, 'general') === destinationPath(readyDestination, 'general')
        );
      } catch {
        return false;
      }
    });
    if (
      (readyDestination && frames.length === 0) ||
      frames.some((frame) => {
        try {
          const doc = frame.contentDocument;
          return (
            !doc ||
            doc.URL === 'about:blank' ||
            (!!readyDestination &&
              destinationPath(
                destinationFromUrl(new URL(doc.URL), 'desktop') ?? { kind: 'home' },
                'general',
              ) !== destinationPath(readyDestination, 'general')) ||
            doc.readyState === 'loading' ||
            (!!doc.querySelector('#microsoft-reader') &&
              !doc.querySelector('#microsoft-reader[data-reader-ready]')) ||
            !!doc.querySelector('[data-personal-properties]:not(.properties-ready)')
          );
        } catch {
          return true;
        }
      })
    ) {
      readyTimer = window.setTimeout(announceReady, FUSION_TIMING.readinessPollMs);
      return;
    }
    post({ type: 'ready', acknowledged: readyRequest });
    // A hidden ready desktop can stop its frame loop without disposing any session.
    if (readiness === 0) shell.setPresentationSuspended(true);
  };
  const prepareReady = (acknowledged: number, destination: FusionDestination | undefined) => {
    window.clearTimeout(readyTimer);
    readyRequest = acknowledged;
    readyDestination = destination;
    // The deadline belongs to the session's first hello (or to a navigation);
    // retry hellos only refresh the poll's request and destination.
    readyTimer = window.setTimeout(announceReady, FUSION_TIMING.readinessPollMs);
  };
  const onMessage = (event: MessageEvent<unknown>) => {
    if (disposed || !PARENT_ORIGINS.includes(event.origin) || event.source !== window.parent)
      return;
    const previous = fusion.session;
    const data = fusion.accept(event.data);
    if (!data) return;
    if (data.type === 'hello') {
      if (previous && data.session !== previous) {
        // A remounted parent owns a fresh session; stale messages cannot survive it.
        reading.disconnect();
        readiness = 0;
        shell?.setAudioMuted(true);
      }
      if (previous !== data.session || readyDeadline === 0) {
        // Repeated hellos must not extend an active readiness deadline.
        readyDeadline = Date.now() + FUSION_TIMING.readinessTimeoutMs;
      }
      origin = event.origin;
      document.documentElement.dataset.embedFull = '';
      activeHost = host;
      reading.connect();
      prepareReady(data.request, shell?.getFusionDestination());
      // A hello can arrive while the desktop is parked mid-startup (the visitor
      // cancelled during boot and is trying again). Let the frame loop finish
      // booting so the readiness poll can answer; audio stays muted and the
      // desktop is parked again once ready.
      shell?.setPresentationSuspended(false);
      // The desktop boot/splash is the loading surface for the fusion handoff.
      // Announce it only while that sequence is actually running: revealing a
      // warmed desktop here would bypass the parent's destination navigation
      // and surface a stale window. Content readiness still follows as `ready`.
      if (shell?.phase === 'boot' || shell?.phase === 'splash') post({ type: 'startup' });
      return;
    }
    if (data.type === 'suspend') {
      // A suspend cancels any outstanding readiness poll: the desktop must not
      // announce a reveal for a presentation the visitor already left.
      window.clearTimeout(readyTimer);
      readyTimer = 0;
      readyDeadline = 0;
      flush();
      shell?.setAudioMuted(true);
      shell?.setPresentationSuspended(true);
      readiness = 0;
      post({
        type: 'suspended',
        acknowledged: data.request,
        destination: shell?.getFusionDestination() ?? { kind: 'home' },
      });
    }
    if (data.type === 'resume') {
      readiness = 1;
      shell?.setPresentationSuspended(false);
      shell?.setAudioMuted(false);
    }
    if (data.type === 'navigate') {
      shell?.setPresentationSuspended(false);
      if (shell?.navigateFusionDestination(data.destination)) {
        // Each navigation gets its own bounded readiness wait.
        readyDeadline = Date.now() + FUSION_TIMING.readinessTimeoutMs;
        onLocation();
        prepareReady(data.request, data.destination);
      } else post({ type: 'failed', acknowledged: data.request });
    }
    if (data.type === 'reading') reading.receive(data);
    if (data.type === 'reading-ack') reading.acknowledge(data);
    if (data.type === 'sync-error') reading.fail(data);
  };
  window.addEventListener('message', onMessage);
  window.addEventListener(FUSION_EVENTS.location, onLocation);
  // The parent may cancel while this document is still loading. Start parked;
  // only an authenticated hello or resume may wake the embedded desktop.
  shell?.setAudioMuted(true);
  shell?.setPresentationSuspended(true);
  return () => {
    if (disposed) return;
    shell?.setAudioMuted(true);
    shell?.setPresentationSuspended(true);
    disposed = true;
    fusion.dispose();
    reading.stop();
    window.removeEventListener('message', onMessage);
    window.removeEventListener(FUSION_EVENTS.location, onLocation);
    window.clearTimeout(readyTimer);
    if (activeHost === host) activeHost = undefined;
    delete document.documentElement.dataset.embedFull;
  };
}
