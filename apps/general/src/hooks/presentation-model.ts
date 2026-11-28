import type { DisplayMode } from './display-mode-model';
import type { FusionDestination } from '@mhk/site-core/fusion/protocol-model';

/**
 * Pure presentation state machine for the classic ↔ Win95 handoff.
 *
 * The reducer owns every decision about which presentation is targeted and
 * which one is actually visible, and it names the side effects the controller
 * must perform. It never reads the DOM, storage or device state; the caller
 * passes prehydration facts in through `boot`.
 *
 * `target` is what the visitor asked for; `visible` is what has been
 * acknowledged by the desktop. The two only diverge while a handoff is in
 * flight, which is what keeps the classic content readable until readiness.
 */
export type PresentationPhase =
  | 'idle'
  | 'connecting'
  | 'startup'
  | 'ready'
  | 'returning'
  | 'failed';

export interface PresentationState {
  readonly target: DisplayMode;
  readonly visible: DisplayMode;
  readonly phase: PresentationPhase;
  /** Handshake generation; stale attempt-tagged events are dropped. */
  readonly attempt: number;
  readonly coldEntry: boolean;
  /**
   * A request or handoff is waiting for the presentation to settle. The
   * handoff overlay renders from this flag, so it stays up from the request
   * until startup/commit/success/failure dismisses it.
   */
  readonly pending: boolean;
  readonly syncError: string;
  /** At most one `portfolio:boot-ready` may be emitted per controller lifetime. */
  readonly bootReadySent: boolean;
  /** Session-scoped auto-entry suppression written after a failed handoff. */
  readonly cooldown: DisplayMode | null;
}

export type PresentationEvent =
  | { type: 'boot'; target: DisplayMode; failedThisSession?: unknown }
  | { type: 'request'; target: DisplayMode; persist?: boolean }
  | { type: 'commit'; target: DisplayMode; attempt?: number }
  /** The authenticated desktop document began its own startup sequence. */
  | { type: 'startup'; attempt: number }
  /** The desktop content handshake completed. */
  | { type: 'ready'; attempt: number }
  /** The desktop handed control back and the classic destination is navigable. */
  | { type: 'classic-restored'; attempt: number; destination?: FusionDestination }
  /**
   * `attempt` tags the handshake generation. The fusion client captures the
   * generation it belongs to, so a late failure or commit from an abandoned
   * attempt cannot override a newer one.
   */
  | { type: 'fail'; attempt?: number }
  | { type: 'iframe-reload'; attempt?: number }
  | { type: 'failure-dismiss' }
  | { type: 'sync-error'; message: string }
  | { type: 'sync-error-dismiss' }
  | { type: 'mark-boot-ready' }
  | { type: 'clear-cooldown' };

export type PresentationEffect =
  | { type: 'persist'; target: DisplayMode }
  | { type: 'clear-cooldown' }
  | { type: 'write-cooldown'; target: DisplayMode }
  | { type: 'paint'; target: DisplayMode; visible: DisplayMode }
  | { type: 'flush-reading' }
  | { type: 'boot-ready' }
  | { type: 'focus'; selector: string }
  | { type: 'restore-reading'; destination: FusionDestination };

export const PRESENTATION_FOCUS_SELECTOR = '[data-mode-toggle]';

export const INITIAL_PRESENTATION_STATE: PresentationState = Object.freeze({
  target: 'classic',
  visible: 'classic',
  phase: 'idle',
  attempt: 0,
  coldEntry: false,
  pending: false,
  syncError: '',
  bootReadySent: false,
  cooldown: null,
});

const NO_EFFECTS: readonly PresentationEffect[] = [];

export interface PresentationContext {
  /** `PUBLIC_DESK_URL` is configured; without it the desktop is bypassed. */
  readonly enabled: boolean;
}

export interface PresentationTransition {
  readonly state: PresentationState;
  readonly effects: readonly PresentationEffect[];
}

function transition(
  state: PresentationState,
  effects: readonly PresentationEffect[] = NO_EFFECTS,
): PresentationTransition {
  return { state, effects };
}

/** Preserve the previous snapshot when every field is unchanged, so the
 * controller does not notify subscribers for a no-op acknowledgement. */
function transitionWith(
  state: PresentationState,
  next: PresentationState,
  effects: readonly PresentationEffect[] = NO_EFFECTS,
): PresentationTransition {
  const changed =
    next.target !== state.target ||
    next.visible !== state.visible ||
    next.phase !== state.phase ||
    next.attempt !== state.attempt ||
    next.coldEntry !== state.coldEntry ||
    next.pending !== state.pending ||
    next.syncError !== state.syncError ||
    next.bootReadySent !== state.bootReadySent ||
    next.cooldown !== state.cooldown;
  return transition(changed ? next : state, effects);
}

function staleAttempt(event: { attempt?: number }, state: PresentationState): boolean {
  return event.attempt !== undefined && event.attempt !== state.attempt;
}

