import type { ReactNode } from 'react';
import type { AsyncState } from '../../hooks/useAsync';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';

interface AsyncViewProps<T> {
  state: AsyncState<T>;
  onRetry?: () => void;
  loadingLabel?: string;
  errorTitle?: string;
  /** When provided and true for the loaded data, `empty` is shown instead of `children`. */
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}

/** The four standard states of any data-backed view: loading, error, empty, success. */
export function AsyncView<T>({
  state,
  onRetry,
  loadingLabel,
  errorTitle,
  isEmpty,
  empty,
  children,
}: AsyncViewProps<T>) {
  if (state.status === 'loading')
    return <LoadingState {...(loadingLabel && { label: loadingLabel })} />;
  if (state.status === 'error') {
    return (
      <ErrorState
        error={state.error}
        onRetry={onRetry}
        {...(errorTitle && { title: errorTitle })}
      />
    );
  }
  if (isEmpty?.(state.data)) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  return <>{children(state.data)}</>;
}
