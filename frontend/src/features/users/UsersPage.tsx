import { useCallback, useState } from 'react';
import type { User } from '../../api/types';
import { createUser, listUsers, type NewUserInput } from '../../api/users';
import { AsyncView } from '../../components/ui/AsyncView';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAsync } from '../../hooks/useAsync';
import styles from '../projects/Projects.module.css';
import { UserForm } from './UserForm';

const ROLE_LABEL = { CONTRIBUTOR: 'Contributor', MANAGER: 'Manager', ADMIN: 'Admin' } as const;

export function UsersPage() {
  const [creating, setCreating] = useState(false);
  const load = useCallback((signal: AbortSignal) => listUsers(signal), []);
  const { state, reload } = useAsync(load);

  const create = async (value: NewUserInput) => {
    await createUser(value);
    reload();
  };

  return (
    <>
      <h1>Users</h1>
      <p className="muted">
        Create contributor and manager accounts. A contributor reports to one manager, who approves
        their timesheets. Only admins can do this; the backend enforces it.
      </p>

      {!creating && <Button onClick={() => setCreating(true)}>New user</Button>}

      {creating && (
        <section className={styles.card} aria-label="Create user">
          <h2>New user</h2>
          <UserForm
            managers={managersFrom(state.status === 'success' ? state.data : [])}
            onSave={create}
            onCancel={() => setCreating(false)}
          />
        </section>
      )}

      <AsyncView
        state={state}
        onRetry={reload}
        loadingLabel="Loading users…"
        errorTitle="Could not load users"
        isEmpty={(list) => list.length === 0}
        empty={<EmptyState title="No users yet" />}
      >
        {(list) => {
          const nameOf = new Map(list.map((u) => [u.id, u.name]));
          return (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Manager</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((u) => (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td>{u.email}</td>
                      <td>{ROLE_LABEL[u.role]}</td>
                      <td>{u.managerId ? (nameOf.get(u.managerId) ?? '—') : '—'}</td>
                      <td>
                        {u.isActive === false ? (
                          <Badge tone="neutral">Inactive</Badge>
                        ) : (
                          <Badge tone="success">Active</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </AsyncView>
    </>
  );
}

const managersFrom = (list: User[]) =>
  list.filter((u) => u.role === 'MANAGER' && u.isActive !== false);
