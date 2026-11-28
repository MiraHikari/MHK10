import { describe, expect, it } from 'vite-plus/test';
import {
  INITIAL_PRESENTATION_STATE,
  PRESENTATION_FOCUS_SELECTOR,
  reducePresentation,
  type PresentationContext,
  type PresentationEvent,
  type PresentationState,
} from './presentation-model';

const ENABLED: PresentationContext = { enabled: true };
const DISABLED: PresentationContext = { enabled: false };

function reduce(
  state: PresentationState,
  event: PresentationEvent,
  context: PresentationContext = ENABLED,
) {
  return reducePresentation(state, event, context);
}

const win95Booted = reduce(INITIAL_PRESENTATION_STATE, { type: 'boot', target: 'win95' }).state;
const coolingDown = reduce(INITIAL_PRESENTATION_STATE, {
  type: 'boot',
  target: 'classic',
  failedThisSession: 'win95',
}).state;
/** Booted into the desktop, then revealed by the startup sequence. */
const revealed = reduce(win95Booted, {
  type: 'startup',
  attempt: win95Booted.attempt,
}).state;
/** The visitor asked to return while the desktop is still on screen. */
const returning = reduce(revealed, { type: 'request', target: 'classic' }).state;

describe('presentation reducer: disabled presentation', () => {
  it('collapses every event to classic without side effects', () => {
    const boot = reduce(INITIAL_PRESENTATION_STATE, { type: 'boot', target: 'win95' }, DISABLED);
    expect(boot.state).toMatchObject({
      target: 'classic',
      visible: 'classic',
      phase: 'idle',
      pending: false,
    });
    expect(boot.effects).toEqual([]);

    const request = reduce(win95Booted, { type: 'request', target: 'win95' }, DISABLED);
    expect(request.state.target).toBe('classic');
    expect(request.state.visible).toBe('classic');
    expect(request.state.pending).toBe(false);
    expect(request.effects).toEqual([]);

    const failure = reduce(win95Booted, { type: 'fail' }, DISABLED);
    expect(failure.state).toMatchObject({
      target: 'classic',
      visible: 'classic',
      phase: 'idle',
      pending: false,
    });
    expect(failure.state.cooldown).toBeNull();
    expect(failure.effects).toEqual([]);
  });

  it('still releases the classic boot mask once when content signals readiness', () => {
    const event = { type: 'mark-boot-ready' } as const;
    const ready = reduce(INITIAL_PRESENTATION_STATE, event, DISABLED);
    expect(ready.state).toMatchObject({ target: 'classic', bootReadySent: true });
    expect(ready.effects).toEqual([{ type: 'boot-ready' }]);
    expect(reduce(ready.state, event, DISABLED)).toEqual({ state: ready.state, effects: [] });
  });
});

describe('presentation reducer: boot', () => {
  it('adopts a classic prehydration target without touching the datasets', () => {
    const { state, effects } = reduce(INITIAL_PRESENTATION_STATE, {
      type: 'boot',
      target: 'classic',
    });
    expect(state).toMatchObject({
      target: 'classic',
      visible: 'classic',
      phase: 'idle',
      attempt: 0,
      pending: false,
      cooldown: null,
    });
    expect(effects).toEqual([]);
  });

  it('targets win95 while keeping the classic content visible', () => {
    const { state, effects } = reduce(INITIAL_PRESENTATION_STATE, {
      type: 'boot',
      target: 'win95',
    });
    expect(state).toMatchObject({
      target: 'win95',
      visible: 'classic',
      phase: 'connecting',
      attempt: 1,
      coldEntry: false,
      pending: true,
    });
    expect(effects).toEqual([{ type: 'paint', target: 'win95', visible: 'classic' }]);
  });

  it('clamps a win95 target and corrects the dataset after a failed session', () => {
    const { state, effects } = reduce(INITIAL_PRESENTATION_STATE, {
      type: 'boot',
      target: 'win95',
      failedThisSession: 'win95',
    });
    expect(state).toMatchObject({
      target: 'classic',
      visible: 'classic',
      phase: 'idle',
      pending: false,
      cooldown: 'win95',
    });
    expect(effects).toEqual([{ type: 'paint', target: 'classic', visible: 'classic' }]);
  });

  it('keeps the cooldown when the inline script already resolved classic', () => {
    const { state, effects } = reduce(INITIAL_PRESENTATION_STATE, {
      type: 'boot',
      target: 'classic',
      failedThisSession: 'win95',
    });
    expect(state.cooldown).toBe('win95');
    expect(state.pending).toBe(false);
    expect(effects).toEqual([]);
  });

  it('ignores malformed failed-session values', () => {
    const { state } = reduce(INITIAL_PRESENTATION_STATE, {
      type: 'boot',
      target: 'win95',
      failedThisSession: 'classic',
    });
    expect(state.target).toBe('win95');
    expect(state.cooldown).toBeNull();
  });
});

