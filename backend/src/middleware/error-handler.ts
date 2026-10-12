import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, type ErrorCode } from '../errors/app-error.js';
import { postgresErrorCode } from '../errors/prisma-errors.js';
import { Prisma } from '../generated/prisma/client.js';

/**
 * 4xx errors raised by Express itself (body-parser: 413/415/400, router param decoding: 400) carry
 * a numeric `status`. They are the client's fault, so they must not become 500s. Messages are
 * fixed text per status: the framework's own message is never echoed.
 */
function clientErrorStatus(err: unknown): number | undefined {
  if (!(err instanceof Error)) return undefined;
  const e = err as Error & { status?: unknown; statusCode?: unknown; expose?: unknown };
  const status = typeof e.status === 'number' ? e.status : e.statusCode;
  if (typeof status !== 'number' || !Number.isInteger(status) || status < 400 || status > 499) {
    return undefined;
  }
  return e.expose === false ? undefined : status;
}

const CLIENT_ERRORS: Record<number, { code: ErrorCode; message: string }> = {
  400: { code: 'VALIDATION_ERROR', message: 'The request is malformed' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large' },
  415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported content type or encoding' },
};

/** Transient database conditions: the caller can simply retry. */
const RETRYABLE_PG_CODES = new Set(['40P01', '40001', '55P03', '57014']); // deadlock, serialization, lock timeout, cancelled
function isTransientDatabaseError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2028') return true; // transaction timeout/closed
  const code = postgresErrorCode(err);
  return code !== undefined && RETRYABLE_PG_CODES.has(code);
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError('NOT_FOUND', 404, `Route not found: ${req.method} ${req.path}`));
};

/** Single place that turns errors into the API error shape. Never leaks internals. */
export function createErrorHandler(options: { logErrors: boolean }): ErrorRequestHandler {
  // Express identifies error handlers by their 4-argument signature.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err: unknown, _req, res, _next) => {
    if (err instanceof AppError) {
      res.status(err.status).json({
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined && { details: err.details }),
        },
      });
      return;
    }

    // Malformed JSON bodies surface from body-parser as errors with a status.
    if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON' },
      });
      return;
    }

    const clientStatus = clientErrorStatus(err);
    if (clientStatus !== undefined) {
      const mapped = CLIENT_ERRORS[clientStatus] ?? {
        code: 'BAD_REQUEST' as const,
        message: 'The request could not be processed',
      };
      res.status(clientStatus).json({ error: { code: mapped.code, message: mapped.message } });
      return;
    }

    if (isTransientDatabaseError(err)) {
      if (options.logErrors) console.error(err);
      res.status(503).json({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'The service is temporarily busy. Please retry.',
        },
      });
      return;
    }

    if (options.logErrors) console.error(err);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  };
}
