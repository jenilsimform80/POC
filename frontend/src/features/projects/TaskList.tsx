import { useState, type FormEvent } from 'react';
import type { Task } from '../../api/types';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/FormControls';
import { describeError } from '../../components/ui/describeError';
import { useMutation } from '../../hooks/useMutation';
import styles from './Projects.module.css';

interface TaskListProps {
  projectCode: string;
  tasks: Task[];
  /** Admin controls are shown only when these are provided. */
  onAdd?: (name: string) => Promise<unknown>;
  onUpdate?: (taskId: string, patch: { name?: string; isActive?: boolean }) => Promise<unknown>;
}

export function TaskList({ projectCode, tasks, onAdd, onUpdate }: TaskListProps) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const add = useMutation(async (name: string) => {
    await onAdd?.(name);
    setNewName('');
  });
  const change = useMutation(
    async (taskId: string, patch: { name?: string; isActive?: boolean }) => {
      await onUpdate?.(taskId, patch);
      setEditingId(null);
    },
  );

  const onAddSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (newName.trim() === '') return;
    await add.run(newName.trim());
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
                <span>
                  {task.name} {!task.isActive && <Badge tone="neutral">Archived</Badge>}
                </span>
                {onUpdate && (
                  <span className={styles.taskActions}>
                    <Button
                      variant="secondary"
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
          </li>
        ))}
      </ul>
      {change.error && <Alert variant="error">{describeError(change.error)}</Alert>}

      {onAdd && (
        <form
          className="row"
          aria-label={`Add task to ${projectCode}`}
          onSubmit={(e) => void onAddSubmit(e)}
        >
          <TextField
            label="New task"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button type="submit" disabled={add.running || newName.trim() === ''}>
            Add task
          </Button>
        </form>
      )}
      {add.error && <Alert variant="error">{describeError(add.error)}</Alert>}
    </div>
  );
}
