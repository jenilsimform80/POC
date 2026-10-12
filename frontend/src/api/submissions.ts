import { apiRequest } from './client';
import type { Submission, SubmissionStatus } from './types';

export async function submitWeek(weekStart: string): Promise<Submission> {
  const { submission } = await apiRequest<{ submission: Submission }>('/submissions', {
    method: 'POST',
    body: { weekStart },
  });
  return submission;
}

export interface SubmissionFilter {
  status?: SubmissionStatus;
  userId?: string;
  forApproval?: boolean;
}

export async function listSubmissions(
  filter: SubmissionFilter = {},
  signal?: AbortSignal,
): Promise<Submission[]> {
  const { submissions } = await apiRequest<{ submissions: Submission[] }>('/submissions', {
    query: { status: filter.status, userId: filter.userId, forApproval: filter.forApproval },
    ...(signal && { signal }),
  });
  return submissions;
}

export async function getSubmission(id: string, signal?: AbortSignal): Promise<Submission> {
  const { submission } = await apiRequest<{ submission: Submission }>(`/submissions/${id}`, {
    ...(signal && { signal }),
  });
  return submission;
}

export async function approveSubmission(id: string, comment?: string): Promise<Submission> {
  const { submission } = await apiRequest<{ submission: Submission }>(
    `/submissions/${id}/approve`,
    {
      method: 'POST',
      body: comment ? { comment } : {},
    },
  );
  return submission;
}

export async function rejectSubmission(id: string, comment: string): Promise<Submission> {
  const { submission } = await apiRequest<{ submission: Submission }>(`/submissions/${id}/reject`, {
    method: 'POST',
    body: { comment },
  });
  return submission;
}
