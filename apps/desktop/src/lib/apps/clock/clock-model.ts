/**
 * Pure, DOM-free engine for a classic Clock / Calendar applet.
 *
 * Every exported function is a deterministic transform of an injected time:
 * callers pass either epoch milliseconds or a {@link Date} instance, and the
 * engine never reads `Date.now()`, constructs `new Date()`, consults the host
 * timezone, or touches any browser global. All civil fields (year, month,
 * weekday, time of day) are derived from the epoch value with integer
 * arithmetic in **UTC**, so the same input always yields the same output on
 * every machine. Month and weekday names are hardcoded English; no `Intl`.
 *
 * Coordinate convention for the analog face: a screen grid with the origin at
 * the top-left, x increasing to the right and y increasing downward (the
 * renderer's integer 640x360 grid). Hand angles are measured clockwise from
 * the 12 o'clock position, which points straight up (towards smaller y). All
 * returned coordinates are integer-rounded and expressed in absolute grid
 * units relative to the caller-supplied centre.
 */

/** A time argument: epoch milliseconds, or a {@link Date} read via `getTime`. */
export type TimeInput = number | Date;

/** An integer point on the renderer's 640x360 grid. */
export interface Point {
  x: number;
  y: number;
}

/** Civil fields decomposed from an epoch value, always in UTC. */
export interface ClockTime {
  /** Full year, e.g. 2026. */
  year: number;
  /** Month in `1..12` (January is 1). */
  month: number;
  /** Day of month in `1..31`. */
  day: number;
  /** Day of week in `0..6`, where 0 is Sunday. */
  weekday: number;
  /** Hour in `0..23`. */
  hours: number;
  /** Minute in `0..59`. */
  minutes: number;
  /** Second in `0..59`. */
  seconds: number;
}

/** Centre point plus hand and tick endpoints for the analog face. */
export interface ClockHands {
  /** The caller-supplied centre, echoed for convenience. */
  center: Point;
  /** Endpoint of the hour hand. */
  hour: Point;
  /** Endpoint of the minute hand. */
  minute: Point;
  /** Endpoint of the second hand. */
  second: Point;
  /** The twelve hour-tick positions, index 0 at 12 o'clock, clockwise. */
  ticks: Point[];
}

/** Geometry describing where and how large to draw the analog face. */
export interface ClockGeometry {
  /** Absolute centre of the face on the grid. */
  center: Point;
  /** Outer radius in grid units; the tick ring sits on this radius. */
  radius: number;
}

/** The 12-hour readout split into a time string and its meridiem. */
export interface Time12 {
  /** `HH:MM:SS` with the hour in `1..12` (zero-padded). */
  time: string;
  /** Meridiem indicator. */
  period: 'AM' | 'PM';
}

/** A year/month pair with month in `1..12`. */
export interface YearMonth {
  year: number;
  month: number;
}

/** One cell of a calendar grid. */
export interface CalendarCell {
  /** Day number within {@link CalendarCell.year}/{@link CalendarCell.month}. */
  day: number;
  /** Year this cell belongs to (may differ from the displayed month). */
  year: number;
  /** Month this cell belongs to, `1..12`. */
  month: number;
  /** True when the cell is part of the displayed month (not spill-over). */
  inMonth: boolean;
  /** True when the cell matches the supplied `today`, if any. */
  today: boolean;
}

/** A full month laid out as weeks of seven day cells. */
export interface CalendarMonth {
  year: number;
  month: number;
  /** English name of the displayed month, e.g. `'October'`. */
  monthName: string;
  /** Seven short weekday headers starting at Sunday. */
  weekdayHeaders: string[];
  /** Rows of seven cells each; the grid always starts on a Sunday. */
  weeks: CalendarCell[][];
}

/** Smallest year the calendar will model. */
export const MIN_YEAR = 1;
/** Largest year the calendar will model. */
export const MAX_YEAR = 9999;

/** Fraction of the radius used for each hand length. */
const HOUR_HAND = 0.5;
const MINUTE_HAND = 0.75;
const SECOND_HAND = 0.9;

