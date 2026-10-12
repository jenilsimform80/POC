import { config } from '../config/env';
import { ApiError, isApiErrorBody } from './errors';

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * Registers the app-wide reaction to "your session is no longer valid" (HTTP 401 on any call
 * except those that opt out). The auth layer uses it to drop the signed-in user and send them to
 * the login page; the failed call still rejects with its ApiError.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Query-string parameters; `undefined`/`null` values are omitted. */
  query?: Record<string, string | number | boolean | null | undefined>;
  /** JSON-serialisable request body. */
  body?: unknown;
  signal?: AbortSignal;
  /** Set false for calls where 401 is an expected answer (login, session check). Default true. */
  handleUnauthorized?: boolean;
}

export function buildUrl(
  path: string,
  query: RequestOptions['query'],
  baseUrl: string = config.apiBaseUrl,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const qs = params.toString();
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}${qs ? `?${qs}` : ''}`;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The only place that calls `fetch`. Sends the session cookie (`credentials: 'include'`), speaks
 * JSON, and turns every failure into an `ApiError`. Cancellation (AbortError) is passed through
 * unchanged so callers can ignore it.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, signal, handleUnauthorized = true } = options;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      ...(signal && { signal }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection.');
  }

  const payload = await readJson(response);

  if (!response.ok) {
    if (response.status === 401 && handleUnauthorized) unauthorizedHandler?.();
    if (isApiErrorBody(payload)) {
      const { code, message, details } = payload.error;
      throw new ApiError(response.status, code, message, details, payload);
    }
    throw new ApiError(
      response.status,
      'UNEXPECTED_RESPONSE',
      `The server answered ${response.status} ${response.statusText}`.trim(),
      undefined,
      payload,
    );
  }

  return payload as T;
}
