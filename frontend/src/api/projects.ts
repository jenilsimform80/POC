import { apiRequest } from './client';
import type { Project, Task } from './types';

export async function listProjects(
  options: { includeArchived?: boolean; signal?: AbortSignal } = {},
): Promise<Project[]> {
  const { projects } = await apiRequest<{ projects: Project[] }>('/projects', {
    query: { includeArchived: options.includeArchived ? true : undefined },
    ...(options.signal && { signal: options.signal }),
  });
  return projects;
}

export interface ProjectInput {
  code: string;
  name: string;
  clientName?: string;
  budgetHours: number;
  startDate?: string;
  endDate?: string;
}

export interface ProjectPatch {
  code?: string;
  name?: string;
  clientName?: string | null;
  budgetHours?: number;
  startDate?: string | null;
  endDate?: string | null;
  isActive?: boolean;
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const { project } = await apiRequest<{ project: Project }>('/projects', {
    method: 'POST',
    body: input,
  });
  return project;
}

export async function updateProject(id: string, patch: ProjectPatch): Promise<Project> {
  const { project } = await apiRequest<{ project: Project }>(`/projects/${id}`, {
    method: 'PATCH',
    body: patch,
  });
  return project;
}

export async function createTask(projectId: string, name: string): Promise<Task> {
  const { task } = await apiRequest<{ task: Task }>(`/projects/${projectId}/tasks`, {
    method: 'POST',
    body: { name },
  });
  return task;
}

export async function updateTask(
  projectId: string,
  taskId: string,
  patch: { name?: string; isActive?: boolean },
): Promise<Task> {
  const { task } = await apiRequest<{ task: Task }>(`/projects/${projectId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: patch,
  });
  return task;
}
