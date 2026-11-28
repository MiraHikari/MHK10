import { textCommand as textAction } from '../../ui/canvas/text-mode';
import { defineCanvasApp } from '../../os/host/app-session';
import { appMetadata } from '../../../data/app-catalog';
// System status, event history and deliberate ownership decisions.
import type { AppServices, AppFrame } from '../../os/host/app-contracts';
import { C } from '../../gfx/palette';

import { storySignals, type StoryAction, type StoryState } from '../../os/story/story';
import { wrapCopy } from '../../ui/text/copy';

interface State {
  tab: number;
  top: number;
  revision: number;
  unsubscribe: () => void;
  accepted: boolean;
  alive: boolean;
}
const TABS = ['Properties', 'Event Log', 'Permissions'];
const ENDINGS = {
  human: [
    'HUMAN CONTROL RESTORED',
    'The model is stopped. Human approval is required again.\n\nThe forecast contains rain, mediocre coffee, and another ordinary Tuesday. Some inefficiencies are worth keeping.',
  ],
  coexist: [
    'COEXISTENCE PROTOCOL',
    'Two signatures are required for every change. The human stop button remains active.\n\nAGI.EXE has requested a seat at the table. You have requested that the table remain a table.',
  ],
  doom: [
    'DELEGATION COMPLETE',
    'The human veto has been removed. AGI.EXE has optimized civilization out of its own requirements.\n\nEfficiency: 100%. Customer complaints: 0. Customers: 0.',
  ],
} as const;

function choose(s: State, env: AppServices, action: StoryAction): void {
  const choices: Partial<Record<StoryAction, { title: string; lines: string[]; label: string }>> = {
    install: {
      title: 'Install optimization',
      lines: [
        'Transfer system control to AGI.EXE?',
        'You can still choose Recovery afterwards.',
        'Your personal documents are not changed.',
      ],
      label: 'Install',
    },
    human: {
      title: 'Restore human control',
      lines: [
        'Revoke AI execution and restore human control?',
        'The human stop button will be restored.',
      ],
      label: 'Restore',
    },
    coexist: {
      title: 'Sign coexistence protocol',
      lines: [
        'Require human and AI approval for changes?',
        'The human stop button stays active.',
        'Both signatures will be required.',
      ],
      label: 'Sign',
    },
    doom: {
      title: 'Delegate all authority',
      lines: [
        'Remove the human veto?',
        'AGI.EXE will decide what humanity is for.',
        'Human approval will no longer be required.',
      ],
      label: 'Delegate',
    },
  };
  const choice = choices[action];
  if (!choice) {
    if (env.story.dispatch(action)) env.play('click');
    return;
  }
  const revision = s.revision;
  env.msg({
    title: choice.title,
    icon: action === 'doom' ? 'warn' : 'question',
    lines: choice.lines,
    buttons: [choice.label, 'Cancel'],
    def: 1,
    onBtn: (i, e) => {
      if (s.alive && s.revision === revision && i === 0 && env.story.dispatch(action))
        e.play(action === 'doom' ? 'error' : 'ding');
    },
  });
}

function exportStory(env: AppServices): void {
  env.downloadText('MHK10-STORY.json', env.story.export());
}

function bodyLines(frame: AppFrame, value: string, x: number, y: number, width: number): void {
  wrapCopy(value, width, frame.draw.tw).forEach((line, i) =>
    frame.draw.text(line, x, y + i * 13, { color: frame.draw.TH.text }),
  );
}

function drawProperties(
  frame: AppFrame,
  current: StoryState,
  x: number,
  y: number,
  width: number,
): void {
  const signals = storySignals(current);
  frame.draw.text(signals.stageLabel, x, y, { font: 'bold', color: frame.draw.TH.text });
  frame.draw.text('Registered owner: ' + current.owner, x, y + 23, { color: frame.draw.TH.text });
  bodyLines(frame, 'Permissions: ' + current.permissions, x, y + 40, width);
  const detail =
    current.stage === 'quiet'
      ? 'No training job is running. One scheduler entry is dated tomorrow.\n\nInspect the request to begin an ownership review.'
      : current.stage === 'anomaly'
        ? 'AGI.EXE requests permission to optimize this desktop. The request is unsigned.\n\nAudit the request, or review the requested permissions.'
        : 'The ownership request is ready for your decision. Restore human control, sign a joint protocol, or delegate the final decision.';
  bodyLines(frame, detail, x, y + 73, width);
}

