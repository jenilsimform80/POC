import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActionMenu } from '../src/components/ui/ActionMenu';

function setup(extra: Partial<Parameters<typeof ActionMenu>[0]> = {}) {
  const onEdit = vi.fn();
  const onRemove = vi.fn();
  render(
    <div>
      <div style={{ overflow: 'hidden' }} data-testid="clipping-wrapper">
        <ActionMenu
          label="Actions for Sam"
          items={[
            { label: 'Edit', onSelect: onEdit },
            { label: 'Archive', onSelect: vi.fn(), disabled: true },
            { label: 'Remove', onSelect: onRemove, tone: 'danger' },
          ]}
          {...extra}
        />
      </div>
      <button>Elsewhere</button>
    </div>,
  );
  return { onEdit, onRemove, user: userEvent.setup() };
}
const trigger = () => screen.getByRole('button', { name: 'Actions for Sam' });

describe('ActionMenu', () => {
  it('starts closed and describes itself to assistive technology', () => {
    setup();

    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens on click, outside any clipping container, and focuses the first enabled item', async () => {
    const { user } = setup();

    await user.click(trigger());

    const menu = screen.getByRole('menu', { name: 'Actions for Sam' });
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      'Edit',
      'Archive',
      'Remove',
    ]);
    // Rendered in a portal on <body>, so a parent with overflow:hidden cannot clip it.
    expect(screen.getByTestId('clipping-wrapper')).not.toContainElement(menu);
    expect(menu.parentElement).toBe(document.body);
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
  });

  it('runs the chosen action once, closes, and returns focus to the button', async () => {
    const { user, onEdit } = setup();

    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('does not run a disabled item', async () => {
    const { user } = setup();

    await user.click(trigger());

    expect(screen.getByRole('menuitem', { name: 'Archive' })).toBeDisabled();
  });

  it('closes on Escape and returns focus to the button', async () => {
    const { user, onEdit } = setup();

    await user.click(trigger());
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('closes when clicking elsewhere, and toggles closed on a second click of the button', async () => {
    const { user } = setup();

    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(trigger());
    await user.click(trigger());
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('moves between enabled items with the arrow keys, Home and End (wrapping, skipping disabled)', async () => {
    const { user } = setup();

    await user.click(trigger());
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toHaveFocus(); // Archive is disabled
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus(); // wraps
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toHaveFocus();
  });

  it('can be disabled as a whole', async () => {
    const { user } = setup({ disabled: true });

    await user.click(trigger());

    expect(trigger()).toBeDisabled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
