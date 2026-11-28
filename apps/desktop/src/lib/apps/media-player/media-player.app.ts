import type { AppServices } from '../../os/host/app-contracts';
import { appMetadata } from '../../../data/app-catalog';
import { C } from '../../gfx/palette';

import type { FileAudio } from '../../os/audio/file-audio';
import { defineCanvasApp } from '../../os/host/app-session';
import { type SpeakerPlayback, type SpeakerTone } from '../../os/audio/pcspeaker';
import { sequenceLength, spectrumAt } from '../../os/audio/speaker-sequence';

const melody = (notes: readonly number[], beat: number, bass: number): SpeakerTone[] =>
  Array.from({ length: 4 }, (_, phrase) =>
    notes.flatMap((frequency, index) => {
      const start = (phrase * notes.length + index) * beat;
      return [
        { frequency, start, duration: beat * 0.85, wave: 'triangle' as const, gain: 0.045 },
        {
          frequency: bass * (index % 4 === 2 ? 1.5 : 1),
          start,
          duration: beat * 0.65,
          gain: 0.023,
        },
        {
          frequency: frequency * 0.5,
          start,
          duration: beat * 0.7,
          wave: 'triangle' as const,
          gain: 0.018,
        },
      ];
    }),
  ).flat();

const TRACKS = [
  {
    title: 'An Ordinary Tuesday',
    tones: melody([262, 330, 392, 523, 440, 392, 330, 294], 0.27, 131),
  },
  {
    title: 'Tomorrow Is Pending',
    tones: melody([220, 262, 330, 294, 220, 196, 247, 330], 0.32, 110),
  },
  { title: 'Two Signatures', tones: melody([349, 440, 523, 440, 392, 330, 294, 349], 0.24, 175) },
];
interface State {
  track: number;
  source: 'speaker' | 'cd' | 'file';
  fileName?: string;
  audio?: FileAudio;
  disposed: boolean;
  position: number;
  paused: boolean;
  playback?: SpeakerPlayback;
  notice: string;
}
function stop(s: State, rewind = true): void {
  s.paused = !rewind;
  if (rewind) s.audio?.stop();
  else s.audio?.pause();
  if (s.playback) {
    s.position = s.playback.position;
    s.playback.stop();
    s.playback = undefined;
  }
  if (rewind) s.position = 0;
}
function start(s: State, env: AppServices): void {
  s.paused = false;
  if (s.source === 'file') {
    void s.audio?.play();
    return;
  }
  if (s.source === 'cd' || s.playback?.playing) return;
  env.audio.primeAudio();
  const tones = TRACKS[s.track].tones;
  if (s.position >= sequenceLength(tones)) s.position = 0;
  s.playback = env.audio.playSequence(tones, { offset: s.position });
  s.notice = s.playback.playing ? '' : 'The sound device is unavailable.';
}
const elapsed = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export const mediaPlayerApp = defineCanvasApp<State>({
  ...appMetadata('media-player'),
  // 播放位置 / 频谱 / 进度条来自实时位置；文件源加载期间也要帧。
  needsFrame: (s) => s.source === 'file' || !!s.playback?.playing,
  create: (env) => {
    const state: State = {
      track: 0,
      source: 'speaker',
      position: 0,
      paused: false,
      notice: '',
      disposed: false,
    };
    if (env.initialFileId) {
      state.source = 'file';
      const file = env.files.get(env.initialFileId);
      if (!file || file.deleted) state.notice = 'The audio file is unavailable.';
      else {
        state.fileName = file.name;
        state.audio = env.fileAudio.open(env.initialFileId);
      }
    }
    return state;
  },
  dispose(s) {
    if (s.disposed) return;
    s.disposed = true;
    stop(s);
    s.audio?.dispose();
  },
  menus: (s) => ({
    File: [
      { command: 'speaker', label: 'PC Speaker', checked: s.source === 'speaker', radio: true },
      { command: 'cd', label: 'Audio CD', checked: s.source === 'cd', radio: true },
      ...(s.fileName
        ? [{ command: 'file', label: 'Audio file', checked: s.source === 'file', radio: true }]
        : []),
      '-',
      { command: 'close', label: 'Exit' },
    ],
    Control: [
      {
        command: 'play',
        label: 'Play',
        disabled:
          s.source === 'cd' || (s.source === 'file' && s.audio?.snapshot().phase !== 'ready'),
      },
      {
        command: 'pause',
        label: 'Pause',
        disabled: s.source === 'file' ? !s.audio?.snapshot().playing : !s.playback?.playing,
      },
      {
        command: 'stop',
        label: 'Stop',
        disabled:
          s.source === 'cd' || (s.source === 'file' && s.audio?.snapshot().phase !== 'ready'),
      },
      { command: 'previous', label: 'Previous track', disabled: s.source !== 'speaker' },
      { command: 'next', label: 'Next track', disabled: s.source !== 'speaker' },
    ],
  }),
  status: (s) => {
    if (s.notice) return s.notice;
    if (s.source === 'file') {
      const audio = s.audio?.snapshot();
      return (
        audio?.error ||
        (audio?.phase === 'loading'
          ? 'Loading audio file...'
          : audio?.playing
            ? 'Playing | Audio file'
            : audio?.phase === 'ready'
              ? audio.position > 0 && audio.position < audio.duration
                ? 'Paused | Audio file'
                : 'Ready | Audio file'
              : 'The audio file is unavailable.')
      );
    }
    return s.source === 'cd'
      ? 'Please insert audio CD'
      : s.playback?.playing
        ? 'Playing | PC Speaker'
        : s.paused
          ? 'Paused | PC Speaker'
          : 'Ready | PC Speaker';
  },
  draw(s, v, env) {
    const c = v.client;
    const command = v.menuSel?.command;
    if (command === 'close') env.close(v.win.id);
    if (command === 'speaker' || command === 'cd' || command === 'file') {
      stop(s);
      s.source = command;
      s.notice = '';
    }
    if (s.playback) {
      s.position = s.playback.position;
      if (!s.playback.playing) {
        stop(s);
      }
    }
    const file = s.source === 'file';
    const audio = file ? s.audio?.snapshot() : undefined;
    const playing = file ? !!audio?.playing : !!s.playback?.playing;
    const available = s.source === 'speaker' || audio?.phase === 'ready';
    if (s.fileName) env.setTitle(v.win.id, file ? `${s.fileName} - Media Player` : 'Media Player');
    v.widgets.field(c.x + 10, c.y + 8, c.w - 20, 93, C.black);
    v.draw.text(
      s.source === 'cd'
        ? 'CD AUDIO'
        : file
          ? 'AUDIO FILE'
          : `TRACK ${String(s.track + 1).padStart(2, '0')}`,
      c.x + 19,
      c.y + 17,
      {
        font: 'bold',
        scale: 2,
        color: C.lime,
      },
    );
    v.draw.text(
      s.source === 'cd' ? '--:--' : elapsed(audio?.position ?? s.position),
      c.x + c.w - 21,
      c.y + 17,
      {
        font: 'bold',
        scale: 2,
        align: 'right',
        color: C.lime,
      },
    );
    v.draw.text(
      s.source === 'cd'
        ? 'Please insert audio CD'
        : file
          ? v.draw.fitText(s.fileName ?? 'Unavailable file', c.w - 38)
          : TRACKS[s.track].title,
      c.x + 19,
      c.y + 44,
      {
        font: 'bold',
        color: C.white,
      },
    );
    const levels =
      s.source === 'speaker' && s.playback?.playing && !env.audio.isMuted()
        ? spectrumAt(TRACKS[s.track].tones, env.reducedMotion ? 0 : s.position)
        : Array.from({ length: 16 }, () => 0);
    const spacing = Math.floor((c.w - 40) / 16);
    levels.forEach((level, bin) => {
      const count = Math.round(level * env.audio.getVolume() * 7);
      for (let i = 0; i < 7; i++) {
        v.draw.rect(
          c.x + 20 + bin * spacing,
          c.y + 91 - i * 4,
          spacing - 4,
          2,
          i >= count ? C.green : i > 4 ? C.yellow : C.lime,
        );
      }
    });
    v.widgets.progress(
      c.x + 10,
      c.y + 106,
      c.w - 20,
      12,
      s.source === 'cd'
        ? 0
        : file
          ? (audio?.position ?? 0) / Math.max(1, audio?.duration ?? 0)
          : s.position / sequenceLength(TRACKS[s.track].tones),
    );
    const transportY = c.y + 125;
    if (
      v.widgets.button(c.x + 10, transportY, 46, 23, '|<', { disabled: s.source !== 'speaker' }) ||
      (command === 'previous' && s.source === 'speaker')
    ) {
      stop(s);
      s.track = (s.track + TRACKS.length - 1) % TRACKS.length;
    }
    if (
      v.widgets.button(c.x + 61, transportY, 55, 23, 'Play', { disabled: !available || playing }) ||
      command === 'play'
    )
      start(s, env);
    if (
      v.widgets.button(c.x + 121, transportY, 55, 23, 'Pause', { disabled: !playing }) ||
      command === 'pause'
    )
      stop(s, false);
    if (
      v.widgets.button(c.x + 181, transportY, 55, 23, 'Stop', { disabled: !available }) ||
      command === 'stop'
    )
      stop(s);
    if (
      v.widgets.button(c.x + 241, transportY, 46, 23, '>|', { disabled: s.source !== 'speaker' }) ||
      (command === 'next' && s.source === 'speaker')
    ) {
      stop(s);
      s.track = (s.track + 1) % TRACKS.length;
    }
    if (
      v.widgets.button(
        c.x + c.w - 73,
        transportY,
        63,
        23,
        s.source === 'speaker' ? 'CD' : 'Speaker',
      )
    ) {
      stop(s);
      s.source = s.source === 'speaker' ? 'cd' : 'speaker';
      s.notice = '';
    }
    v.draw.text('Volume', c.x + 11, c.y + 162, { color: v.draw.TH.text });
    const volume = v.widgets.hslider(
      `${v.win.id}:media-volume`,
      c.x + 62,
      c.y + 154,
      c.w - 122,
      env.audio.getVolume(),
    );
    if (volume !== env.audio.getVolume()) {
      env.audio.setVolume(volume);
      env.desktop?.updateSettings({ volume });
    }
    v.draw.text(`${Math.round(env.audio.getVolume() * 100)}%`, c.x + c.w - 44, c.y + 162, {
      color: v.draw.TH.text,
    });
  },
});
