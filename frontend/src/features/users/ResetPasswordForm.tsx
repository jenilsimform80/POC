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

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // no look-alikes

/** 16 random characters from the browser's cryptographic generator (rejection-sampled: no bias). */
function generatePassword(length = 16): string {
  const limit = 256 - (256 % ALPHABET.length);
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      if (byte < limit && out.length < length) out += ALPHABET[byte % ALPHABET.length];
    }
  }
  return out;
}

export function ResetPasswordForm({ user, onSave, onCancel }: ResetPasswordFormProps) {
  const [password, setPassword] = useState('');
  const [clientError, setClientError] = useState<string | undefined>();
  const [generated, setGenerated] = useState(false);
  /** Shown once after saving a generated password: it cannot be read back later. */
  const [issued, setIssued] = useState<string | null>(null);
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
    if (!result.ok) return;
    if (generated) setIssued(password);
    else onCancel();
  };

  if (issued) {
    return (
      <div className="stack" role="group" aria-label={`Temporary password for ${user.email}`}>
        <Alert variant="success" title="Password set">
          Temporary password for {user.email}: <strong>{issued}</strong>
          <br />
          Share it securely. It is not shown again, and they must choose their own at sign-in.
        </Alert>
        <div className="row">
          <Button onClick={onCancel}>Done</Button>
        </div>
      </div>
    );
  }

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
        hint="Signs the user out everywhere. They must choose their own password at next sign-in."
        onChange={(e) => {
          setPassword(e.target.value);
          setGenerated(false);
        }}
      />
      <div className="row">
        <Button type="submit" disabled={save.running}>
          {save.running ? 'Saving…' : 'Set password'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setPassword(generatePassword());
            setGenerated(true);
            setClientError(undefined);
          }}
          disabled={save.running}
        >
          Generate
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={save.running}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
