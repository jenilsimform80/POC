import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './ActionMenu.module.css';

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Visual hint for destructive-looking actions. */
  tone?: 'danger';
}

interface ActionMenuProps {
  /** Accessible name of the trigger, e.g. "Actions for dev@example.com". */
  label: string;
  items: ActionMenuItem[];
  disabled?: boolean;
}

const GAP = 4;

/**
 * Three-dot "more actions" menu.
 *
 * The menu is rendered in a portal with fixed positioning: table wrappers use `overflow`, which
 * would clip an ordinary absolutely positioned dropdown (worst on the last rows). It opens below
 * the button, right-aligned, and flips above when there is no room. Closes on outside click,
 * Escape (focus returns to the button), Tab, scroll and resize. Arrow keys, Home and End move
 * between items.
 */
export function ActionMenu({ label, items, disabled = false }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setPosition(null);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Place the menu once it is in the DOM and can be measured.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const anchor = triggerRef.current.getBoundingClientRect();
    const { width, height } = menuRef.current.getBoundingClientRect();
    const below = anchor.bottom + GAP;
    const top =
      below + height > window.innerHeight ? Math.max(GAP, anchor.top - height - GAP) : below;
    const left = Math.max(GAP, Math.min(anchor.right - width, window.innerWidth - width - GAP));
    setPosition({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    const dismiss = () => close(false);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true); // capture: also inner scroll containers
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open, close]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabled = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );
    const index = enabled.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => enabled[(i + enabled.length) % enabled.length]?.focus();

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      case 'ArrowDown':
        event.preventDefault();
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusAt(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusAt(enabled.length - 1);
        break;
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            className={styles.menu}
            data-ready={position !== null}
            style={position ?? { top: 0, left: 0 }}
            onKeyDown={onMenuKeyDown}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={[styles.item, item.tone === 'danger' && styles.danger]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  close(true);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
