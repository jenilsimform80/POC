import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';

const NUL = '\u0000';

/** Iterative walk (no recursion limit on deeply nested JSON) looking for a NUL in any key or string. */
function containsNul(value: unknown): boolean {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (typeof current === 'string') {
      if (current.includes(NUL)) return true;
    } else if (Array.isArray(current)) {
      stack.push(...(current as unknown[]));
    } else if (typeof current === 'object' && current !== null) {
      for (const [key, child] of Object.entries(current)) {
        if (key.includes(NUL)) return true;
        stack.push(child);
      }
    }
  }
  return false;
}

/**
 * PostgreSQL text and jsonb cannot store NUL (U+0000), so any value containing one would reach the
 * database and fail as a 500. No legitimate client sends it, so reject it up front with a 400
 * for every route (body, query string and path), including text fields added in the future.
 */
export const rejectNulBytes: RequestHandler = (req, _res, next) => {
  if (/%00/i.test(req.originalUrl) || containsNul(req.body)) {
    next(
      new AppError('VALIDATION_ERROR', 400, 'Request validation failed', [
        { location: 'request', path: '', message: 'must not contain NUL (\\u0000) characters' },
      ]),
    );
    return;
  }
  next();
};
