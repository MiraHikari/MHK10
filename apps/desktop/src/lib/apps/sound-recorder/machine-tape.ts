import { createLifetime } from '../../ui/browser/lifetime';
import { MACHINE_TAPE } from './machine-tape.generated';

export type TapeSide = keyof typeof MACHINE_TAPE.waveform;
type TapePhase = 'ready' | 'starting' | 'playing' | 'paused' | 'finished' | 'unavailable';
type TapeAudio = EventTarget &
  Pick<
    HTMLAudioElement,
    | 'src'
    | 'currentTime'
    | 'autoplay'
    | 'preload'
    | 'volume'
    | 'muted'
    | 'play'
    | 'pause'
    | 'load'
    | 'removeAttribute'
  >;

interface TapeBrowser {
  createAudio(): TapeAudio;
  visible(): boolean;
  watch(tick: () => void, pageHidden: () => void): () => void;
}

const browser: TapeBrowser = {
  createAudio: () => new Audio(),
  visible: () =>
    !document.hidden && !document.documentElement.hasAttribute('data-presentation-suspended'),
  watch(tick, pageHidden) {
    const lifetime = createLifetime();
    lifetime.listen(document, 'visibilitychange', tick);
    lifetime.listen(window, 'pagehide', pageHidden);
    const observer = new MutationObserver(tick);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-presentation-suspended'],
    });
    lifetime.defer(() => observer.disconnect());
    const timer = window.setInterval(tick, 100);
    lifetime.defer(() => window.clearInterval(timer));
    return () => lifetime.dispose();
  },
};

interface TapeOwner {
  inForeground(): boolean;
  output(): { volume: number; muted: boolean };
  invalidate(): void;
}

export function createMachineTape(owner: TapeOwner, device: TapeBrowser = browser) {
  let side: TapeSide = 'A';
  let phase: TapePhase = 'ready';
  let position = 0;
  let audio: TapeAudio | undefined;
  let releaseAudio: (() => void) | undefined;
  let disposed = false;
  const { duration } = MACHINE_TAPE;

  const canPlay = () => !disposed && device.visible() && owner.inForeground();
  const readPosition = () =>
    audio ? Math.min(duration, Math.max(0, audio.currentTime)) : position;
  const release = () => {
    const cleanup = releaseAudio;
    audio = releaseAudio = undefined;
    cleanup?.();
  };
  const settle = (next: TapePhase, at = readPosition()) => {
    position = at;
    release();
    phase = next;
    owner.invalidate();
  };
  const pause = () => {
    if (audio) settle('paused');
  };
  function play(from: number): void {
    if (disposed) return;
    release();
    position = from;
    if (!canPlay()) {
      settle('paused', from);
      return;
    }
    try {
      const element = device.createAudio();
      const lifetime = createLifetime();
      audio = element;
      releaseAudio = () => lifetime.dispose();
      lifetime.defer(() => {
        element.pause();
        element.removeAttribute('src');
        element.load();
      });
      const tick = () => {
        if (audio !== element) return;
        if (!canPlay()) {
          pause();
          return;
        }
        const { volume, muted } = owner.output();
        element.volume = volume;
        element.muted = muted;
      };
      const fail = () => {
        if (audio === element) settle('unavailable');
      };
      lifetime.listen(element, 'ended', () => {
        if (audio === element) settle('finished', duration);
      });
      lifetime.listen(element, 'error', fail);
      lifetime.defer(device.watch(tick, pause));
      element.autoplay = false;
      element.preload = 'auto';
      element.src = `/sounds/machine-tape/ibm-m2-${side.toLowerCase()}.wav`;
      element.currentTime = from;
      phase = 'starting';
      tick();
      owner.invalidate();
      if (audio !== element) return;
      void element.play().then(() => {
        if (audio !== element) return;
        if (!canPlay()) pause();
        else {
          phase = 'playing';
          owner.invalidate();
        }
      }, fail);
    } catch {
      settle('unavailable', from);
    }
  }

  return {
    snapshot: () => {
      const { muted, volume } = owner.output();
      return { side, phase, position: readPosition(), duration, muted: muted || volume === 0 };
    },
    select(next: TapeSide) {
      if (disposed || next === side) return;
      side = next;
      if (audio) play(readPosition());
      else owner.invalidate();
    },
    toggle() {
      if (audio) pause();
      else play(position >= duration ? 0 : position);
    },
    replay: () => play(0),
    pause,
    stop() {
      if (!disposed) settle('ready', 0);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      release();
    },
  };
}

export type MachineTape = ReturnType<typeof createMachineTape>;
