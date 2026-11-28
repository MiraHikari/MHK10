import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { AppServices } from '../../os/host/app-contracts';
import type { FileAudioSnapshot } from '../../os/audio/file-audio';
import { createAudio } from '../../os/audio/pcspeaker';
import { createFileSystem } from '../../os/files/filesystem';
import { appTestFixture } from '../testing/app-test-fixture';
const fixtureAudio = vi.hoisted(() => ({
  snapshot: {
    phase: 'loading',
    playing: false,
    position: 0,
    duration: 0,
    error: '',
  } as FileAudioSnapshot,
  play: vi.fn(async () => true),
  pause: vi.fn(),
  stop: vi.fn(),
  dispose: vi.fn(),
  create: vi.fn(),
  speaker: vi.fn(),
}));
import { mediaPlayerApp } from './media-player.app';
beforeEach(() => {
  vi.clearAllMocks();
  fixtureAudio.snapshot = { phase: 'loading', playing: false, position: 0, duration: 0, error: '' };
});
function setup(initial = true, present = true) {
  const files = createFileSystem(null);
  const file = present ? files.createText('Track.wav', '').file! : undefined;
  const env: Partial<AppServices> = {
    initialFileId: initial ? (file?.id ?? 'missing') : undefined,
    files,
    loadFileAsset: vi.fn(async () => new Blob(['audio'])),
    fileAudio: {
      open(fileId) {
        fixtureAudio.create(fileId);
        return {
          snapshot: () => ({ ...fixtureAudio.snapshot }),
          ready: Promise.resolve(true),
          play: fixtureAudio.play,
          pause: fixtureAudio.pause,
          stop: fixtureAudio.stop,
          dispose: fixtureAudio.dispose,
        };
      },
    },
    setTitle: vi.fn(),
    close: vi.fn(),
    audio: {
      ...createAudio(),
      playSequence: () => {
        fixtureAudio.speaker();
        return { playing: true, position: 0, stop: vi.fn() };
      },
    },
  };
  const c = appTestFixture(mediaPlayerApp, env, { x: 0, y: 0, w: 374, h: 198 });
  c.view.win.id = 'file-media-player';
  return c;
}
describe('Media Player file sessions', () => {
  it('keeps Pause distinct from Stop before the speaker clock advances', () => {
    const current = setup(false);
    current.click('Play');
    expect(current.session.status()).toBe('Playing | PC Speaker');
    current.click('Pause');
    expect(current.session.status()).toBe('Paused | PC Speaker');
    current.click('Play');
    expect(current.session.status()).toBe('Playing | PC Speaker');
    current.click('Stop');
    expect(current.session.status()).toBe('Ready | PC Speaker');
    current.session.dispose();
  });
  it('keeps a file unavailable until metadata is ready and never starts on initialization', () => {
    const c = setup();
    expect(c.session.status()).toBe('Loading audio file...');
    c.click('Play');
    expect(fixtureAudio.play).not.toHaveBeenCalled();
    fixtureAudio.snapshot = { phase: 'ready', playing: false, position: 0, duration: 2, error: '' };
    expect(c.session.status()).toBe('Ready | Audio file');
    c.click('Play');
    expect(fixtureAudio.play).toHaveBeenCalledOnce();
    expect(c.env.setTitle).toHaveBeenCalledWith('file-media-player', 'Track.wav - Media Player');
    c.session.dispose();
    c.session.dispose();
    expect(fixtureAudio.dispose).toHaveBeenCalledOnce();
  });
  it('reports missing and invalid files without enabling Play', () => {
    const absent = setup(true, false);
    expect(absent.session.status()).toBe('The audio file is unavailable.');
    absent.click('Play');
    expect(fixtureAudio.create).not.toHaveBeenCalled();
    expect(fixtureAudio.play).not.toHaveBeenCalled();
    absent.session.dispose();
    const invalid = setup();
    fixtureAudio.snapshot = {
      phase: 'error',
      playing: false,
      position: 0,
      duration: 0,
      error: 'The audio file could not be decoded.',
    };
    expect(invalid.session.status()).toBe('The audio file could not be decoded.');
    invalid.click('Play');
    expect(fixtureAudio.play).not.toHaveBeenCalled();
    invalid.session.dispose();
  });
  it('retains the built-in playlist for file-less launches and explicit PC Speaker selection', () => {
    const fresh = setup(false);
    expect(fresh.session.status()).toBe('Ready | PC Speaker');
    fresh.click('Play');
    expect(fixtureAudio.speaker).toHaveBeenCalledOnce();
    fresh.session.dispose();
    const imported = setup();
    imported.view.menuSel = { menu: 'File', item: 'PC Speaker', command: 'speaker' };
    imported.frame();
    imported.view.menuSel = null;
    expect(imported.session.status()).toBe('Ready | PC Speaker');
    imported.click('Play');
    expect(fixtureAudio.speaker).toHaveBeenCalledTimes(2);
    imported.session.dispose();
  });
});
