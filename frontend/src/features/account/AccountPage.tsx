import { useState, type FormEvent } from 'react';
import { changePassword } from '../../api/auth';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/FormControls';
import { describeError } from '../../components/ui/describeError';
import { useCurrentUser } from '../../auth/useAuth';
import { useMutation } from '../../hooks/useMutation';
import { fieldErrorsFrom, MIN_PASSWORD_LENGTH } from '../../lib/forms';
import styles from '../projects/Projects.module.css';

export function AccountPage() {
  const user = useCurrentUser();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const save = useMutation(changePassword);
  const errors = { ...fieldErrorsFrom(save.error), ...clientErrors };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setDone(false);
    const found: Record<string, string> = {};
    if (current === '') found['currentPassword'] = 'Enter your current password';
    if (next.length < MIN_PASSWORD_LENGTH)
      found['newPassword'] = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
    else if (next !== confirm) found['confirm'] = 'The passwords do not match';
    setClientErrors(found);
    if (Object.keys(found).length > 0) return;

    const result = await save.run(current, next);
    if (result.ok) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    }
  };

  return (
    <>
      <h1>Account</h1>
      <dl className={styles.facts}>
        <dt>Name</dt>
        <dd>{user.name}</dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
      </dl>

      <section className={styles.card} aria-label="Change password">
        <h2>Change password</h2>
        <p className="muted">
          Changing your password signs you out everywhere else. This device stays signed in.
        </p>
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="stack">
          {done && <Alert variant="success">Your password was changed.</Alert>}
          {save.error && Object.keys(fieldErrorsFrom(save.error)).length === 0 && (
            <Alert variant="error">{describeError(save.error)}</Alert>
          )}
          <TextField
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={current}
            error={errors['currentPassword']}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={next}
            error={errors['newPassword']}
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            onChange={(e) => setNext(e.target.value)}
          />
          <TextField
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            error={errors['confirm']}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <div className="row">
            <Button type="submit" disabled={save.running}>
              {save.running ? 'Saving…' : 'Change password'}
            </Button>
          </div>
        </form>
      </section>
    </>
  );
}
