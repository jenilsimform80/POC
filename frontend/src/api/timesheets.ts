import { apiRequest } from './client';
import type { TimeEntry, TimesheetWarning, WeekSummary } from './types';

export function getWeek(
  weekStart: string,
  userId?: string,
  signal?: AbortSignal,
): Promise<WeekSummary> {
  return apiRequest<WeekSummary>(`/timesheets/${weekStart}`, {
    query: { userId },
    ...(signal && { signal }),
  });
}

export interface EntryInput {
  projectId: string;
  taskId: string;
  workDate: string;
  hours: number;
  isBillable: boolean;
  notes?: string;
}

export interface EntryPatch {
  projectId?: string;
  taskId?: string;
  workDate?: string;
  hours?: number;
  isBillable?: boolean;
  notes?: string | null;
}

export interface EntryWriteResult {
  entry: TimeEntry;
  warnings: TimesheetWarning[];
}

export function createEntry(input: EntryInput): Promise<EntryWriteResult> {
  return apiRequest<EntryWriteResult>('/time-entries', { method: 'POST', body: input });
}

export function updateEntry(id: string, patch: EntryPatch): Promise<EntryWriteResult> {
  return apiRequest<EntryWriteResult>(`/time-entries/${id}`, { method: 'PATCH', body: patch });
}

export function deleteEntry(id: string): Promise<void> {
  return apiRequest<void>(`/time-entries/${id}`, { method: 'DELETE' });
}
