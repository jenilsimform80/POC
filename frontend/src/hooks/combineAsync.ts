import type { AsyncState } from './useAsync';

type Combined<T extends Record<string, AsyncState<unknown>>> = AsyncState<{
  [K in keyof T]: T[K] extends AsyncState<infer D> ? D : never;
}>;

/**
 * Merges several loads into one state for a single `AsyncView`: an error if any failed (the first
 * one), loading while any is pending, otherwise success with every result keyed by name.
 */
export function combineAsync<T extends Record<string, AsyncState<unknown>>>(
  states: T,
): Combined<T> {
  const entries = Object.entries(states);
  for (const [, state] of entries) {
    if (state.status === 'error') return { status: 'error', error: state.error };
  }
  if (entries.some(([, state]) => state.status === 'loading')) return { status: 'loading' };
  const data = Object.fromEntries(
    entries.map(([key, state]) => [key, state.status === 'success' ? state.data : undefined]),
  );
  return { status: 'success', data } as Combined<T>;
}