const MS_PER_DAY = 86_400_000;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Normalise a time argument to finite epoch milliseconds; invalid input is 0. */
function toEpochMs(input: TimeInput): number {
  const ms = typeof input === 'number' ? input : input.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Civil date from a day count since the Unix epoch (Howard Hinnant's algorithm). */
function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719_468;
  const era = Math.floor((z >= 0 ? z : z - 146_096) / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: month <= 2 ? y + 1 : y, month, day };
}

/** Day count since the Unix epoch for a civil date (inverse of civilFromDays). */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const mp = month > 2 ? month - 3 : month + 9;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

/** Weekday (0 = Sunday) for a civil date, with no reliance on `Date`. */
function weekdayFromCivil(year: number, month: number, day: number): number {
  const days = daysFromCivil(year, month, day);
  return ((((days % 7) + 4) % 7) + 7) % 7;
}

/** Decompose a time argument into UTC civil fields. */
export function toClockTime(input: TimeInput): ClockTime {
  const ms = toEpochMs(input);
  const days = Math.floor(ms / MS_PER_DAY);
  const msOfDay = ms - days * MS_PER_DAY;
  const totalSeconds = Math.floor(msOfDay / 1000);
  const { year, month, day } = civilFromDays(days);
  // The Unix epoch (day 0) was a Thursday (weekday 4).
  const weekday = ((((days % 7) + 4) % 7) + 7) % 7;
  return {
    year,
    month,
    day,
    weekday,
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor(totalSeconds / 60) % 60,
    seconds: totalSeconds % 60,
  };
}

const pad2 = (value: number): string => value.toString().padStart(2, '0');

/** 24-hour readout `HH:MM:SS`. */
export function formatTime24(input: TimeInput): string {
  const { hours, minutes, seconds } = toClockTime(input);
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

/** 12-hour readout with meridiem; midnight and noon both read as `12`. */
export function formatTime12(input: TimeInput): Time12 {
  const { hours, minutes, seconds } = toClockTime(input);
  const period = hours < 12 ? 'AM' : 'PM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return { time: `${pad2(hour12)}:${pad2(minutes)}:${pad2(seconds)}`, period };
}

/** Long date string, e.g. `'Saturday, 1 January 2000'`. */
export function formatDate(input: TimeInput): string {
  const { year, month, day, weekday } = toClockTime(input);
  return `${WEEKDAY_NAMES[weekday]}, ${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

/** Endpoint of a hand of the given length at the given angle (clockwise from 12). */
function endpoint(center: Point, length: number, angle: number): Point {
  return {
    x: Math.round(center.x + length * Math.sin(angle)),
    y: Math.round(center.y - length * Math.cos(angle)),
  };
}

/**
 * Analog hand and tick geometry for the given time and face.
 *
 * Angles advance smoothly: the hour hand accounts for elapsed minutes and the
 * minute hand for elapsed seconds, matching a real sweep clock.
 */
export function clockHands(input: TimeInput, geometry: ClockGeometry): ClockHands {
  // Canvas coordinates are integer grid units. Normalising here keeps callers
  // from accidentally introducing fractional or negative geometry when a
  // responsive window is smaller than its preferred size.
  const center = {
    x: Math.round(Number.isFinite(geometry.center.x) ? geometry.center.x : 0),
    y: Math.round(Number.isFinite(geometry.center.y) ? geometry.center.y : 0),
  };
  const radius = Math.max(0, Math.round(Number.isFinite(geometry.radius) ? geometry.radius : 0));
  const { hours, minutes, seconds } = toClockTime(input);
  const twoPi = Math.PI * 2;
  const hourAngle = (((hours % 12) + minutes / 60) / 12) * twoPi;
  const minuteAngle = ((minutes + seconds / 60) / 60) * twoPi;
  const secondAngle = (seconds / 60) * twoPi;
  const ticks: Point[] = [];
  for (let i = 0; i < 12; i++) {
    ticks.push(endpoint(center, radius, (i / 12) * twoPi));
  }
  return {
    center: { x: center.x, y: center.y },
    hour: endpoint(center, radius * HOUR_HAND, hourAngle),
    minute: endpoint(center, radius * MINUTE_HAND, minuteAngle),
    second: endpoint(center, radius * SECOND_HAND, secondAngle),
    ticks,
  };
}

/** True for Gregorian leap years. */
export function isLeapYear(year: number): boolean {
  if (!Number.isFinite(year)) return false;
  year = Math.trunc(year);
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Number of days in the given month (`1..12`), honouring leap years. */
export function daysInMonth(year: number, month: number): number {
  const normalized = normalizeYearMonth(year, month);
  const lengths = [
    31,
    isLeapYear(normalized.year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return lengths[normalized.month - 1];
}

const clampYear = (year: number): number =>
  Math.min(MAX_YEAR, Math.max(MIN_YEAR, Math.trunc(year)));

/**
 * Normalise an arbitrary year/month into bounds, wrapping overflowing months
 * into neighbouring years (e.g. month 13 becomes January of the next year).
 */
export function normalizeYearMonth(year: number, month: number): YearMonth {
  const safeMonth = Number.isFinite(month) ? Math.trunc(month) : 1;
  const safeYear = Number.isFinite(year) ? Math.trunc(year) : MIN_YEAR;
  const absolute = Math.max(0, Math.min(MAX_YEAR * 12 - 1, (safeYear - 1) * 12 + safeMonth - 1));
  return { year: clampYear(Math.floor(absolute / 12) + 1), month: (absolute % 12) + 1 };
}

/** The month after `ym`; December rolls to the following January. */
export function nextMonth(ym: YearMonth): YearMonth {
  return normalizeYearMonth(ym.year, ym.month + 1);
}

/** The month before `ym`; January rolls to the preceding December. */
export function prevMonth(ym: YearMonth): YearMonth {
  return normalizeYearMonth(ym.year, ym.month - 1);
}

/**
 * Build a calendar grid for the given month. The grid always begins on a
 * Sunday, so the first of the month lands in the column matching its weekday;
 * leading and trailing cells spill over from the adjacent months with
 * `inMonth: false`. When `today` is supplied the matching cell is flagged.
 */
export function buildCalendar(year: number, month: number, today?: TimeInput): CalendarMonth {
  const normalized = normalizeYearMonth(year, month);
  const marker = today === undefined ? undefined : toClockTime(today);
  const firstWeekday = weekdayFromCivil(normalized.year, normalized.month, 1);
  const total = daysInMonth(normalized.year, normalized.month);
  const startDay = daysFromCivil(normalized.year, normalized.month, 1);

  const cell = (year: number, month: number, day: number, inMonth: boolean): CalendarCell => ({
    day,
    year,
    month,
    inMonth,
    today:
      marker !== undefined && marker.year === year && marker.month === month && marker.day === day,
  });

  const flat: CalendarCell[] = [];
  for (let i = 0; i < firstWeekday; i++) {
    const previous = civilFromDays(startDay - firstWeekday + i);
    flat.push(cell(previous.year, previous.month, previous.day, false));
  }
  for (let day = 1; day <= total; day++) {
    flat.push(cell(normalized.year, normalized.month, day, true));
  }
  let nextDay = 1;
  while (flat.length % 7 !== 0) {
    const following = civilFromDays(startDay + total + nextDay++ - 1);
    flat.push(cell(following.year, following.month, following.day, false));
  }

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < flat.length; i += 7) {
    weeks.push(flat.slice(i, i + 7));
  }

  return {
    year: normalized.year,
    month: normalized.month,
    monthName: MONTH_NAMES[normalized.month - 1],
    weekdayHeaders: [...WEEKDAY_HEADERS],
    weeks,
  };
}

/** Format a nonnegative duration; fractions are useful for stopwatch laps. */
export function formatDuration(milliseconds: number, fractions = false): string {
  const safe = Number.isFinite(milliseconds) ? Math.max(0, Math.floor(milliseconds)) : 0;
  const seconds = Math.floor(safe / 1000);
  const result = `${pad2(Math.floor(seconds / 3600))}:${pad2(Math.floor(seconds / 60) % 60)}:${pad2(seconds % 60)}`;
  return fractions
    ? `${result}.${Math.floor((safe % 1000) / 10)
        .toString()
        .padStart(2, '0')}`
    : result;
}

export interface StopwatchSnapshot {
  readonly running: boolean;
  readonly elapsed: number;
  readonly laps: readonly number[];
  readonly totalLaps: number;
}

/** Elapsed time follows injected monotonic timestamps, including suspended frames. */
export class StopwatchModel {
  private running = false;
  private elapsed = 0;
  private lastTime = 0;
  private laps: number[] = [];
  private totalLaps = 0;

  private advance(now: number): void {
    if (!Number.isFinite(now)) return;
    if (this.running) this.elapsed += Math.max(0, now - this.lastTime);
    this.lastTime = Math.max(this.lastTime, now);
  }

  toggle(now: number): void {
    this.advance(now);
    this.running = !this.running;
  }

  reset(now: number): void {
    this.advance(now);
    this.running = false;
    this.elapsed = 0;
    this.laps = [];
    this.totalLaps = 0;
  }

  lap(now: number): void {
    this.advance(now);
    if (this.running) {
      this.laps = [...this.laps.slice(-4), this.elapsed];
      this.totalLaps += 1;
    }
  }

  snapshot(now: number): StopwatchSnapshot {
    this.advance(now);
    return {
      running: this.running,
      elapsed: this.elapsed,
      laps: [...this.laps],
      totalLaps: this.totalLaps,
    };
  }
}

export interface CountdownSnapshot {
  readonly running: boolean;
  readonly remaining: number;
  readonly duration: number;
  readonly finished: boolean;
}

export class CountdownModel {
  private running = false;
  private duration = 300_000;
  private remaining = this.duration;
  private lastTime = 0;
  private finished = false;

  /** Returns true exactly once per completion, even after a long frame gap. */
  tick(now: number): boolean {
    if (!Number.isFinite(now)) return false;
    if (this.running)
      this.remaining = Math.max(0, this.remaining - Math.max(0, now - this.lastTime));
    this.lastTime = Math.max(this.lastTime, now);
    if (this.running && this.remaining === 0) {
      this.running = false;
      this.finished = true;
      return true;
    }
    return false;
  }

  setDuration(milliseconds: number): void {
    if (this.running || !Number.isFinite(milliseconds)) return;
    this.duration = Math.max(1_000, Math.min(86_400_000, Math.round(milliseconds / 1000) * 1000));
    this.remaining = this.duration;
    this.finished = false;
  }

  toggle(now: number): void {
    this.tick(now);
    if (this.finished) {
      this.remaining = this.duration;
      this.finished = false;
    }
    this.running = !this.running;
  }

  reset(now: number): void {
    this.tick(now);
    this.running = false;
    this.remaining = this.duration;
    this.finished = false;
  }

  snapshot(): CountdownSnapshot {
    return {
      running: this.running,
      remaining: this.remaining,
      duration: this.duration,
      finished: this.finished,
    };
  }
}
