import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMutation } from '../src/hooks/useMutation';

describe('useMutation', () => {
  it('reports running, then resolves { ok, data } and never throws', async () => {
    let resolve!: (v: string) => void;
    const action = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const { result } = renderHook(() => useMutation(action));

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.run();
    });
    expect(result.current.running).toBe(true);

    await act(async () => {
      resolve('done');
      await pending;
    });

    expect(result.current.running).toBe(false);
    expect(result.current.error).toBeUndefined();
    await expect(pending).resolves.toEqual({ ok: true, data: 'done' });
  });

  it('captures failures as { ok: false, error } and exposes the error until reset', async () => {
    const action = vi.fn(() => Promise.reject(new Error('nope')));
    const { result } = renderHook(() => useMutation(action));

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.run();
    });

    expect(outcome).toMatchObject({ ok: false, error: { message: 'nope' } });
    expect(result.current.error?.message).toBe('nope');

    act(() => result.current.reset());
    expect(result.current.error).toBeUndefined();
  });

  it('passes arguments through and clears a previous error on the next run', async () => {
    const action = vi.fn((n: number) =>
      n > 0 ? Promise.resolve(n * 2) : Promise.reject(new Error('bad')),
    );
    const { result } = renderHook(() => useMutation(action));

    await act(async () => {
      await result.current.run(0);
    });
    expect(result.current.error).toBeDefined();

    await act(async () => {
      await result.current.run(4);
    });
    expect(action).toHaveBeenLastCalledWith(4);
    expect(result.current.error).toBeUndefined();
  });
});
