import type { AppFrame } from '../../os/host/app-contracts';
import { defineCanvasApp } from '../../os/host/app-session';
import { appMetadata } from '../../../data/app-catalog';
import type { AppServices } from '../../os/host/app-contracts';
import { C } from '../../gfx/palette';

import { type Rect } from '../../ui/canvas/widgets';

import { appIconName } from '../../gfx/app-icon-art';

import { TaskManagerModel } from './task-manager-model';

interface State {
  m: TaskManagerModel;
  top: number;
  paused: boolean;
  notice: string;
  noticeUntil: number;
  requested: { id: string; title: string } | null;
  dragOffset: number | null;
  lastClickId: string | null;
}
const TABS = [
  { id: 'applications', label: 'Applications' },
  { id: 'performance', label: 'Window Activity' },
] as const;

function requestClose(s: State, env: AppServices): void {
  const result = s.m.endTask();
  if (!result.ok) return;
  const process = s.m.processes().find((entry) => entry.id === result.id);
  s.requested = { id: result.id, title: process?.title ?? 'Task' };
  s.notice = 'Close requested. Check the task for save prompts.';
  s.noticeUntil = env.now() + 5;
  env.close(result.id);
  env.play('click');
}
function switchTo(s: State, env: AppServices): void {
  const id = s.m.selected();
  if (id && env.focus) {
    env.focus(id);
    env.play('click');
  }
}

