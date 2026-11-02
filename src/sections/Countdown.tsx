// Countdown (spec 2.3.3) to the wedding start. The server and the first render show "—" placeholders (no hydration
// mismatch); the client fills the numbers after mount and updates on minute boundaries (paused while hidden). A changed
// digit crossfades (keyed remount; motion tiers only). The section disappears at the wedding start (no invented
// "after" text). The sr-only sentence is read on demand, never announced.
import { config } from '../config';
import { useI18n } from '../i18n/context';
import { WEDDING_START_UTC } from '../generated/facts';
import { remaining } from '../lib/countdown';
import { usePage } from '../state/page';
import { PaperBand } from '../components/paint/PaperBand';
import { GoldRule } from '../components/text/GoldRule';
import { AddToCalendar } from '../components/actions/AddToCalendar';
import { Reveal } from '../components/text/Reveal';
import type { UiKey } from '../i18n/types';
import styles from './sections.module.css';

export function Countdown() {
  const { copy, t, num } = useI18n();
  const { flags, now } = usePage();
  if (!flags.countdown) return null;
  const wedding = copy.events.find((e) => e.key === 'wedding');
  const r = now === null ? null : remaining(WEDDING_START_UTC, now);
  const units: { key: UiKey; value: number | undefined; pad: number }[] = [
    { key: 'countdown.days', value: r?.days, pad: 1 },
    { key: 'countdown.hours', value: r?.hours, pad: 2 },
    { key: 'countdown.minutes', value: r?.minutes, pad: 2 },
  ];
  if (config.countdown.showSeconds) units.push({ key: 'countdown.seconds', value: r?.seconds, pad: 2 });

  return (
    <PaperBand id="countdown" palette="ivory" labelledBy="countdown-title" className="countdown">
      <div className={`mini-card countdown__card ${styles.cdCard}`}>
        <GoldRule />
        <h2 id="countdown-title" className="t-title t-title--small">
          {t('countdown.title')}
        </h2>
        <Reveal as="ol" className={`countdown__units ${styles.cdUnits}`} aria-hidden="true" at={150}>
          {units.map((u, i) => (
            <li key={u.key} className={`countdown__unit ${styles.cdUnit}`} data-unit={u.key.split('.')[1]}>
              {i > 0 && <span className={styles.cdDot} />}
              <span className={`t-digits ${styles.cdDigits}`}>
                {u.value === undefined ? (
                  <span className={styles.cdPlaceholder}>—</span>
                ) : (
                  <span key={u.value} className={styles.cdValue}>
                    {num(u.value, u.pad)}
                  </span>
                )}
              </span>
              <span className={`t-ui ${styles.cdLabel}`}>{t(u.key, undefined, u.value ?? 2)}</span>
            </li>
          ))}
        </Reveal>
        {r && (
          <p className="sr-only" aria-live="off">
            {t('countdown.sr', { d: r.days, h: r.hours, m: r.minutes })}
          </p>
        )}
        {wedding && (
          <>
            {/* the event name on its own line, then "date · time" in unbreakable parts: a line never ends in a
                lone separator (F7) */}
            <Reveal as="p" className={`countdown__when ${styles.cdWhen}`} at={380}>
              <span className={`t-kicker ${styles.cdEvent}`}>{wedding.title}</span>
              <span className="t-when">
                {wedding.dateTime.split(' · ').map((part, i) => (
                  <span key={i} className={styles.cdWhenPart}>
                    {i > 0 && <span className="sep"> · </span>}
                    {part}
                  </span>
                ))}
              </span>
              <span className="t-venue countdown__venue">{wedding.venue}</span>
            </Reveal>
            <Reveal kind="fade" className={styles.cdActions} at={620}>
              <AddToCalendar events={[wedding]} />
            </Reveal>
          </>
        )}
        <GoldRule />
      </div>
    </PaperBand>
  );
}
