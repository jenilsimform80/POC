import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/api/errors';
import { fieldErrorsFrom } from '../src/lib/forms';

describe('fieldErrorsFrom', () => {
  it('maps backend validation issues to field messages (first message per field)', () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', [
      { location: 'body', path: 'hours', message: 'Too big: expected number to be <=24' },
      { location: 'body', path: 'hours', message: 'second message ignored' },
      { location: 'body', path: 'workDate', message: 'Invalid ISO date' },
    ]);

    expect(fieldErrorsFrom(error)).toEqual({
      hours: 'Too big: expected number to be <=24',
      workDate: 'Invalid ISO date',
    });
  });

  it('uses the first path segment for nested paths', () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'x', [
      { location: 'body', path: 'a.b', message: 'bad' },
    ]);

    expect(fieldErrorsFrom(error)).toEqual({ a: 'bad' });
  });

  it('returns nothing for other errors or malformed details', () => {
    expect(fieldErrorsFrom(new ApiError(409, 'CONFLICT', 'dup'))).toEqual({});
    expect(fieldErrorsFrom(new ApiError(400, 'VALIDATION_ERROR', 'x', 'not a list'))).toEqual({});
    expect(fieldErrorsFrom(new ApiError(400, 'VALIDATION_ERROR', 'x', [{ nope: 1 }]))).toEqual({});
    expect(fieldErrorsFrom(new Error('plain'))).toEqual({});
    expect(fieldErrorsFrom(undefined)).toEqual({});
  });
});
