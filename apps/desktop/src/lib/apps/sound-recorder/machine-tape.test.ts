import { describe, expect, it, vi } from 'vite-plus/test';
import { createMachineTape } from './machine-tape';

class AudioElement extends EventTarget {
  src = '';
  currentTime = 0;
  autoplay = true;
  preload: HTMLAudioElement['preload'] = 'none';
  volume = 1;
  muted = false;
  play = vi.fn<() => Promise<void>>(() => Promise.resolve());
  pause = vi.fn();
  load = vi.fn();
  removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.src = '';
  });
}

function fixture() {
  const players: AudioElement[] = [];
  const environment = { visible: true, foreground: true, volume: 0.75, muted: false };
  let tick: (() => void) | undefined;
  let pageHidden: (() => void) | undefined;
  let nextPlayer: AudioElement | undefined;
  const unwatch = vi.fn(() => {
    tick = pageHidden = undefined;
  });
  const transport = createMachineTape(
    {
      inForeground: () => environment.foreground,
      output: () => environment,
      invalidate: vi.fn(),
    },
    {
      createAudio() {
        const player = nextPlayer ?? new AudioElement();
        nextPlayer = undefined;
        players.push(player);
        return player;
      },
      visible: () => environment.visible,
      watch(update, hide) {
        tick = update;
        pageHidden = hide;
        return unwatch;
      },
    },
  );
  return {
    players,
    transport,
    environment,
    unwatch,
    tick: () => tick?.(),
    pageHidden: () => pageHidden?.(),
    usePlayer: (player: AudioElement) => {
      nextPlayer = player;
    },
  };
}

describe('machine sample tape transport', () => {
  it('loads neither side without an explicit play command and shares the real clock across sides', async () => {
    const { players, transport, unwatch } = fixture();
    transport.select('B');
    transport.select('A');
    expect(players).toHaveLength(0);
    transport.toggle();
    await Promise.resolve();
    const [original] = players;
    expect(original.src).toMatch(/ibm-m2-a\.wav$/);
    expect(original.autoplay).toBe(false);
    original.currentTime = 1.23;
    transport.select('B');
    await Promise.resolve();
    const rewritten = players[1];
    expect(original.pause).toHaveBeenCalledOnce();
    expect(original.src).toBe('');
    expect(unwatch).toHaveBeenCalledOnce();
    expect(rewritten.src).toMatch(/ibm-m2-b\.wav$/);
    expect(transport.snapshot()).toMatchObject({ side: 'B', phase: 'playing', position: 1.23 });
    rewritten.currentTime = 1.87;
    transport.toggle();
    transport.select('A');
    expect(players).toHaveLength(2);
    expect(transport.snapshot()).toMatchObject({ side: 'A', phase: 'paused', position: 1.87 });
    transport.toggle();
    expect(players[2].currentTime).toBe(1.87);
    transport.replay();
    expect(players[3].currentTime).toBe(0);
    transport.stop();
    expect(transport.snapshot()).toMatchObject({ phase: 'ready', position: 0 });
  });

  it('keeps a visible muted playback state and releases on background, pagehide or disposal', async () => {
    const { players, transport, environment, tick, pageHidden, unwatch } = fixture();
    transport.toggle();
    await Promise.resolve();
    environment.muted = true;
    tick();
    expect(players[0]).toMatchObject({ muted: true, volume: 0.75 });
    expect(transport.snapshot()).toMatchObject({ muted: true, phase: 'playing' });

    players[0].currentTime = 1.15;
    environment.foreground = false;
    tick();
    expect(transport.snapshot()).toMatchObject({ phase: 'paused', position: 1.15 });
    environment.foreground = true;
    tick();
    expect(players).toHaveLength(1);
    transport.toggle();
    pageHidden();
    expect(players[1].src).toBe('');
    expect(transport.snapshot().position).toBe(1.15);
    transport.toggle();
    transport.dispose();
    transport.dispose();
    expect(unwatch).toHaveBeenCalledTimes(3);
    expect(players[2].src).toBe('');
    transport.replay();
    expect(players).toHaveLength(3);
  });

  it('reports unavailable audio and ignores a late start from an abandoned side', async () => {
    const { players, transport, usePlayer } = fixture();
    const slow = new AudioElement();
    let finish!: () => void;
    slow.play.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    usePlayer(slow);
    transport.toggle();
    transport.select('B');
    await Promise.resolve();
    players[1].dispatchEvent(new Event('error'));
    finish();
    await Promise.resolve();
    expect(transport.snapshot()).toMatchObject({ phase: 'unavailable', side: 'B' });
    expect(slow.src).toBe('');
    transport.replay();
    await Promise.resolve();
    players[2].dispatchEvent(new Event('ended'));
    expect(transport.snapshot()).toMatchObject({ phase: 'finished', position: 4.1 });
    expect(players[2].src).toBe('');
  });
});
