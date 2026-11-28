import type { Register } from '../../gfx/registers';
import { SOUND_SCHEMES, type SoundScheme } from '../../gfx/palette';
import type { AudioService, SoundName } from './pcspeaker';

export const SOUNDSCAPES: Record<Register, readonly SoundName[]> = {
  L0: ['click', 'error'],
  L1: ['click', 'ding'],
  L2: ['ding', 'error', 'up', 'down', 'shutdown'],
  L3: ['boot', 'chord', 'tada', 'boom'],
  L4: ['click', 'ding'],
};
const pitch: Record<SoundScheme, number> = {
  standard: 1,
  night: 0.75,
  void: 0.5,
  hotdog: 1.5,
  teal: 1.125,
  phosphor: 1,
  ribbon: 1.25,
};
export function playInRegister(
  audio: AudioService,
  name: SoundName,
  register: Register,
  scheme: SoundScheme,
): void {
  const active = SOUND_SCHEMES.includes(scheme) ? scheme : 'standard';
  if (register === 'L0' || register === 'L1') {
    audio.playSequence([
      {
        frequency: (name === 'error' ? 220 : 880) * pitch[active],
        start: 0,
        duration: register === 'L1' ? 0.025 : 0.09,
      },
    ]);
    return;
  }
  if (active === 'standard') {
    audio.play(name);
    return;
  }
  const base =
    (name === 'error' || name === 'boom' ? 196 : name === 'click' ? 1400 : 523) * pitch[active];
  const duration = name === 'click' ? 0.03 : 0.18;
  audio.playSequence(
    [0, ...(register === 'L3' ? [4, 7] : [])].map((semitone) => ({
      frequency: base * 2 ** (semitone / 12),
      start: 0,
      duration,
      gain: 0.04,
    })),
  );
}
