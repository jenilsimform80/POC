import type { ReactNode } from 'react';
import styles from './Alert.module.css';

type Variant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  variant?: Variant;
  title?: string;
  children: ReactNode;
}

/** Errors are announced assertively (role=alert); everything else politely (role=status). */
export function Alert({ variant = 'info', title, children }: AlertProps) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`${styles.alert} ${styles[variant]}`}
    >
      {title && <strong>{title}</strong>}
      <div>{children}</div>
    </div>
  );
}
