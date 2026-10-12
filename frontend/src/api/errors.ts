/** Shape of every error the backend returns (see docs/api-contracts.md). */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/**
 * A failed API call. `status` is the HTTP status, or 0 when no response was received at all
 * (network down, DNS, CORS). `code` is the backend's stable error code, or one of the client-side
 * codes `NETWORK_ERROR` / `UNEXPECTED_RESPONSE`.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    /** Parsed response body when it was JSON (some endpoints answer 503 with their own shape). */
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = value.error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}
