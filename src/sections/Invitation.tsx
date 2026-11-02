// Invitation (spec 2.3.2): kalash, shloka (hi/mai), blessing, host line, honorific + name, the gold joiner, honorific +
// name, the shehnai in gold line; a faint alpana ghost behind the names. A visually hidden h2 labels the section.
// Entrances (3.4, after 70% of the paint-reveal): kalash 0-560 ms, shloka 150, blessing 250, host 400, name 1
// 600-1500, joiner 1300-1700, name 2 1450-2350, the shehnai draws 1700-2400.
import { useI18n } from '../i18n/context';
import { ENTRANCE } from '../lib/motion';
import type { Person } from '../i18n/types';
import { PlateSection } from '../components/paint/PlateSection';
import { Joiner } from '../components/text/Joiner';
import { Reveal } from '../components/text/Reveal';
import { Ghost } from '../components/motifs/Ghost';
import { Sprite } from '../components/motifs/Sprite';
import { LineArt } from '../components/motifs/LineArt';
import styles from './sections.module.css';

const T = ENTRANCE.invitation;
const slot = (s: readonly [number, number]) => ({ at: s[0], dur: s[1] - s[0] });

function Name({ person, at, dur }: { person: Person; at: number; dur: number }) {
  return (
    <Reveal as="p" className="invitation__person" data-role={person.role} at={at} dur={dur}>
      {person.honorific && <span className="t-honor">{person.honorific}</span>}
      <span className="t-names">{person.text}</span>
    </Reveal>
  );
}

export function Invitation() {
  const { copy, t } = useI18n();
  return (
    <PlateSection id="invitation" palette="blush" labelledBy="invitation-title" className="invitation">
      <h2 id="invitation-title" className="sr-only">
        {t('nav.invitation')}
      </h2>
      <div className="invitation__col glaze">
        <Reveal
          className={`invitation__kalash ${styles.kalash}`}
          aria-hidden="true"
          data-slot="kalash"
          kind="fade"
          {...slot(T.kalash)}
        >
          <Sprite id="invitation-kalash" sizes="85px" />
        </Reveal>
        {copy.shloka && (
          <Reveal as="p" className="t-blessing t-shloka" {...slot(T.shloka)}>
            <span>{copy.shloka[0]}</span>
            <span>{copy.shloka[1]}</span>
          </Reveal>
        )}
        <Reveal as="p" className="t-blessing" {...slot(T.blessing)}>
          {copy.blessing}
        </Reveal>
        <Reveal as="p" className={`t-host ${styles.host}`} {...slot(T.host)}>
          {copy.host}
        </Reveal>
        <div className={`invitation__names ${styles.names}`}>
          <Ghost motif="alpana" alpha={0.09} className={styles.namesGhost} />
          <Name person={copy.names.first} {...slot(T.name1)} />
          <Reveal wrap {...slot(T.joiner)}>
            <Joiner value={copy.names.joiner} className="invitation__joiner" />
          </Reveal>
          <Name person={copy.names.second} {...slot(T.name2)} />
        </div>
        <div className={`invitation__shehnai ${styles.shehnai}`} aria-hidden="true" data-slot="shehnai">
          <LineArt motif="shehnai" ink="var(--gold-1)" {...slot(T.shehnai)} />
        </div>
      </div>
    </PlateSection>
  );
}
