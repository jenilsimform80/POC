import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/errors';
import { AsyncView } from '../src/components/ui/AsyncView';
import { Button } from '../src/components/ui/Button';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { LoadingState } from '../src/components/ui/LoadingState';
import type { AsyncState } from '../src/hooks/useAsync';

describe('LoadingState', () => {
  it('is an accessible status with a default and a custom label', () => {
    const { rerender } = render(<LoadingState />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');

    rerender(<LoadingState label="Checking the API…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking the API…');
  });
});

describe('ErrorState', () => {
  it('shows the backend message for an ApiError and announces it as an alert', () => {
    render(<ErrorState error={new ApiError(409, 'PERIOD_LOCKED', 'Period 2026-03 is locked')} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Period 2026-03 is locked');
  });

  it('never shows the text of an unexpected error', () => {
    render(
      <ErrorState
        error={new TypeError("Cannot read properties of undefined (reading 'secret')")}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('secret');
  });

  it('offers a retry button only when a handler is given', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorState />);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();

    rerender(<ErrorState onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('EmptyState', () => {
  it('renders title, description and action', () => {
    render(
      <EmptyState
        title="No entries"
        description="Log your first hours."
        action={<a href="/x">Add</a>}
      />,
    );

    expect(screen.getByText('No entries')).toBeInTheDocument();
    expect(screen.getByText('Log your first hours.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add' })).toBeInTheDocument();
  });
});

describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('does not fire when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('AsyncView (loading / error / empty / success)', () => {
  const view = (
    state: AsyncState<string[]>,
    extra: Partial<Parameters<typeof AsyncView<string[]>>[0]> = {},
  ) =>
    render(
      <AsyncView
        state={state}
        isEmpty={(items) => items.length === 0}
        empty={<EmptyState title="No items" />}
        {...extra}
      >
        {(items) => (
          <ul>
            {items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
      </AsyncView>,
    );

  it('shows loading', () => {
    view({ status: 'loading' }, { loadingLabel: 'Loading items…' });

    expect(screen.getByRole('status')).toHaveTextContent('Loading items…');
  });

  it('shows the error with retry', async () => {
    const onRetry = vi.fn();
    view(
      {
        status: 'error',
        error: new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred'),
      },
      { onRetry, errorTitle: 'Could not load items' },
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load items');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows the empty state for empty data', () => {
    view({ status: 'success', data: [] });

    expect(screen.getByText('No items')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows the content for data', () => {
    view({ status: 'success', data: ['a', 'b'] });

    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['a', 'b']);
  });

  it('falls back to a generic empty state when none is supplied', () => {
    render(
      <AsyncView
        state={{ status: 'success', data: [] as string[] }}
        isEmpty={(d) => d.length === 0}
      >
        {() => <p>content</p>}
      </AsyncView>,
    );

    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });
});
