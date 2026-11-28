import { describe, expect, it } from 'vite-plus/test';
import {
  createRecording,
  parseRecording,
  recordingEnvelope,
  serializeRecording,
} from './recording-model';

describe('PC speaker recordings', () => {
  it('clips a song already playing and removes tones cancelled before they start', () => {
    const recorder = createRecording();
    recorder.begin(10);
    recorder.capture({
      type: 'tone',
      id: 1,
      at: 9,
      tone: { frequency: 440, start: 0, duration: 3 },
    });
    recorder.capture({
      type: 'tone',
      id: 2,
      at: 12,
      tone: { frequency: 880, start: 0, duration: 2 },
    });
    recorder.capture({ type: 'stop', id: 2, at: 11 });
    const result = recorder.stop(11);
    expect(result.duration).toBe(1);
    expect(result.tones).toEqual([{ frequency: 440, start: 0, duration: 1 }]);
    recorder.capture({
      type: 'tone',
      id: 3,
      at: 11,
      tone: { frequency: 110, start: 0, duration: 1 },
    });
    expect(recorder.snapshot(20)).toEqual(result);
  });
  it('caps duration and data, and round-trips a bounded file under the filesystem limit', () => {
    const recorder = createRecording();
    recorder.begin(0);
    for (let i = 0; i < 1000; i++)
      recorder.capture({
        type: 'tone',
        id: i,
        at: 1,
        tone: { frequency: 440, start: 0, duration: 80 },
      });
    const result = recorder.stop(90);
    expect(result.duration).toBe(60);
    expect(result.tones).toHaveLength(256);
    const saved = serializeRecording(result);
    expect(saved.length).toBeLessThan(20000);
    expect(parseRecording(saved)?.tones).toHaveLength(256);
  });
  it('rejects malformed, oversized and out-of-range scores', () => {
    for (const raw of [
      {},
      42,
      ' '.repeat(20001),
      '{}',
      'null',
      '{',
      JSON.stringify({
        format: 'MHK10-PC-SPEAKER',
        version: 1,
        duration: 5,
        tones: [[0, 9, 440, 'square', 0.05]],
      }),
    ])
      expect(parseRecording(raw)).toBeUndefined();
  });
  it('reports silence and measured voice gain in waveform buckets', () => {
    expect(recordingEnvelope({ duration: 1, tones: [] }, 4)).toEqual([0, 0, 0, 0]);
    expect(
      recordingEnvelope(
        { duration: 2, tones: [{ frequency: 440, start: 0.5, duration: 0.5, gain: 0.05 }] },
        4,
      ),
    ).toEqual([0, 0.5, 0, 0]);
  });
});
