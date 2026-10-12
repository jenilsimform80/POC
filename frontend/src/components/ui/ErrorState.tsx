import { Button } from './Button';
import { describeError } from './describeError';
import styles from './States.module.css';

interface ErrorStateProps {
  error?: Error | undefined;
  title?: string;
  onRetry?: (() => void) | undefined;
}

export function ErrorState({ error, title = 'Something went wrong', onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className={`${styles.state} ${styles.error}`}>
      <strong>{title}</strong>
      <p>{describeError(error)}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
