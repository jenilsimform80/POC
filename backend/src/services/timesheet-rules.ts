import { AppError } from '../errors/app-error.js';

// ASSUMPTIONS (original spec unverified; see docs/requirements.md): thresholds are configurable
// here in one place. Only the 24h/day cap is a hard rule; the others only produce warnings.
export const MAX_DAILY_HOURS = 24;
export const DAILY_WARNING_HOURS = 10;
export const WEEKLY_WARNING_HOURS = 48;

export type WarningCode = 'DAILY_HOURS_HIGH' | 'WEEKLY_HOURS_HIGH';

export interface TimesheetWarning {
  code: WarningCode;
  message: string;
  total: number;
  threshold: number;
  date?: string;
}

/** Throws if the day would exceed 24 hours in total. */
export function assertDailyLimit(dayTotalAfter: number, date: string): void {
  if (dayTotalAfter > MAX_DAILY_HOURS) {
    throw new AppError(
      'DAILY_LIMIT_EXCEEDED',
      422,
      `Total hours for ${date} would be ${dayTotalAfter}, exceeding the ${MAX_DAILY_HOURS}-hour daily limit`,
      { date, total: dayTotalAfter, limit: MAX_DAILY_HOURS },
    );
  }
}

export function evaluateWarnings(input: {
  date: string;
  dayTotal: number;
  weekTotal: number;
}): TimesheetWarning[] {
  const warnings: TimesheetWarning[] = [];
  if (input.dayTotal > DAILY_WARNING_HOURS) {
    warnings.push({
      code: 'DAILY_HOURS_HIGH',
      message: `${input.dayTotal} hours logged on ${input.date} (more than ${DAILY_WARNING_HOURS})`,
      total: input.dayTotal,
      threshold: DAILY_WARNING_HOURS,
      date: input.date,
    });
  }
  if (input.weekTotal > WEEKLY_WARNING_HOURS) {
    warnings.push({
      code: 'WEEKLY_HOURS_HIGH',
      message: `${input.weekTotal} hours logged this week (more than ${WEEKLY_WARNING_HOURS})`,
      total: input.weekTotal,
      threshold: WEEKLY_WARNING_HOURS,
    });
  }
  return warnings;
}
