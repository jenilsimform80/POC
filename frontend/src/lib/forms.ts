import { ApiError } from '../api/errors';

interface ValidationIssue {
  location: string;
  path: string;
  message: string;
}

function isIssueList(value: unknown): value is ValidationIssue[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as ValidationIssue).path === 'string' &&
        typeof (v as ValidationIssue).message === 'string',
    )
  );
}

/**
 * Maps the backend's `VALIDATION_ERROR` details (`[{location, path, message}]`) to
 * `{ fieldName: message }` so forms can show the message next to the right input.
 */
export function fieldErrorsFrom(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return {};
  if (!isIssueList(error.details)) return {};
  const result: Record<string, string> = {};
  for (const issue of error.details) {
    const field = issue.path.split('.')[0] ?? '';
    if (field && !(field in result)) result[field] = issue.message;
  }
  return result;
}
