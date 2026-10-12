import type { RequestHandler, Response } from 'express';
import type { ZodType, z } from 'zod';
import { AppError } from '../errors/app-error.js';

interface RequestSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

export interface ValidatedRequest<S extends RequestSchemas> {
  body: S['body'] extends ZodType ? z.infer<S['body']> : undefined;
  params: S['params'] extends ZodType ? z.infer<S['params']> : undefined;
  query: S['query'] extends ZodType ? z.infer<S['query']> : undefined;
}

/**
 * Validates body/params/query with Zod. Parsed (typed, coerced) values are placed on
 * `res.locals.validated`; controllers must read from there, not from raw `req`.
 * (Express 5 makes `req.query` read-only, so we do not overwrite it.)
 */
export function validate<S extends RequestSchemas>(schemas: S): RequestHandler {
  return (req, res, next) => {
    const validated: Record<string, unknown> = {};
    const issues: { location: string; path: string; message: string }[] = [];

    for (const location of ['body', 'params', 'query'] as const) {
      const schema = schemas[location];
      if (!schema) continue;
      const result = schema.safeParse(req[location]);
      if (result.success) {
        validated[location] = result.data;
      } else {
        for (const issue of result.error.issues) {
          issues.push({ location, path: issue.path.join('.'), message: issue.message });
        }
      }
    }

    if (issues.length > 0) {
      next(new AppError('VALIDATION_ERROR', 400, 'Request validation failed', issues));
      return;
    }
    res.locals['validated'] = validated;
    next();
  };
}

export function getValidated<S extends RequestSchemas>(res: Response): ValidatedRequest<S> {
  return res.locals['validated'] as ValidatedRequest<S>;
}
