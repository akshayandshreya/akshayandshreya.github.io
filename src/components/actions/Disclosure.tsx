// A small disclosure (spec 2.3.4, 6.1): a button with aria-expanded that shows a panel of actions. Esc and a click
// outside close it; Esc and choosing an item return focus to the button. The panel opens downward when it fits inside
// both the viewport and its own section (a later section would paint over it), else upward.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useIsomorphicLayoutEffect } from '../../lib/dom';
import styles from './actions.module.css';

export interface DisclosureApi {
  /** close the panel; `focusButton` returns focus to the trigger (keyboard users keep their place) */
  close: (focusButton?: boolean) => void;
}

export function Disclosure({
  label,
  icon,
  className = '',
  children,
}: {
  label: ReactNode;
  icon?: ReactNode;
  className?: string;
  children: (api: DisclosureApi) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback((focusButton = false) => {
    setOpen(false);
    if (focusButton) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(true);
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close(false);
    };
    const onFocus = (e: FocusEvent) => {
      if (root.current && e.target instanceof Node && !root.current.contains(e.target)) close(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('focusin', onFocus);
    };
  }, [open, close]);

  // measured once per opening, before paint (no flicker): down if it fits, else up when there is more room above
  useIsomorphicLayoutEffect(() => {
    if (!open || !button.current || !panel.current) return;
    const b = button.current.getBoundingClientRect();
    const h = panel.current.offsetHeight + 12;
    const section = button.current.closest('section');
    const floor = Math.min(window.innerHeight || 800, section ? section.getBoundingClientRect().bottom : Infinity);
    const ceiling = Math.max(64, section ? section.getBoundingClientRect().top : 0); // below the top bar
    const below = floor - b.bottom;
    const above = b.top - ceiling;
    setUp(below < h && above > below);
  }, [open]);

  const toggle = () => setOpen((o) => !o);

  return (
    <div ref={root} className={`${styles.disclosure} ${className}`} data-open={open || undefined}>
      <button
        ref={button}
        type="button"
        className={`btn-gilt ${styles.trigger}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        {icon}
        <span>{label}</span>
        <svg className={styles.caret} viewBox="0 0 12 8" aria-hidden="true" focusable="false">
          <path d="M1.5 2 C 3.5 4, 4.6 5.2, 6 6 C 7.4 5.2, 8.5 4, 10.5 2" />
        </svg>
      </button>
      <div ref={panel} id={panelId} className={styles.panel} data-dir={up ? 'up' : 'down'} hidden={!open}>
        {children({ close })}
      </div>
    </div>
  );
}
