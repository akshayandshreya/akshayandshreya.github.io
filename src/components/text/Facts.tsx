// An event's facts (spec 2.3.4) as a description list: date · time (the " · " in --sep), the venue, the address on two
// lines (broken after a comma by the generator, 4.4). The dt labels come from content `labels` and are visually
// hidden: the card shows facts, not field names. Each group enters in turn (3.4: date/time, venue +150 ms, address
// +300 ms after `delay`); text never moves afterwards.
import { useI18n } from '../../i18n/context';
import type { EventCopy } from '../../i18n/types';
import { Reveal } from './Reveal';
import styles from './Facts.module.css';

/** "Wed, 26 November · 6:00 PM" -> the parts with a separator span between them. */
export function DateTime({ value }: { value: string }) {
  const parts = value.split(' · ');
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} className={styles.part}>
          {i > 0 && (
            <span className="sep" aria-hidden="true">
              {' · '}
            </span>
          )}
          {i > 0 && <span className="sr-only">, </span>}
          {p}
        </span>
      ))}
    </>
  );
}

export function Facts({
  event,
  delay = 0,
  className = '',
}: {
  event: Pick<EventCopy, 'key' | 'dateTime' | 'venue' | 'address'>;
  delay?: number;
  className?: string;
}) {
  const { copy } = useI18n();
  return (
    <dl className={`facts ${styles.facts} ${className}`} data-event={event.key}>
      <Reveal className={styles.group} delay={delay}>
        <dt className="sr-only">
          {copy.labels.date}, {copy.labels.time}
        </dt>
        <dd className="t-when">
          <DateTime value={event.dateTime} />
        </dd>
      </Reveal>
      <Reveal className={styles.group} delay={delay + 150}>
        <dt className="sr-only">{copy.labels.venue}</dt>
        <dd className="t-venue">{event.venue}</dd>
        <dd className={`t-addr ${styles.addr}`}>
          <span>{event.address[0]}</span> <span>{event.address[1]}</span>
        </dd>
      </Reveal>
    </dl>
  );
}
