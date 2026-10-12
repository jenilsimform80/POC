import { apiRequest } from './client';
import type { User } from './types';

/** Users the caller may see: self (contributor), self + reports (manager), everyone (admin). */
export async function listUsers(signal?: AbortSignal): Promise<User[]> {
  const { users } = await apiRequest<{ users: User[] }>('/users', { ...(signal && { signal }) });
  return users;
}

export async function listDirectReports(signal?: AbortSignal): Promise<User[]> {
  const { users } = await apiRequest<{ users: User[] }>('/users/direct-reports', {
    ...(signal && { signal }),
  });
  return users;
}

export async function getUser(id: string, signal?: AbortSignal): Promise<User> {
  const { user } = await apiRequest<{ user: User }>(`/users/${id}`, { ...(signal && { signal }) });
  return user;
}