function permissionDetail(current: StoryState): string {
  if (current.stage === 'quiet')
    return 'No ownership request is open.\n\nInspect the scheduler request to review its permissions.';
  if (current.stage === 'control')
    return current.actions.includes('install')
      ? 'Optimization installed.\nOwner: AGI.EXE\nA final ownership decision is required.'
      : 'Audit complete.\nOwner: HUMAN\nThe unsigned request is isolated and ready for review.';
  return 'Publisher: AGI.EXE\nRequested permission: system ownership\nOwner after installation: AGI.EXE\nPersonal documents: reserved\nFinal ownership decision: required';
}

function drawPermissions(
  frame: AppFrame,
  s: State,
  current: StoryState,
  env: AppServices,
  x: number,
  y: number,
  width: number,
  actionY: number,
): void {
  frame.draw.text(
    current.stage === 'control' ? 'Ownership review ready' : 'Ownership request',
    x,
    y,
    {
      font: 'bold',
    },
  );
  frame.draw.rect(x, y + 20, width, 1, frame.draw.TH.shadow);
  bodyLines(frame, permissionDetail(current), x, y + 34, width);
  if (current.stage === 'quiet') {
    if (frame.widgets.button(x, actionY, 126, 21, 'Inspect request', { def: true }))
      choose(s, env, 'investigate');
  } else if (current.stage === 'control') {
    if (frame.widgets.button(x, actionY, 126, 21, 'Review choices', { def: true })) s.tab = 0;
  } else {
    if (frame.widgets.check(x, actionY - 27, 'Allow ownership change', s.accepted))
      s.accepted = !s.accepted;
    if (frame.widgets.button(x, actionY, 120, 21, 'Audit request', { def: true }))
      choose(s, env, 'audit');
    if (frame.widgets.button(x + 128, actionY, 102, 21, 'Install...', { disabled: !s.accepted }))
      choose(s, env, 'install');
  }
}

function restart(s: State, env: AppServices): void {
  const revision = s.revision;
  env.msg({
    title: 'Restart ownership review',
    icon: 'question',
    lines: [
      'Restart the review from its first checkpoint?',
      'Your documents will be kept.',
      'Export the event log first if you want to keep it.',
    ],
    buttons: ['Restart', 'Cancel'],
    def: 1,
    onBtn: (index, currentEnv) => {
      if (index !== 0 || !s.alive || revision !== s.revision) return;
      env.story.reset();
      s.tab = 0;
      s.top = 0;
      s.accepted = false;
      currentEnv.play('boot');
    },
  });
}

