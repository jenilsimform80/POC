import { useCallback, useState } from 'react';
import {
  createProject,
  createTask,
  listProjects,
  updateProject,
  updateTask,
  type ProjectInput,
  type ProjectPatch,
} from '../../api/projects';
import type { Project } from '../../api/types';
import { Alert } from '../../components/ui/Alert';
import { AsyncView } from '../../components/ui/AsyncView';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { CheckboxField } from '../../components/ui/FormControls';
import { describeError } from '../../components/ui/describeError';
import { useAuth } from '../../auth/useAuth';
import { useAsync } from '../../hooks/useAsync';
import { useMutation } from '../../hooks/useMutation';
import { formatRange } from '../../lib/dates';
import { ProjectForm } from './ProjectForm';
import styles from './Projects.module.css';
import { TaskList } from './TaskList';

export function ProjectsPage() {
  const { state: auth } = useAuth();
  const isAdmin = auth.status === 'authenticated' && auth.user.role === 'ADMIN';
  const [includeArchived, setIncludeArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const load = useCallback(
    (signal: AbortSignal) => listProjects({ includeArchived, signal }),
    [includeArchived],
  );
  const { state, reload } = useAsync(load);

  const create = async (value: ProjectInput | ProjectPatch) => {
    await createProject(value as ProjectInput);
    reload();
  };

  return (
    <>
      <h1>Projects</h1>
      <div className="row">
        {isAdmin && (
          <>
            <CheckboxField
              label="Show archived projects"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            {!creating && <Button onClick={() => setCreating(true)}>New project</Button>}
          </>
        )}
      </div>

      {creating && isAdmin && (
        <section className={styles.card} aria-label="Create project">
          <h2>New project</h2>
          <ProjectForm onSave={create} onCancel={() => setCreating(false)} />
        </section>
      )}

      <AsyncView
        state={state}
        onRetry={reload}
        loadingLabel="Loading projects…"
        errorTitle="Could not load projects"
        isEmpty={(projects) => projects.length === 0}
        empty={
          <EmptyState
            title="No projects yet"
            description={
              isAdmin
                ? 'Create the first project above.'
                : 'An admin has not set up any projects yet.'
            }
          />
        }
      >
        {(projects) => (
          <div className="stack">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isAdmin={isAdmin}
                onChanged={reload}
              />
            ))}
          </div>
        )}
      </AsyncView>
    </>
  );
}

function ProjectCard({
  project,
  isAdmin,
  onChanged,
}: {
  project: Project;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const toggle = useMutation(async () => {
    await updateProject(project.id, { isActive: !project.isActive });
    onChanged();
  });
  const headingId = `project-${project.id}`;

  const save = async (patch: ProjectInput | ProjectPatch) => {
    await updateProject(project.id, patch);
    onChanged();
  };

  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <header className={styles.cardHeader}>
        <h2 id={headingId}>
          {project.code} · {project.name}
        </h2>
        {!project.isActive && <Badge tone="neutral">Archived</Badge>}
      </header>

      {editing && isAdmin ? (
        <ProjectForm project={project} onSave={save} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <dl className={styles.facts}>
            {project.clientName && (
              <>
                <dt>Client</dt>
                <dd>{project.clientName}</dd>
              </>
            )}
            {project.budgetHours !== undefined && (
              <>
                <dt>Budget</dt>
                <dd>{project.budgetHours} h</dd>
              </>
            )}
            {(project.startDate || project.endDate) && (
              <>
                <dt>Dates</dt>
                <dd>
                  {project.startDate && project.endDate
                    ? formatRange(project.startDate, project.endDate)
                    : (project.startDate ?? `until ${project.endDate}`)}
                </dd>
              </>
            )}
          </dl>
          {isAdmin && (
            <div className="row">
              <Button
                variant="secondary"
                onClick={() => setEditing(true)}
                aria-label={`Edit project ${project.code}`}
              >
                Edit
              </Button>
              <Button
                variant="secondary"
                disabled={toggle.running}
                onClick={() => void toggle.run()}
                aria-label={`${project.isActive ? 'Archive' : 'Restore'} project ${project.code}`}
              >
                {project.isActive ? 'Archive' : 'Restore'}
              </Button>
            </div>
          )}
          {toggle.error && <Alert variant="error">{describeError(toggle.error)}</Alert>}
          {!project.isActive && isAdmin && (
            <p className="muted">
              Archived projects stay in reports but no new time can be logged.
            </p>
          )}
        </>
      )}

      <TaskList
        projectCode={project.code}
        tasks={project.tasks ?? []}
        {...(isAdmin && {
          onAdd: async (name: string) => {
            await createTask(project.id, name);
            onChanged();
          },
          onUpdate: async (taskId: string, patch: { name?: string; isActive?: boolean }) => {
            await updateTask(project.id, taskId, patch);
            onChanged();
          },
        })}
      />
    </section>
  );
}