export const taskManagerApp = defineCanvasApp<State>({
  ...appMetadata('task-manager'),
  create: () => ({
    m: new TaskManagerModel(),
    top: 0,
    paused: false,
    notice: '',
    noticeUntil: 0,
    requested: null,
    dragOffset: null,
    lastClickId: null,
  }),
  menus: (s, env) => ({
    Task: [
      { command: 'switch', label: 'Switch To', disabled: !s.m.selected() || !env.focus },
      { command: 'close', label: 'Close Task', disabled: !s.m.selected() },
    ],
    View: [
      ...TABS.map((tab) => ({
        command: tab.id,
        label: `${s.m.snapshot().tab === tab.id ? '• ' : ''}${tab.label}`,
      })),
      '-',
      { command: 'pause', label: s.paused ? 'Resume history' : 'Pause history' },
      { command: 'name', label: 'Sort by name' },
      { command: 'state', label: 'Sort by state' },
    ],
    Help: [{ command: 'help', label: 'Keyboard help' }],
  }),
  draw(s, v, env) {
    const processes = env.processes?.() ?? [];
    s.m.sync(processes);
    if (!s.paused) s.m.tick(env.now());
    if (s.requested && !processes.some((process) => process.id === s.requested?.id)) {
      s.notice = `Closed ${s.requested.title}.`;
      s.noticeUntil = env.now() + 4;
      s.requested = null;
    }
    if (env.now() >= s.noticeUntil) {
      s.notice = '';
      s.requested = null;
    }
    const command = v.menuSel?.command;
    if (command === 'applications' || command === 'performance') s.m.setTab(command);
    if (command === 'pause') s.paused = !s.paused;
    if (command === 'name' || command === 'state') s.m.setSort(command);
    if (command === 'close') requestClose(s, env);
    if (command === 'switch') switchTo(s, env);
    if (command === 'help')
      env.msg({
        title: 'Task Manager keyboard help',
        icon: 'info',
        lines: [
          'Up / Down selects; Home / End jumps to the ends.',
          'Page Up / Page Down scrolls a page; type a task initial.',
          'Enter switches to the selected task; Delete closes it.',
          'F6 changes view; Space pauses the history graph.',
          'Tasks may ask to save or refuse a close request.',
          'Activity measures MHK10 windows, not device CPU/RAM.',
        ],
      });
    const c = v.client;
    const panel = { x: c.x + 5, y: c.y + 26, w: c.w - 10, h: c.h - 55 };
    const visibleRows = Math.max(1, Math.floor((panel.h - 27) / 18));
    let keepVisible = false;
    if (v.focused) {
      const tab = s.m.snapshot().tab;
      if (v.input.io.keyPressed.has('F6'))
        s.m.setTab(tab === 'applications' ? 'performance' : 'applications');
      if (v.input.io.keyPressed.has(' ')) s.paused = !s.paused;
      if (tab === 'applications') {
        if (v.input.io.keyPressed.has('ArrowDown')) keepVisible = s.m.selectRelative(1);
        if (v.input.io.keyPressed.has('ArrowUp')) keepVisible = s.m.selectRelative(-1);
        if (v.input.io.keyPressed.has('PageDown')) keepVisible = s.m.selectRelative(visibleRows);
        if (v.input.io.keyPressed.has('PageUp')) keepVisible = s.m.selectRelative(-visibleRows);
        if (v.input.io.keyPressed.has('Home')) keepVisible = s.m.selectFirst();
        if (v.input.io.keyPressed.has('End')) keepVisible = s.m.selectLast();
        if (v.input.io.keyPressed.has('Escape')) s.m.clearSelection();
        if (v.input.io.keyPressed.has('Enter')) switchTo(s, env);
        if (v.input.io.keyPressed.has('Delete')) requestClose(s, env);
        if (v.input.io.typed.trim())
          keepVisible = s.m.selectByPrefix(v.input.io.typed.trim()) || keepVisible;
      }
    }
    const snap = s.m.snapshot();
    if (keepVisible) {
      const selected = snap.processes.findIndex((process) => process.selected);
      if (selected < s.top) s.top = selected;
      if (selected >= s.top + visibleRows) s.top = selected - visibleRows + 1;
    }
    let x = c.x + 6;
    for (const tab of TABS) {
      const width = tab.id === 'applications' ? 105 : 120;
      if (
        v.widgets.button(x, c.y + 5, width, 18, tab.label, {
          owner: `tm-tab-${tab.id}`,
          pressed: snap.tab === tab.id,
          font: 'bold',
        })
      )
        s.m.setTab(tab.id);
      x += width + 3;
    }
    v.widgets.bevel(panel.x, panel.y, panel.w, panel.h, 'sunken', v.draw.TH.face);
    if (snap.tab === 'applications') drawApplications(v, panel, s, env, visibleRows);
    else drawActivity(v, panel, s);
    const btnY = c.y + c.h - 23;
    if (snap.tab === 'applications') {
      v.draw.text(`${snap.performance.totalProcesses} tasks`, c.x + 8, btnY + 5, {
        color: v.draw.TH.text,
      });
      if (
        v.widgets.button(c.x + c.w - 170, btnY, 78, 17, 'Switch To', {
          owner: 'tm-switch',
          disabled: !snap.selected || !env.focus,
        })
      )
        switchTo(s, env);
      if (
        v.widgets.button(c.x + c.w - 86, btnY, 78, 17, 'Close Task', {
          owner: 'tm-close',
          disabled: !snap.selected,
        })
      )
        requestClose(s, env);
    } else {
      v.draw.text('One sample per second', c.x + 8, btnY + 5, { color: v.draw.TH.text });
      if (
        v.widgets.button(c.x + c.w - 94, btnY, 86, 17, s.paused ? 'Resume' : 'Pause', {
          owner: 'tm-pause',
        })
      )
        s.paused = !s.paused;
    }
  },
  status: (s, env) => {
    if (!env.processes) return 'Open on the desktop to manage MHK10 windows.';
    if (s.notice) return s.notice;
    const snap = s.m.snapshot(),
      process = snap.processes.find((entry) => entry.selected);
    return process
      ? `${process.title} | ${process.status}`
      : `${snap.performance.totalProcesses} tasks | ${snap.performance.activeProcesses} visible | ${snap.performance.minimizedProcesses} minimized${s.paused ? ' | History paused' : ''}`;
  },
});

