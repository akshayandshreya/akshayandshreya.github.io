import { useT } from '../../i18n/context';
import { mapsUrl } from '../../lib/maps';
import styles from './actions.module.css';

/** "Open in Maps" (spec 2.3.4): new tab, says so to screen readers. Opens only on click (no embed, no request). */
export function OpenInMaps({ query, className = '' }: { query: string; className?: string }) {
  const t = useT();
  return (
    <a className={`btn-gilt ${className}`} href={mapsUrl(query)} target="_blank" rel="noopener noreferrer">
      <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M10 17.6 C 7.2 14.2, 4.6 11.2, 4.7 8.1 C 4.8 5, 7.1 2.9, 10 2.9 C 12.9 2.9, 15.2 5, 15.3 8.1 C 15.4 11.2, 12.8 14.2, 10 17.6 Z" />
        <circle cx="10" cy="8.1" r="2" />
      </svg>
      <span>{t('maps.open')}</span>
      <span className="sr-only"> {t('a11y.newTab')}</span>
    </a>
  );
}
