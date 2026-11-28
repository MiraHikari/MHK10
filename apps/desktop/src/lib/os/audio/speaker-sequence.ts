/** Seconds, hertz and linear gain. This score is also the recorder's file format. */
export interface SpeakerTone {
  frequency: number;
  start: number;
  duration: number;
  wave?: 'square' | 'triangle' | 'sawtooth' | 'sine';
  gain?: number;
}

export type SpeakerEvent =
  | { type: 'tone'; id: number; at: number; tone: SpeakerTone }
  | { type: 'stop'; id: number; at: number };

export function sequenceLength(tones: readonly SpeakerTone[]): number {
  return tones.reduce((duration, tone) => Math.max(duration, tone.start + tone.duration), 0);
}

/** The meter measures generated voices, never unrelated random animation. */
export function spectrumAt(tones: readonly SpeakerTone[], time: number, bins = 16): number[] {
  const levels = Array.from({ length: bins }, () => 0);
  for (const tone of tones) {
    if (time < tone.start || time >= tone.start + tone.duration) continue;
    const bin = Math.max(0, Math.min(bins - 1, Math.floor(Math.log2(tone.frequency / 55) * 2)));
    levels[bin] = Math.min(1, levels[bin] + (tone.gain ?? 0.045) * 12);
  }
  return levels;
}
