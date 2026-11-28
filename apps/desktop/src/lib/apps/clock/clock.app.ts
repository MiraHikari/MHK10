import type { AppFrame } from '../../os/host/app-contracts';
import { defineCanvasApp } from '../../os/host/app-session';
import { appMetadata } from '../../../data/app-catalog';
import type { AppServices } from '../../os/host/app-contracts';
import { C } from '../../gfx/palette';

import { type Rect } from '../../ui/canvas/widgets';

import {
  clockHands,
  formatTime12,
  formatTime24,
  formatDate,
  buildCalendar,
  nextMonth,
  prevMonth,
  toClockTime,
  normalizeYearMonth,
  formatDuration,
  StopwatchModel,
  CountdownModel,
  type CalendarMonth,
  type YearMonth,
} from './clock-model';

type Tab = 'clock' | 'calendar' | 'timers';
interface State {
  tab: Tab;
  view: YearMonth | null;
  mode24: boolean;
  utc: boolean;
  timerMode: 'stopwatch' | 'countdown';
  stopwatch: StopwatchModel;
  countdown: CountdownModel;
  selectedDate: string;
  timer: ReturnType<typeof setInterval>;
  now: () => number;
  /** 月历网格缓存：时钟每秒重绘，42 格不应每秒重建。 */
  calendarCache?: { key: string; month: CalendarMonth };
}
const TABS = [
  { id: 'clock', label: 'Clock' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'timers', label: 'Timers' },
] as const;

// Only the view reads browser clocks. Timers use performance.now rather than
// the host's animation time, which deliberately clamps large frame gaps.
function epoch(utc: boolean): number {
  const now = new Date();
  return now.getTime() - (utc ? 0 : now.getTimezoneOffset() * 60_000);
}

function shownMonth(s: State, now: number): YearMonth {
  const current = toClockTime(now);
  return s.view ?? { year: current.year, month: current.month };
}