/**
 * Session cooldown: after a failed desktop handoff the saved `win95`
 * preference is preserved, but the prehydration target is clamped to classic
 * for the rest of the session. An explicit `?view` entry is handled by the
 * bootstrap (and clears the stored cooldown) before the reducer sees it.
 */
function bootState(
  state: PresentationState,
  target: DisplayMode,
  failedThisSession: unknown,
): PresentationTransition {
  const blocked = failedThisSession === 'win95';
  const coerced = blocked && target === 'win95';
  const resolved = coerced ? 'classic' : target;
  const effects: PresentationEffect[] = [];
  // The prehydration script already wrote `data-display-target`; boot only
  // repaints when it injected a target or has to correct a blocked one.
  if (resolved === 'win95' || coerced) {
    effects.push({ type: 'paint', target: resolved, visible: 'classic' });
  }
  return transitionWith(
    state,
    {
      ...state,
      target: resolved,
      visible: 'classic',
      phase: resolved === 'win95' ? 'connecting' : 'idle',
      attempt: resolved === 'win95' ? Math.max(1, state.attempt) : state.attempt,
      coldEntry: false,
      // An automatic desktop boot is still a handoff in flight; a classic boot
      // has nothing to wait for.
      pending: resolved === 'win95',
      cooldown: blocked ? 'win95' : state.cooldown,
    },
    effects,
  );
}

/**
 * Reduce one external fact into presentation state plus ordered effects.
 *
 * Effect order is intentional: reading state is flushed and the preference is
 * persisted before the target dataset is painted; a reveal paints before it
 * restores reading or moves focus, because those consumers observe inert and
 * dataset state from the committed render.
 */