describe('presentation reducer: request', () => {
  it('is a no-op for the same target', () => {
    const request = reduce(win95Booted, { type: 'request', target: 'win95' });
    expect(request.state).toBe(win95Booted);
    expect(request.effects).toEqual([]);
  });

  it('retargets to win95, flushing reading and persisting before painting', () => {
    const { state, effects } = reduce(INITIAL_PRESENTATION_STATE, {
      type: 'request',
      target: 'win95',
    });
    expect(state).toMatchObject({
      target: 'win95',
      visible: 'classic',
      phase: 'connecting',
      attempt: 1,
      coldEntry: true,
      pending: true,
    });
    expect(effects).toEqual([
      { type: 'flush-reading' },
      { type: 'persist', target: 'win95' },
      { type: 'paint', target: 'win95', visible: 'classic' },
    ]);
  });

  it('honors persist:false for session-only transitions', () => {
    const { state, effects } = reduce(INITIAL_PRESENTATION_STATE, {
      type: 'request',
      target: 'win95',
      persist: false,
    });
    expect(state.target).toBe('win95');
    expect(effects).not.toContainEqual({ type: 'persist', target: 'win95' });
  });

  it('keeps the revealed desktop visible while returning to classic', () => {
    const { state, effects } = reduce(revealed, { type: 'request', target: 'classic' });
    expect(state).toMatchObject({
      target: 'classic',
      visible: 'win95',
      phase: 'returning',
      pending: true,
    });
    expect(state.attempt).toBe(revealed.attempt);
    expect(effects).toEqual([
      { type: 'flush-reading' },
      { type: 'persist', target: 'classic' },
      { type: 'paint', target: 'classic', visible: 'win95' },
    ]);
  });

  it('clears the failed-session cooldown on an explicit desktop request', () => {
    const { state, effects } = reduce(coolingDown, { type: 'request', target: 'win95' });
    expect(state.cooldown).toBeNull();
    expect(state.pending).toBe(true);
    expect(effects).toEqual([
      { type: 'flush-reading' },
      { type: 'clear-cooldown' },
      { type: 'persist', target: 'win95' },
      { type: 'paint', target: 'win95', visible: 'classic' },
    ]);
  });
});

