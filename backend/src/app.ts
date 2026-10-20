import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Env } from './config/env.js';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler.js';
import { rejectNulBytes } from './middleware/reject-nul.js';
import { mountApiDocs } from './routes/docs.routes.js';
import { createApiRouter, type AppDependencies } from './routes/index.js';

export function createApp(env: Env, deps: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  // Authenticated JSON must never be reused from a browser/proxy cache for another user: no ETag
  // (no conditional-request path), `no-store`, and `Vary: Authorization` for caches that ignore no-store.
  app.disable('etag');
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.vary('Authorization');
    next();
  });
  // Trust exactly N proxy hops (never "true"); 0 means X-Forwarded-For is ignored.
  if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);
  app.locals['jwtSecret'] = env.JWT_SECRET;
  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL }));
  app.use(express.json({ limit: '100kb' }));
  app.use(rejectNulBytes);

  mountApiDocs(app, env);
  app.use('/api', createApiRouter(deps, env));

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logErrors: env.NODE_ENV !== 'test' }));

  return app;
}
