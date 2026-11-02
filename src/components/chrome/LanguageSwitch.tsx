// The language switch (spec 2.3.8, 2.1.2): four endonyms as real links (they work without JS), keeping the query and
// the section in view. A click remembers the place so the new language opens at the same spot; the new chunk is
// prefetched on pointerenter/focus.
import { Link, useLocation } from 'react-router-dom';
import { prefetchLang } from '../../i18n';
import { useI18n } from '../../i18n/context';
import { ENDONYMS, LANGS, langHref, storeLang } from '../../lib/langs';
import { useActiveSection } from '../../state/scrollspy';
import { rememberPlace } from '../../state/place';
import styles from './LanguageSwitch.module.css';

export function LanguageSwitch({ variant = 'bar' }: { variant?: 'bar' | 'footer' }) {
  const { requestedLang, t, variant: copyVariant } = useI18n();
  const { search } = useLocation();
  const active = useActiveSection();

  return (
    <nav className={`${styles.switch} ${variant === 'footer' ? styles.footer : ''}`} aria-label={t('lang.label')}>
      <ul className={styles.list}>
        {LANGS.map((l) => {
          const current = l === requestedLang;
          const { full, short } = ENDONYMS[l];
          return (
            <li key={l}>
              <Link
                to={langHref(l, search, active, copyVariant.path)}
                className={styles.link}
                lang={l}
                hrefLang={l}
                aria-current={current ? 'true' : undefined}
                aria-label={variant === 'bar' ? full : undefined}
                onPointerEnter={() => prefetchLang(l)}
                onFocus={() => prefetchLang(l)}
                onClick={(e) => {
                  if (current) {
                    e.preventDefault();
                    return;
                  }
                  rememberPlace(active);
                  storeLang(l);
                }}
              >
                {variant === 'bar' ? (
                  <>
                    <span className={styles.full} aria-hidden="true">
                      {full}
                    </span>
                    <span className={styles.short} aria-hidden="true">
                      {short}
                    </span>
                  </>
                ) : (
                  full
                )}
                {current && (
                  <svg
                    className={styles.underline}
                    viewBox="0 0 60 6"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M2 4 C 18 1.5, 40 1.5, 58 3.2" />
                  </svg>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