describe('presentation reducer: commit', () => {
  it('rejects a desktop acknowledgement after the target was abandoned', () => {
    const commit = reduce(returning, { type: 'commit', target: 'win95' });
    expect(commit.state).toBe(returning);
    expect(commit.effects).toEqual([]);
  });

  it('reveals a committed desktop as ready without inventing a startup phase', () => {
    const first = reduce(win95Booted, { type: 'commit', target: 'win95' });
    expect(first.state).toMatchObject({
      target: 'win95',
      visible: 'win95',
      phase: 'ready',
      pending: false,
      bootReadySent: true,
    });
    expect(first.effects).toEqual([
      { type: 'paint', target: 'win95', visible: 'win95' },
      { type: 'boot-ready' },
    ]);

    const second = reduce(first.state, { type: 'commit', target: 'win95' });
    expect(second.state.phase).toBe('ready');
    expect(second.state.visible).toBe('win95');
    expect(second.effects).toEqual([{ type: 'paint', target: 'win95', visible: 'win95' }]);
  });

  it('reuses an already connected desktop without marking the return as cold entry or startup', () => {
    const parked = reduce(revealed, {
      type: 'classic-restored',
      attempt: revealed.attempt,
    }).state;
    const entry = reduce(parked, { type: 'request', target: 'win95' }).state;
    expect(entry).toMatchObject({ phase: 'connecting', coldEntry: false });
    const resume = reduce(entry, { type: 'commit', target: 'win95', attempt: entry.attempt });
    expect(resume.state).toMatchObject({ phase: 'ready', visible: 'win95', pending: false });
    expect(resume.effects).toEqual([{ type: 'paint', target: 'win95', visible: 'win95' }]);
  });

  it('keeps a previously observed readiness when the reveal is committed later', () => {
    const hiddenReady = reduce(win95Booted, {
      type: 'ready',
      attempt: win95Booted.attempt,
    }).state;
    const commit = reduce(hiddenReady, {
      type: 'commit',
      target: 'win95',
      attempt: win95Booted.attempt,
    });
    expect(commit.state).toMatchObject({
      visible: 'win95',
      phase: 'ready',
      pending: false,
    });
  });

  it('committing classic reveals classic, keeps the win95 target signal and boots ready', () => {
    const { state, effects } = reduce(win95Booted, { type: 'commit', target: 'classic' });
    expect(state).toMatchObject({
      target: 'win95',
      visible: 'classic',
      phase: 'idle',
      pending: false,
    });
    expect(effects).toEqual([
      { type: 'paint', target: 'win95', visible: 'classic' },
      { type: 'boot-ready' },
    ]);
  });

  it('settles a cancelled handoff with one boot-ready', () => {
    const cancelled = reduce(win95Booted, { type: 'request', target: 'classic' }).state;
    expect(cancelled).toMatchObject({ phase: 'returning', pending: true });
    const { state, effects } = reduce(cancelled, {
      type: 'commit',
      target: 'classic',
      attempt: cancelled.attempt,
    });
    expect(state).toMatchObject({
      target: 'classic',
      visible: 'classic',
      phase: 'idle',
      pending: false,
      bootReadySent: true,
    });
    expect(effects).toEqual([
      { type: 'paint', target: 'classic', visible: 'classic' },
      { type: 'boot-ready' },
      { type: 'focus', selector: PRESENTATION_FOCUS_SELECTOR },
    ]);
  });

  it('does not erase a failure cooldown when no presentation changes', () => {
    const { state, effects } = reduce(coolingDown, { type: 'commit', target: 'classic' });
    expect(state.cooldown).toBe('win95');
    expect(effects.some((effect) => effect.type === 'clear-cooldown')).toBe(false);
  });

  it('clears the cooldown when a reveal completes the handoff', () => {
    const cooled = { ...win95Booted, cooldown: 'win95' as const };
    const { state, effects } = reduce(cooled, { type: 'commit', target: 'win95' });
    expect(state.cooldown).toBeNull();
    expect(effects[0]).toEqual({ type: 'clear-cooldown' });
  });

  it('does not move focus when classic was never covered', () => {
    const { effects } = reduce(win95Booted, { type: 'commit', target: 'classic' });
    expect(effects.some((effect) => effect.type === 'focus')).toBe(false);
  });

  it('drops a commit from an abandoned generation', () => {
    const stale = reduce(win95Booted, { type: 'commit', target: 'win95', attempt: 0 });
    expect(stale.state).toBe(win95Booted);
    expect(stale.effects).toEqual([]);

    const staleClassic = reduce(revealed, { type: 'commit', target: 'classic', attempt: 0 });
    expect(staleClassic.state).toBe(revealed);
    expect(staleClassic.effects).toEqual([]);

    const current = reduce(win95Booted, {
      type: 'commit',
      target: 'win95',
      attempt: win95Booted.attempt,
    });
    expect(current.state.visible).toBe('win95');
  });
});

