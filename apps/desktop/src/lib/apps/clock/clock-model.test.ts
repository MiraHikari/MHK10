import { describe, expect, it } from 'vite-plus/test';
import { CountdownModel, StopwatchModel, formatDuration, normalizeYearMonth } from './clock-model';

describe('clock timer models', () => {
  it('measures pause/resume and frame gaps without counting paused time', () => {
    const watch = new StopwatchModel();
    watch.toggle(1000);
    expect(watch.snapshot(3500).elapsed).toBe(2500);
    watch.toggle(4000);
    expect(watch.snapshot(10000).elapsed).toBe(3000);
    watch.toggle(11000);
    expect(watch.snapshot(12100).elapsed).toBe(4100);
    expect(watch.snapshot(8000).elapsed).toBe(4100);
    expect(watch.snapshot(Number.NaN).elapsed).toBe(4100);
    watch.reset(13000);
    expect(watch.snapshot(15000)).toEqual({ running: false, elapsed: 0, laps: [], totalLaps: 0 });
  });

  it('records bounded immutable laps only while running', () => {
    const watch = new StopwatchModel();
    watch.lap(0);
    watch.toggle(0);
    for (let second = 1; second <= 7; second += 1) watch.lap(second * 1000);
    expect(watch.snapshot(7000).laps).toEqual([3000, 4000, 5000, 6000, 7000]);
    expect(watch.snapshot(7000).totalLaps).toBe(7);
    watch.toggle(7000);
    watch.lap(8000);
    expect(watch.snapshot(8000).laps).toHaveLength(5);
    expect(formatDuration(3_661_230, true)).toBe('01:01:01.23');
  });

  it('finishes countdown exactly once after a suspended frame and restarts cleanly', () => {
    const timer = new CountdownModel();
    timer.setDuration(2000);
    timer.toggle(100);
    expect(timer.tick(600)).toBe(false);
    expect(timer.snapshot().remaining).toBe(1500);
    expect(timer.tick(8000)).toBe(true);
    expect(timer.tick(9000)).toBe(false);
    expect(timer.snapshot()).toMatchObject({ running: false, remaining: 0, finished: true });
    timer.toggle(10000);
    expect(timer.snapshot()).toMatchObject({ running: true, remaining: 2000, finished: false });
    timer.reset(11000);
    expect(timer.snapshot()).toMatchObject({ running: false, remaining: 2000, finished: false });
  });

  it('retains countdown remaining time on pause and protects duration while running', () => {
    const timer = new CountdownModel();
    timer.setDuration(-1);
    expect(timer.snapshot().duration).toBe(1000);
    timer.setDuration(Number.POSITIVE_INFINITY);
    expect(timer.snapshot().duration).toBe(1000);
    timer.toggle(0);
    timer.setDuration(10000);
    timer.toggle(400);
    expect(timer.snapshot()).toMatchObject({ duration: 1000, remaining: 600, running: false });
    timer.tick(10000);
    timer.toggle(12000);
    expect(timer.tick(12599)).toBe(false);
    expect(timer.tick(12600)).toBe(true);
  });

  it('clamps month navigation at both ends and computes adjacent calendar cells accurately', () => {
    expect(prevMonth({ year: 1, month: 1 })).toEqual({ year: 1, month: 1 });
    expect(nextMonth({ year: 9999, month: 12 })).toEqual({ year: 9999, month: 12 });
    expect(normalizeYearMonth(Number.NaN, Number.NaN)).toEqual({ year: 1, month: 1 });
    const first = buildCalendar(1, 1).weeks[0];
    expect(first[0]).toMatchObject({ year: 0, month: 12, day: 31 });
    expect(first[1]).toMatchObject({ year: 1, month: 1, day: 1 });
  });
});
import {
  buildCalendar,
  clockHands,
  daysInMonth,
  formatDate,
  formatTime12,
  formatTime24,
  isLeapYear,
  nextMonth,
  prevMonth,
  toClockTime,
} from './clock-model';

/** Fixed UTC epoch for a civil instant; keeps the engine's input deterministic. */
const at = (
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0,
): number => Date.UTC(year, month - 1, day, hours, minutes, seconds);

