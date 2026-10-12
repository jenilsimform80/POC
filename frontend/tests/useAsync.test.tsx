import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAsync } from '../src/hooks/useAsync';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useAsync', () => {
  it('goes loading → success', async () => {
    const load = vi.fn(() => Promise.resolve('data'));

    const { result } = renderHook(() => useAsync(load));

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'success', data: 'data' }));
  });

  it('goes loading → error and wraps non-Error rejections', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('boom')));
    // Deliberately not an Error: the hook must still produce an Error state.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const odd = vi.fn(() => Promise.reject('just a string'));

    const first = renderHook(() => useAsync(failing));
    const second = renderHook(() => useAsync(odd));

    await waitFor(() => expect(first.result.current.state.status).toBe('error'));
    await waitFor(() => expect(second.result.current.state.status).toBe('error'));
    expect(first.result.current.state).toMatchObject({ error: { message: 'boom' } });
    expect(second.result.current.state).toMatchObject({ error: expect.any(Error) as Error });
  });

  it('reload() keeps the previous data visible (refreshing) and then swaps in fresh data', async () => {
    let n = 0;
    const load = vi.fn(() => Promise.resolve(++n));
    const { result } = renderHook(() => useAsync(load));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'success', data: 1 }));

    act(() => result.current.reload());

    expect(result.current.state).toEqual({ status: 'success', data: 1 }); // no flash of a spinner
    expect(result.current.refreshing).toBe(true);
    await waitFor(() => expect(result.current.state).toEqual({ status: 'success', data: 2 }));
    expect(result.current.refreshing).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reload() after an error shows loading again (nothing to keep showing)', async () => {
    let fail = true;
    const load = vi.fn(() => (fail ? Promise.reject(new Error('boom')) : Promise.resolve('ok')));
    const { result } = renderHook(() => useAsync(load));
    await waitFor(() => expect(result.current.state.status).toBe('error'));

    fail = false;
    act(() => result.current.reload());

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'success', data: 'ok' }));
  });

  it('switching to a different loader shows loading, not the other loader’s data', async () => {
    const a = vi.fn(() => Promise.resolve('A'));
    const b = vi.fn(() => Promise.resolve('B'));
    const { result, rerender } = renderHook(({ loader }) => useAsync(loader), {
      initialProps: { loader: a },
    });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'success', data: 'A' }));

    rerender({ loader: b });

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'success', data: 'B' }));
  });

  it('aborts the request on unmount and never updates state afterwards', async () => {
    const pending = deferred<string>();
    let signal: AbortSignal | undefined;
    const load = vi.fn((s: AbortSignal) => {
      signal = s;
      return pending.promise;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { unmount } = renderHook(() => useAsync(load));
    unmount();
    pending.resolve('late');
    await Promise.resolve();

    expect(signal?.aborted).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled(); // no "state update on unmounted component"
  });

  it('ignores a slow response from a request that was superseded by reload()', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const calls = [first, second];
    const load = vi.fn(() => calls.shift()!.promise);
    const { result } = renderHook(() => useAsync(load));

    act(() => result.current.reload());
    second.resolve('fresh');
    await waitFor(() => expect(result.current.state).toEqual({ status: 'success', data: 'fresh' }));
    first.resolve('stale');
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state).toEqual({ status: 'success', data: 'fresh' });
  });
});