export const clockApp = defineCanvasApp<State>({
  ...appMetadata('clock'),
  create: (env) => {
    const state: State = {
      tab: 'clock',
      view: null,
      mode24: true,
      utc: false,
      timerMode: 'stopwatch',
      stopwatch: new StopwatchModel(),
      countdown: new CountdownModel(),
      selectedDate: '',
      now: performance.now.bind(performance),
      timer: setInterval(() => {
        if (state.countdown.tick(state.now())) env.play('ding');
      }, 250),
    };
    return state;
  },
  dispose: (s) => clearInterval(s.timer),
  menus: (s) => ({
    View: [
      ...TABS.map((tab) => ({
        command: tab.id,
        label: tab.label,
        checked: s.tab === tab.id,
        radio: true,
      })),
      '-',
      { command: 'format', label: s.mode24 ? 'Switch to 12-hour' : 'Switch to 24-hour' },
      { command: 'zone', label: s.utc ? 'Use local time' : 'Use UTC' },
      { command: 'today', label: 'Today' },
    ],
    Help: [{ command: 'help', label: 'Keyboard help' }],
  }),
  draw(s, v, env) {
    const now = epoch(s.utc);
    const timerNow = s.now();
    const command = v.menuSel?.command;
    if (command === 'clock' || command === 'calendar' || command === 'timers') s.tab = command;
    if (command === 'format') s.mode24 = !s.mode24;
    if (command === 'zone') s.utc = !s.utc;
    if (command === 'today') {
      s.tab = 'calendar';
      s.view = null;
      s.selectedDate = '';
    }
    if (command === 'help')
      env.msg({
        title: 'Clock keyboard help',
        icon: 'info',
        lines: [
          '1 Clock; 2 Calendar; 3 Timers; T time format; U zone.',
          'Calendar: arrows / Page Up / Page Down change month.',
          'Shift + arrows changes year; Home returns to today.',
          'Timers: S stopwatch; C countdown; Space start/pause.',
          'R resets; L records a lap; +/- adjusts countdown.',
          'Timers run while the window stays open.',
        ],
      });
    if (s.countdown.tick(timerNow)) env.play('ding');
    const c = v.client;
    const tabW = Math.floor((c.w - 12) / TABS.length);
    for (const [index, tab] of TABS.entries()) {
      if (
        v.widgets.button(c.x + 6 + index * tabW, c.y + 5, tabW, 18, tab.label, {
          pressed: s.tab === tab.id,
          owner: `clock-tab-${tab.id}`,
          font: 'bold',
        })
      ) {
        s.tab = tab.id;
        env.play('click');
      }
    }
    if (v.focused) {
      for (const event of v.input.io.keyboardEvents) {
        for (const typed of (event.typed ?? '').toLowerCase()) {
          if (typed === '1') s.tab = 'clock';
          if (typed === '2') s.tab = 'calendar';
          if (typed === '3') s.tab = 'timers';
          if (typed === 't') s.mode24 = !s.mode24;
          if (typed === 'u') s.utc = !s.utc;
          if (s.tab === 'timers') {
            if (typed === 's') s.timerMode = 'stopwatch';
            if (typed === 'c') s.timerMode = 'countdown';
            const timer = s.timerMode === 'stopwatch' ? s.stopwatch : s.countdown;
            if (typed === 'r') timer.reset(timerNow);
            if (typed === 'l' && s.timerMode === 'stopwatch') s.stopwatch.lap(timerNow);
            if (s.timerMode === 'countdown') {
              const duration = s.countdown.snapshot().duration;
              if (typed === '+') s.countdown.setDuration(duration + 60_000);
              if (typed === '-') s.countdown.setDuration(duration - 60_000);
            }
          }
        }
        if (s.tab === 'calendar') {
          const delta = v.input.io.keyDown.has('Shift') ? 12 : 1;
          const month = shownMonth(s, now);
          if (event.key === 'ArrowLeft' || event.key === 'PageUp')
            s.view = normalizeYearMonth(month.year, month.month - delta);
          if (event.key === 'ArrowRight' || event.key === 'PageDown')
            s.view = normalizeYearMonth(month.year, month.month + delta);
          if (event.key === 'Home') {
            s.view = null;
            s.selectedDate = '';
          }
        }
        if (s.tab === 'timers') {
          const timer = s.timerMode === 'stopwatch' ? s.stopwatch : s.countdown;
          if (event.key === ' ') timer.toggle(timerNow);
          if (s.timerMode === 'countdown') {
            const duration = s.countdown.snapshot().duration;
            if (event.key === 'ArrowUp') s.countdown.setDuration(duration + 60_000);
            if (event.key === 'ArrowDown') s.countdown.setDuration(duration - 60_000);
          }
        }
      }
    }
    const body = { x: c.x + 6, y: c.y + 27, w: c.w - 12, h: c.h - 33 };
    v.widgets.bevel(body.x, body.y, body.w, body.h, 'sunken', v.draw.TH.face);
    if (s.tab === 'clock') drawClock(v, body, s, now);
    if (s.tab === 'calendar') drawCalendar(v, body, s, env, now);
    if (s.tab === 'timers') drawTimers(v, body, s, env, timerNow);
  },
  status: (s) => {
    if (s.countdown.snapshot().finished)
      return s.tab === 'timers' && s.timerMode === 'countdown'
        ? 'Timer finished | R resets; Space restarts.'
        : 'Timer finished | Open Timers > Countdown to reset.';
    if (s.tab === 'timers') {
      if (s.timerMode === 'stopwatch') {
        const timer = s.stopwatch.snapshot(s.now());
        return `Stopwatch ${timer.running ? 'running' : 'paused'} | ${formatDuration(timer.elapsed, true)}`;
      }
      const timer = s.countdown.snapshot();
      return `Countdown ${timer.running ? 'running' : 'ready'} | ${formatDuration(Math.ceil(timer.remaining / 1000) * 1000)}`;
    }
    if (s.tab === 'calendar') {
      const now = epoch(s.utc),
        month = shownMonth(s, now);
      const calendar = buildCalendar(month.year, month.month);
      return s.selectedDate || `${calendar.monthName} ${calendar.year} | Home: today`;
    }
    return `${s.utc ? 'UTC' : 'Local time'} | ${s.mode24 ? '24-hour' : '12-hour'} | ${formatDate(epoch(s.utc))}`;
  },
});

