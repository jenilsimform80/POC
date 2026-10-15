import { z } from 'zod';

/** "YYYY-MM-DD" (a real calendar date) -> Date at UTC midnight. */
// Years are bounded: PostgreSQL has no year 0 and JS date arithmetic near 9999 overflows PostgreSQL's
// range; business dates outside 2000-2100 are not meaningful for a timesheet system.
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

export const isoDate = z.iso
  .date()
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine(
    (date) => date.getUTCFullYear() >= MIN_YEAR && date.getUTCFullYear() <= MAX_YEAR,
    `year must be between ${MIN_YEAR} and ${MAX_YEAR}`,
  );

export const uuid = z.uuid();

/** Minimum length for any password set through the API (the seed script uses the same value). */
export const MIN_PASSWORD_LENGTH = 8;

/** Query-string booleans arrive as strings. */
export const queryBoolean = z.enum(['true', 'false']).transform((value) => value === 'true');

import { isMonday } from '../utils/dates.js';

/** A "YYYY-MM-DD" date that must be a Monday (ISO week start). */
export const mondayDate = isoDate.refine(isMonday, 'must be a Monday (weeks start on Monday)');

/**
 * Object-level refinements still run when a field already failed validation (the value is then the
 * raw, untransformed input). Range checks must therefore only look at real dates, otherwise a bad
 * date would crash the refinement (500) instead of producing a 400.
 */
export function bothDates<T extends { from: unknown; to: unknown }>(
  q: T,
): q is T & { from: Date; to: Date } {
  return q.from instanceof Date && q.to instanceof Date;
}
