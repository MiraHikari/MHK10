import type { FileAudio, FileAudioSnapshot } from './file-audio';
export type FileAudioElement = Pick<
  HTMLAudioElement,
  | 'src'
  | 'preload'
  | 'autoplay'
  | 'volume'
  | 'muted'
  | 'currentTime'
  | 'duration'
  | 'paused'
  | 'ended'
  | 'canPlayType'
  | 'play'
  | 'pause'
  | 'load'
  | 'removeAttribute'
  | 'addEventListener'
  | 'removeEventListener'
>;
export interface FileAudioDependencies {
  createAudio(): FileAudioElement;
  createUrl(blob: Blob): string;
  revokeUrl(url: string): void;
  watchOutput(update: () => void): () => void;
}
const browserDependencies: FileAudioDependencies = {
  createAudio: () => new Audio(),
  createUrl: (blob) => URL.createObjectURL(blob),
  revokeUrl: (url) => URL.revokeObjectURL(url),
  watchOutput(update) {
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  },
};

/** Owns one detached media element and Blob URL. Loading never requests playback. */
export function createBrowserFileAudio(
  load: () => Promise<Blob | undefined>,
  output: () => { volume: number; muted: boolean },
  dependencies: FileAudioDependencies = browserDependencies,
): FileAudio {
  let phase: FileAudioSnapshot['phase'] = 'loading',
    error = '';
  let element: FileAudioElement | undefined, url: string | undefined;
  let unwatch: (() => void) | undefined;
  let revision = 0,
    disposed = false,
    playRequested = false;
  const listeners: { type: string; listener: EventListener }[] = [];
  const { promise: ready, resolve: finishReady } = Promise.withResolvers<boolean>();
  function syncOutput() {
    if (!element || disposed) return;
    const value = output();
    element.volume = Number.isFinite(value.volume) ? Math.max(0, Math.min(1, value.volume)) : 0;
    element.muted = value.muted;
  }
  function release() {
    unwatch?.();
    unwatch = undefined;
    if (element) {
      listeners
        .splice(0)
        .forEach(({ type, listener }) => element?.removeEventListener(type, listener));
      try {
        element.pause();
        element.removeAttribute('src');
        element.load();
      } catch {
        /* Device is already unavailable. */
      }
      element = undefined;
    }
    if (url !== undefined) {
      dependencies.revokeUrl(url);
      url = undefined;
    }
  }
  function fail(message: string) {
    if (disposed) return;
    revision++;
    playRequested = false;
    phase = 'error';
    error = message;
    release();
    finishReady(false);
  }
  void Promise.resolve()
    .then(() => (disposed ? undefined : load()))
    .then((blob) => {
      if (disposed) return;
      if (!blob || !blob.size) {
        fail('The audio file is unavailable.');
        return;
      }
      try {
        element = dependencies.createAudio();
        element.autoplay = false;
        element.preload = 'metadata';
        if (blob.type.startsWith('audio/') && !element.canPlayType(blob.type)) {
          fail('This audio format is not supported.');
          return;
        }
        const audio = element;
        const metadata = () => {
          if (disposed || element !== audio) return;
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            phase = 'ready';
            error = '';
            finishReady(true);
          }
        };
        const listen = (type: string, listener: EventListener) => {
          listeners.push({ type, listener });
          audio.addEventListener(type, listener);
        };
        listen('loadedmetadata', metadata);
        listen('durationchange', metadata);
        listen('canplay', () => {
          metadata();
          if (!disposed && phase === 'loading') fail('The file contains no playable audio.');
        });
        listen('error', () => fail('The audio file could not be decoded.'));
        listen('ended', () => {
          if (!disposed) error = '';
        });
        url = dependencies.createUrl(blob);
        audio.src = url;
        syncOutput();
        unwatch = dependencies.watchOutput(syncOutput);
        audio.load();
      } catch {
        fail('The audio device is unavailable.');
      }
    })
    .catch(() => fail('The audio file is unavailable.'));
  return {
    ready,
    snapshot(): FileAudioSnapshot {
      return {
        phase,
        error,
        playing: phase === 'ready' && !!element && !element.paused && !element.ended,
        position:
          element && Number.isFinite(element.currentTime) ? Math.max(0, element.currentTime) : 0,
        duration: element && Number.isFinite(element.duration) ? Math.max(0, element.duration) : 0,
      };
    },
    async play(): Promise<boolean> {
      const audio = element;
      if (disposed || phase !== 'ready' || !audio) return false;
      const attempt = ++revision;
      playRequested = true;
      error = '';
      syncOutput();
      if (audio.ended || audio.currentTime >= audio.duration) audio.currentTime = 0;
      try {
        await audio.play();
        if (disposed || element !== audio || attempt !== revision) {
          // A newer Play owns this same element. An older completion may only
          // enforce a later Stop/Pause or release its own disposed element.
          if (disposed || element !== audio || !playRequested) audio.pause();
          return false;
        }
        return true;
      } catch {
        if (!disposed && attempt === revision) {
          playRequested = false;
          error = 'Audio playback could not start.';
        }
        return false;
      }
    },
    pause(): void {
      revision++;
      playRequested = false;
      element?.pause();
    },
    stop(): void {
      revision++;
      playRequested = false;
      if (element) {
        element.pause();
        try {
          element.currentTime = 0;
        } catch {
          /* Metadata is not ready. */
        }
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      revision++;
      playRequested = false;
      phase = 'disposed';
      release();
      finishReady(false);
    },
  };
}
