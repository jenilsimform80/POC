import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors/app-error.js';
import { assertDailyLimit, evaluateWarnings } from '../src/services/timesheet-rules.js';

describe('assertDailyLimit', () => {
  it('allows up to exactly 24 hours', () => {
    expect(() => assertDailyLimit(24, '2026-03-02')).not.toThrow();
  });

  it('rejects more than 24 hours with a 422', () => {
    const error = (() => {
      try {
        assertDailyLimit(24.25, '2026-03-02');
      } catch (e) {
        return e as AppError;
      }
    })();

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 422, code: 'DAILY_LIMIT_EXCEEDED' });
  });
});

describe('evaluateWarnings', () => {
  it('has no warnings at or below the thresholds', () => {
    expect(evaluateWarnings({ date: '2026-03-02', dayTotal: 10, weekTotal: 48 })).toEqual([]);
  });

  it('warns above the daily threshold', () => {
    const warnings = evaluateWarnings({ date: '2026-03-02', dayTotal: 10.25, weekTotal: 10.25 });

    expect(warnings.map((w) => w.code)).toEqual(['DAILY_HOURS_HIGH']);
    expect(warnings[0]).toMatchObject({ date: '2026-03-02', total: 10.25, threshold: 10 });
  });

  it('warns above the weekly threshold and can report both', () => {
    const warnings = evaluateWarnings({ date: '2026-03-02', dayTotal: 11, weekTotal: 49 });

    expect(warnings.map((w) => w.code)).toEqual(['DAILY_HOURS_HIGH', 'WEEKLY_HOURS_HIGH']);
  });
});
