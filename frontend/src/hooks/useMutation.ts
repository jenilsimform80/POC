import { useCallback, useState } from 'react';

export type MutationResult<R> = { ok: true; data: R } | { ok: false; error: Error };

export interface MutationState {
  running: boolean;
  error: Error | undefined;
}

/**
 * Wraps a write call (POST/PATCH/DELETE). `run()` never throws: it resolves to
 * `{ ok, data | error }`, so event handlers stay free of try/catch, while `running` / `error`
 * drive the UI (disabled buttons, inline error).
 */
export function useMutation<A extends unknown[], R>(action: (...args: A) => Promise<R>) {
  const [state, setState] = useState<MutationState>({ running: false, error: undefined });

  const run = useCallback(
    async (...args: A): Promise<MutationResult<R>> => {
      setState({ running: true, error: undefined });
      try {
        const data = await action(...args);
        setState({ running: false, error: undefined });
        return { ok: true, data };
      } catch (caught) {
        const error = caught instanceof Error ? caught : new Error('Unknown error');
        setState({ running: false, error });
        return { ok: false, error };
      }
    },
    [action],
  );

  const reset = useCallback(() => setState({ running: false, error: undefined }), []);

  return { ...state, run, reset };
}
