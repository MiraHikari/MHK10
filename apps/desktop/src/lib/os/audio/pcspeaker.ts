// Generated PC-speaker voices. The caller owns and cancels long sequences.
import { sequenceLength, type SpeakerEvent, type SpeakerTone } from './speaker-sequence';
export type { SpeakerEvent, SpeakerTone } from './speaker-sequence';

export type SoundName =
  | 'boot'
  | 'ding'
  | 'chord'
  | 'click'
  | 'up'
  | 'down'
  | 'error'
  | 'tada'
  | 'boom'
  | 'shutdown';
export interface SpeakerPlayback {
  stop(): void;
  readonly position: number;
  readonly playing: boolean;
}

export interface AudioService {
  setMuted(value: boolean): void;
  isMuted(): boolean;
  setVolume(value: number): void;
  getVolume(): number;
  speakerTime(): number;
  primeAudio(): void;
  subscribeSpeaker(listener: (event: SpeakerEvent) => void): () => void;
  playSequence(
    tones: readonly SpeakerTone[],
    options?: { offset?: number; duration?: number },
  ): SpeakerPlayback;
  play(name: SoundName): void;
}
export interface AudioRuntime extends AudioService {
  dispose(): void;
}
const note = (
  frequency: number,
  start: number,
  duration: number,
  wave: SpeakerTone['wave'] = 'square',
  gain = 0.045,
): SpeakerTone => ({ frequency, start, duration, wave, gain });
const SEQ: Record<SoundName, readonly SpeakerTone[]> = {
  boot: [note(262, 0, 0.12), note(330, 0.12, 0.12), note(392, 0.24, 0.12), note(523, 0.36, 0.22)],
  ding: [note(880, 0, 0.22, 'triangle', 0.06), note(1760, 0.02, 0.18, 'triangle', 0.02)],
  chord: [
    note(220, 0, 0.5, 'triangle', 0.05),
    note(262, 0, 0.5, 'triangle', 0.04),
    note(330, 0, 0.5, 'triangle', 0.04),
  ],
  click: [note(1400, 0, 0.03, 'square', 0.03)],
  up: [note(523, 0, 0.06), note(659, 0.05, 0.07)],
  down: [note(659, 0, 0.06), note(523, 0.05, 0.07)],
  error: [note(196, 0, 0.16), note(185, 0.14, 0.22)],
  tada: [note(523, 0, 0.1), note(659, 0.1, 0.1), note(784, 0.2, 0.1), note(1047, 0.3, 0.3)],
  boom: [note(110, 0, 0.3, 'sawtooth', 0.08), note(55, 0.05, 0.4, 'square', 0.06)],
  shutdown: [note(523, 0, 0.16), note(392, 0.16, 0.16), note(262, 0.32, 0.34)],
};

