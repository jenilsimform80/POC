// All business dates are calendar dates (no time zone). They are handled as UTC-midnight Dates
// and exchanged with clients as "YYYY-MM-DD" strings, so no server/client zone can shift them.

const DAY_MS = 86_400_000;

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** ISO weeks start on Monday. */
export function isMonday(date: Date): boolean {
  return date.getUTCDay() === 1;
}

export function mondayOf(date: Date): Date {
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  return addDays(date, -sinceMonday);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}
