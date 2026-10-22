import type { Role } from '../api/types';

/**
 * Which roles see which area. This only decides what the UI SHOWS; the backend enforces every
 * permission regardless (a hidden link is a convenience, never a control).
 */
export const ACCESS = {
  timesheet: ['CONTRIBUTOR', 'MANAGER', 'ADMIN'],
  approvals: ['MANAGER', 'ADMIN'],
  projects: ['CONTRIBUTOR', 'MANAGER', 'ADMIN'],
  reports: ['CONTRIBUTOR', 'MANAGER', 'ADMIN'],
  budgets: ['ADMIN'],
  periods: ['ADMIN'],
  users: ['ADMIN'],
  account: ['CONTRIBUTOR', 'MANAGER', 'ADMIN'],
} as const satisfies Record<string, readonly Role[]>;

export type Area = keyof typeof ACCESS;

export function canAccess(role: Role, area: Area): boolean {
  return (ACCESS[area] as readonly Role[]).includes(role);
}
