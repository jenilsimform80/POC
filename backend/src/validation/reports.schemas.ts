import { z } from 'zod';
import { daysBetween } from '../utils/dates.js';
import { bothDates, isoDate, uuid } from './common.js';

export const REPORT_DIMENSIONS = ['contributor', 'project', 'month'] as const;
export type ReportDimension = (typeof REPORT_DIMENSIONS)[number];

// Reports may span several years, but not unbounded ranges.
const MAX_RANGE_DAYS = 1830;

/** "contributor,month" -> ['contributor', 'month']; whitelisted, unique, at least one. */
const groupBy = z
  .string()
  .transform((value) => value.split(',').map((part) => part.trim()))
  .pipe(z.array(z.enum(REPORT_DIMENSIONS)).min(1))
  .refine((dims) => new Set(dims).size === dims.length, 'groupBy must not repeat a dimension');

export const hoursReportSchemas = {
  query: z
    .object({
      from: isoDate,
      to: isoDate,
      groupBy,
      userId: uuid.optional(),
      projectId: uuid.optional(),
    })
    .refine((q) => !bothDates(q) || q.from <= q.to, {
      message: 'from must not be after to',
      path: ['from'],
    })
    .refine((q) => !bothDates(q) || daysBetween(q.from, q.to) <= MAX_RANGE_DAYS, {
      message: `date range must not exceed ${MAX_RANGE_DAYS} days`,
      path: ['to'],
    }),
};

export const budgetReportSchemas = {
  query: z.object({
    projectId: uuid.optional(),
    // Count only hours up to and including this date (e.g. a month-end snapshot).
    through: isoDate.optional(),
    includeArchived: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  }),
};
