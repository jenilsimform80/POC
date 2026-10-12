import {
  useId,
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
