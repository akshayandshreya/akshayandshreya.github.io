// Celebrations (spec 2.3.4): the header band (heading, one chip per event linking to its section, "Add all to
// calendar"), then one EventSection per event (siblings in the DOM so the scrollspy sees each one).
import { useI18n } from '../i18n/context';
import { PaperBand } from '../components/paint/PaperBand';
import { GoldRule } from '../components/text/GoldRule';
import { AddToCalendar } from '../components/actions/AddToCalendar';
import { Reveal } from '../components/text/Reveal';
import { EVENT_PALETTE } from '../lib/palettes';
import { EventSection } from './EventSection';
import styles from './sections.module.css';

/** the chips arrive one after another, in event order, then "Add all" (ms after the band's trigger) */
const CHIPS_AT = 150;
const CHIP_STEP = 90;

export function Celebrations() {
  const { copy } = useI18n();
  return (
    <>
      <PaperBand id="celebrations" palette="ivory" labelledBy="celebrations-title" className="celebrations">
        <h2 id="celebrations-title" className="t-title">
          {copy.eventsHeading}
        </h2>
        <GoldRule className={styles.celebRule} />
        <ul className={`chips ${styles.chips}`}>
          {copy.events.map((e, i) => (
            <Reveal as="li" key={e.key} kind="fade" at={CHIPS_AT + i * CHIP_STEP}>
              <a className={`chip ${styles.chip} pal-${EVENT_PALETTE[e.key]}`} href={`#${e.key}`}>
                <span className={styles.chipSwatch} aria-hidden="true" />
                <span className={`chip__title ${styles.chipTitle}`}>{e.title}</span>
                <span className={`chip__date ${styles.chipDate}`}>{e.date}</span>
              </a>
            </Reveal>
          ))}
        </ul>
        <Reveal
          kind="fade"
          className={`celebrations__all ${styles.celebAll}`}
          data-slot="calendar-all"
          at={CHIPS_AT + copy.events.length * CHIP_STEP + 80}
        >
          <AddToCalendar events={copy.events} />
        </Reveal>
      </PaperBand>
      {copy.events.map((e, i) => (
        <EventSection key={e.key} event={e} index={i} />
      ))}
    </>
  );
}
