import { useState, type FormEvent } from 'react';
import type { User } from '../../api/types';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { PasswordField } from '../../components/ui/FormControls';
import { describeError } from '../../components/ui/describeError';
import { useMutation } from '../../hooks/useMutation';
import { fieldErrorsFrom, MIN_PASSWORD_LENGTH } from '../../lib/forms';

interface ResetPasswordFormProps {
  user: User;
  onSave: (password: string) => Promise<unknown>;
  onCancel: () => void;
}

export function ResetPasswordForm({ user, onSave, onCancel }: ResetPasswordFormProps) {
  const [password, setPassword] = useState('');
  const [clientError, setClientError] = useState<string | undefined>();
  const save = useMutation(onSave);
  const serverErrors = fieldErrorsFrom(save.error);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setClientError(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    setClientError(undefined);
    const result = await save.run(password);
    if (result.ok) onCancel();
  };

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      noValidate
      aria-label={`Reset password for ${user.email}`}
      className="stack"
    >
      {save.error && Object.keys(serverErrors).length === 0 && (
        <Alert variant="error">{describeError(save.error)}</Alert>
      )}
      <PasswordField
        label="New password"
        autoComplete="new-password"
        value={password}
        error={clientError ?? serverErrors['password']}
        hint="Signs the user out everywhere. Share the new password securely."
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="row">
        <Button type="submit" disabled={save.running}>
          {save.running ? 'Saving…' : 'Set password'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={save.running}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