describe('presentation reducer: startup', () => {
  it('reveals the desktop once its own startup sequence is live', () => {
    const { state, effects } = reduce(win95Booted, {
      type: 'startup',
      attempt: win95Booted.attempt,
    });
    expect(state).toMatchObject({
      target: 'win95',
      visible: 'win95',
      phase: 'startup',
      pending: false,
      bootReadySent: true,
    });
    expect(effects).toEqual([
      { type: 'paint', target: 'win95', visible: 'win95' },
      { type: 'boot-ready' },
    ]);
  });

  it('does not repeat the reveal or the boot signal', () => {
    const first = reduce(win95Booted, { type: 'startup', attempt: win95Booted.attempt });
    const second = reduce(first.state, { type: 'startup', attempt: win95Booted.attempt });
    expect(second.state).toBe(first.state);
    expect(second.effects).toEqual([]);
  });

  it('ignores startup after the visitor abandoned the desktop', () => {
    const startup = reduce(returning, { type: 'startup', attempt: returning.attempt });
    expect(startup.state).toBe(returning);
    expect(startup.effects).toEqual([]);
  });

  it('drops a startup from an abandoned generation', () => {
    const stale = reduce(win95Booted, { type: 'startup', attempt: 0 });
    expect(stale.state).toBe(win95Booted);
    expect(stale.effects).toEqual([]);
  });
});

describe('presentation reducer: ready', () => {
  it('records readiness without revealing a desktop that has not started', () => {
    const { state, effects } = reduce(win95Booted, {
      type: 'ready',
      attempt: win95Booted.attempt,
    });
    expect(state).toMatchObject({
      target: 'win95',
      visible: 'classic',
      phase: 'ready',
      pending: true,
    });
    expect(effects).toEqual([]);
  });

  it('settles the pending overlay when the desktop is already visible', () => {
    const { state, effects } = reduce(revealed, {
      type: 'ready',
      attempt: win95Booted.attempt,
    });
    expect(state).toMatchObject({ phase: 'ready', pending: false });
    expect(effects).toEqual([]);
  });

  it('lets a later commit reveal a desktop that was ready while hidden', () => {
    const hiddenReady = reduce(win95Booted, {
      type: 'ready',
      attempt: win95Booted.attempt,
    }).state;
    const commit = reduce(hiddenReady, {
      type: 'commit',
      target: 'win95',
      attempt: win95Booted.attempt,
    });
    expect(commit.state).toMatchObject({
      visible: 'win95',
      phase: 'ready',
      pending: false,
    });
    expect(commit.effects).toContainEqual({ type: 'paint', target: 'win95', visible: 'win95' });
  });

  it('drops a ready from an abandoned generation', () => {
    const stale = reduce(win95Booted, { type: 'ready', attempt: 0 });
    expect(stale.state).toBe(win95Booted);
    expect(stale.effects).toEqual([]);
  });

  it('ignores a late ready after the visitor cancelled the entry', () => {
    const cancelled = reduce(win95Booted, { type: 'request', target: 'classic' }).state;
    const { state, effects } = reduce(cancelled, {
      type: 'ready',
      attempt: cancelled.attempt,
    });
    expect(state).toBe(cancelled);
    expect(state).toMatchObject({ target: 'classic', phase: 'returning', pending: true });
    expect(effects).toEqual([]);
  });

  it('ignores a late ready after a failure and keeps the banner', () => {
    const failed = reduce(win95Booted, { type: 'fail' }).state;
    const { state, effects } = reduce(failed, { type: 'ready', attempt: failed.attempt });
    expect(state).toBe(failed);
    expect(state).toMatchObject({ target: 'classic', phase: 'failed', pending: false });
    expect(effects).toEqual([]);
  });

  it('ignores a late ready while the desktop is returning to classic', () => {
    const returningVisible = reduce(revealed, { type: 'request', target: 'classic' }).state;
    const { state, effects } = reduce(returningVisible, {
      type: 'ready',
      attempt: returningVisible.attempt,
    });
    expect(state).toBe(returningVisible);
    expect(state.pending).toBe(true);
    expect(effects).toEqual([]);
  });
});

