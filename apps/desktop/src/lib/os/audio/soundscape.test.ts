import { describe, expect, it, vi } from 'vite-plus/test';
import { playInRegister } from './soundscape';
import { SOUND_SCHEMES, type SoundScheme } from '../../gfx/palette';
import type { AudioService } from './pcspeaker';

function audio() {
  return { play: vi.fn(), playSequence: vi.fn() };
}

describe('shared sound scheme rendering', () => {
  it('produces finite oscillator frequencies for every supported scheme', () => {
    for (const scheme of SOUND_SCHEMES) {
      const host = audio();
      playInRegister(host as unknown as AudioService, 'tada', 'L3', scheme);
      if (scheme === 'standard') expect(host.play).toHaveBeenCalledExactlyOnceWith('tada');
      else {
        expect(host.playSequence).toHaveBeenCalledTimes(1);
        const notes = host.playSequence.mock.calls[0][0] as { frequency: number }[];
        expect(notes.every((note) => Number.isFinite(note.frequency) && note.frequency > 0)).toBe(
          true,
        );
      }
    }
  });
  it('uses the standard scheme for unsupported runtime input', () => {
    const host = audio();
    playInRegister(host as unknown as AudioService, 'click', 'L0', '__proto__' as SoundScheme);
    expect(host.playSequence).toHaveBeenCalledExactlyOnceWith([
      { frequency: 880, start: 0, duration: 0.09 },
    ]);
  });
});
