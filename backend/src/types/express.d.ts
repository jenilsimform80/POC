import type { AuthUser } from '../auth/auth-user.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by `authenticate`; undefined on unauthenticated requests. */
    auth?: AuthUser;
    /** The login session (from the access token's `sid`) that authenticated this request. */
    sessionId?: string;
  }
}
