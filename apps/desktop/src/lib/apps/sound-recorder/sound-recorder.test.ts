import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { AppServices, MsgSpec } from '../../os/host/app-contracts';
import type { SpeakerEvent } from '../../os/audio/speaker-sequence';
import type { SaveTextResult } from '../../os/files/save-request';
import { createFileSystem } from '../../os/files/filesystem';
import { createAudio } from '../../os/audio/pcspeaker';
import { appTestFixture } from '../testing/app-test-fixture';

const audio = vi.hoisted(() => ({
  time: 0,
  listener: undefined as ((event: SpeakerEvent) => void) | undefined,
  unsubscribe: vi.fn(),
  stop: vi.fn(),
}));
import { soundRecorderApp } from './sound-recorder.app';

beforeEach(() => {
  audio.time = 0;
  audio.listener = undefined;
  vi.clearAllMocks();
});
function fixture(initial?: { name: string; content: string }) {
  const values = new Map<string, string>();
  const files = createFileSystem({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  });
  const opened = initial ? files.createText(initial.name, initial.content).file : undefined;
  let finish!: (result: SaveTextResult) => void;
  const env = {
    audio: {
      ...createAudio(),
      speakerTime: () => audio.time,
      primeAudio: vi.fn(),
      subscribeSpeaker: (listener: (event: SpeakerEvent) => void) => {
        audio.listener = listener;
        return audio.unsubscribe;
      },
      playSequence: () => ({ stop: audio.stop, position: 0, playing: true }),
    },
    files,
    initialFileId: opened?.id,
    setTitle: vi.fn(),
    saveText: vi.fn(
      () =>
        new Promise<SaveTextResult>((resolve) => {
          finish = resolve;
        }),
    ),
    msg: vi.fn<(spec: MsgSpec) => void>(),
    close: vi.fn(),
    downloadText: vi.fn(),
  } as unknown as AppServices;
  const c = appTestFixture(soundRecorderApp, env, { x: 0, y: 0, w: 384, h: 210 });
  c.view.win.id = 'recorder-instance';
  const { session, view, click } = c;
  const record = () => {
    click('Record');
    audio.listener?.({
      type: 'tone',
      id: 1,
      at: 0,
      tone: { frequency: 440, start: 0, duration: 2 },
    });
    audio.time = 1;
    click('Stop');
  };
  return { env, session, view, click, record, finish: (result: SaveTextResult) => finish(result) };
}

describe('Sound Recorder session', () => {
  it('loads an initial serialized recording without starting playback', () => {
    const current = fixture({
      name: 'Imported.snd',
      content: JSON.stringify({
        format: 'MHK10-PC-SPEAKER',
        version: 1,
        duration: 1,
        tones: [[0, 1, 440, 'square', 0.05]],
      }),
    });
    expect(current.session.status()).toBe('1 tones | Ready');
    expect(current.session.prepareUnload()).toBe(true);
    expect(audio.stop).not.toHaveBeenCalled();
    current.click('Play');
    expect(current.env.setTitle).toHaveBeenCalledWith(
      'recorder-instance',
      'Imported.snd - Sound Recorder',
    );
    current.session.dispose();
    expect(audio.stop).toHaveBeenCalledOnce();
  });
  it('leaves malformed imported scores unplayable', () => {
    const current = fixture({ name: 'Broken.snd.txt', content: '{broken' });
    expect(current.session.status()).toBe('The recording file is invalid.');
    current.click('Play');
    expect(audio.stop).not.toHaveBeenCalled();
    current.session.dispose();
  });
  it('retains a cancelled or failed save, then closes after durable saving', async () => {
    const current = fixture();
    current.record();
    expect(current.session.prepareUnload()).toBe(false);
    current.click('Save As...');
    const close = current.session.requestClose();
    const flushing = current.session.flushClose();
    current.finish({ status: 'failed', error: 'Disk full' });
    expect(await close).toBe(false);
    await flushing;
    expect(current.session.closed).toBe(false);
    expect(current.session.status()).toBe('Disk full');
    current.click('Save As...');
    const request = vi.mocked(current.env.saveText).mock.calls.at(-1)![0];
    const saved = current.env.files.createText(request.name, request.content);
    current.finish({ status: 'saved', file: saved.file!, persisted: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(current.session.prepareUnload()).toBe(true);
    const retry = current.session.requestClose();
    await current.session.flushClose();
    expect(await retry).toBe(true);
    expect(audio.unsubscribe).toHaveBeenCalledOnce();
  });
  it('rejects late save adoption after reset, and ignores callbacks after disposal', async () => {
    const current = fixture();
    current.record();
    current.click('Save As...');
    const saved = current.env.files.createText('before-reset.txt', 'score');
    current.env.files.reset();
    current.finish({ status: 'saved', file: saved.file!, persisted: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(current.session.prepareUnload()).toBe(false);
    const closing = current.session.requestClose();
    await current.session.flushClose();
    expect(await closing).toBe(false);
    const prompt = vi.mocked(current.env.msg).mock.calls.at(-1)![0];
    current.session.dispose();
    current.session.dispose();
    prompt.onBtn?.(1, current.env);
    expect(current.env.close).not.toHaveBeenCalled();
    expect(audio.unsubscribe).toHaveBeenCalledOnce();
  });
  it('stops playback on final disposal and starts a fresh recording on remount', () => {
    const current = fixture();
    current.record();
    current.click('Play');
    current.session.dispose();
    current.session.dispose();
    expect(audio.stop).toHaveBeenCalledOnce();
    const next = fixture();
    expect(next.session.prepareUnload()).toBe(true);
    expect(next.session.status()).toBe('0 tones | Ready');
    next.session.dispose();
  });
});
