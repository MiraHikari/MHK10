import { appMetadata } from '../../../data/app-catalog';
import { C } from '../../gfx/palette';

import type { AppServices } from '../../os/host/app-contracts';
import { defineCanvasApp } from '../../os/host/app-session';

import { type SpeakerPlayback } from '../../os/audio/pcspeaker';
import { createMachineTape, type MachineTape } from './machine-tape';
import { drawMachineTape, tapeStatus } from './machine-tape-view';

import {
  createRecording,
  parseRecording,
  RECORDING_LIMIT,
  recordingEnvelope,
  serializeRecording,
  type Recording,
} from './recording-model';

interface State {
  recorder: ReturnType<typeof createRecording>;
  recording: Recording;
  active: boolean;
  dirty: boolean;
  saving: boolean;
  disposed: boolean;
  unsubscribe?: () => void;
  playback?: SpeakerPlayback;
  notice: string;
  name: string;
  winId: string;
  tape?: MachineTape;
  tapeOpen?: boolean;
  picker?: { files: { name: string; recording: Recording }[]; selected: number; top: number };
}
function stop(s: State, env: AppServices): void {
  if (s.active) s.recording = s.recorder.stop(env.audio.speakerTime());
  s.active = false;
  s.unsubscribe?.();
  s.unsubscribe = undefined;
  s.playback?.stop();
  s.playback = undefined;
}
async function save(s: State, env: AppServices): Promise<void> {
  if (s.saving) return;
  stop(s, env);
  const epoch = env.files.epoch;
  s.saving = true;
  const result = await env.saveText({
    name: s.name,
    content: serializeRecording(s.recording),
    folder: 'root',
  });
  if (s.disposed) return;
  s.saving = false;
  if (result.status === 'saved' && result.persisted && epoch === env.files.epoch) {
    s.dirty = false;
    s.name = result.file.name;
    s.notice = 'Recording saved.';
  } else {
    s.notice =
      result.status === 'failed'
        ? result.error
        : result.status === 'cancelled'
          ? 'Save cancelled.'
          : 'Recording remains open. Save again or export.';
  }
}
function changeRecording(s: State, env: AppServices, change: () => void): void {
  stop(s, env);
  if (!s.dirty) {
    change();
    return;
  }
  env.msg({
    title: 'Sound Recorder',
    icon: 'question',
    lines: ['Discard changes to this recording?'],
    buttons: ['Discard', 'Cancel'],
    def: 1,
    onBtn: (index) => {
      if (index === 0 && !s.disposed && !s.saving) change();
    },
  });
}

