import { useCallback, useEffect, useState } from 'react';
import { deferStart } from '../lib/defer-start';

export type AsyncState<T> =
  { status: 'loading' } | { status: 'success'; data: T } | { status: 'error'; error: Error };

type Outcome<T> = { status: 'success'; data: T } | { status: 'error'; error: Error };

interface Settled<T> {
  source: (signal: AbortSignal) => Promise<T>;
  attempt: number;
  outcome: Outcome<T>;
}

/**
 * Runs an async loader and exposes loading / success / error, with `reload()`.
 *
 * - `load` MUST be referentially stable (a module-level function or `useCallback`); a new
 *   function starts a new request.
 * - The request is aborted on unmount, on reload and when `load` changes; a late response from an
 *   aborted request can never overwrite newer state.
 * - "Loading" is derived (no result yet for this loader/attempt) rather than set inside the
 *   effect, which avoids a cascading synchronous re-render.
 * - `reload()` after a success keeps showing the previous data (`refreshing` = true) instead of
 *   flashing a spinner and unmounting the view (open forms keep their state); a reload after an
 *   error, or a different `load`, shows loading.
 */
export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const cancelStart = deferStart(() => {
      load(controller.signal).then(
        (data) => {
          if (!controller.signal.aborted) {
            setSettled({ source: load, attempt, outcome: { status: 'success', data } });
          }
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          const err = error instanceof Error ? error : new Error('Unknown error');
          setSettled({ source: load, attempt, outcome: { status: 'error', error: err } });
        },
      );
    });
    return () => {
      cancelStart();
      controller.abort();
    };
  }, [load, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const sameSource = settled !== null && settled.source === load;
  const fresh = sameSource && settled.attempt === attempt;
  const stale = sameSource && !fresh && settled.outcome.status === 'success';

  const state: AsyncState<T> = fresh || stale ? settled.outcome : { status: 'loading' };

  return { state, reload, refreshing: stale };
}
