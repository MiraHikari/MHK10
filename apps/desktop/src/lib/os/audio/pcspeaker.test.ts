import { createAudio, type AudioRuntime } from './pcspeaker';
const audioInstances: AudioRuntime[] = [];
const audioFixture = () => {
  const audio = createAudio();
  audioInstances.push(audio);
  return audio;
};
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { SpeakerEvent } from './speaker-sequence';
import { spectrumAt } from './speaker-sequence';

class Voice {
  type = 'square';
  frequency = { value: 0 };
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class Output {
  gain = { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
  connect = vi.fn();
  disconnect = vi.fn();
}
class SpeakerContext {
  static latest: SpeakerContext;
  currentTime = 0;
  state = 'running';
  destination = {};
  oscillators: Voice[] = [];
  outputs: Output[] = [];
  failGain = false;
  constructor() {
    SpeakerContext.latest = this;
  }
  createOscillator() {
    const voice = new Voice();
    this.oscillators.push(voice);
    return voice;
  }
  createGain() {
    if (this.failGain) throw new Error('Device lost');
    const output = new Output();
    this.outputs.push(output);
    return output;
  }
  close = vi.fn(async () => {});
  resume = vi.fn(async () => {});
}

beforeEach(() => {
  vi.stubGlobal('AudioContext', SpeakerContext);
});
afterEach(() => {
  for (const audio of audioInstances.splice(0)) audio.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('owned speaker playback', () => {
  it('keeps two hosts independent when one is muted and disposed', () => {
    const a = audioFixture(),
      b = audioFixture();
    a.primeAudio();
    const first = SpeakerContext.latest;
    b.primeAudio();
    const second = SpeakerContext.latest;
    const recording = vi.fn();
    b.subscribeSpeaker(recording);
    a.setVolume(0.1);
    a.setMuted(true);
    expect(b.getVolume()).toBe(0.8);
    expect(b.isMuted()).toBe(false);
    b.play('ding');
    const voices = second.oscillators.length;
    a.dispose();
    a.dispose();
    a.primeAudio();
    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).not.toHaveBeenCalled();
    b.play('click');
    expect(second.oscillators.length).toBeGreaterThan(voices);
    expect(recording).toHaveBeenCalled();
  });
  it('captures pending voices, resumes at the exact offset, and cancels only its own nodes', async () => {
    const speaker = audioFixture();
    speaker.primeAudio();
    const context = SpeakerContext.latest;
    const playback = speaker.playSequence(
      [
        { frequency: 440, start: 0, duration: 2 },
        { frequency: 660, start: 3, duration: 1 },
      ],
      { offset: 1 },
    );
    const other = speaker.playSequence([{ frequency: 220, start: 0, duration: 5 }]);
    expect(context.oscillators[0].stop).toHaveBeenCalledWith(1);
    expect(context.oscillators[1].start).toHaveBeenCalledWith(2);
    const events: SpeakerEvent[] = [];
    const unsubscribe = speaker.subscribeSpeaker((event) => events.push(event));
    expect(events.filter((event) => event.type === 'tone')).toHaveLength(3);
    context.currentTime = 0.5;
    playback.stop();
    playback.stop();
    expect(playback.position).toBe(1.5);
    expect(playback.playing).toBe(false);
    expect(context.oscillators[0].disconnect).toHaveBeenCalledOnce();
    expect(context.oscillators[1].disconnect).toHaveBeenCalledOnce();
    expect(context.oscillators[2].disconnect).not.toHaveBeenCalled();
    expect(events.filter((event) => event.type === 'stop')).toHaveLength(2);
    unsubscribe();
    other.stop();
    expect(events).toHaveLength(5);
  });
  it('disconnects normally completed voices and unwinds partial device failures', async () => {
    const speaker = audioFixture();
    speaker.primeAudio();
    const context = SpeakerContext.latest;
    speaker.play('ding');
    context.oscillators.forEach((voice) => voice.onended?.());
    expect(context.oscillators.every((voice) => voice.disconnect.mock.calls.length === 1)).toBe(
      true,
    );
    const listener = vi.fn();
    const unsubscribe = speaker.subscribeSpeaker(listener);
    expect(listener).not.toHaveBeenCalled();
    context.failGain = true;
    const failed = speaker.playSequence([{ frequency: 440, start: 0, duration: 1 }]);
    expect(failed.playing).toBe(false);
    expect(context.oscillators.at(-1)!.disconnect).toHaveBeenCalledOnce();
    unsubscribe();
  });
  it('applies volume and mute to already playing output, and measures only active voices', async () => {
    const speaker = audioFixture();
    speaker.primeAudio();
    speaker.setVolume(0.3);
    expect(SpeakerContext.latest.outputs[0].gain.setValueAtTime).toHaveBeenLastCalledWith(0.3, 0);
    speaker.setMuted(true);
    expect(SpeakerContext.latest.outputs[0].gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0);
    speaker.setMuted(false);
    expect(SpeakerContext.latest.outputs[0].gain.setValueAtTime).toHaveBeenLastCalledWith(0.3, 0);
    const tones = [{ frequency: 440, start: 1, duration: 1 }];
    expect(spectrumAt(tones, 0.5).every((value) => value === 0)).toBe(true);
    expect(spectrumAt(tones, 1.5).some((value) => value > 0)).toBe(true);
    expect(spectrumAt(tones, 2).every((value) => value === 0)).toBe(true);
  });

  it('keeps one event clock when a device becomes available during recording', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(7500);
    vi.stubGlobal('AudioContext', undefined);
    const speaker = audioFixture();
    speaker.primeAudio();
    expect(speaker.speakerTime()).toBe(7.5);
    const events: SpeakerEvent[] = [];
    const unsubscribe = speaker.subscribeSpeaker((event) => events.push(event));
    speaker.play('ding');
    expect(events[0]).toMatchObject({ type: 'tone', at: 7.5 });

    vi.stubGlobal('AudioContext', SpeakerContext);
    speaker.primeAudio();
    expect(speaker.speakerTime()).toBe(7.5);
    const context = SpeakerContext.latest;
    context.currentTime = 0.5;
    const playback = speaker.playSequence([{ frequency: 440, start: 0.25, duration: 1 }]);
    expect(speaker.speakerTime()).toBe(8);
    expect(events.at(-1)).toMatchObject({ type: 'tone', at: 8.25 });
    expect(context.oscillators[0].start).toHaveBeenCalledWith(0.75);
    context.currentTime = 0.75;
    playback.stop();
    expect(events.at(-1)).toMatchObject({ type: 'stop', at: 8.25 });
    unsubscribe();
  });

  it('cancels source events without claiming playback when the audio device is unavailable', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now * 1000);
    vi.stubGlobal('AudioContext', undefined);
    const speaker = audioFixture();
    const events: SpeakerEvent[] = [];
    const unsubscribe = speaker.subscribeSpeaker((event) => events.push(event));
    const playback = speaker.playSequence([
      { frequency: 440, start: 0, duration: 2 },
      { frequency: 660, start: 1, duration: 1 },
    ]);
    expect(events.filter((event) => event.type === 'tone')).toHaveLength(2);
    expect(playback.playing).toBe(false);
    expect(playback.position).toBe(0);
    now = 0.5;
    playback.stop();
    playback.stop();
    expect(events.filter((event) => event.type === 'stop')).toEqual([
      { type: 'stop', id: 1, at: 0.5 },
      { type: 'stop', id: 2, at: 0.5 },
    ]);
    const late = vi.fn();
    const unsubscribeLate = speaker.subscribeSpeaker(late);
    expect(late).not.toHaveBeenCalled();
    unsubscribeLate();
    unsubscribe();
  });

  it('releases silent source events after they expire or the last recorder unsubscribes', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now * 1000);
    vi.stubGlobal('AudioContext', undefined);
    const speaker = audioFixture();
    const unsubscribe = speaker.subscribeSpeaker(() => {});
    speaker.play('ding');
    now = 1;
    const late = vi.fn();
    const unsubscribeLate = speaker.subscribeSpeaker(late);
    expect(late).not.toHaveBeenCalled();
    speaker.play('ding');
    expect(late).toHaveBeenCalledTimes(2);
    unsubscribeLate();
    unsubscribe();
    const remounted = vi.fn();
    const unsubscribeRemounted = speaker.subscribeSpeaker(remounted);
    expect(remounted).not.toHaveBeenCalled();
    unsubscribeRemounted();
  });
});