function drawClock(frame: AppFrame, c: Rect, s: State, now: number): void {
  const cx = c.x + Math.floor(c.w / 2);
  const radius = Math.max(12, Math.min(43, Math.floor((c.h - 71) / 2)));
  const cy = c.y + radius + 9;
  frame.draw.disc(cx, cy, radius + 3, C.white);
  frame.draw.ring(cx, cy, radius + 3, frame.draw.TH.shadow);
  frame.draw.ring(cx, cy, radius + 2, C.black);
  const hands = clockHands(now, { center: { x: cx, y: cy }, radius });
  for (const [index, tick] of hands.ticks.entries())
    frame.draw.disc(tick.x, tick.y, index % 3 === 0 ? 2 : 1, C.navy);
  frame.draw.line(cx, cy, hands.hour.x, hands.hour.y, C.black, 2);
  frame.draw.line(cx, cy, hands.minute.x, hands.minute.y, C.navy);
  frame.draw.line(cx, cy, hands.second.x, hands.second.y, C.maroon);
  frame.draw.disc(cx, cy, 2, C.maroon);
  const time12 = formatTime12(now);
  const time = s.mode24 ? formatTime24(now) : `${time12.time} ${time12.period}`;
  const y = c.y + c.h - 54;
  frame.widgets.field(c.x + 8, y, c.w - 16, 28);
  frame.draw.text(time, cx, y + 8, {
    align: 'center',
    font: 'bold',
    scale: frame.draw.tw(time, 'bold', 2) < c.w - 28 ? 2 : 1,
    color: frame.draw.TH.text,
  });
  if (
    frame.widgets.button(c.x + 8, c.y + c.h - 21, 68, 15, s.mode24 ? '24-hour' : '12-hour', {
      owner: 'clock-format',
    })
  )
    s.mode24 = !s.mode24;
  if (
    frame.widgets.button(c.x + c.w - 76, c.y + c.h - 21, 68, 15, s.utc ? 'UTC' : 'Local time', {
      owner: 'clock-zone',
    })
  )
    s.utc = !s.utc;
}

function drawCalendar(frame: AppFrame, c: Rect, s: State, env: AppServices, now: number): void {
  const shown = shownMonth(s, now);
  // 网格只随「显示的月份 + 本地日历日（today 标记）」变化。
  const cacheKey = `${shown.year}-${shown.month}-${Math.floor(now / 86_400_000)}`;
  if (s.calendarCache?.key !== cacheKey) {
    s.calendarCache = { key: cacheKey, month: buildCalendar(shown.year, shown.month, now) };
  }
  const month = s.calendarCache.month;
  const previous = prevMonth(shown),
    next = nextMonth(shown);
  if (
    frame.widgets.button(c.x + 5, c.y + 5, 19, 17, '<', {
      owner: 'cal-prev',
      disabled: previous.year === shown.year && previous.month === shown.month,
    })
  )
    s.view = previous;
  if (
    frame.widgets.button(c.x + c.w - 24, c.y + 5, 19, 17, '>', {
      owner: 'cal-next',
      disabled: next.year === shown.year && next.month === shown.month,
    })
  )
    s.view = next;
  frame.draw.text(`${month.monthName} ${month.year}`, c.x + Math.floor(c.w / 2), c.y + 10, {
    align: 'center',
    font: 'bold',
    color: frame.draw.TH.text,
  });
  const cellW = Math.floor((c.w - 12) / 7);
  const gx = c.x + Math.floor((c.w - cellW * 7) / 2);
  const cellH = Math.max(13, Math.min(18, Math.floor((c.h - 64) / 6)));
  for (const [col, heading] of month.weekdayHeaders.entries())
    frame.draw.text(heading, gx + col * cellW + Math.floor(cellW / 2), c.y + 29, {
      align: 'center',
      color: frame.draw.TH.text,
    });
  for (const [row, week] of month.weeks.entries())
    for (const [col, date] of week.entries()) {
      const x = gx + col * cellW,
        y = c.y + 42 + row * cellH;
      const label = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
      const selected = label === s.selectedDate;
      if (date.today) frame.draw.rect(x, y, cellW - 1, cellH - 1, frame.draw.TH.sel);
      if (selected)
        frame.draw.frame(
          x,
          y,
          cellW - 1,
          cellH - 1,
          date.today ? frame.draw.TH.selText : frame.draw.TH.text,
        );
      frame.draw.text(String(date.day), x + Math.floor(cellW / 2), y + 3, {
        align: 'center',
        color: date.today
          ? frame.draw.TH.selText
          : !date.inMonth
            ? frame.draw.TH.shadow
            : frame.draw.TH.text,
      });
      if (frame.input.hit(x, y, cellW, cellH).clicked && date.year >= 1 && date.year <= 9999) {
        s.selectedDate = label;
        if (!date.inMonth) s.view = { year: date.year, month: date.month };
        env.play('click');
      }
    }
  if (frame.widgets.button(c.x + 6, c.y + c.h - 20, 46, 15, 'Today', { owner: 'cal-today' })) {
    s.view = null;
    s.selectedDate = '';
  }
  frame.draw.text(
    frame.draw.fitText(s.selectedDate || 'Home: today', c.w - 66),
    c.x + c.w - 6,
    c.y + c.h - 16,
    {
      align: 'right',
      color: frame.draw.TH.text,
    },
  );
}

