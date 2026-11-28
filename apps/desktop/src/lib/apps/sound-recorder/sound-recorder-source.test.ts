import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { parseRecording } from './recording-model';
import { createAudio, type AudioRuntime } from '../../os/audio/pcspeaker';
import { soundRecorderApp } from './sound-recorder.app';
import { appTestFixture } from '../testing/app-test-fixture';

let now = 0;
let speaker: AudioRuntime;
beforeEach(() => {
  now = 0;
  speaker = createAudio();
  vi.stubGlobal('AudioContext', undefined);
  vi.spyOn(performance, 'now').mockImplementation(() => now * 1000);
});
afterEach(() => {
  speaker.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function fixture() {
  const c = appTestFixture(
    soundRecorderApp,
    { audio: speaker, play: speaker.play },
    { x: 0, y: 0, w: 384, h: 210 },
  );
  const exported = () => {
    c.command('export');
    const content = vi.mocked(c.env.downloadText).mock.calls.at(-1)?.[1];
    return content === undefined ? undefined : parseRecording(content);
  };
  return { ...c, speaker, exported };
}

describe('Sound Recorder with the real speaker source and no audio device', () => {
  it('retains the generated test tone through later frames, Stop and export', async () => {
    const current = await fixture();
    current.click('Record');
    now = 0.1;
    current.command('test-tone');
    now = 0.35;
    current.frame();
    expect(current.session.status()).toBe('Recording | 2 tones | PC Speaker');
    now = 0.6;
    current.frame();
    current.click('Stop');
    expect(current.exported()).toEqual({
      duration: 0.6,
      tones: [
        { frequency: 880, start: 0.1, duration: 0.22, wave: 'triangle', gain: 0.06 },
        { frequency: 1760, start: 0.12, duration: 0.18, wave: 'triangle', gain: 0.02 },
      ],
    });
    current.click('Play');
    expect(current.session.status()).toBe('The sound device is unavailable.');
    current.session.dispose();
  });

  it('clips cancelled source notes and excludes notes that had not started', async () => {
    const current = await fixture();
    current.click('Record');
    const playback = current.speaker.playSequence([
      { frequency: 440, start: 0, duration: 1 },
      { frequency: 660, start: 0.4, duration: 1 },
    ]);
    now = 0.2;
    playback.stop();
    now = 0.6;
    current.click('Stop');
    expect(current.exported()).toEqual({
      duration: 0.6,
      tones: [{ frequency: 440, start: 0, duration: 0.2, wave: 'square', gain: 0.045 }],
    });
    current.session.dispose();
  });

  it('does not record while stopped or replay abandoned source events on remount', async () => {
    const current = await fixture();
    current.command('test-tone');
    expect(current.session.status()).toBe('0 tones | Ready');
    current.click('Record');
    now = 0.3;
    current.click('Stop');
    current.command('test-tone');
    expect(current.exported()).toEqual({ duration: 0.3, tones: [] });
    current.session.dispose();

    const next = await fixture();
    next.click('Record');
    next.command('test-tone');
    next.session.dispose();
    next.session.dispose();
    const remounted = await fixture();
    remounted.click('Record');
    now = 0.6;
    remounted.click('Stop');
    expect(remounted.exported()).toEqual({ duration: 0.3, tones: [] });
    remounted.session.dispose();
  });
});
