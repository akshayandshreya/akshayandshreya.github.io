// Opening (spec 2.3.1): Ganesh, invocation(s), the heading (h1, gold leaf), gold rule, monogram ring, the pair,
// dates and cities, in the card cover's order; a brush-drawn scroll cue at the fold. No paint-reveal here: the plate
// is the LCP element and shows at once (6.6). The column enters on the opening timeline of 3.4 (after fonts or
// 1200 ms): Ganesh draws and paints in, then the kickers, the heading, the rule, the ring and monogram, the pair and
// the dateline, one after another. The boot class (public/motion-boot.js) keeps them hidden at first paint, so the
// finished state never flashes; without JS or under reduced motion they are simply there.
import { useI18n } from '../i18n/context';
import { ENTRANCE } from '../lib/motion';
import { PlateSection } from '../components/paint/PlateSection';
import { GoldRule } from '../components/text/GoldRule';
import { Joiner } from '../components/text/Joiner';
import { Monogram } from '../components/text/Monogram';
import { Reveal } from '../components/text/Reveal';
import { Ganesh } from '../components/motifs/Ganesh';
import styles from './sections.module.css';

const T = ENTRANCE.opening;
const slot = (s: readonly [number, number]) => ({ at: s[0], dur: s[1] - s[0] });

export function Opening() {
  const { copy, t } = useI18n();
  return (
    <PlateSection id="opening" palette="ivory" labelledBy="opening-title" className="opening">
      <header className={`opening__col ${styles.openingCol}`}>
        <div className="opening__ganesh" aria-hidden="true" data-slot="ganesh">
          <Ganesh />
        </div>
        <Reveal as="p" className="t-kicker" {...slot(T.kicker)}>
          {copy.invocation}
        </Reveal>
        {copy.invocationSecondary && (
          <Reveal as="p" className="t-kicker" {...slot(T.kicker2)}>
            {copy.invocationSecondary}
          </Reveal>
        )}
        <Reveal as="h1" id="opening-title" className="t-hero gold-leaf" {...slot(T.heading)}>
          {copy.heading}
        </Reveal>
        <Reveal wrap kind="fade" {...slot(T.rule)}>
          <GoldRule />
        </Reveal>
        <Reveal wrap kind="fade" {...slot(T.ring)}>
          <Monogram value={copy.monogram} />
        </Reveal>
        <Reveal as="p" className="t-pair" {...slot(T.pair)}>
          {copy.pair.first} <Joiner value={copy.pair.joiner} /> {copy.pair.second}
        </Reveal>
        <Reveal as="p" className="t-dateline" {...slot(T.dateline)}>
          <span>{copy.dateline.dates}</span>
          {copy.dateline.cities && <span>{copy.dateline.cities}</span>}
        </Reveal>
      </header>
      <Reveal wrap kind="fade" {...slot(T.cue)}>
        <a className="scroll-cue" href="#invitation" aria-label={t('a11y.scrollCue')}>
          <svg viewBox="0 0 40 20" aria-hidden="true" focusable="false">
            <path d="M4 5 C 12 11, 16 14, 20 15 C 24 14, 28 11, 36 5" />
          </svg>
        </a>
      </Reveal>
    </PlateSection>
  );
}