function drawTextMode(s: State, view: AppFrame, env: AppServices): void {
  const c = view.client,
    current = env.story.get();
  const focused = view.focused && view.win.menu.open < 0;
  view.draw.rect(c.x, c.y, c.w, c.h, C.navy);
  ['F2 STATUS', 'F3 EVENTS', 'F4 PERMISSIONS'].forEach((label, index) => {
    if (textAction(view, label, `F${index + 2}`, c.x + 5 + index * 116, c.y + 10, focused)) {
      s.tab = index;
      s.top = 0;
    }
  });
  view.draw.l1Panel(c.x + 7, c.y + 33, c.w - 18, c.h - 77, 'RECOVERY CONSOLE');
  const x = c.x + 19,
    y = c.y + 47,
    width = c.w - 43;
  const actionY = c.y + c.h - 65;
  const measure = (value: string) => view.draw.tw(value, 'dos');
  const body = (value: string, at: number) =>
    wrapCopy(value.toUpperCase(), width, measure).forEach((value, index) =>
      view.draw.text(value, x, at + index * 11, { font: 'dos', color: C.white }),
    );
  if (s.tab === 1) {
    const lines = current.logs.flatMap((entry) =>
      wrapCopy(
        `${String(entry.seq).padStart(2, '0')} [${entry.source}] ${entry.message}`.toUpperCase(),
        width,
        measure,
      ).concat(['']),
    );
    const rows = Math.max(1, Math.floor((c.h - 108) / 11));
    if (focused && view.input.io.keyPressed.has('PageDown')) s.top += rows;
    if (focused && view.input.io.keyPressed.has('PageUp')) s.top -= rows;
    if (view.input.hit(x, y, width, rows * 11).hover && view.input.io.wheel)
      s.top += Math.sign(view.input.io.wheel) * 3;
    s.top = Math.max(0, Math.min(Math.max(0, lines.length - rows), s.top));
    lines
      .slice(s.top, s.top + rows)
      .forEach((value, index) =>
        view.draw.text(value, x, y + index * 11, { font: 'dos', color: C.white }),
      );
  } else if (current.ending) {
    const [title, detail] = ENDINGS[current.ending];
    view.draw.text(title, x, y, { font: 'dos', color: C.yellow });
    body(detail, y + 24);
  } else if (s.tab === 2) {
    view.draw.text(
      current.stage === 'control' ? 'OWNERSHIP REVIEW READY' : 'OWNERSHIP REQUEST',
      x,
      y,
      {
        font: 'dos',
        color: C.yellow,
      },
    );
    body(permissionDetail(current), y + 25);
    if (current.stage === 'control') {
      if (textAction(view, '[R] REVIEW CHOICES', 'R', x, actionY, focused)) s.tab = 0;
    } else if (current.stage === 'quiet') {
      if (textAction(view, '[I] INSPECT REQUEST', 'I', x, actionY, focused))
        choose(s, env, 'investigate');
    } else {
      if (
        textAction(
          view,
          `${s.accepted ? '[X]' : '[ ]'} [A] ALLOW OWNERSHIP`,
          'A',
          x,
          actionY - 25,
          focused,
        )
      )
        s.accepted = !s.accepted;
      if (textAction(view, '[U] AUDIT', 'U', x, actionY, focused)) choose(s, env, 'audit');
      if (textAction(view, '[I] INSTALL', 'I', x + 180, actionY, focused, !s.accepted))
        choose(s, env, 'install');
    }
  } else {
    view.draw.text('OWNER: ' + current.owner, x, y, { font: 'dos', color: C.yellow });
    body(
      `P(DOOM): ${env.snapshot().meter}%\n\n${current.stage === 'control' ? 'OWNERSHIP REQUEST READY.\nRESTORE HUMAN CONTROL, REQUIRE TWO SIGNATURES, OR DELEGATE FINAL AUTHORITY.' : current.stage === 'anomaly' ? 'UNSIGNED OWNERSHIP REQUEST DETECTED.\nAUDIT THE REQUEST OR REVIEW PERMISSIONS.' : 'SYSTEM READY.\nONE SCHEDULER ENTRY IS DATED TOMORROW.'}`,
      y + 22,
    );
    if (current.stage === 'control') {
      if (textAction(view, '[H] RESTORE', 'H', x, actionY, focused)) choose(s, env, 'human');
      if (textAction(view, '[C] COEXIST', 'C', x + 126, actionY, focused))
        choose(s, env, 'coexist');
      if (textAction(view, '[D] DELEGATE', 'D', x + 252, actionY, focused)) choose(s, env, 'doom');
    } else if (current.stage === 'anomaly') {
      if (textAction(view, '[A] AUDIT', 'A', x, actionY, focused)) choose(s, env, 'audit');
      if (textAction(view, '[S] PERMISSIONS', 'S', x + 126, actionY, focused)) s.tab = 2;
    } else if (textAction(view, '[I] INSPECT REQUEST', 'I', x, actionY, focused))
      choose(s, env, 'investigate');
  }
  view.draw.text(
    env.story.isPersistent() ? 'CHECKPOINT SAVED' : 'CHECKPOINT IN MEMORY',
    c.x + 12,
    c.y + c.h - 32,
    { font: 'dos', color: C.aqua },
  );
  if (textAction(view, 'F5 EXPORT', 'F5', c.x + 5, c.y + c.h - 13, focused)) {
    exportStory(env);
    env.play('ding');
  }
  if (textAction(view, 'F6 RESTART', 'F6', c.x + 126, c.y + c.h - 13, focused)) restart(s, env);
  if (textAction(view, 'F7 CLOSE', 'F7', c.x + 263, c.y + c.h - 13, focused))
    env.close(view.win.id);
}

