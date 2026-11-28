import { describe, expect, it, vi } from 'vite-plus/test';
import {
  createBrowserFileAudio,
  type FileAudioDependencies,
  type FileAudioElement,
} from './browser-file-audio';
class AudioFixture extends EventTarget {
  src = '';
  preload = '';
  autoplay = true;
  volume = 1;
  muted = false;
  currentTime = 0;
  duration = 2;
  paused = true;
  ended = false;
  canPlayType = vi.fn(() => 'probably' as const);
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  load = vi.fn();
  removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.src = '';
  });
}
function fixture(
  load: () => Promise<Blob | undefined> = async () => new Blob(['audio'], { type: 'audio/wav' }),
) {
  const audio = new AudioFixture();
  let update: () => void = () => {};
  const output = { volume: 0.4, muted: false },
    unwatch = vi.fn();
  const deps: FileAudioDependencies = {
    createAudio: vi.fn(() => audio as FileAudioElement),
    createUrl: vi.fn(() => 'blob:fixture'),
    revokeUrl: vi.fn(),
    watchOutput: vi.fn((callback) => {
      update = callback;
      return unwatch;
    }),
  };
  const player = createBrowserFileAudio(load, () => output, deps);
  const ready = async () => {
    await vi.waitFor(() => expect(audio.load).toHaveBeenCalled());
    audio.dispatchEvent(new Event('loadedmetadata'));
    await expect(player.ready).resolves.toBe(true);
  };
  return { audio, output, unwatch, deps, player, ready, update: () => update() };
}
describe('owned browser audio playback', () => {
  it('loads metadata without autoplay, starts explicitly and follows global output levels', async () => {
    const c = fixture();
    expect(await c.player.play()).toBe(false);
    await c.ready();
    expect(c.audio.autoplay).toBe(false);
    expect(c.audio.play).not.toHaveBeenCalled();
    expect(c.player.snapshot()).toMatchObject({ phase: 'ready', playing: false, duration: 2 });
    expect(await c.player.play()).toBe(true);
    expect(c.player.snapshot().playing).toBe(true);
    c.output.volume = 0.2;
    c.output.muted = true;
    c.update();
    expect(c.audio.volume).toBe(0.2);
    expect(c.audio.muted).toBe(true);
    c.audio.currentTime = 1;
    c.player.pause();
    expect(c.player.snapshot()).toMatchObject({ position: 1, playing: false });
    c.player.stop();
    expect(c.player.snapshot().position).toBe(0);
    c.player.dispose();
  });
  it('does not create an element or URL for missing or rejected assets', async () => {
    for (const load of [
      async () => undefined,
      async (): Promise<Blob> => {
        throw new Error('Missing');
      },
    ]) {
      const c = fixture(load);
      await expect(c.player.ready).resolves.toBe(false);
      expect(c.player.snapshot().phase).toBe('error');
      expect(c.deps.createAudio).not.toHaveBeenCalled();
      expect(c.deps.createUrl).not.toHaveBeenCalled();
      c.player.dispose();
    }
  });
  it('releases resources and listeners on decode failure and repeated disposal', async () => {
    const c = fixture();
    const added = vi.spyOn(c.audio, 'addEventListener'),
      removed = vi.spyOn(c.audio, 'removeEventListener');
    await vi.waitFor(() => expect(c.audio.load).toHaveBeenCalled());
    c.audio.dispatchEvent(new Event('error'));
    await expect(c.player.ready).resolves.toBe(false);
    expect(c.player.snapshot().phase).toBe('error');
    expect(c.deps.revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:fixture');
    expect(c.unwatch).toHaveBeenCalledOnce();
    expect(removed).toHaveBeenCalledTimes(added.mock.calls.length);
    expect(c.audio.src).toBe('');
    c.player.dispose();
    c.player.dispose();
    expect(c.deps.revokeUrl).toHaveBeenCalledTimes(1);
  });
  it('ignores late loading and metadata after disposal', async () => {
    let resolve!: (blob: Blob) => void;
    const c = fixture(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await Promise.resolve();
    c.player.dispose();
    await expect(c.player.ready).resolves.toBe(false);
    resolve(new Blob(['late'], { type: 'audio/wav' }));
    await Promise.resolve();
    await Promise.resolve();
    expect(c.deps.createUrl).not.toHaveBeenCalled();
    expect(c.deps.createAudio).not.toHaveBeenCalled();
    const next = fixture();
    await vi.waitFor(() => expect(next.audio.load).toHaveBeenCalled());
    next.player.dispose();
    next.audio.dispatchEvent(new Event('loadedmetadata'));
    expect(next.player.snapshot().phase).toBe('disposed');
    expect(next.deps.revokeUrl).toHaveBeenCalledTimes(1);
  });
  it('keeps a late play resolution stopped after Stop or disposal', async () => {
    const c = fixture();
    await c.ready();
    let finish!: () => void;
    c.audio.play.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const playing = c.player.play();
    c.player.stop();
    c.audio.paused = false;
    finish();
    expect(await playing).toBe(false);
    expect(c.audio.paused).toBe(true);
    c.player.dispose();
  });
  it('leaves a newer Play running when the Play from before Stop resolves late', async () => {
    const c = fixture();
    await c.ready();
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    c.audio.play
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const oldPlay = c.player.play();
    c.player.stop();
    const newPlay = c.player.play();
    c.audio.paused = false;
    second.resolve();
    expect(await newPlay).toBe(true);
    const pauses = c.audio.pause.mock.calls.length;
    first.resolve();
    expect(await oldPlay).toBe(false);
    expect(c.audio.pause).toHaveBeenCalledTimes(pauses);
    expect(c.player.snapshot().playing).toBe(true);
    c.player.dispose();
  });
  it('cleans up a partial initialization failure after URL creation', async () => {
    const c = fixture();
    c.deps.watchOutput = vi.fn(() => {
      throw new Error('Unavailable device');
    });
    await expect(c.player.ready).resolves.toBe(false);
    expect(c.player.snapshot().phase).toBe('error');
    expect(c.deps.revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:fixture');
    expect(c.audio.src).toBe('');
    c.player.dispose();
  });
});
