import { appMetadata } from '../../../data/app-catalog';
import { defineCanvasApp } from '../../os/host/app-session';
import { type SpeakerPlayback, type SpeakerTone } from '../../os/audio/pcspeaker';

import { C } from '../../gfx/palette';

import { dialStage, DIAL_DURATION, type DialStage } from './dialup-model';

const tones: SpeakerTone[] = [
  ...[697, 1209, 770, 1336, 852, 1477, 941, 1209].map((frequency, i) => ({
    frequency,
    start: i * 0.18,
    duration: 0.13,
    gain: 0.4,
  })),
  { frequency: 2100, start: 1.8, duration: 1.1, gain: 0.32 },
  ...Array.from({ length: 18 }, (_, i) => ({
    frequency: i % 2 ? 1200 : 2400,
    start: 3 + i * 0.14,
    duration: 0.12,
    gain: 0.22,
  })),
];
const labels: Record<DialStage, string> = {
  idle: 'Disconnected',
  dialing: 'Dialing MiraHikari...',
  carrier: 'Carrier detected',
  negotiating: 'Verifying connection...',
  connected: 'Connected at 33600 bps',
};
interface State {
  started: number | null;
  audio: SpeakerPlayback | null;
  notice: string;
}
const stop = (s: State) => {
  s.audio?.stop();
  s.audio = null;
  s.started = null;
};
export const dialupApp = defineCanvasApp<State>({
  ...appMetadata('dialup'),
  // 拨号阶段进度 / 闪烁来自 env.now()；接通后画面是静态的。
  needsFrame: (s, env) => s.started !== null && dialStage(env.now() - s.started) !== 'connected',
  create: () => ({ started: null, audio: null, notice: '' }),
  status: (s, env) =>
    s.notice || labels[dialStage(s.started === null ? null : env.now() - s.started)],
  dispose: stop,
  draw(s, v, env) {
    const c = v.client,
      elapsed = s.started === null ? null : env.now() - s.started,
      stage = dialStage(elapsed);
    v.draw.text('Connect to MiraHikari', c.x + 12, c.y + 12, { font: 'bold' });
    if (v.widgets.button(c.x + c.w - 158, c.y + 6, 146, 24, 'Long-Distance Directory')) {
      const result = env.open('network');
      if (!result.accepted) s.notice = 'The directory is unavailable in this desktop.';
    }
    v.widgets.field(c.x + 12, c.y + 36, c.w - 24, 48);
    v.draw.text('Using: MHK10 Serial Modem', c.x + 23, c.y + 48);
    v.draw.text('Destination: MiraHikari Home Page', c.x + 23, c.y + 67);
    v.draw.text(labels[stage], c.x + 12, c.y + 102);
    v.widgets.progress(
      c.x + 12,
      c.y + 123,
      c.w - 24,
      16,
      elapsed === null ? 0 : Math.min(1, elapsed / DIAL_DURATION),
    );
    const active = stage !== 'idle' && stage !== 'connected';
    const flash = active && !env.reducedMotion && Math.floor(env.now() * 8) % 2 === 0;
    v.draw.rect(
      c.x + c.w - 30,
      c.y + 100,
      7,
      7,
      stage === 'connected' || flash ? C.lime : v.draw.TH.shadow,
    );
    if (
      v.widgets.button(
        c.x + 12,
        c.y + c.h - 34,
        98,
        23,
        stage === 'idle' ? 'Connect' : 'Disconnect',
      )
    ) {
      if (stage !== 'idle') {
        stop(s);
        s.notice = 'Disconnected';
      } else {
        s.started = env.now();
        s.notice = '';
        env.audio.primeAudio();
        s.audio = env.audio.playSequence(tones);
      }
    }
    if (
      v.widgets.button(c.x + 119, c.y + c.h - 34, 122, 23, 'Open home page', {
        disabled: stage !== 'connected',
      })
    ) {
      const result = env.open('home');
      if (!result.accepted) s.notice = 'The home page is unavailable in this desktop.';
    }
    if (v.widgets.button(c.x + c.w - 78, c.y + c.h - 34, 66, 23, 'Close')) env.close(v.win.id);
  },
});
