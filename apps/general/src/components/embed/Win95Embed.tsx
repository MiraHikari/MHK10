import { useEffect, useRef, useState } from 'react';
import {
  DESK_EMBED_ENABLED,
  PUBLIC_DESK_URL,
  setDisplayMode,
  usePresentationState,
} from '@/hooks/useDisplayMode';
import { getPresentation } from '@/hooks/presentation-controller';
import { requestDisplayMode } from '@/hooks/useDisplayModeEntry';
import {
  destinationPath,
  FUSION_EVENTS,
  FUSION_QUERY,
  type FusionDestination,
} from '@mhk/site-core/fusion/protocol-model';
import {
  readSharedReading,
  reconcileSharedReading,
  subscribeSharedReading,
} from '@mhk/site-core/fusion/browser-reading';
import {
  createFusionClient,
  needsDesktopNavigation,
  type FusionClient,
} from '@/hooks/fusion-client';
import PresentationHandoff, { HANDOFF_FAILURE } from './PresentationHandoff';
import '@/styles/features/fusion.css';

function cancelHandoff(): void {
  const { pending, target, visible } = getPresentation().getSnapshot();
  if (pending && target !== visible) setDisplayMode(visible);
}

/**
 * Iframe/transport adapter for the desktop presentation.
 *
 * The presentation controller owns the target, visible mode, phase, attempt,
 * pending overlay and sync notice; this component only loads the desktop
 * document, runs one fusion client per document and feeds authenticated
 * events back into the controller with their handshake generation.
 */
