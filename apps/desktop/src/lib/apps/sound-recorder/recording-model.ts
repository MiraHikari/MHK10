import type { SpeakerEvent, SpeakerTone } from '../../os/audio/speaker-sequence';

export interface Recording {
  duration: number;
  tones: SpeakerTone[];
}
export const RECORDING_LIMIT = 60;
const VOICE_LIMIT = 256;
const bounded = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** A bounded event recorder. Absolute speaker times become an editable local score. */
export function createRecording() {
  let started: number | undefined;
  let stopped = 0;
  let full = false;
  const voices = new Map<number, SpeakerTone>();
  const snapshot = (now: number): Recording => {
    const duration =
      started === undefined ? stopped : Math.max(0, Math.min(RECORDING_LIMIT, now - started));
    return {
      duration,
      tones: [...voices.values()]
        .map((tone) => ({
          ...tone,
          duration: Math.min(tone.duration, duration - tone.start),
        }))
        .filter((tone) => tone.duration > 0),
    };
  };
  return {
    begin(now: number) {
      voices.clear();
      started = now;
      stopped = 0;
      full = false;
    },
    capture(event: SpeakerEvent) {
      if (started === undefined) return;
      if (event.type === 'stop') {
        const tone = voices.get(event.id);
        if (tone)
          tone.duration = Math.max(0, Math.min(tone.duration, event.at - started - tone.start));
        return;
      }
      if (voices.has(event.id)) return;
      if (voices.size >= VOICE_LIMIT) {
        full = true;
        return;
      }
      const start = Math.max(0, event.at - started);
      const end = Math.min(RECORDING_LIMIT, event.at + event.tone.duration - started);
      if (end > start) voices.set(event.id, { ...event.tone, start, duration: end - start });
    },
    stop(now: number): Recording {
      const result = snapshot(now);
      started = undefined;
      stopped = result.duration;
      voices.clear();
      result.tones.forEach((tone, index) => voices.set(index, tone));
      return result;
    },
    snapshot,
    get full() {
      return full;
    },
  };
}

/** Compact tuples keep the maximum recording below the filesystem text limit. */
export function serializeRecording(recording: Recording): string {
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return JSON.stringify({
    format: 'MHK10-PC-SPEAKER',
    version: 1,
    duration: round(recording.duration),
    tones: recording.tones
      .filter((tone) => round(tone.duration) >= 0.001)
      .map((tone) => [
        round(tone.start),
        round(tone.duration),
        round(tone.frequency),
        tone.wave ?? 'square',
        round(tone.gain ?? 0.045),
      ]),
  });
}
export function parseRecording(raw: unknown): Recording | undefined {
  if (typeof raw !== 'string' || raw.length > 20000) return;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return;
    const data = value as Record<string, unknown>;
    if (
      data.format !== 'MHK10-PC-SPEAKER' ||
      data.version !== 1 ||
      !bounded(data.duration, 0, RECORDING_LIMIT) ||
      !Array.isArray(data.tones) ||
      data.tones.length > VOICE_LIMIT
    )
      return;
    const tones: SpeakerTone[] = [];
    for (const value of data.tones as unknown[]) {
      if (!Array.isArray(value) || value.length !== 5) return;
      const [start, duration, frequency, wave, gain]: unknown[] = value;
      if (
        !bounded(start, 0, RECORDING_LIMIT) ||
        !bounded(duration, 0.001, RECORDING_LIMIT) ||
        !bounded(frequency, 20, 20000) ||
        !bounded(gain, 0, 0.2)
      )
        return;
      if (wave !== 'square' && wave !== 'triangle' && wave !== 'sawtooth' && wave !== 'sine')
        return;
      if (start + duration > data.duration + 0.002) return;
      tones.push({ start, duration, frequency, wave, gain });
    }
    return { duration: data.duration, tones };
  } catch {
    return;
  }
}

/** Peak envelope of the actual captured voices, in horizontal time buckets. */
export function recordingEnvelope(recording: Recording, bins: number): number[] {
  const result = Array.from({ length: bins }, () => 0);
  if (!recording.duration) return result;
  for (const tone of recording.tones) {
    const from = Math.floor((tone.start / recording.duration) * bins);
    const to = Math.min(
      bins,
      Math.ceil(((tone.start + tone.duration) / recording.duration) * bins),
    );
    for (let i = from; i < to; i++) result[i] = Math.min(1, result[i] + (tone.gain ?? 0.045) * 10);
  }
  return result;
}