describe('presentation reducer: classic restored', () => {
  it('returns control to classic, restores reading and focuses the toggle', () => {
    const { state, effects } = reduce(revealed, {
      type: 'classic-restored',
      attempt: revealed.attempt,
      destination: { kind: 'article', id: 'colophon' },
    });
    expect(state).toMatchObject({
      target: 'classic',
      visible: 'classic',
      phase: 'idle',
      pending: false,
    });
    expect(effects).toEqual([
      { type: 'paint', target: 'classic', visible: 'classic' },
      { type: 'restore-reading', destination: { kind: 'article', id: 'colophon' } },
      { type: 'focus', selector: PRESENTATION_FOCUS_SELECTOR },
    ]);
  });

  it('releases the boot mask when the return completes before startup did', () => {
    const { state, effects } = reduce(win95Booted, {
      type: 'classic-restored',
      attempt: win95Booted.attempt,
      destination: { kind: 'article', id: 'colophon' },
    });
    expect(state).toMatchObject({
      target: 'classic',
      visible: 'classic',
      phase: 'idle',
      pending: false,
      bootReadySent: true,
    });
    expect(effects).toEqual([
      { type: 'paint', target: 'classic', visible: 'classic' },
      { type: 'boot-ready' },
      { type: 'restore-reading', destination: { kind: 'article', id: 'colophon' } },
      { type: 'focus', selector: PRESENTATION_FOCUS_SELECTOR },
    ]);
  });

  it('skips reading restoration without a destination but still focuses', () => {
    const { effects } = reduce(revealed, {
      type: 'classic-restored',
      attempt: revealed.attempt,
    });
    expect(effects).toEqual([
      { type: 'paint', target: 'classic', visible: 'classic' },
      { type: 'focus', selector: PRESENTATION_FOCUS_SELECTOR },
    ]);
  });

  it('drops a restoration from an abandoned generation', () => {
    const stale = reduce(revealed, { type: 'classic-restored', attempt: 0 });
    expect(stale.state).toBe(revealed);
    expect(stale.effects).toEqual([]);
  });
});

describe('presentation reducer: failure', () => {
  it('falls back to classic, keeps the preference, and writes the cooldown', () => {
    const { state, effects } = reduce(win95Booted, { type: 'fail' });
    expect(state).toMatchObject({
      target: 'classic',
      visible: 'classic',
      phase: 'failed',
      pending: false,
      cooldown: 'win95',
      bootReadySent: true,
    });
    // No `persist` effect: the saved win95 preference survives the failure.
    expect(effects).toEqual([
      { type: 'write-cooldown', target: 'win95' },
      { type: 'paint', target: 'classic', visible: 'classic' },
      { type: 'boot-ready' },
      { type: 'focus', selector: PRESENTATION_FOCUS_SELECTOR },
    ]);
  });

  it('a classic-return failure does not arm desktop suppression', () => {
    const { state, effects } = reduce(returning, { type: 'fail' });
    expect(state).toMatchObject({
      target: 'classic',
      visible: 'classic',
      phase: 'failed',
      pending: false,
      cooldown: null,
      bootReadySent: true,
    });
    // No `write-cooldown`: the desktop was already being left, so the saved
    // preference must stay eligible for automatic entry next session.
    expect(effects).toEqual([
      { type: 'paint', target: 'classic', visible: 'classic' },
      { type: 'focus', selector: PRESENTATION_FOCUS_SELECTOR },
    ]);
  });

  it('a cancelled entry that fails settles classic, releases the mask and restores focus', () => {
    const cancelled = reduce(win95Booted, { type: 'request', target: 'classic' }).state;
    const { state, effects } = reduce(cancelled, {
      type: 'fail',
      attempt: cancelled.attempt,
    });
    expect(state).toMatchObject({
      target: 'classic',
      visible: 'classic',
      phase: 'failed',
      pending: false,
      cooldown: null,
      bootReadySent: true,
    });
    expect(effects).toEqual([
      { type: 'paint', target: 'classic', visible: 'classic' },
      { type: 'boot-ready' },
      { type: 'focus', selector: PRESENTATION_FOCUS_SELECTOR },
    ]);
  });

  it('preserves an existing cooldown on a classic-target failure', () => {
    const { state, effects } = reduce(coolingDown, { type: 'fail' });
    expect(state.cooldown).toBe('win95');
    expect(state.pending).toBe(false);
    expect(effects.some((effect) => effect.type === 'write-cooldown')).toBe(false);
  });

  it('emits boot-ready exactly once', () => {
    const first = reduce(win95Booted, { type: 'fail' });
    const second = reduce(first.state, { type: 'fail' });
    expect(first.effects.filter((effect) => effect.type === 'boot-ready')).toHaveLength(1);
    expect(second.effects.some((effect) => effect.type === 'boot-ready')).toBe(false);
    expect(second.state.bootReadySent).toBe(true);
  });

  it('drops a stale failure from an abandoned attempt', () => {
    const current = reduce(INITIAL_PRESENTATION_STATE, {
      type: 'request',
      target: 'win95',
    }).state;
    expect(current.attempt).toBe(1);
    const stale = reduce(current, { type: 'fail', attempt: 0 });
    expect(stale.state).toBe(current);
    expect(stale.effects).toEqual([]);

    const matching = reduce(current, { type: 'fail', attempt: 1 });
    expect(matching.state.phase).toBe('failed');
    expect(matching.state.pending).toBe(false);
  });
});

