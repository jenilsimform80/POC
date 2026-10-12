import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysInclusive,
  formatDay,
  formatMonth,
  formatRange,
  isValidIsoDate,
  mondayOf,
  monthOf,
  todayIso,
  weekDays,
} from '../src/lib/dates';

describe('date helpers (calendar dates, UTC arithmetic)', () => {
  it('finds the Monday of any weekday, including Sundays', () => {
    expect(mondayOf('2026-03-02')).toBe('2026-03-02'); // Monday
    expect(mondayOf('2026-03-04')).toBe('2026-03-02');
    expect(mondayOf('2026-03-08')).toBe('2026-03-02'); // Sunday belongs to the week before
    expect(mondayOf('2026-03-09')).toBe('2026-03-09');
  });

  it('crosses month and year boundaries', () => {
    expect(mondayOf('2026-01-01')).toBe('2025-12-29');
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
    expect(addDays('2026-03-02', -7)).toBe('2026-02-23');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // leap year
  });

  it('is not affected by daylight-saving changes', () => {
    // 2026-03-29 is the EU spring-forward date, 2026-11-01 the US fall-back date.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(weekDays('2026-03-23')).toEqual([
      '2026-03-23',
      '2026-03-24',
      '2026-03-25',
      '2026-03-26',
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
    ]);
  });

  it('lists the 7 days of a week', () => {
    const days = weekDays('2026-03-02');

    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-03-02');
    expect(days[6]).toBe('2026-03-08');
  });

  it('validates real calendar dates only', () => {
    expect(isValidIsoDate('2026-03-31')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-3-1')).toBe(false);
    expect(isValidIsoDate('yesterday')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });

  it('uses the local calendar date for "today", not the UTC date', () => {
    // 00:30 local on 2 March, whatever the machine's zone: local getters decide.
    expect(todayIso(new Date(2026, 2, 2, 0, 30))).toBe('2026-03-02');
    expect(todayIso(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('formats days, ranges and months deterministically', () => {
    expect(formatDay('2026-03-02')).toBe('Mon 2 Mar');
    expect(formatDay('2026-12-31')).toBe('Thu 31 Dec');
    expect(formatRange('2026-03-02', '2026-03-08')).toBe('2 Mar – 8 Mar 2026');
    expect(formatMonth('2026-03')).toBe('March 2026');
    expect(monthOf('2026-03-31')).toBe('2026-03');
  });

  it('counts days inclusively', () => {
    expect(daysInclusive('2026-03-01', '2026-03-01')).toBe(1);
    expect(daysInclusive('2026-03-01', '2026-03-31')).toBe(31);
  });
});