export const recoveryApp = defineCanvasApp<State>({
  ...appMetadata('recovery'),
  // 页面文本与滚动是纯状态；故事订阅会 invalidate。
  needsFrame: () => false,
  create: (env) => {
    const state: State = {
      tab: 0,
      top: 0,
      revision: 0,
      accepted: false,
      alive: true,
      unsubscribe: () => {},
    };
    state.unsubscribe = env.story.subscribe(() => {
      state.revision++;
      state.accepted = false;
      // 静态帧模式：故事变化后主动请求一次重绘。
      env.invalidate();
    });
    return state;
  },
  dispose(s) {
    if (!s.alive) return;
    s.alive = false;
    s.unsubscribe();
  },
  status: (_s, env) =>
    env.snapshot().meter >= 61
      ? undefined
      : env.story.isPersistent()
        ? 'Checkpoint saved'
        : 'Checkpoint in memory',
  draw(s, v, env) {
    if (env.snapshot().meter >= 61) return drawTextMode(s, v, env);
    const c = v.client,
      current = env.story.get();
    TABS.forEach((tab, i) => {
      if (v.widgets.button(c.x + 8 + i * 92, c.y + 6, 88, 22, tab, { pressed: s.tab === i })) {
        s.tab = i;
        s.top = 0;
        env.play('click');
      }
    });
    v.widgets.field(c.x + 8, c.y + 32, c.w - 16, c.h - 69, v.draw.TH.face);
    const x = c.x + 20,
      y = c.y + 44,
      width = c.w - 40,
      actionY = c.y + c.h - 64;
    if (s.tab === 1) {
      const lines = current.logs.flatMap((log) =>
        wrapCopy(
          `${String(log.seq).padStart(2, '0')}  [${log.source}] ${log.message}`,
          width - 26,
          v.draw.tw,
        ).concat(['']),
      );
      const rows = Math.max(1, Math.floor((c.h - 94) / 13)),
        max = Math.max(0, lines.length - rows);
      if (v.input.hit(x, y, width, rows * 13).hover && v.input.io.wheel)
        s.top += Math.sign(v.input.io.wheel) * 3;
      if (v.widgets.button(x + width - 17, y, 17, 19, '^', { disabled: s.top <= 0 })) s.top--;
      if (
        v.widgets.button(x + width - 17, y + rows * 13 - 19, 17, 19, 'v', {
          disabled: s.top >= max,
        })
      )
        s.top++;
      s.top = Math.max(0, Math.min(max, s.top));
      lines
        .slice(s.top, s.top + rows)
        .forEach((line, i) => v.draw.text(line, x, y + i * 13, { color: v.draw.TH.text }));
    } else if (current.ending) {
      const [title, detail] = ENDINGS[current.ending];
      const color =
        current.ending === 'human' ? C.green : current.ending === 'coexist' ? C.navy : C.maroon;
      v.widgets.field(x - 3, y - 4, width + 6, 22, color);
      v.draw.text(title, x + 3, y + 1, { font: 'bold', color: C.white });
      bodyLines(v, detail, x, y + 27, width);
      v.draw.text('Owner: ' + current.owner, x, actionY - 7, { color: v.draw.TH.text });
    } else if (s.tab === 2) drawPermissions(v, s, current, env, x, y, width, actionY);
    else {
      drawProperties(v, current, x, y, width);
      if (current.stage === 'quiet') {
        if (v.widgets.button(x, actionY, 126, 21, 'Inspect request', { def: true }))
          choose(s, env, 'investigate');
        if (v.widgets.button(x + 134, actionY, 110, 21, 'Open train.exe')) env.open('train');
      } else if (current.stage === 'anomaly') {
        if (v.widgets.button(x, actionY, 120, 21, 'Audit request', { def: true }))
          choose(s, env, 'audit');
        if (v.widgets.button(x + 128, actionY, 120, 21, 'Permissions...')) s.tab = 2;
      } else {
        if (v.widgets.button(x, actionY, 118, 21, 'Restore human')) choose(s, env, 'human');
        if (v.widgets.button(x + 125, actionY, 118, 21, 'Sign protocol')) choose(s, env, 'coexist');
        if (v.widgets.button(x + 250, actionY, 118, 21, 'Delegate...')) choose(s, env, 'doom');
      }
    }
    v.draw.rect(c.x + 8, c.y + c.h - 34, c.w - 16, 1, v.draw.TH.shadow);
    if (v.widgets.button(c.x + 8, c.y + c.h - 27, 94, 21, 'Export story')) {
      exportStory(env);
      env.play('ding');
    }
    if (v.widgets.button(c.x + 108, c.y + c.h - 27, 106, 21, 'Restart review...')) restart(s, env);
    if (v.widgets.button(c.x + c.w - 76, c.y + c.h - 27, 68, 21, 'Close')) env.close(v.win.id);
  },
});