describe('presentation reducer: failure dismiss', () => {
  it('clears the failed phase without touching the cooldown', () => {
    const failed = reduce(win95Booted, { type: 'fail' }).state;
    const { state, effects } = reduce(failed, { type: 'failure-dismiss' });
    expect(state).toMatchObject({
      target: 'classic',
      visible: 'classic',
      phase: 'idle',
      pending: false,
      cooldown: 'win95',
    });
    expect(effects).toEqual([{ type: 'focus', selector: PRESENTATION_FOCUS_SELECTOR }]);
  });

  it('is a no-op once the banner is already dismissed', () => {
    const failed = reduce(win95Booted, { type: 'fail' }).state;
    const dismissed = reduce(failed, { type: 'failure-dismiss' }).state;
    const again = reduce(dismissed, { type: 'failure-dismiss' });
    expect(again.state).toBe(dismissed);
    expect(again.effects).toEqual([]);
  });
});

describe('presentation reducer: iframe reload', () => {
  it('hides the desktop, marks the handoff pending, bumps the attempt and boots ready once', () => {
    const { state, effects } = reduce(revealed, {
      type: 'iframe-reload',
      attempt: revealed.attempt,
    });
    expect(state).toMatchObject({
      target: 'win95',
      visible: 'classic',
      phase: 'connecting',
      attempt: revealed.attempt + 1,
      pending: true,
      bootReadySent: true,
    });
    expect(effects).toEqual([{ type: 'paint', target: 'win95', visible: 'classic' }]);
  });

  it('boots ready on the first reload when nothing else has released the mask', () => {
    const { effects } = reduce(win95Booted, {
      type: 'iframe-reload',
      attempt: win95Booted.attempt,
    });
    expect(effects).toEqual([
      { type: 'paint', target: 'win95', visible: 'classic' },
      { type: 'boot-ready' },
    ]);
  });

  it('does not repeat boot-ready on later reloads', () => {
    const first = reduce(revealed, { type: 'iframe-reload', attempt: revealed.attempt });
    const second = reduce(first.state, {
      type: 'iframe-reload',
      attempt: first.state.attempt,
    });
    expect(second.state.attempt).toBe(first.state.attempt + 1);
    expect(second.state.pending).toBe(true);
    expect(second.effects).toEqual([{ type: 'paint', target: 'win95', visible: 'classic' }]);
  });

  it('drops a stale reload event', () => {
    const stale = reduce(win95Booted, { type: 'iframe-reload', attempt: 0 });
    expect(stale.state).toBe(win95Booted);
    expect(stale.effects).toEqual([]);
  });

  it('does not restart a settled classic presentation when a hidden frame reloads', () => {
    const cancelled = reduce(win95Booted, { type: 'request', target: 'classic' }).state;
    const settled = reduce(cancelled, { type: 'commit', target: 'classic' }).state;
    expect(settled).toMatchObject({ target: 'classic', visible: 'classic', phase: 'idle' });
    const { state, effects } = reduce(settled, {
      type: 'iframe-reload',
      attempt: settled.attempt,
    });
    expect(state).toBe(settled);
    expect(state.pending).toBe(false);
    expect(effects).toEqual([]);
  });

  it('keeps a failure banner through a hidden frame reload', () => {
    const failed = reduce(win95Booted, { type: 'fail' }).state;
    const { state, effects } = reduce(failed, { type: 'iframe-reload', attempt: failed.attempt });
    expect(state).toBe(failed);
    expect(state.phase).toBe('failed');
    expect(effects).toEqual([]);
  });
});

