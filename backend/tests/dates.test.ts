import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isMonday, mondayOf, toIsoDate } from '../src/utils/dates.js';
import { date } from './helpers.js';

describe('date utilities (UTC calendar dates)', () => {
  it('finds the Monday of any weekday', () => {
    // 2026-03-02 is a Monday
    expect(toIsoDate(mondayOf(date('2026-03-02')))).toBe('2026-03-02');
    expect(toIsoDate(mondayOf(date('2026-03-04')))).toBe('2026-03-02');
    expect(toIsoDate(mondayOf(date('2026-03-08')))).toBe('2026-03-02'); // Sunday belongs to the week before
    expect(toIsoDate(mondayOf(date('2026-03-09')))).toBe('2026-03-09');
  });

  it('works across month and year boundaries', () => {
    expect(toIsoDate(mondayOf(date('2026-01-01')))).toBe('2025-12-29');
    expect(toIsoDate(addDays(date('2026-02-27'), 3))).toBe('2026-03-02');
    expect(daysBetween(date('2026-01-01'), date('2027-01-01'))).toBe(365);
  });

  it('detects Mondays', () => {
    expect(isMonday(date('2026-03-02'))).toBe(true);
    expect(isMonday(date('2026-03-03'))).toBe(false);
  });
});