function processIcon(frame: AppFrame, appId: string): string | undefined {
  const appIcon = appIconName(appId);
  if (frame.draw.hasSprite(appIcon)) return appIcon;
  const shellIcon = `i_${appId.replace(/^\$/, '')}`;
  if (frame.draw.hasSprite(shellIcon)) return shellIcon;
  if (appId === '$find' && frame.draw.hasSprite('i_find')) return 'i_find';
  if (frame.draw.hasSprite('i_exe')) return 'i_exe';
  return undefined;
}

function drawApplications(
  frame: AppFrame,
  c: Rect,
  s: State,
  env: AppServices,
  rows: number,
): void {
  const list = s.m.processes();
  const snap = s.m.snapshot();
  const listX = c.x + 5,
    listY = c.y + 23,
    listW = c.w - 10;
  const maxTop = Math.max(0, list.length - rows);
  const scrollbar = maxTop > 0 ? 14 : 0;
  const stateWidth = 85;
  const nameWidth = listW - scrollbar - stateWidth;
  if (
    frame.widgets.button(
      listX,
      c.y + 4,
      nameWidth,
      17,
      `Task${snap.sort === 'name' ? (snap.descending ? ' v' : ' ^') : ''}`,
      { owner: 'tm-sort-name' },
    )
  ) {
    s.m.setSort('name');
    s.top = 0;
  }
  if (
    frame.widgets.button(
      listX + nameWidth,
      c.y + 4,
      listW - nameWidth,
      17,
      `State${snap.sort === 'state' ? (snap.descending ? ' v' : ' ^') : ''}`,
      { owner: 'tm-sort-state' },
    )
  ) {
    s.m.setSort('state');
    s.top = 0;
  }
  const listH = rows * 18;
  frame.widgets.field(listX, listY, listW, listH + 2);
  if (frame.input.hit(listX, listY, listW, listH).hover && frame.input.io.wheel)
    s.top += Math.sign(frame.input.io.wheel) * 3;
  s.top = Math.max(0, Math.min(maxTop, s.top));
  if (scrollbar) {
    const sx = listX + listW - 14;
    if (
      frame.widgets.button(sx, listY, 14, 14, '^', { owner: 'tm-scroll-up', disabled: s.top === 0 })
    )
      s.top = Math.max(0, s.top - 1);
    if (
      frame.widgets.button(sx, listY + listH - 12, 14, 14, 'v', {
        owner: 'tm-scroll-down',
        disabled: s.top === maxTop,
      })
    )
      s.top = Math.min(maxTop, s.top + 1);
    const trackY = listY + 14,
      trackH = listH - 26;
    const thumbH = Math.min(trackH, Math.max(14, Math.floor((trackH * rows) / list.length)));
    const travel = trackH - thumbH;
    const thumbY = trackY + Math.round((travel * s.top) / maxTop);
    frame.draw.rect(sx, trackY, 14, trackH, frame.draw.TH.face);
    const thumb = frame.input.hit(sx, thumbY, 14, thumbH);
    if (thumb.hover && frame.input.io.wentDown) s.dragOffset = frame.input.io.py - thumbY;
    if (frame.input.io.cancelled || !frame.input.io.down) s.dragOffset = null;
    if (s.dragOffset !== null && travel > 0)
      s.top = Math.max(
        0,
        Math.min(
          maxTop,
          Math.round(((frame.input.io.py - trackY - s.dragOffset) / travel) * maxTop),
        ),
      );
    if (frame.input.hit(sx, trackY, 14, trackH).clicked && !thumb.hover)
      s.top = Math.max(0, Math.min(maxTop, s.top + (frame.input.io.py < thumbY ? -rows : rows)));
    frame.widgets.bevel(sx, thumbY, 14, thumbH, 'button');
  } else s.dragOffset = null;
  for (const [index, process] of list.slice(s.top, s.top + rows).entries()) {
    const x = listX + 2,
      y = listY + 1 + index * 18,
      width = listW - scrollbar - 4;
    if (frame.input.hit(x, y, width, 18).clicked) {
      s.m.select(process.id);
      if (frame.input.io.dbl && s.lastClickId === process.id) switchTo(s, env);
      s.lastClickId = process.id;
    }
    if (process.selected) frame.draw.rect(x, y, width, 18, frame.draw.TH.sel);
    const icon = processIcon(frame, process.appId);
    if (icon) frame.draw.spr(icon, x + 1, y + 1);
    const color = process.selected ? frame.draw.TH.selText : frame.draw.TH.text;
    frame.draw.text(frame.draw.fitText(process.title, nameWidth - 27), x + 21, y + 5, { color });
    frame.draw.text(
      frame.draw.fitText(process.status, stateWidth - 4),
      listX + nameWidth + 4,
      y + 5,
      { color },
    );
  }
  if (!list.length) {
    frame.draw.text(
      env.processes ? 'No tasks are running.' : 'Desktop session required',
      c.x + Math.floor(c.w / 2),
      listY + 24,
      { align: 'center', font: 'bold', color: frame.draw.TH.text },
    );
    if (!env.processes)
      frame.draw.text('Open this app from the desktop.', c.x + Math.floor(c.w / 2), listY + 40, {
        align: 'center',
        color: frame.draw.TH.text,
      });
  }
}