function drawTimers(frame: AppFrame, c: Rect, s: State, env: AppServices, now: number): void {
  const half = Math.floor((c.w - 12) / 2);
  for (const [index, mode] of (['stopwatch', 'countdown'] as const).entries())
    if (
      frame.widgets.button(
        c.x + 6 + index * half,
        c.y + 6,
        half,
        17,
        mode === 'stopwatch' ? 'Stopwatch' : 'Countdown',
        { pressed: s.timerMode === mode, owner: `timer-${mode}` },
      )
    )
      s.timerMode = mode;
  const stopwatch = s.stopwatch.snapshot(now),
    countdown = s.countdown.snapshot();
  const running = s.timerMode === 'stopwatch' ? stopwatch.running : countdown.running;
  const value =
    s.timerMode === 'stopwatch'
      ? formatDuration(stopwatch.elapsed, true)
      : formatDuration(Math.ceil(countdown.remaining / 1000) * 1000);
  frame.widgets.field(c.x + 8, c.y + 31, c.w - 16, 32);
  frame.draw.text(value, c.x + Math.floor(c.w / 2), c.y + 40, {
    align: 'center',
    font: 'bold',
    scale: frame.draw.tw(value, 'bold', 2) < c.w - 28 ? 2 : 1,
    color: frame.draw.TH.text,
  });
  const controlY = c.y + c.h - 23;
  const controlW = Math.floor((c.w - 20) / 3);
  const timer = s.timerMode === 'stopwatch' ? s.stopwatch : s.countdown;
  if (
    frame.widgets.button(c.x + 6, controlY, controlW, 17, running ? 'Pause' : 'Start', {
      owner: 'timer-toggle',
      def: true,
    })
  ) {
    timer.toggle(now);
    env.play('click');
  }
  if (
    frame.widgets.button(c.x + 10 + controlW, controlY, controlW, 17, 'Reset', {
      owner: 'timer-reset',
    })
  )
    timer.reset(now);
  if (s.timerMode === 'stopwatch') {
    if (
      frame.widgets.button(c.x + 14 + controlW * 2, controlY, controlW, 17, 'Lap', {
        owner: 'timer-lap',
        disabled: !running,
      })
    )
      s.stopwatch.lap(now);
    const lines = stopwatch.laps.slice(-Math.max(1, Math.floor((c.h - 102) / 12)));
    if (!lines.length)
      frame.draw.text('Space starts; L records a lap.', c.x + 10, c.y + 77, {
        color: frame.draw.TH.text,
      });
    lines.forEach((lap, index) =>
      frame.draw.text(
        `Lap ${stopwatch.totalLaps - lines.length + index + 1}     ${formatDuration(lap, true)}`,
        c.x + 10,
        c.y + 73 + index * 12,
        { color: frame.draw.TH.text },
      ),
    );
  } else {
    frame.draw.text(
      countdown.finished ? 'Time is up!' : 'Set duration before starting',
      c.x + 10,
      c.y + 72,
      {
        color: frame.draw.TH.text,
      },
    );
    if (
      frame.widgets.button(c.x + 10, c.y + 87, 23, 16, '-', {
        owner: 'timer-minus',
        disabled: running,
      })
    )
      s.countdown.setDuration(countdown.duration - 60_000);
    frame.draw.text(
      `${Math.floor(countdown.duration / 60_000)} min ${Math.floor(countdown.duration / 1000) % 60} sec`,
      c.x + 42,
      c.y + 92,
      { color: frame.draw.TH.text },
    );
    if (
      frame.widgets.button(c.x + c.w - 33, c.y + 87, 23, 16, '+', {
        owner: 'timer-plus',
        disabled: running,
      })
    )
      s.countdown.setDuration(countdown.duration + 60_000);
    frame.widgets.progress(
      c.x + 10,
      c.y + 112,
      c.w - 20,
      10,
      1 - countdown.remaining / countdown.duration,
    );
    if (
      frame.widgets.button(c.x + 14 + controlW * 2, controlY, controlW, 17, '5 min', {
        owner: 'timer-preset',
        disabled: running,
      })
    )
      s.countdown.setDuration(300_000);
  }
}
