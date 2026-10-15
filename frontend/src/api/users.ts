import { apiRequest } from './client';
import type { User } from './types';

export interface NewUserInput {
  email: string;
  name: string;
  role: 'CONTRIBUTOR' | 'MANAGER';
  password: string;
  managerId?: string;
}

/** Admin only (the backend enforces it). */
export async function createUser(input: NewUserInput): Promise<User> {
  const { user } = await apiRequest<{ user: User }>('/users', { method: 'POST', body: input });
  return user;
}

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

export interface UserPatch {
  name?: string;
  role?: 'CONTRIBUTOR' | 'MANAGER';
  managerId?: string | null;
  isActive?: boolean;
}

export async function updateUser(id: string, patch: UserPatch): Promise<User> {
  const { user } = await apiRequest<{ user: User }>(`/users/${id}`, {
    method: 'PATCH',
    body: patch,
  });
  return user;
}

/** Admin sets a new password for another user (ends that user's sessions). */
export async function resetUserPassword(id: string, password: string): Promise<void> {
  await apiRequest<void>(`/users/${id}/password`, { method: 'POST', body: { password } });
}