describe('presentation reducer: pending lifecycle', () => {
  it('tracks requests, reveals, returns and failures', () => {
    expect(win95Booted.pending).toBe(true);

    const started = reduce(win95Booted, {
      type: 'startup',
      attempt: win95Booted.attempt,
    }).state;
    expect(started.pending).toBe(false);

    const back = reduce(started, { type: 'request', target: 'classic' }).state;
    expect(back.pending).toBe(true);
    expect(back.phase).toBe('returning');

    const settled = reduce(back, { type: 'commit', target: 'classic' }).state;
    expect(settled.pending).toBe(false);
    expect(settled.phase).toBe('idle');

    const reloading = reduce(started, {
      type: 'iframe-reload',
      attempt: started.attempt,
    }).state;
    expect(reloading.pending).toBe(true);

    const failed = reduce(reloading, { type: 'fail', attempt: reloading.attempt }).state;
    expect(failed.pending).toBe(false);
    expect(failed.phase).toBe('failed');
  });
});

describe('presentation reducer: boot signal', () => {
  it('shares one boot-ready guard across startup, commit and failure', () => {
    const started = reduce(win95Booted, {
      type: 'startup',
      attempt: win95Booted.attempt,
    });
    expect(started.effects.filter((effect) => effect.type === 'boot-ready')).toHaveLength(1);

    const committed = reduce(started.state, {
      type: 'commit',
      target: 'win95',
      attempt: started.state.attempt,
    });
    expect(committed.effects.some((effect) => effect.type === 'boot-ready')).toBe(false);

    const failed = reduce(committed.state, { type: 'fail', attempt: committed.state.attempt });
    expect(failed.effects.some((effect) => effect.type === 'boot-ready')).toBe(false);
  });

  it('marks boot ready at most once', () => {
    const first = reduce(win95Booted, { type: 'mark-boot-ready' });
    expect(first.state.bootReadySent).toBe(true);
    expect(first.effects).toEqual([{ type: 'boot-ready' }]);
    expect(reduce(first.state, { type: 'mark-boot-ready' }).effects).toEqual([]);
  });

  it('shares the boot-ready guard with failures and reloads', () => {
    const marked = reduce(win95Booted, { type: 'mark-boot-ready' }).state;
    const failed = reduce(marked, { type: 'fail' });
    expect(failed.effects.some((effect) => effect.type === 'boot-ready')).toBe(false);
    const reloaded = reduce(marked, { type: 'iframe-reload' });
    expect(reloaded.effects.some((effect) => effect.type === 'boot-ready')).toBe(false);
  });
});

describe('presentation reducer: notices', () => {
  it('stores and dismisses sync errors', () => {
    const set = reduce(win95Booted, { type: 'sync-error', message: 'conflict' });
    expect(set.state.syncError).toBe('conflict');
    expect(reduce(set.state, { type: 'sync-error', message: 'conflict' }).state).toBe(set.state);
    const dismissed = reduce(set.state, { type: 'sync-error-dismiss' });
    expect(dismissed.state.syncError).toBe('');
    expect(reduce(dismissed.state, { type: 'sync-error-dismiss' }).state).toBe(dismissed.state);
  });

  it('clears a cooldown only when one is present', () => {
    const cleared = reduce(coolingDown, { type: 'clear-cooldown' });
    expect(cleared.state.cooldown).toBeNull();
    expect(cleared.effects).toEqual([{ type: 'clear-cooldown' }]);
    const again = reduce(cleared.state, { type: 'clear-cooldown' });
    expect(again.state).toBe(cleared.state);
    expect(again.effects).toEqual([]);
  });
});
