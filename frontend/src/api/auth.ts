import { apiRequest, storeTokensFrom } from './client';
import { ApiError } from './errors';
import { clearTokens, getRefreshToken, hasTokens } from './token-store';
import type { User } from './types';

/**
 * Returns the signed-in user, or null when there is no valid session (401 is not an error here).
 * Without tokens in memory (fresh page load) there is nothing to check, so no request is made.
 */
export async function getCurrentUser(signal?: AbortSignal): Promise<User | null> {
  if (!hasTokens()) return null;
  try {
    const { user } = await apiRequest<{ user: User }>('/auth/me', {
      ...(signal && { signal }),
    });
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function login(email: string, password: string): Promise<User> {
  const payload = await apiRequest<{ user: User }>('/auth/login', {
    method: 'POST',
    body: { email, password },
    handleUnauthorized: false, // a 401 here means "wrong credentials", shown on the form
  });
  storeTokensFrom(payload);
  return payload.user;
}

/** Ends the server session, then forgets the tokens. If the server call fails the tokens are kept. */
export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    await apiRequest<void>('/auth/logout', {
      method: 'POST',
      body: { refreshToken },
      handleUnauthorized: false,
    });
  }
  clearTokens();
}

/** The user changes their own password. A wrong current password is a 401 that must NOT sign them out. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiRequest<void>('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
    handleUnauthorized: false, // wrong current password is a 401 shown on the form...
    silentRefresh: true, // ...but an expired access token is renewed first
  });
}
