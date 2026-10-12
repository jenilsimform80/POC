import type { Project } from '../../api/types';

export interface ProjectLookup {
  /** "ALPHA · Alpha Platform", or a placeholder for archived projects (not in the active list). */
  projectLabel: (projectId: string) => string;
  taskName: (projectId: string, taskId: string) => string;
}

export function createProjectLookup(projects: Project[]): ProjectLookup {
  const byId = new Map(projects.map((p) => [p.id, p]));
  return {
    projectLabel: (projectId) => {
      const project = byId.get(projectId);
      return project ? `${project.code} · ${project.name}` : 'Archived project';
    },
    taskName: (projectId, taskId) =>
      byId.get(projectId)?.tasks?.find((t) => t.id === taskId)?.name ?? 'Archived task',
  };
}
