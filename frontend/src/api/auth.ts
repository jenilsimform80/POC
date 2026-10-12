import { apiRequest } from './client';
import { ApiError } from './errors';
import type { User } from './types';

/** Returns the signed-in user, or null when there is no valid session (401 is not an error here). */
export async function getCurrentUser(signal?: AbortSignal): Promise<User | null> {
  try {
    const { user } = await apiRequest<{ user: User }>('/auth/me', {
      handleUnauthorized: false,
      ...(signal && { signal }),
    });
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function login(email: string, password: string): Promise<User> {
  const { user } = await apiRequest<{ user: User }>('/auth/login', {
    method: 'POST',
    body: { email, password },
    handleUnauthorized: false, // a 401 here means "wrong credentials", shown on the form
  });
  return user;
}

export async function logout(): Promise<void> {
  await apiRequest<void>('/auth/logout', { method: 'POST', handleUnauthorized: false });
}
