// "Add to calendar" (spec 2.3.4): a disclosure with "Apple · Outlook (.ics)" (a client-side file, nothing is sent)
// and "Google Calendar" (a prefilled template, opened in a new tab only on click). For several events ("Add all") the
// .ics holds every VEVENT and Google gets one link per event, labelled with the event title.
import { config } from '../../config';
import { useI18n } from '../../i18n/context';
import type { EventCopy } from '../../i18n/types';
import { buildIcs, downloadIcs, icsFileName } from '../../lib/ics';
import { googleCalendarUrl } from '../../lib/google-calendar';
import { Disclosure } from './Disclosure';
import styles from './actions.module.css';

/** The page URL written into calendar entries (only when the site URL is configured). */
function pageUrl(lang: string): string | null {
  const site = config.siteUrl;
  return site ? `${site.replace(/\/+$/, '')}/${lang}/` : null;
}

function CalendarIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M3.6 6.2 C 3.5 5, 4.3 4.3, 5.4 4.3 L 14.7 4.2 C 15.8 4.2, 16.5 5, 16.5 6.1 L 16.4 15 C 16.4 16, 15.7 16.6, 14.7 16.6 L 5.3 16.7 C 4.3 16.7, 3.6 16, 3.6 15 Z" />
      <path d="M3.8 8.3 C 8 8.1, 12 8.1, 16.3 8.3" />
      <path d="M7 2.8 L 7 5.6 M13 2.8 L 13 5.6" />
      <circle cx="10" cy="12.4" r="1.15" />
    </svg>
  );
}

export function AddToCalendar({ events, className = '' }: { events: readonly EventCopy[]; className?: string }) {
  const { lang, copy, t } = useI18n();
  if (events.length === 0) return null;
  const all = events.length > 1;
  const opts = { pair: copy.pair.text, durationMinutes: config.calendar.durationMinutes, url: pageUrl(lang) };

  return (
    <Disclosure label={t(all ? 'cal.addAll' : 'cal.add')} icon={<CalendarIcon />} className={className}>
      {({ close }) => (
        <ul className={styles.menu}>
          <li>
            <button
              type="button"
              className={styles.item}
              onClick={() => {
                downloadIcs(icsFileName(events), buildIcs(events, opts));
                close(true);
              }}
            >
              <span lang="en">{t('cal.ics')}</span>
            </button>
          </li>
          {config.calendar.google &&
            events.map((e) => (
              <li key={e.key}>
                <a
                  className={styles.item}
                  href={googleCalendarUrl(e, opts)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => close(false)}
                >
                  <span>{t('cal.google')}</span>
                  {all && <span className={styles.itemSub}>{e.title}</span>}
                  <span className="sr-only"> {t('a11y.newTab')}</span>
                </a>
              </li>
            ))}
        </ul>
      )}
    </Disclosure>
  );
}
