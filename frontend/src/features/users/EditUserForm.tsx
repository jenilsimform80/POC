import { useState, type FormEvent } from 'react';
import type { User } from '../../api/types';
import type { UserPatch } from '../../api/users';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { SelectField, TextField } from '../../components/ui/FormControls';
import { describeError } from '../../components/ui/describeError';
import { useMutation } from '../../hooks/useMutation';
import { fieldErrorsFrom } from '../../lib/forms';

interface EditUserFormProps {
  user: User;
  /** Active managers a contributor can report to (never the user themself). */
  managers: User[];
  /** Must reject on failure; the form shows why and stays open. */
  onSave: (patch: UserPatch) => Promise<unknown>;
  onCancel: () => void;
}

export function EditUserForm({ user, managers, onSave, onCancel }: EditUserFormProps) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<'CONTRIBUTOR' | 'MANAGER'>(
    user.role === 'MANAGER' ? 'MANAGER' : 'CONTRIBUTOR',
  );
  const [managerId, setManagerId] = useState(user.managerId ?? '');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const save = useMutation(onSave);
  const serverErrors = fieldErrorsFrom(save.error);
  const errors = { ...serverErrors, ...clientErrors };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (name.trim() === '') found['name'] = 'Enter the full name';
    if (role === 'CONTRIBUTOR' && managerId === '') found['managerId'] = 'Choose a manager';
    setClientErrors(found);
    if (Object.keys(found).length > 0) return;

    // Only what changed.
    const patch: UserPatch = {};
    if (name.trim() !== user.name) patch.name = name.trim();
    if (role !== user.role) patch.role = role;
    if (role === 'CONTRIBUTOR' && managerId !== (user.managerId ?? '')) patch.managerId = managerId;
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    const result = await save.run(patch);
    if (result.ok) onCancel();
  };

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      noValidate
      aria-label={`Edit ${user.email}`}
      className="stack"
    >
      {save.error && Object.keys(serverErrors).length === 0 && (
        <Alert variant="error">{describeError(save.error)}</Alert>
      )}
      <div className="row">
        <TextField
          label="Full name"
          value={name}
          error={errors['name']}
          onChange={(e) => setName(e.target.value)}
        />
        <SelectField
          label="Role"
          value={role}
          error={errors['role']}
          onChange={(e) => setRole(e.target.value as 'CONTRIBUTOR' | 'MANAGER')}
        >
          <option value="CONTRIBUTOR">Contributor</option>
          <option value="MANAGER">Manager</option>
        </SelectField>
        {role === 'CONTRIBUTOR' && (
          <SelectField
            label="Manager"
            value={managerId}
            error={errors['managerId']}
            onChange={(e) => setManagerId(e.target.value)}
          >
            <option value="">Select a manager…</option>
            {managers
              .filter((m) => m.id !== user.id)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </option>
              ))}
          </SelectField>
        )}
      </div>
      <p className="muted">Email addresses cannot be changed.</p>
      <div className="row">
        <Button type="submit" disabled={save.running}>
          {save.running ? 'Saving…' : 'Save changes'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={save.running}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
