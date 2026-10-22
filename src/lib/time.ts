export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
export const WIB_OFFSET = 7 * HOUR;

export type Tz = 'WIB' | 'UTC';

const pad = (n: number) => String(n).padStart(2, '0');

function parts(ts: number, tz: Tz) {
  const d = new Date(ts + (tz === 'WIB' ? WIB_OFFSET : 0));
  return {
    y: d.getUTCFullYear(),
    mo: d.getUTCMonth(),
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    m: d.getUTCMinutes(),
    s: d.getUTCSeconds(),
    dow: d.getUTCDay(),
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function fmtClock(ts: number, tz: Tz, seconds = true): string {
  const p = parts(ts, tz);
  return `${pad(p.h)}:${pad(p.m)}${seconds ? ':' + pad(p.s) : ''}`;
}

export function fmtDate(ts: number, tz: Tz): string {
  const p = parts(ts, tz);
  return `${pad(p.d)} ${MONTHS[p.mo]} ${p.y}`;
}

export function fmtDateShort(ts: number, tz: Tz): string {
  const p = parts(ts, tz);
  return `${pad(p.d)} ${MONTHS[p.mo]}`;
}

export function fmtDow(ts: number, tz: Tz): string {
  return DOW[parts(ts, tz).dow];
}

/** "22 Oct 14:05 WIB" */
export function fmtStamp(ts: number, tz: Tz): string {
  return `${fmtDateShort(ts, tz)} ${fmtClock(ts, tz, false)} ${tz}`;
}

/** Hour of day in timezone (0..23, fractional). */
export function hourOf(ts: number, tz: Tz = 'WIB'): number {
  const p = parts(ts, tz);
  return p.h + p.m / 60;
}

/** Start of day in timezone, returned as UTC ms. */
export function startOfDay(ts: number, tz: Tz = 'WIB'): number {
  const off = tz === 'WIB' ? WIB_OFFSET : 0;
  return Math.floor((ts + off) / DAY) * DAY - off;
}

export function startOfHour(ts: number): number {
  return Math.floor(ts / HOUR) * HOUR;
}

/** Duration "2h 14m", "45m", "3d 4h" */
export function fmtDur(ms: number): string {
  if (!isFinite(ms)) return '—';
  const neg = ms < 0;
  let m = Math.round(Math.abs(ms) / MIN);
  const d = Math.floor(m / 1440);
  m -= d * 1440;
  const h = Math.floor(m / 60);
  m -= h * 60;
  let s: string;
  if (d > 0) s = `${d}d ${h}h`;
  else if (h > 0) s = `${h}h ${pad(m)}m`;
  else s = `${m}m`;
  return neg ? `−${s}` : s;
}

/** Relative "in 2h 10m" / "3h ago" */
export function fmtRel(ts: number, now: number): string {
  const d = ts - now;
  if (Math.abs(d) < MIN) return 'now';
  return d > 0 ? `in ${fmtDur(d)}` : `${fmtDur(-d)} ago`;
}

export function fmtHrs(hrs: number): string {
  return `${hrs.toFixed(1)} h`;
}
