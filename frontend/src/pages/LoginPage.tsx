import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/FormControls';
import { describeError } from '../components/ui/describeError';
import { useAuth } from '../auth/useAuth';
import { useMutation } from '../hooks/useMutation';
import { fieldErrorsFrom } from '../lib/forms';
import { safeReturnPath } from '../lib/navigation';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const { state, login } = useAuth();
  const location = useLocation();
  const from = safeReturnPath((location.state as { from?: unknown } | null)?.from);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const signIn = useMutation(login);

  if (state.status === 'authenticated') return <Navigate to={from} replace />;

  const missing = { email: email.trim() === '', password: password === '' };
  const serverFields = fieldErrorsFrom(signIn.error);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (missing.email || missing.password) return;
    await signIn.run(email.trim(), password);
  };

  return (
    <section className={styles.wrapper} aria-labelledby="login-heading">
      <h1 id="login-heading">Sign in</h1>
      <form onSubmit={(e) => void onSubmit(e)} noValidate className={styles.form}>
        {signIn.error && Object.keys(serverFields).length === 0 && (
          <Alert variant="error">{describeError(signIn.error)}</Alert>
        )}
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={
            (touched && missing.email ? 'Enter your email' : undefined) ?? serverFields['email']
          }
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={
            (touched && missing.password ? 'Enter your password' : undefined) ??
            serverFields['password']
          }
        />
        <Button type="submit" disabled={signIn.running}>
          {signIn.running ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </section>
  );
}