function drawActivity(frame: AppFrame, c: Rect, s: State): void {
  const perf = s.m.performance();
  const columns = [
    { label: 'Total', value: perf.totalProcesses },
    { label: 'Visible', value: perf.activeProcesses },
    { label: 'Minimized', value: perf.minimizedProcesses },
  ];
  const width = Math.floor((c.w - 12) / 3);
  columns.forEach((column, index) => {
    const x = c.x + 6 + index * width;
    frame.widgets.field(x, c.y + 6, width - 3, 33);
    frame.draw.text(column.label, x + Math.floor(width / 2), c.y + 11, {
      align: 'center',
      color: frame.draw.TH.text,
    });
    frame.draw.text(String(column.value), x + Math.floor(width / 2), c.y + 24, {
      align: 'center',
      font: 'bold',
      color: frame.draw.TH.text,
    });
  });
  const graph = { x: c.x + 6, y: c.y + 57, w: c.w - 12, h: c.h - 79 };
  frame.draw.text(`Window count history${s.paused ? ' (paused)' : ''}`, c.x + 7, c.y + 45, {
    color: frame.draw.TH.text,
  });
  frame.widgets.field(graph.x, graph.y, graph.w, graph.h, C.black);
  const samples = s.m.historySamples();
  const max = Math.max(4, ...samples.map((sample) => sample.totalProcesses));
  const bottom = graph.y + graph.h - 3;
  const plotH = graph.h - 6;
  for (let index = 1; index < 4; index += 1) {
    const y = bottom - Math.round((plotH * index) / 4);
    frame.draw.line(graph.x + 2, y, graph.x + graph.w - 3, y, C.navy);
  }
  for (let index = 1; index < samples.length; index += 1) {
    const x1 = graph.x + 3 + Math.round(((index - 1) * (graph.w - 7)) / 59);
    const x2 = graph.x + 3 + Math.round((index * (graph.w - 7)) / 59);
    frame.draw.line(
      x1,
      bottom - Math.round((samples[index - 1].totalProcesses / max) * plotH),
      x2,
      bottom - Math.round((samples[index].totalProcesses / max) * plotH),
      C.lime,
    );
    frame.draw.line(
      x1,
      bottom - Math.round((samples[index - 1].minimizedProcesses / max) * plotH),
      x2,
      bottom - Math.round((samples[index].minimizedProcesses / max) * plotH),
      C.yellow,
    );
  }
  frame.draw.text('Total: green   Minimized: yellow', c.x + 7, c.y + c.h - 15, {
    color: frame.draw.TH.text,
  });
}