export function createAudio(): AudioRuntime {
  let disposed = false;
  let ac: AudioContext | null = null;
  let master: GainNode | null = null;
  let audioClockOffset = 0;
  let muted = false;
  let volume = 0.8;
  let serial = 0;
  const listeners = new Set<(event: SpeakerEvent) => void>();
  const voices = new Map<
    number,
    {
      event: Extract<SpeakerEvent, { type: 'tone' }>;
      audible: boolean;
      stop(): void;
      release(): void;
    }
  >();
  const emit = (event: SpeakerEvent) => {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        /* A recorder cannot interrupt the speaker. */
      }
    }
  };
  const gain = () => {
    if (ac && master) master.gain.setValueAtTime(muted ? 0 : volume, ac.currentTime);
  };
  function setMuted(value: boolean): void {
    muted = value;
    gain();
  }
  const isMuted = () => muted;
  function setVolume(value: number): void {
    volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : volume;
    gain();
  }
  const getVolume = () => volume;
  /** Recording and scheduled events share one timeline, including device acquisition. */
  const speakerTime = () => (ac ? audioClockOffset + ac.currentTime : performance.now() / 1000);

  function pruneSilentVoices(): void {
    const now = speakerTime();
    for (const voice of voices.values())
      if (!voice.audible && (!listeners.size || voice.event.at + voice.event.tone.duration <= now))
        voice.release();
  }

  /** The host or an explicit transport control calls this after a user gesture. */
  function primeAudio(): void {
    if (disposed) return;
    if (!ac) {
      let created: AudioContext | undefined;
      try {
        created = new AudioContext();
        const output = created.createGain();
        output.connect(created.destination);
        audioClockOffset = speakerTime() - created.currentTime;
        ac = created;
        master = output;
        gain();
      } catch {
        if (created) void created.close().catch(() => {});
      }
    }
    if (ac?.state === 'suspended') void ac.resume().catch(() => {});
  }

  /** Replay pending voices so starting a recording mid-song loses no notes. */
  function subscribeSpeaker(listener: (event: SpeakerEvent) => void): () => void {
    if (disposed) return () => {};
    pruneSilentVoices();
    listeners.add(listener);
    try {
      for (const { event } of voices.values()) listener(event);
    } catch (error) {
      listeners.delete(listener);
      pruneSilentVoices();
      throw error;
    }
    return () => {
      listeners.delete(listener);
      pruneSilentVoices();
    };
  }

  function playSequence(
    tones: readonly SpeakerTone[],
    options: { offset?: number; duration?: number } = {},
  ): SpeakerPlayback {
    pruneSilentVoices();
    const context = ac;
    const output = master;
    const offset = Math.max(0, options.offset ?? 0);
    const duration = Math.max(sequenceLength(tones), options.duration ?? 0);
    const start = context?.currentTime ?? 0;
    const sourceStart = context ? audioClockOffset + start : speakerTime();
    const owned = new Set<number>();
    let stopped = !context || !output;
    let stoppedAt = offset;
    const position = () => Math.min(duration, offset + (context?.currentTime ?? start) - start);
    // A recorder captures the requested score even when the output device is absent.
    // Playback still reports unavailable; these voices only exist while a recorder listens.
    if ((context && output) || listeners.size) {
      try {
        for (const tone of tones) {
          const remaining = tone.start + tone.duration - offset;
          if (
            remaining <= 0 ||
            !Number.isFinite(remaining) ||
            !Number.isFinite(tone.start) ||
            !Number.isFinite(tone.frequency) ||
            tone.frequency <= 0
          )
            continue;
          const delay = Math.max(0, tone.start - offset);
          const length = Math.min(tone.duration, remaining);
          let oscillator: OscillatorNode | undefined;
          let envelope: GainNode | undefined;
          if (context && output) {
            oscillator = context.createOscillator();
            try {
              envelope = context.createGain();
            } catch (error) {
              oscillator.disconnect();
              throw error;
            }
          }
          const id = ++serial;
          const at = start + delay;
          const level = Math.max(0, Math.min(0.2, tone.gain ?? 0.045));
          const event: Extract<SpeakerEvent, { type: 'tone' }> = {
            type: 'tone',
            id,
            at: sourceStart + delay,
            tone: { ...tone, start: 0, duration: length, gain: level },
          };
          let released = false;
          const release = () => {
            if (released) return;
            released = true;
            if (oscillator) {
              oscillator.onended = null;
              oscillator.disconnect();
            }
            envelope?.disconnect();
            voices.delete(id);
            owned.delete(id);
          };
          const stop = () => {
            if (released) return;
            emit({ type: 'stop', id, at: speakerTime() });
            try {
              oscillator?.stop();
            } catch {
              /* Already ended. */
            }
            release();
          };
          owned.add(id);
          voices.set(id, { event, audible: !!oscillator, stop, release });
          if (oscillator && envelope && output) {
            oscillator.type = tone.wave ?? 'square';
            oscillator.frequency.value = tone.frequency;
            envelope.gain.setValueAtTime(level, at);
            envelope.gain.setValueAtTime(level, at + Math.max(0, length - 0.015));
            envelope.gain.linearRampToValueAtTime(0, at + length);
            oscillator.connect(envelope);
            envelope.connect(output);
            oscillator.onended = release;
            oscillator.start(at);
            oscillator.stop(at + length);
          }
          emit(event);
        }
      } catch {
        for (const id of owned) voices.get(id)?.stop();
        stopped = true;
      }
    }
    return {
      stop() {
        if (stopped && !owned.size) return;
        if (!stopped) stoppedAt = position();
        stopped = true;
        for (const id of owned) voices.get(id)?.stop();
      },
      get position() {
        return stopped ? stoppedAt : position();
      },
      get playing() {
        return !stopped && position() < duration;
      },
    };
  }

  function play(name: SoundName): void {
    if (!disposed && !muted) playSequence(SEQ[name]);
  }

  return {
    setMuted,
    isMuted,
    setVolume,
    getVolume,
    speakerTime,
    primeAudio,
    subscribeSpeaker,
    playSequence,
    play,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const voice of voices.values()) voice.stop();
      voices.clear();
      listeners.clear();
      master?.disconnect();
      master = null;
      const context = ac;
      ac = null;
      if (context) void context.close().catch(() => {});
    },
  };
}