describe('clock applet engine', () => {
  it('reads 24-hour time including midnight and noon', () => {
    expect(formatTime24(at(2024, 1, 1, 0, 0, 0))).toBe('00:00:00');
    expect(formatTime24(at(2024, 1, 1, 12, 0, 0))).toBe('12:00:00');
    expect(formatTime24(at(2024, 1, 1, 23, 9, 5))).toBe('23:09:05');
  });

  it('reads 12-hour time with meridiem for midnight and noon', () => {
    expect(formatTime12(at(2024, 1, 1, 0, 0, 0))).toEqual({ time: '12:00:00', period: 'AM' });
    expect(formatTime12(at(2024, 1, 1, 12, 0, 0))).toEqual({ time: '12:00:00', period: 'PM' });
    expect(formatTime12(at(2024, 1, 1, 13, 30, 0))).toEqual({ time: '01:30:00', period: 'PM' });
    expect(formatTime12(at(2024, 1, 1, 11, 59, 59))).toEqual({ time: '11:59:59', period: 'AM' });
  });

  it('names the weekday of a known date', () => {
    // 1 January 2000 was a Saturday.
    expect(formatDate(at(2000, 1, 1))).toBe('Saturday, 1 January 2000');
    expect(toClockTime(at(2000, 1, 1)).weekday).toBe(6);
    // 7 October 2026 is a Wednesday.
    expect(formatDate(at(2026, 10, 7))).toBe('Wednesday, 7 October 2026');
  });

  it('accepts a Date instance as well as epoch milliseconds', () => {
    expect(formatTime24(new Date(at(2024, 1, 1, 8, 30, 0)))).toBe('08:30:00');
  });

  it('counts leap-year February correctly', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(Number.NaN)).toBe(false);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2024, 13)).toBe(31);
    expect(daysInMonth(2024, 0)).toBe(31);
    expect(daysInMonth(2023, 14)).toBe(29);
  });

  it('aligns the first of the month under its weekday column', () => {
    // 1 October 2026 is a Thursday (column index 4, Sunday-first grid).
    const grid = buildCalendar(2026, 10);
    expect(grid.monthName).toBe('October');
    expect(grid.weekdayHeaders).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    const firstCell = grid.weeks[0].find((cell) => cell.inMonth && cell.day === 1);
    expect(firstCell).toBeDefined();
    expect(grid.weeks[0].indexOf(firstCell!)).toBe(4);
    // Leading cells spill from September; every row has seven cells.
    expect(grid.weeks[0][0]).toMatchObject({ inMonth: false, month: 9 });
    for (const week of grid.weeks) expect(week).toHaveLength(7);
    const inMonth = grid.weeks.flat().filter((cell) => cell.inMonth);
    expect(inMonth).toHaveLength(31);
  });

  it('flags today only when it falls inside the displayed month', () => {
    const grid = buildCalendar(2026, 10, at(2026, 10, 7, 9, 0, 0));
    const flagged = grid.weeks.flat().filter((cell) => cell.today);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ day: 7, month: 10, year: 2026, inMonth: true });
    const other = buildCalendar(2026, 11, at(2026, 10, 7));
    expect(other.weeks.flat().some((cell) => cell.today)).toBe(false);
  });

  it('wraps months across year boundaries', () => {
    expect(nextMonth({ year: 2024, month: 12 })).toEqual({ year: 2025, month: 1 });
    expect(prevMonth({ year: 2024, month: 1 })).toEqual({ year: 2023, month: 12 });
    expect(nextMonth({ year: 2024, month: 6 })).toEqual({ year: 2024, month: 7 });
  });

  it('bounds absurd years and overflowing months', () => {
    const grid = buildCalendar(999_999, 1);
    expect(grid.year).toBe(9999);
    const low = buildCalendar(-5000, 1);
    expect(low.year).toBe(1);
    // Month 13 wraps into January of the next year.
    const wrapped = buildCalendar(2024, 13);
    expect(wrapped).toMatchObject({ year: 2025, month: 1 });
  });

  it('places analog hands at cardinal angles', () => {
    const geometry = { center: { x: 100, y: 100 }, radius: 80 };
    const noon = clockHands(at(2024, 1, 1, 12, 0, 0), geometry);
    // At 12:00 every hand points straight up (smaller y, same x).
    expect(noon.center).toEqual({ x: 100, y: 100 });
    expect(noon.hour).toEqual({ x: 100, y: 100 - Math.round(80 * 0.5) });
    expect(noon.minute).toEqual({ x: 100, y: 100 - Math.round(80 * 0.75) });
    expect(noon.second).toEqual({ x: 100, y: 100 - Math.round(80 * 0.9) });
    // Tick 0 sits at the top, tick 3 to the right, tick 6 below.
    expect(noon.ticks).toHaveLength(12);
    expect(noon.ticks[0]).toEqual({ x: 100, y: 20 });
    expect(noon.ticks[3]).toEqual({ x: 180, y: 100 });
    expect(noon.ticks[6]).toEqual({ x: 100, y: 180 });

    const three = clockHands(at(2024, 1, 1, 3, 0, 0), geometry);
    // At 3:00 the hour hand points right (+x), the minute hand points up.
    expect(three.hour).toEqual({ x: 100 + Math.round(80 * 0.5), y: 100 });
    expect(three.minute).toEqual({ x: 100, y: 100 - Math.round(80 * 0.75) });
  });

  it('normalizes malformed hand geometry to the integer canvas grid', () => {
    const hands = clockHands(at(2024, 1, 1, 12), {
      center: { x: 10.4, y: 20.6 },
      radius: Number.NaN,
    });
    expect(hands.center).toEqual({ x: 10, y: 21 });
    expect(
      hands.ticks.every((point) => Number.isInteger(point.x) && Number.isInteger(point.y)),
    ).toBe(true);
    expect(hands.ticks.every((point) => point.x === 10 && point.y === 21)).toBe(true);
  });
});
