// The section nav (spec 2.3.8): a full-height paper sheet (from the right on wide screens, from the bottom on phones),
// focus trapped, Esc closes, focus returns to the menu button. Links in page order; events indented with their dates.
import { useEffect, useRef, type RefObject } from 'react';
import { useI18n } from '../../i18n/context';
import { usePage } from '../../state/page';
import type { SectionId } from '../../lib/sections';
import type { EventKey, UiKey } from '../../i18n/types';
import { EVENT_PALETTE } from '../../lib/palettes';
import { Monogram } from '../text/Monogram';
import styles from './SectionNav.module.css';

const NAV_KEYS: Partial<Record<SectionId, UiKey>> = {
  invitation: 'nav.invitation',
  countdown: 'nav.countdown',
  cultures: 'nav.cultures',
  venues: 'nav.venues',
  rsvp: 'rsvp.cta',
  gallery: 'gallery.title',
};

export function SectionNav({
  open,
  onClose,
  returnFocus,
}: {
  open: boolean;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement>;
}) {
  const { copy, t } = useI18n();
  const { visible } = usePage();
  const sheet = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      sheet.current?.querySelector<HTMLElement>('a, button')?.focus();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        } else if (e.key === 'Tab' && sheet.current) {
          const items = Array.from(sheet.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
          const first = items[0];
          const last = items[items.length - 1];
          if (!first || !last) return;
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };
      document.addEventListener('keydown', onKey);
      document.documentElement.classList.add('sheet-open');
      return () => {
        document.removeEventListener('keydown', onKey);
        document.documentElement.classList.remove('sheet-open');
      };
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      returnFocus.current?.focus();
    }
  }, [open, onClose, returnFocus]);

  const items: { id: string; label: string; sub?: { id: EventKey; label: string; date: string }[] }[] = [];
  for (const id of visible) {
    if (id === 'celebrations') {
      items.push({
        id,
        label: copy.eventsHeading,
        sub: copy.events.map((e) => ({ id: e.key, label: e.title, date: e.date })),
      });
    } else {
      const key = NAV_KEYS[id];
      if (key) items.push({ id, label: t(key) });
    }
  }

  return (
    <div className={styles.root} data-open={open || undefined} hidden={!open}>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <div
        ref={sheet}
        id="section-nav"
        className={`${styles.sheet} pal-ivory`}
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.menu')}
      >
        <button type="button" className={styles.close} onClick={onClose} aria-label={t('nav.close')}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 6 L18 18 M18 6 L6 18" />
          </svg>
        </button>
        <div className={styles.head} aria-hidden="true">
          <Monogram value={copy.monogram} size="s" />
          <span className={styles.headRule} />
        </div>
        <nav aria-label={t('nav.menu')}>
          <ol className={styles.list}>
            {items.map((item) => (
              <li key={item.id}>
                <a className={styles.link} href={`#${item.id}`} onClick={onClose}>
                  {item.label}
                </a>
                {item.sub && (
                  <ol className={styles.sub}>
                    {item.sub.map((s) => (
                      <li key={s.id}>
                        <a className={styles.subLink} href={`#${s.id}`} onClick={onClose}>
                          <span className={styles.subLabel}>
                            <span className={`${styles.dot} pal-${EVENT_PALETTE[s.id]}`} aria-hidden="true" />
                            {s.label}
                          </span>
                          <span className={styles.date}>{s.date}</span>
                        </a>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        </nav>
      </div>
    </div>
  );
}
