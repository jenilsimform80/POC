export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PERIOD_LOCKED'
  | 'BUSINESS_RULE_VIOLATION'
  | 'DAILY_LIMIT_EXCEEDED'
  | 'WEEK_NOT_EDITABLE'
  | 'INVALID_STATE'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'BAD_REQUEST'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

/** Expected, client-facing failure. Anything else is treated as an unexpected 500. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
