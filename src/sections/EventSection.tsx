// One event (spec 2.3.4): h3 title, tagline, the couple (figure, alt text with the event title), facts as a dl
// (visually hidden labels), then the actions. Stacked like the card on phones; on wide screens the couple stands on one
// side, alternating (Mehndi left, Engagement right, ...), and the DOM order stays the reading order.
// The event timeline of spec 3.4 runs from the section's trigger (after 70% of its paint-reveal): the title is brushed
// on 0-900 ms, the couple feathers in from the feet 300-1500, the tagline 500, date and time 800, venue 950, address
// 1100, the actions 1250-1800, the wedding's kalash and shankha 600-1600.
import type { CSSProperties } from 'react';
import { useI18n } from '../i18n/context';
import type { EventCopy } from '../i18n/types';
import { EVENT_PALETTE } from '../lib/palettes';
import { CoupleFigure, PlateSection } from '../components/paint/PlateSection';
import { Sprite } from '../components/motifs/Sprite';
import { coupleEntry } from '../lib/sprites';
import { ENTRANCE } from '../lib/motion';
import { HandTitle } from '../components/text/HandTitle';
import { Reveal } from '../components/text/Reveal';
import { EventActions } from './EventActions';
import styles from './sections.module.css';

function DateTime({ value }: { value: string }) {
  const parts = value.split(' · ');
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} className={styles.whenPart}>
          {i > 0 && <span className="sep"> · </span>}
          {p}
        </span>
      ))}
    </>
  );
}

/** Kalash front left and shankha front right of the wedding couple (spec 1.7), on the couple's own box. */
function WeddingProps() {
  const c = coupleEntry('wedding');
  const style = { '--couple-aspect': c?.aspect ?? 0.61, '--couple-hs': c?.heightScale ?? 1 } as CSSProperties;
  return (
    <div className={`couple ${styles.near}`} style={style} aria-hidden="true" data-slot="near-motifs">
      <Sprite id="wedding-kalash" sizes="90px" className={styles.weddingKalash} />
      <Sprite id="wedding-shankha" sizes="110px" className={styles.weddingShankha} />
    </div>
  );
}

const T = ENTRANCE.event;
const slot = (s: readonly [number, number]) => ({ at: s[0], dur: s[1] - s[0] });

export function EventSection({ event, index }: { event: EventCopy; index: number }) {
  const { copy, t } = useI18n();
  const titleId = `${event.key}-title`;
  const side = index % 2 === 0 ? 'left' : 'right';
  return (
    <PlateSection
      id={event.key}
      palette={EVENT_PALETTE[event.key]}
      labelledBy={titleId}
      className={`event event--${event.key}`}
    >
      <div className={`event__grid ${styles.eventGrid}`} data-couple={side}>
        <HandTitle as="h3" id={titleId} className={`t-title event__title ${styles.eventTitle}`} {...slot(T.title)}>
          {event.title}
        </HandTitle>
        <Reveal as="p" className="t-tagline event__tagline glaze" {...slot(T.tagline)}>
          {event.tagline}
        </Reveal>
        <Reveal wrap kind="feather" {...slot(T.couple)}>
          <CoupleFigure event={event.key} alt={t('alt.couple', { event: event.title })} className="event__couple" />
        </Reveal>
        {event.key === 'wedding' && (
          <Reveal wrap kind="rise" {...slot(T.near)}>
            <WeddingProps />
          </Reveal>
        )}
        <dl className={`event__facts glaze ${styles.facts}`}>
          <dt className="sr-only">
            {copy.labels.date}, {copy.labels.time}
          </dt>
          <Reveal as="dd" className="t-when" {...slot(T.when)}>
            <DateTime value={event.dateTime} />
          </Reveal>
          <dt className="sr-only">{copy.labels.venue}</dt>
          <Reveal as="dd" className="t-venue" {...slot(T.venue)}>
            {event.venue}
          </Reveal>
          <Reveal as="dd" className={`t-addr ${styles.addr}`} {...slot(T.address)}>
            <span>{event.address[0]}</span> <span>{event.address[1]}</span>
          </Reveal>
        </dl>
        <Reveal wrap kind="fade" {...slot(T.actions)}>
          <EventActions event={event} />
        </Reveal>
      </div>
    </PlateSection>
  );
}