export const soundRecorderApp = defineCanvasApp<State>({
  ...appMetadata('sound-recorder'),
  // 录音时长 / 波形与播放游标是实时值；保存中也要帧以更新提示。
  needsFrame: (s) => {
    const tapePhase = s.tape?.snapshot().phase;
    return (
      s.active ||
      s.saving ||
      !!s.playback?.playing ||
      tapePhase === 'playing' ||
      tapePhase === 'starting'
    );
  },
  create: (env) => {
    const state: State = {
      recorder: createRecording(),
      recording: { duration: 0, tones: [] },
      active: false,
      dirty: false,
      saving: false,
      disposed: false,
      notice: '',
      name: 'Recording.SND.txt',
      winId: 'sound-recorder',
    };
    if (env.initialFileId) {
      const file = env.files.get(env.initialFileId);
      const recording = file && !file.deleted ? parseRecording(file.content) : undefined;
      if (recording && file) {
        state.recording = recording;
        state.name = file.name;
      } else
        state.notice =
          file && !file.deleted
            ? 'The recording file is invalid.'
            : 'The recording file is unavailable.';
    }
    return state;
  },
  menus: (s) => ({
    File: [
      { command: 'new', label: 'New', disabled: s.saving },
      { command: 'open', label: 'Open recording...', disabled: s.saving },
      {
        command: 'save',
        label: 'Save As...',
        disabled: s.saving || (!s.recording.duration && !s.active),
      },
      {
        command: 'export',
        label: 'Export recording',
        disabled: s.saving || (!s.recording.duration && !s.active),
      },
      '-',
      { command: 'close', label: 'Exit' },
    ],
    Source: [
      {
        command: 'sample-tape',
        label: s.tapeOpen ? 'My Recordings' : 'Sample Tape...',
        disabled: s.saving || s.active,
      },
      { command: 'test-tone', label: 'Test tone', disabled: s.saving },
    ],
  }),
  status: (s) =>
    (s.tapeOpen && s.tape && tapeStatus(s.tape)) ||
    s.notice ||
    (s.active
      ? `Recording | ${s.recording.tones.length} tones | PC Speaker`
      : s.playback?.playing
        ? 'Playing | PC Speaker'
        : `${s.recording.tones.length} tones | ${s.dirty ? 'Modified' : 'Ready'}`),
  checkpoint: (s) => !s.dirty && !s.active && !s.saving,
  dispose(s, env: AppServices) {
    if (s.disposed) return;
    s.disposed = true;
    s.tape?.dispose();
    stop(s, env);
  },
  onClose(s, env) {
    s.tape?.pause();
    stop(s, env);
    if (!s.dirty) return;
    env.msg({
      title: 'Unsaved Recording',
      icon: 'warn',
      lines: ['Save this recording before closing.'],
      buttons: ['Save', 'Discard', 'Cancel'],
      def: 2,
      onBtn: (index) => {
        if (s.disposed) return;
        if (index === 0)
          void save(s, env).then(() => {
            if (!s.disposed && !s.dirty) env.close(s.winId);
          });
        if (index === 1) {
          s.dirty = false;
          env.close(s.winId);
        }
      },
    });
    return false;
  },
  draw(s, v, env) {
    const c = v.client;
    s.winId = v.win.id;
    if (env.initialFileId)
      env.setTitle(v.win.id, `${s.name}${s.dirty ? ' *' : ''} - Sound Recorder`);
    const action = v.menuSel?.command;
    const leaveTape = () => {
      s.tape?.pause();
      s.tapeOpen = false;
      env.invalidate();
    };
    const toggleTape = () => {
      if (s.tapeOpen) leaveTape();
      else if (!s.active && !s.saving) {
        stop(s, env);
        s.tape ??= createMachineTape({
          inForeground: () =>
            env
              .processes?.()
              .some((process) => process.id === s.winId && process.focused && !process.minimized) ??
            true,
          output: () => ({ volume: env.audio.getVolume(), muted: env.audio.isMuted() }),
          invalidate: () => env.invalidate(),
        });
        s.tapeOpen = true;
        env.invalidate();
      }
    };
    const tapeShortcut =
      v.focused &&
      !s.picker &&
      v.win.menu.open < 0 &&
      (v.input.consumeKey('t') || v.input.consumeKey('T'));
    if (action === 'sample-tape' || tapeShortcut) toggleTape();
    if (s.tapeOpen && action && action !== 'sample-tape') leaveTape();
    if (s.tapeOpen && s.tape) {
      drawMachineTape(s.tape, v, !!env.reducedMotion, leaveTape);
      return;
    }
    if (s.active) {
      s.recording = s.recorder.snapshot(env.audio.speakerTime());
      if (s.recording.duration >= RECORDING_LIMIT) {
        stop(s, env);
        s.notice = 'The recording has reached 60 seconds.';
      }
      if (s.recorder.full) {
        stop(s, env);
        s.notice = 'The recording buffer is full.';
      }
    }
    if (s.playback && !s.playback.playing) stop(s, env);
    if (action === 'close') env.close(v.win.id);
    if (action === 'test-tone') {
      env.audio.primeAudio();
      env.play('ding');
    }
    if (action === 'new')
      changeRecording(s, env, () => {
        s.recording = { duration: 0, tones: [] };
        s.dirty = false;
        s.notice = '';
        s.name = 'Recording.SND.txt';
      });
    if (action === 'open')
      changeRecording(s, env, () => {
        const files = env.files
          .folders()
          .flatMap((folder) => env.files.list('documents', folder.id))
          .flatMap((file) => {
            const recording = parseRecording(file.content);
            return recording ? [{ name: file.name, recording }] : [];
          });
        if (!files.length) {
          s.notice = 'No recordings were found in My Documents.';
          return;
        }
        s.picker = { files, selected: 0, top: 0 };
      });
    if (action === 'save') void save(s, env);
    if (action === 'export') {
      stop(s, env);
      env.downloadText(s.name, serializeRecording(s.recording));
      s.notice = 'Recording exported.';
    }
    if (s.picker) {
      const picker = s.picker;
      v.draw.text('My Documents - Recordings', c.x + 12, c.y + 10, {
        font: 'bold',
        color: v.draw.TH.text,
      });
      v.widgets.field(c.x + 12, c.y + 30, c.w - 24, 117);
      if (v.input.hit(c.x + 12, c.y + 30, c.w - 24, 117).hover && v.input.io.wheel)
        picker.top += Math.sign(v.input.io.wheel);
      picker.top = Math.max(0, Math.min(Math.max(0, picker.files.length - 5), picker.top));
      picker.files.slice(picker.top, picker.top + 5).forEach((file, row) => {
        const index = picker.top + row;
        const y = c.y + 35 + row * 21;
        if (v.input.hit(c.x + 16, y, c.w - 50, 21).clicked) picker.selected = index;
        if (index === picker.selected) v.draw.rect(c.x + 16, y, c.w - 50, 21, v.draw.TH.sel);
        v.draw.text(v.draw.fitText(file.name, c.w - 66), c.x + 21, y + 5, {
          color: index === picker.selected ? v.draw.TH.selText : v.draw.TH.text,
        });
      });
      if (v.widgets.button(c.x + c.w - 31, c.y + 34, 16, 20, '^', { disabled: picker.top === 0 }))
        picker.top--;
      if (
        v.widgets.button(c.x + c.w - 31, c.y + 123, 16, 20, 'v', {
          disabled: picker.top + 5 >= picker.files.length,
        })
      )
        picker.top++;
      if (v.widgets.button(c.x + c.w - 167, c.y + 162, 70, 24, 'Open')) {
        const item = picker.files[picker.selected];
        s.recording = item.recording;
        s.name = item.name;
        s.dirty = false;
        s.notice = '';
        s.picker = undefined;
      }
      if (v.widgets.button(c.x + c.w - 87, c.y + 162, 70, 24, 'Cancel')) s.picker = undefined;
      return;
    }
    v.draw.text('PC Speaker', c.x + 12, c.y + 10, { font: 'bold', color: v.draw.TH.text });
    if (
      v.widgets.button(c.x + 104, c.y + 3, 112, 24, 'Sample Tape...', {
        disabled: s.active || s.saving,
      })
    )
      toggleTape();
    v.draw.text(
      s.active ? 'RECORDING' : s.playback?.playing ? 'PLAYING' : 'STOPPED',
      c.x + c.w - 12,
      c.y + 10,
      { align: 'right', color: s.active ? C.maroon : v.draw.TH.text },
    );
    v.widgets.field(c.x + 11, c.y + 30, c.w - 22, 79, C.black);
    const count = Math.floor((c.w - 36) / 3);
    const waveform = recordingEnvelope(s.recording, count);
    v.draw.rect(c.x + 18, c.y + 69, c.w - 36, 1, C.green);
    waveform.forEach((level, i) => {
      const height = Math.round(level * 30);
      if (height) v.draw.rect(c.x + 18 + i * 3, c.y + 69 - height, 2, height * 2 + 1, C.lime);
    });
    if (s.playback?.playing && !env.reducedMotion) {
      const marker = Math.floor(
        (s.playback.position / Math.max(0.1, s.recording.duration)) * (c.w - 36),
      );
      v.draw.rect(c.x + 18 + marker, c.y + 36, 1, 66, C.white);
    }
    v.draw.text(`Length: ${s.recording.duration.toFixed(1)} sec`, c.x + 13, c.y + 118, {
      color: v.draw.TH.text,
    });
    v.draw.text(`${s.recording.tones.length} tones`, c.x + c.w - 14, c.y + 118, {
      align: 'right',
      color: v.draw.TH.text,
    });
    if (
      v.widgets.button(c.x + 12, c.y + 141, 75, 25, 'Record', {
        disabled: s.active || s.saving || s.dirty,
      })
    ) {
      stop(s, env);
      env.audio.primeAudio();
      s.recorder.begin(env.audio.speakerTime());
      s.active = true;
      s.dirty = true;
      s.notice = '';
      s.unsubscribe = env.audio.subscribeSpeaker((event) => {
        if (!s.disposed) s.recorder.capture(event);
      });
    }
    if (
      v.widgets.button(c.x + 94, c.y + 141, 75, 25, 'Stop', { disabled: !s.active && !s.playback })
    )
      stop(s, env);
    if (
      v.widgets.button(c.x + 176, c.y + 141, 75, 25, 'Play', {
        disabled: s.active || s.saving || !s.recording.duration,
      })
    ) {
      stop(s, env);
      env.audio.primeAudio();
      s.playback = env.audio.playSequence(s.recording.tones, { duration: s.recording.duration });
      s.notice = s.playback.playing ? '' : 'The sound device is unavailable.';
    }
    if (
      v.widgets.button(c.x + c.w - 88, c.y + 141, 75, 25, 'Save As...', {
        disabled: s.saving || (!s.recording.duration && !s.active),
      })
    )
      void save(s, env);
    v.draw.text(
      s.saving ? 'Saving recording...' : s.dirty ? 'Unsaved recording' : s.name,
      c.x + 13,
      c.y + 179,
      { color: v.draw.TH.shadow },
    );
  },
});
