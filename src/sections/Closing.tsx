// Closing (spec 2.3.7): monogram ring, the two-line request (h2), the line, a gold rule, regards, family 1, the gold
// joiner, family 2, and the lit diya at the foot (glow, lamp, flame layers). Entrances (3.4, after 70% of the bloom
// reveal): ring 0-600 ms, request 200-1100, line 700, rule 900, regards 1000, families 1150-1900; the diya fades in
// 300-860 and its flame lights at 860.
import { useI18n } from '../i18n/context';
import { ENTRANCE } from '../lib/motion';
import { PlateSection } from '../components/paint/PlateSection';
import { GoldRule } from '../components/text/GoldRule';
import { Joiner } from '../components/text/Joiner';
import { Monogram } from '../components/text/Monogram';
import { Reveal } from '../components/text/Reveal';
import { Diya } from '../components/motifs/Diya';
import styles from './sections.module.css';

const T = ENTRANCE.closing;
const slot = (s: readonly [number, number]) => ({ at: s[0], dur: s[1] - s[0] });

export function Closing() {
  const { copy } = useI18n();
  const [fam1, joiner, fam2] = copy.closing.families;
  return (
    <PlateSection id="closing" palette="ivory" labelledBy="closing-title" className="closing">
      <div className={`closing__col glaze ${styles.closingCol}`}>
        <Reveal className="closing__ring" kind="fade" {...slot(T.ring)}>
          <Monogram value={copy.monogram} />
        </Reveal>
        <Reveal as="h2" id="closing-title" className="t-close" {...slot(T.request)}>
          <span>{copy.closing.bigLines[0]}</span> <span>{copy.closing.bigLines[1]}</span>
        </Reveal>
        <Reveal as="p" className="t-closeline" {...slot(T.line)}>
          {copy.closing.small}
        </Reveal>
        <Reveal wrap kind="fade" {...slot(T.rule)}>
          <GoldRule />
        </Reveal>
        <Reveal as="p" className="t-closeline" {...slot(T.regards)}>
          {copy.closing.regards}
        </Reveal>
        <Reveal as="p" className="closing__families" at={T.family1[0]} dur={T.family2[1] - T.family1[0]}>
          <span className="t-family">{fam1}</span>
          <Joiner value={joiner} className="closing__joiner" />
          <span className="t-family">{fam2}</span>
        </Reveal>
        <div className={`closing__diya ${styles.diyaSlot}`} data-slot="diya" aria-hidden="true">
          <Diya />
        </div>
      </div>
    </PlateSection>
  );
}