export default function Win95Embed({
  destination,
  onReturn,
}: {
  destination: FusionDestination;
  onReturn(destination: FusionDestination, signal: AbortSignal): Promise<void>;
}) {
  const {
    target: mode,
    visible: visibleMode,
    phase,
    attempt,
    coldEntry,
    pending,
    syncError,
  } = usePresentationState();
  const active = visibleMode === 'win95';
  const frameRef = useRef<HTMLIFrameElement>(null);
  const clientRef = useRef<FusionClient | null>(null);
  /**
   * Generation the live client's callbacks belong to. It is captured when the
   * client is created and refreshed when the reducer advances the attempt, so
   * a re-armed document reports the current generation instead of the one it
   * was first loaded under.
   */
  const clientAttemptRef = useRef(0);
  /**
   * The first load belongs to the document that the handshake already targets:
   * scripts run (and can answer `hello`) before the frame's load event. Treating
   * it as a reload would discard a completed handshake, hide a just-revealed
   * desktop and restart the session; only later loads are real navigations.
   */
  const awaitingFirstLoadRef = useRef(true);
  const [src, setSrc] = useState<string | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);
  const destinationRef = useRef(destination);
  destinationRef.current = destination;
  const returnRef = useRef(onReturn);
  returnRef.current = onReturn;
  const origin = DESK_EMBED_ENABLED ? new URL(PUBLIC_DESK_URL).origin : '';
  const desktopTarget = mode === 'win95' ? destinationPath(destination, 'general') : '';

  useEffect(() => {
    if (src !== null || mode !== 'win95' || !DESK_EMBED_ENABLED) return;
    awaitingFirstLoadRef.current = true;
    const initial = new URL(destinationPath(destinationRef.current, 'desktop'), PUBLIC_DESK_URL);
    initial.searchParams.set(FUSION_QUERY.shell, FUSION_QUERY.full);
    setSrc(initial.href);
  }, [mode, src]);

  /**
   * One authenticated session per loaded desktop document. The connection
   * starts with the iframe request rather than its load event, so a document
   * that never loads still times out instead of leaving the handoff pending
   * forever. Callbacks are tagged with the client's generation; the reducer
   * drops events from an abandoned attempt.
   */
  useEffect(() => {
    if (!src || !origin) return;
    clientAttemptRef.current = getPresentation().getSnapshot().attempt;
    const client = createFusionClient({
      initialDestination: destinationRef.current,
      transmit: (message) => frameRef.current?.contentWindow?.postMessage(message, origin),
      reading: {
        read: readSharedReading,
        merge: reconcileSharedReading,
        subscribe: subscribeSharedReading,
      },
      wireError: () => '阅读记录发生冲突或无法保存，原记录已保留。',
      events: {
        onStartup: () => {
          if (clientRef.current !== client) return;
          // Reveal the authenticated desktop while it runs its own POST/splash.
          // This is the single Win95 loading surface; the parent never draws a
          // second mock boot screen. Content readiness arrives later as `ready`.
          getPresentation().send({ type: 'startup', attempt: clientAttemptRef.current });
        },
        onReady: () => {
          if (clientRef.current !== client) return;
          getPresentation().send({ type: 'ready', attempt: clientAttemptRef.current });
        },
        onFailure: () => {
          if (clientRef.current !== client) return;
          // A guest failure only fails an entry. Return-path failures surface
          // through the handoff promise, and a settled classic presentation
          // must not be pulled back into a failure banner by a late guest.
          if (getPresentation().getSnapshot().target !== 'win95') return;
          // The fail effect paints classic, releases the boot mask once and
          // moves focus; this adapter must not repeat those dispatches.
          getPresentation().send({ type: 'fail', attempt: clientAttemptRef.current });
        },
        onRequestClassic: () => {
          if (clientRef.current === client && getPresentation().getSnapshot().visible === 'win95') {
            setDisplayMode('classic');
          }
        },
        onSyncError: (error) => {
          if (clientRef.current !== client) return;
          getPresentation().send({ type: 'sync-error', message: error });
        },
      },
    });
    clientRef.current = client;
    client.start();
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== origin || event.source !== frameRef.current?.contentWindow) return;
      client.receive(event.data);
    };
    const onSyncError = (event: Event) => {
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      getPresentation().send({
        type: 'sync-error',
        message: typeof detail === 'string' ? detail : '阅读记录同步失败，原记录已保留。',
      });
    };
    window.addEventListener('message', onMessage);
    window.addEventListener(FUSION_EVENTS.syncError, onSyncError);
    return () => {
      client.dispose();
      if (clientRef.current === client) clientRef.current = null;
      window.removeEventListener('message', onMessage);
      window.removeEventListener(FUSION_EVENTS.syncError, onSyncError);
    };
  }, [src, origin, loadVersion]);

  useEffect(() => {
    if (!DESK_EMBED_ENABLED) return;
    const controller = new AbortController();
    const { signal } = controller;
    const intendedMode = mode;
    clientAttemptRef.current = attempt;
    const handoff = async () => {
      const client = clientRef.current;
      if (mode === 'win95') {
        // The boot/request transition already holds the pending overlay until
        // the iframe exists and the client can start its attempt.
        if (!client) return;
        if (visibleMode === 'win95' && (phase === 'ready' || phase === 'startup')) return;
        if (phase === 'connecting' && !client.connected) {
          client.beginAttempt();
          return;
        }
        // A warm client is already connected, so there is no handshake to
        // restart: navigate to the current destination and reveal it.
        const target = destinationRef.current;
        if (
          needsDesktopNavigation(target, client.desktopDestination, client.deliveredDestination)
        ) {
          await client.navigate(target, signal);
          if (signal.aborted) return;
        }
        if (signal.aborted) return;
        getPresentation().send({ type: 'commit', target: 'win95', attempt });
        return;
      }

      if (!client) {
        // Finish a cancelled entry that never loaded a document. A settled
        // classic boot keeps its datasets and session cooldown untouched.
        if (phase === 'returning') {
          getPresentation().send({ type: 'commit', target: 'classic' });
        }
        return;
      }
      if (visibleMode === 'classic') {
        // The desktop never took the screen: park it and keep the current classic destination.
        client.suspendOnly();
        if (phase === 'returning') {
          getPresentation().send({ type: 'commit', target: 'classic' });
        }
        return;
      }
      const target = await client.suspend(signal);
      if (signal.aborted) return;
      await returnRef.current(target, signal);
      if (signal.aborted) return;
      client.markDelivered(target);
      // Completion publishes paint, reading restoration and focus. The commit
      // event only settles cancellations/failures without a destination.
      getPresentation().send({
        type: 'classic-restored',
        attempt,
        destination: target,
      });
    };
    void handoff().catch(() => {
      // A stale attempt that lost the mode race must not surface a failure banner.
      if (signal.aborted) return;
      if (getPresentation().getSnapshot().target !== intendedMode) return;
      getPresentation().send({ type: 'fail', attempt });
    });
    return () => controller.abort();
  }, [mode, visibleMode, phase, attempt, desktopTarget, loadVersion]);

  useEffect(() => {
    if (!active || mode !== 'win95' || phase !== 'ready' || !src) return;
    clientRef.current?.resume();
    let focusAttempts = 4;
    let focusFrame = window.requestAnimationFrame(function focusDesktop() {
      const frame = frameRef.current;
      if (!frame || document.activeElement === frame) return;
      frame.focus({ preventScroll: true });
      focusAttempts -= 1;
      if (focusAttempts > 0 && document.activeElement !== frame) {
        focusFrame = window.requestAnimationFrame(focusDesktop);
      }
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [active, mode, phase, src]);

  if (!DESK_EMBED_ENABLED) return null;
  const retry = (trigger: HTMLButtonElement) => {
    // The request clears the failure cooldown and re-targets the desktop;
    // dropping the frame disposes the failed document/client so the next entry
    // starts from a fresh handshake instead of reusing a broken session. A
    // stale reading-sync notice belongs to the abandoned attempt.
    getPresentation().send({ type: 'sync-error-dismiss' });
    requestDisplayMode('win95', trigger);
    awaitingFirstLoadRef.current = true;
    setSrc(null);
    setLoadVersion((value) => value + 1);
  };
  return (
    <>
      <div
        className="fusion-desktop"
        data-visible={active}
        data-phase={phase}
        aria-hidden={!active}
        inert={!active}
        data-desk-embed
      >
        {src ? (
          <iframe
            ref={frameRef}
            src={src}
            onLoad={() => {
              if (awaitingFirstLoadRef.current) {
                awaitingFirstLoadRef.current = false;
                return;
              }
              // A real navigation replaced the desktop document. Only an active
              // desktop entry re-handshakes; a hidden document may finish
              // loading while classic stays settled. Either way the client for
              // the replaced document is stale and must be rebuilt.
              if (getPresentation().getSnapshot().target === 'win95') {
                getPresentation().send({
                  type: 'iframe-reload',
                  attempt: getPresentation().getSnapshot().attempt,
                });
              }
              setLoadVersion((value) => value + 1);
            }}
            title="MHK10 桌面"
            className="h-full w-full border-0"
            allow="fullscreen; autoplay"
            tabIndex={active ? 0 : -1}
          />
        ) : null}
      </div>
      <PresentationHandoff
        mode={mode}
        pending={pending && mode !== visibleMode}
        attempt={attempt}
        coldEntry={coldEntry}
        failed={phase === 'failed'}
        onCancel={cancelHandoff}
      />
      {phase === 'failed' ? (
        <div className="fusion-failure">
          <p>{HANDOFF_FAILURE}</p>
          <button type="button" onClick={(event) => retry(event.currentTarget)}>
            重试桌面
          </button>
          <button type="button" onClick={() => getPresentation().send({ type: 'failure-dismiss' })}>
            继续阅读
          </button>
        </div>
      ) : null}
      {syncError ? (
        <div className="fusion-failure fusion-failure--reading" role="status">
          {syncError}
          <button
            type="button"
            onClick={() => getPresentation().send({ type: 'sync-error-dismiss' })}
          >
            关闭
          </button>
        </div>
      ) : null}
    </>
  );
}
