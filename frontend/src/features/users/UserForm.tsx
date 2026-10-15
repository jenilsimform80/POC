import { useState, type FormEvent } from 'react';
import type { NewUserInput } from '../../api/users';
import type { User } from '../../api/types';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { SelectField, TextField } from '../../components/ui/FormControls';
import { describeError } from '../../components/ui/describeError';
import { useMutation } from '../../hooks/useMutation';
import { fieldErrorsFrom, MIN_PASSWORD_LENGTH } from '../../lib/forms';

interface UserFormProps {
  /** Active managers a contributor can report to. */
  managers: User[];
  /** Must reject on failure; the form shows why and stays open. */
  onSave: (value: NewUserInput) => Promise<unknown>;
  onCancel: () => void;
}

type Field = 'name' | 'email' | 'role' | 'password' | 'managerId';

export function UserForm({ managers, onSave, onCancel }: UserFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<NewUserInput['role']>('CONTRIBUTOR');
  const [password, setPassword] = useState('');
  const [managerId, setManagerId] = useState('');
  const [clientErrors, setClientErrors] = useState<Partial<Record<Field, string>>>({});
  const save = useMutation(onSave);

  const serverErrors = fieldErrorsFrom(save.error);
  const errors = { ...serverErrors, ...clientErrors } as Partial<Record<Field, string>>;

  const validate = () => {
    const found: Partial<Record<Field, string>> = {};
    if (name.trim() === '') found.name = 'Enter the full name';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) found.email = 'Enter a valid email address';
    if (password.length < MIN_PASSWORD_LENGTH)
      found.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
    if (role === 'CONTRIBUTOR' && managerId === '') found.managerId = 'Choose a manager';
    return found;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validate();
    setClientErrors(found);
    if (Object.keys(found).length > 0) return;

    const result = await save.run({
      name: name.trim(),
      email: email.trim(),
      role,
      password,
      ...(role === 'CONTRIBUTOR' && { managerId }),
    });
    if (result.ok) onCancel();
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate aria-label="New user" className="stack">
      {save.error && Object.keys(serverErrors).length === 0 && (
        <Alert variant="error">{describeError(save.error)}</Alert>
      )}
      <div className="row">
        <TextField
          label="Full name"
          value={name}
          error={errors.name}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="Email"
          type="email"
          value={email}
          error={errors.email}
          autoComplete="off"
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="row">
        <SelectField
          label="Role"
          value={role}
          error={errors.role}
          onChange={(e) => {
            setRole(e.target.value as NewUserInput['role']);
            setManagerId('');
          }}
        >
          <option value="CONTRIBUTOR">Contributor</option>
          <option value="MANAGER">Manager</option>
        </SelectField>
        {role === 'CONTRIBUTOR' && (
          <SelectField
            label="Manager"
            value={managerId}
            error={errors.managerId}
            onChange={(e) => setManagerId(e.target.value)}
          >
            <option value="">Select a manager…</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.email})
              </option>
            ))}
          </SelectField>
        )}
        <TextField
          label="Initial password"
          type="password"
          value={password}
          error={errors.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. Share it with the user securely.`}
          autoComplete="new-password"
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="row">
        <Button type="submit" disabled={save.running}>
          {save.running ? 'Creating…' : 'Create user'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={save.running}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
