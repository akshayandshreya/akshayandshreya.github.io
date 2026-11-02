import type { DayCopy } from '../i18n/types';
import { OpenInMaps } from '../components/actions/OpenInMaps';
import { GoldRule } from '../components/text/GoldRule';
import { Ghost } from '../components/motifs/Ghost';
import styles from './sections.module.css';

/**
 * One city (spec 2.3.6): the city in a miniature card frame with a ghost corner ornament (Kolkata: alpana, Saharsa:
 * aripan, 8% alpha), its days with the event lines, venue, address and "Open in Maps".
 */
export function VenueCard({ city, days, index }: { city: string; days: DayCopy[]; index: number }) {
  const id = `venue-city-${index}`;
  return (
    <article className={`mini-card venue-card ${styles.venueCard}`} aria-labelledby={id} data-city={index}>
      <span className={styles.venueCorner} aria-hidden="true">
        <Ghost motif={index === 0 ? 'alpana' : 'aripan'} alpha={0.08} className={styles.venueGhost} />
      </span>
      <h3 id={id} className="t-title t-title--city">
        {city}
      </h3>
      <GoldRule className={styles.venueRule} />
      {days.map((d) => (
        <div key={d.dateIso} className={`venue-card__day ${styles.venueDay}`}>
          <h4 className={`t-kicker ${styles.venueDayHeading}`}>{d.heading}</h4>
          <ul className={`venue-card__lines ${styles.venueLines}`}>
            {d.lines.map((l) => (
              <li key={l.key} className="t-when">
                {l.text}
              </li>
            ))}
          </ul>
          <p className={`t-venue ${styles.venueName}`}>{d.venue}</p>
          <p className={`t-addr ${styles.addr}`}>
            <span>{d.address[0]}</span> <span>{d.address[1]}</span>
          </p>
          <OpenInMaps query={d.mapQuery} className={styles.venueMaps} />
        </div>
      ))}
    </article>
  );
}