export function reducePresentation(
  state: PresentationState,
  event: PresentationEvent,
  context: PresentationContext,
): PresentationTransition {
  if (event.type === 'mark-boot-ready') {
    if (state.bootReadySent) return transition(state);
    return transition({ ...state, bootReadySent: true }, [{ type: 'boot-ready' }]);
  }

  if (!context.enabled) {
    if (
      state.target === 'classic' &&
      state.visible === 'classic' &&
      state.phase === 'idle' &&
      !state.pending
    ) {
      return transition(state);
    }
    return transition({
      ...state,
      target: 'classic',
      visible: 'classic',
      phase: 'idle',
      coldEntry: false,
      pending: false,
      cooldown: null,
    });
  }

  switch (event.type) {
    case 'boot':
      return bootState(state, event.target, event.failedThisSession);

    case 'request': {
      if (event.target === state.target) return transition(state);
      const effects: PresentationEffect[] = [{ type: 'flush-reading' }];
      let cooldown = state.cooldown;
      // An explicit desktop request is the visitor's retry signal: it clears
      // this session's failure cooldown so a reload may auto-enter again.
      if (event.target === 'win95' && cooldown !== null) {
        cooldown = null;
        effects.push({ type: 'clear-cooldown' });
      }
      if (event.persist !== false) effects.push({ type: 'persist', target: event.target });
      effects.push({ type: 'paint', target: event.target, visible: state.visible });
      return {
        state: {
          ...state,
          target: event.target,
          phase: event.target === 'win95' ? 'connecting' : 'returning',
          attempt: event.target === 'win95' ? state.attempt + 1 : state.attempt,
          coldEntry: event.target === 'win95' && state.attempt === 0,
          pending: true,
          cooldown,
        },
        effects,
      };
    }

    case 'commit': {
      if (staleAttempt(event, state)) return transition(state);
      // A late acknowledgement from an abandoned handoff must never reveal a
      // desktop the visitor already left.
      if (event.target === 'win95' && state.target !== 'win95') return transition(state);
      const effects: PresentationEffect[] = [];
      let cooldown = state.cooldown;
      // Only a commit that changes the visible presentation completes a
      // handoff. Acknowledging the already-visible mode (a settled classic
      // boot, a dismissed failure) must not erase the session cooldown.
      if (cooldown !== null && state.visible !== event.target) {
        cooldown = null;
        effects.push({ type: 'clear-cooldown' });
      }
      // `target` stays whatever the visitor last requested: committing classic
      // only changes what is visible, it does not abandon a pending desktop.
      effects.push({ type: 'paint', target: state.target, visible: event.target });
      let bootReadySent = state.bootReadySent;
      // A classic commit can settle a handoff that was cancelled before the
      // desktop ever revealed itself; the boot mask must still be released.
      const settlesPending = event.target === 'classic' && state.pending;
      if (!bootReadySent && (event.target === 'win95' || settlesPending)) {
        bootReadySent = true;
        effects.push({ type: 'boot-ready' });
      }
      if (settlesPending && state.target === 'classic') {
        effects.push({ type: 'focus', selector: PRESENTATION_FOCUS_SELECTOR });
      }
      return transitionWith(
        state,
        {
          ...state,
          visible: event.target,
          phase: event.target === 'win95' ? 'ready' : 'idle',
          coldEntry: false,
          pending: false,
          cooldown,
          bootReadySent,
        },
        effects,
      );
    }

    case 'startup': {
      if (staleAttempt(event, state)) return transition(state);
      // A startup can reveal an active connection, but cannot replace a later phase.
      if (state.target !== 'win95' || state.phase !== 'connecting') return transition(state);
      const effects: PresentationEffect[] = [];
      if (state.visible !== 'win95') {
        effects.push({ type: 'paint', target: state.target, visible: 'win95' });
      }
      let bootReadySent = state.bootReadySent;
      if (!bootReadySent) {
        bootReadySent = true;
        effects.push({ type: 'boot-ready' });
      }
      return transitionWith(
        state,
        {
          ...state,
          visible: 'win95',
          phase: 'startup',
          coldEntry: false,
          pending: false,
          bootReadySent,
        },
        effects,
      );
    }

    case 'ready': {
      if (staleAttempt(event, state)) return transition(state);
      // Readiness from an abandoned entry must not resurrect a return, erase a
      // failure banner or settle its pending overlay.
      if (state.target !== 'win95') return transition(state);
      // Readiness never reveals the desktop on its own: startup (or a warm
      // commit) owns the reveal. It settles a handoff whose desktop is already
      // on screen and records readiness for the next commit.
      return transitionWith(state, {
        ...state,
        phase: 'ready',
        pending: state.visible === 'win95' ? false : state.pending,
      });
    }

    case 'classic-restored': {
      if (staleAttempt(event, state)) return transition(state);
      // The desktop handed control back and the classic destination is ready:
      // restore reading, release the boot mask if needed and move focus.
      const effects: PresentationEffect[] = [
        { type: 'paint', target: 'classic', visible: 'classic' },
      ];
      let bootReadySent = state.bootReadySent;
      if (!bootReadySent) {
        bootReadySent = true;
        effects.push({ type: 'boot-ready' });
      }
      if (event.destination) {
        effects.push({ type: 'restore-reading', destination: event.destination });
      }
      effects.push({ type: 'focus', selector: PRESENTATION_FOCUS_SELECTOR });
      return transitionWith(
        state,
        {
          ...state,
          target: 'classic',
          visible: 'classic',
          phase: 'idle',
          coldEntry: false,
          pending: false,
          bootReadySent,
        },
        effects,
      );
    }

    case 'fail': {
      if (staleAttempt(event, state)) return transition(state);
      // Only a failed desktop *entry* arms the session cooldown. A failure on
      // the way back to classic still returns to classic, but must not
      // suppress the visitor's saved win95 preference for the rest of the
      // session.
      const desktopEntry = state.target === 'win95';
      const effects: PresentationEffect[] = [];
      if (desktopEntry) effects.push({ type: 'write-cooldown', target: 'win95' });
      effects.push({ type: 'paint', target: 'classic', visible: 'classic' });
      let bootReadySent = state.bootReadySent;
      if (!bootReadySent) {
        bootReadySent = true;
        effects.push({ type: 'boot-ready' });
      }
      effects.push({ type: 'focus', selector: PRESENTATION_FOCUS_SELECTOR });
      return transitionWith(
        state,
        {
          ...state,
          // The saved preference is untouched; only this session falls back.
          target: 'classic',
          visible: 'classic',
          phase: 'failed',
          coldEntry: false,
          pending: false,
          cooldown: desktopEntry ? 'win95' : state.cooldown,
          bootReadySent,
        },
        effects,
      );
    }

    case 'iframe-reload': {
      // A real navigation replaced the desktop document. Hide the desktop,
      // start a new generation and wait for the fresh handshake; the late
      // acknowledgement of the old attempt is stale from here on.
      if (staleAttempt(event, state)) return transition(state);
      // A hidden desktop may finish a navigation while the visitor already sits
      // on a settled classic presentation; loading a document is not a request
      // to take the screen back.
      if (state.target === 'classic' && state.visible === 'classic') return transition(state);
      const effects: PresentationEffect[] = [
        { type: 'paint', target: state.target, visible: 'classic' },
      ];
      let bootReadySent = state.bootReadySent;
      if (!bootReadySent) {
        bootReadySent = true;
        effects.push({ type: 'boot-ready' });
      }
      return transitionWith(
        state,
        {
          ...state,
          visible: 'classic',
          phase: 'connecting',
          attempt: state.attempt + 1,
          coldEntry: false,
          pending: true,
          bootReadySent,
        },
        effects,
      );
    }

    case 'failure-dismiss':
      // Dismissing the banner is not a successful handoff: keep the classic
      // target/visible pair and the session cooldown.
      if (state.phase !== 'failed') return transition(state);
      return transitionWith(state, { ...state, phase: 'idle' }, [
        { type: 'focus', selector: PRESENTATION_FOCUS_SELECTOR },
      ]);

    case 'sync-error':
      if (state.syncError === event.message) return transition(state);
      return transition({ ...state, syncError: event.message });

    case 'sync-error-dismiss':
      if (state.syncError === '') return transition(state);
      return transition({ ...state, syncError: '' });

    case 'clear-cooldown':
      if (state.cooldown === null) return transition(state);
      return transition({ ...state, cooldown: null }, [{ type: 'clear-cooldown' }]);
  }
}
