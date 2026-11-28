/**
 * 后台内容日期的本地时区工具。
 *
 * 内容里的 `date` 字段是作者本地的“墙上时间”，不是 UTC 瞬时值：
 * 用 `toISOString()` 会在 UTC+8 的 00:00–08:00 之间给出“昨天”，
 * 用写死的 `+08:00` 则会在其他时区的后台机器上整体偏移。
 */

const LOCAL_DATE = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 本地日历日 `YYYY-MM-DD`（`en-CA` 的短日期格式恰为 ISO 形状）。 */
export function formatToday(now: Date = new Date()): string {
  return LOCAL_DATE.format(now);
}

/** 本地墙上时间 `HH:mm`。 */
export function formatClock(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/**
 * 带真实本地偏移的 ISO 8601 时间戳（`2026-11-28T10:30:00+08:00`）。
 *
 * 保留墙上时间、按运行机器的实际偏移标注：与 `Date.parse` 互相转换仍是
 * 同一瞬时，直接展示也还是作者写下的日期。
 */
export function toLocalIsoString(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  return (
    `${formatToday(date)}T` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(hours)}:${pad(minutes)}`
  );
}
