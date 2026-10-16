import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import styles from './FormControls.module.css';

interface FieldShellProps {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  inputId: string;
  children: ReactNode;
}

function FieldShell({ label, error, hint, inputId, children }: FieldShellProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={inputId}>{label}</label>
      {children}
      {hint && !error && (
        <span id={`${inputId}-hint`} className={styles.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={`${inputId}-error`} role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

type CommonProps = { label: string; error?: string | undefined; hint?: string | undefined };

export function TextField({
  label,
  error,
  hint,
  ...input
}: CommonProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <FieldShell label={label} error={error} hint={hint} inputId={id}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...input}
      />
    </FieldShell>
  );
}

const EyeIcon = ({ crossed }: { crossed: boolean }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {crossed && <path d="M4 4l16 16" />}
  </svg>
);

/**
 * Password input with a show/hide button. Starts hidden. The button is a real, keyboard-focusable
 * button named after the field ("Show new password" / "Hide new password", so several fields on one
 * page stay distinguishable); the name itself carries the state, and it never submits the form.
 */
export function PasswordField({
  label,
  error,
  hint,
  ...input
}: CommonProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell label={label} error={error} hint={hint} inputId={id}>
      <div className={styles.passwordWrap}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          {...input}
        />
        <button
          type="button"
          className={styles.reveal}
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          onClick={() => setVisible((v) => !v)}
        >
          <EyeIcon crossed={visible} />
        </button>
      </div>
    </FieldShell>
  );
}

export function SelectField({
  label,
  error,
  hint,
  children,
  ...select
}: CommonProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <FieldShell label={label} error={error} hint={hint} inputId={id}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...select}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  ...area
}: CommonProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldShell label={label} error={error} hint={hint} inputId={id}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...area}
      />
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  error,
  ...input
}: Omit<CommonProps, 'hint'> & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const id = useId();
  return (
    <div className={styles.checkbox}>
      <input id={id} type="checkbox" aria-invalid={error ? true : undefined} {...input} />
      <label htmlFor={id}>{label}</label>
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}
