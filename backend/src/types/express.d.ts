import type { AuthUser } from '../auth/auth-user.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by `authenticate`; undefined on unauthenticated requests. */
    auth?: AuthUser;
    /** Hash of the session cookie token that authenticated this request. */
    sessionToken?: string;
  }
}
