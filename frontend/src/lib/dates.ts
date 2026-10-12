// Business dates are calendar dates ("YYYY-MM-DD", ADR 0006). All arithmetic is done in UTC on
// the date parts, so neither the browser's time zone nor daylight-saving changes can shift a day.

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
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

const pad = (n: number) => String(n).padStart(2, '0');

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseIsoDate(value);
  return !Number.isNaN(parsed.getTime()) && toIsoDate(parsed) === value;
}

export function parseIsoDate(iso: string): Date {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The browser user's current calendar date (their local "today"), not the UTC date. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  return toIsoDate(new Date(parseIsoDate(iso).getTime() + days * DAY_MS));
}

export function mondayOf(iso: string): string {
  const sinceMonday = (parseIsoDate(iso).getUTCDay() + 6) % 7;
  return addDays(iso, -sinceMonday);
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Number of calendar days from `from` to `to`, both included. */
export function daysInclusive(from: string, to: string): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / DAY_MS) + 1;
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** "Mon 2 Mar" */
export function formatDay(iso: string): string {
  const date = parseIsoDate(iso);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** "2 Mar – 8 Mar 2026" */
export function formatRange(from: string, to: string): string {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
}

/** "March 2026" from "2026-03" */
export function formatMonth(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return `${MONTH_NAMES[(m ?? 1) - 1]} ${y}`;
}

/** An instant (ISO timestamp from the API) in the viewer's own time zone. */
export function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
