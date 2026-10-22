import { useState, type FormEvent } from 'react';
import type { Task, User } from '../../api/types';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/FormControls';
import { describeError } from '../../components/ui/describeError';
import { useMutation } from '../../hooks/useMutation';
import { PersonChecklist } from './PersonChecklist';
import styles from './Projects.module.css';

interface TaskListProps {
  projectCode: string;
  tasks: Task[];
  /** People a task can be assigned to (empty = everyone may log to it). */
  people?: User[];
  /** Add controls are shown only when this is provided (admins and managers). */
  onAdd?: (name: string, assigneeIds: string[]) => Promise<unknown>;
  /** Per-task edit controls additionally require `task.canManage`. */
  onUpdate?: (
    taskId: string,
    patch: { name?: string; isActive?: boolean; assigneeIds?: string[] },
  ) => Promise<unknown>;
}

export function TaskList({ projectCode, tasks, people = [], onAdd, onUpdate }: TaskListProps) {
  const [newName, setNewName] = useState('');
  const [newAssignees, setNewAssignees] = useState<string[]>([]);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignDraft, setAssignDraft] = useState<string[]>([]);
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const add = useMutation(async (name: string, assigneeIds: string[]) => {
    await onAdd?.(name, assigneeIds);
    setNewName('');
    setNewAssignees([]);
  });
  const change = useMutation(
    async (
      taskId: string,
      patch: { name?: string; isActive?: boolean; assigneeIds?: string[] },
    ) => {
      await onUpdate?.(taskId, patch);
      setEditingId(null);
      setAssigningId(null);
    },
  );

  const onAddSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (newName.trim() === '') return;
    await add.run(newName.trim(), newAssignees);
  };

  return (
    <div>
      <h4 className={styles.taskHeading}>Tasks</h4>
      {tasks.length === 0 && <p className="muted">No tasks yet.</p>}
      <ul className={styles.tasks}>
        {tasks.map((task) => (
          <li key={task.id} className={styles.task}>
            {editingId === task.id ? (
              <form
                className="row"
                aria-label={`Rename task ${task.name}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editName.trim() !== '') void change.run(task.id, { name: editName.trim() });
                }}
              >
                <TextField
                  label="Task name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <Button type="submit" disabled={change.running}>
                  Save
                </Button>
                <Button variant="secondary" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <>
                <div className={styles.taskInfo}>
                  <span className={styles.taskName}>
                    {task.name} {!task.isActive && <Badge tone="neutral">Archived</Badge>}{' '}
                    {!task.canLog && <Badge tone="neutral">Assigned to others</Badge>}
                  </span>
                  {task.assigneeIds && task.assigneeIds.length > 0 && (
                    <span className={styles.assignees}>
                      Assigned to:{' '}
                      {task.assigneeIds.map((id) => nameOf.get(id) ?? 'another user').join(', ')}
                    </span>
                  )}
                </div>
                {onUpdate && task.canManage && (
                  <span className={styles.taskActions}>
                    <Button
                      variant="secondary"
                      className={styles.small}
                      aria-label={`Rename task ${task.name} in ${projectCode}`}
                      onClick={() => {
                        setEditingId(task.id);
                        setEditName(task.name);
                      }}
                    >
                      Rename
                    </Button>
                    <Button
                      variant="secondary"
                      className={styles.small}
                      aria-label={`Assign task ${task.name} in ${projectCode}`}
                      onClick={() => {
                        setAssigningId(assigningId === task.id ? null : task.id);
                        setAssignDraft(task.assigneeIds ?? []);
                      }}
                    >
                      Assign
                    </Button>
                    <Button
                      variant="secondary"
                      className={styles.small}
                      aria-label={`${task.isActive ? 'Archive' : 'Restore'} task ${task.name} in ${projectCode}`}
                      disabled={change.running}
                      onClick={() => void change.run(task.id, { isActive: !task.isActive })}
                    >
                      {task.isActive ? 'Archive' : 'Restore'}
                    </Button>
                  </span>
                )}
              </>
            )}
            {assigningId === task.id && (
              <div className={`stack ${styles.assignPanel}`}>
                <PersonChecklist
                  legend={`Who can log time to ${task.name}? (nobody selected = everyone)`}
                  people={people}
                  selected={assignDraft}
                  onChange={setAssignDraft}
                />
                <div className="row">
                  <Button
                    disabled={change.running}
                    onClick={() => void change.run(task.id, { assigneeIds: assignDraft })}
                  >
                    Save assignees
                  </Button>
                  <Button variant="secondary" onClick={() => setAssigningId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {change.error && <Alert variant="error">{describeError(change.error)}</Alert>}

      {onAdd && (
        <form
          className={styles.addTask}
          aria-label={`Add task to ${projectCode}`}
          onSubmit={(e) => void onAddSubmit(e)}
        >
          <TextField
            label="New task"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          {people.length > 0 && (
            <details className={styles.assignDetails}>
              <summary>
                Assign to people ({newAssignees.length === 0 ? 'everyone' : newAssignees.length})
              </summary>
              <PersonChecklist
                legend="Who can log time to this task? (nobody selected = everyone)"
                people={people}
                selected={newAssignees}
                onChange={setNewAssignees}
              />
            </details>
          )}
          <Button type="submit" disabled={add.running || newName.trim() === ''}>
            Add task
          </Button>
        </form>
      )}
      {add.error && <Alert variant="error">{describeError(add.error)}</Alert>}
    </div>
  );
}
