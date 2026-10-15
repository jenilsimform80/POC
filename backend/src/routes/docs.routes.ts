import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { sessionCookieName } from '../auth/session.service.js';
import type { Env } from '../config/env.js';
import { buildOpenApiDocument } from '../docs/openapi.js';

export const API_DOCS_PATH = '/api-docs';
export const API_DOCS_JSON_PATH = '/api-docs.json';

export function apiDocsEnabled(env: Env): boolean {
  return env.API_DOCS_ENABLED ?? env.NODE_ENV !== 'production';
}

/** Swagger UI at /api-docs and the raw OpenAPI document at /api-docs.json. No-op when disabled. */
export function mountApiDocs(app: Express, env: Env): void {
  if (!apiDocsEnabled(env)) return;

  const document = buildOpenApiDocument({ cookieName: sessionCookieName(env.NODE_ENV) });
  app.get(API_DOCS_JSON_PATH, (_req, res) => {
    res.status(200).json(document);
  });
  // The UI loads the same JSON the endpoint serves, so what you read is what is documented.
  app.use(
    API_DOCS_PATH,
    swaggerUi.serve,
    swaggerUi.setup(null, {
      customSiteTitle: 'Timesheets API docs',
      swaggerOptions: { url: API_DOCS_JSON_PATH },
    }),
  );
}
