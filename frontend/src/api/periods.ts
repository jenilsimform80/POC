import { apiRequest } from './client';
import type { LockedPeriod } from './types';

export async function listLockedPeriods(signal?: AbortSignal): Promise<LockedPeriod[]> {
  const { lockedPeriods } = await apiRequest<{ lockedPeriods: LockedPeriod[] }>('/locked-periods', {
    ...(signal && { signal }),
  });
  return lockedPeriods;
}

export async function lockPeriod(period: string, note?: string): Promise<LockedPeriod> {
  const { lockedPeriod } = await apiRequest<{ lockedPeriod: LockedPeriod }>('/locked-periods', {
    method: 'POST',
    body: note ? { period, note } : { period },
  });
  return lockedPeriod;
}

export function unlockPeriod(period: string, reason: string): Promise<void> {
  return apiRequest<void>(`/locked-periods/${period}/unlock`, { method: 'POST', body: { reason } });
}
