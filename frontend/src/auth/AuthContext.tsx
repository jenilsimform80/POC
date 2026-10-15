import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getCurrentUser, login as loginRequest, logout as logoutRequest } from '../api/auth';
import { setUnauthorizedHandler } from '../api/client';
import { deferStart } from '../lib/defer-start';
import type { User } from '../api/types';

export type AuthState =
  { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: User };

export interface AuthContextValue {
  state: AuthState;
  /** Resolves on success; rejects with the ApiError (e.g. 401 wrong credentials, 429 throttled). */
  login: (email: string, password: string) => Promise<void>;
  /** Rejects (user stays signed in) if the server could not end the session. */
  logout: () => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Owns "who is signed in". The server session (HttpOnly cookie) is the source of truth: on load
 * we ask `/auth/me`; any later 401 from the API drops us to anonymous (central handler), which the
 * route guards turn into a redirect to the login page.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    const cancelStart = deferStart(() => {
      getCurrentUser(controller.signal).then(
        (user) => {
          if (controller.signal.aborted) return;
          setState(user ? { status: 'authenticated', user } : { status: 'anonymous' });
        },
        () => {
          // Cannot tell (network/server problem): treat as signed out; the login page will show
          // the real error when the user tries to sign in.
          if (!controller.signal.aborted) setState({ status: 'anonymous' });
        },
      );
    });
    return () => {
      cancelStart();
      controller.abort();
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setState({ status: 'anonymous' }));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const user = await loginRequest(email, password);
    setState({ status: 'authenticated', user });
  }, []);

  const logout = useCallback(async () => {
    // Only forget the user once the server has ended the session. If the request fails the
    // session may still be valid, so we must not pretend the user is signed out (shared computers).
    await logoutRequest();
    setState({ status: 'anonymous' });
  }, []);

  const value = useMemo(() => ({ state, login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
