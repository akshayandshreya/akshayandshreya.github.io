// Two cultures (spec 2.3.5): Mithila and Bengal side by side as line art, captions only, a lotus at the seam. The
// Tirhuta flourish heads the Mithila half and "বাংলা" the Bengal half: never adjacent. Both words are set as small gold
// specimens of the same optical height on one baseline, each joined to its caption by three bindus (QA r1 D3).
// Ivory, quiet, no night palette.
// config.sections.cultures = false removes it (Page). The draw-with-scroll belongs to the motion layer (data-line-art).
import { useI18n } from '../i18n/context';
import { PlateSection } from '../components/paint/PlateSection';
import type { UiKey } from '../i18n/types';
import { TirhutaFlourish } from '../components/motifs/TirhutaFlourish';
import { LineArt } from '../components/motifs/LineArt';
import { HandTitle } from '../components/text/HandTitle';
import { Reveal } from '../components/text/Reveal';
import type { LineMotif } from '../components/motion/lineArt';
import styles from './sections.module.css';

function Motif({
  name,
  caption,
  ink,
  size = 'l',
}: {
  name: LineMotif;
  caption: UiKey;
  ink: string;
  size?: 'l' | 's' | 'seam';
}) {
  const { t } = useI18n();
  return (
    <figure className={`cultures__motif ${styles.culMotif}`} data-size={size}>
      <div className={`cultures__art ${styles.culArt}`} data-slot={name} aria-hidden="true">
        {/* the seam lotus fades in whole (a half-drawn lotus of two cups read as two creatures facing, QA r1 D2) */}
        <LineArt motif={name} ink={ink} scroll fade={size === 'seam'} />
      </div>
      <figcaption className={`t-tagline ${styles.culCaption}`}>{t(caption)}</figcaption>
    </figure>
  );
}

/** Three gold bindus between a script specimen and its caption: the two words read as labelled specimens of their
 *  scripts, not as headings (QA r1 D3, F15). */
function WordOrnament() {
  return (
    <span className={styles.culOrn} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export function Cultures() {
  const { t } = useI18n();
  return (
    <PlateSection id="cultures" palette="ivory" labelledBy="cultures-title" className="cultures">
      {/* the title and the two words enter after the brush (3.4, 3.5); the line art draws with the scroll */}
      <HandTitle as="h2" id="cultures-title" className="t-title">
        {t('cultures.title')}
      </HandTitle>
      <div className={`cultures__halves ${styles.culHalves}`}>
        <div className={`cultures__half cultures__half--mithila ${styles.culHalf}`}>
          <Reveal as="figure" className={`cultures__word ${styles.culWord}`} kind="fade" at={300} dur={700}>
            <div className={`cultures__tirhuta ${styles.culTirhuta}`} data-slot="tirhuta" aria-hidden="true">
              <TirhutaFlourish />
            </div>
            <WordOrnament />
            <figcaption className={`t-tagline ${styles.culCaption} ${styles.culWordCaption}`}>
              {t('cultures.tirhuta')}
            </figcaption>
          </Reveal>
          <Motif name="aripan" caption="cultures.aripan" ink="var(--m-mithila)" />
          <Motif name="paag" caption="cultures.paag" ink="var(--m-mithila)" size="s" />
        </div>
        <div className={`cultures__seam ${styles.culSeam}`}>
          <Motif name="lotus_open" caption="cultures.lotus" ink="var(--m-lotus)" size="seam" />
        </div>
        <div className={`cultures__half cultures__half--bengal ${styles.culHalf}`}>
          <Reveal as="figure" className={`cultures__word ${styles.culWord}`} kind="fade" at={450} dur={700}>
            <div className={styles.culWordBox}>
              <p className={`cultures__bangla ${styles.culBangla}`} lang="bn" aria-hidden="true">
                বাংলা
              </p>
            </div>
            <WordOrnament />
            <figcaption className={`t-tagline ${styles.culCaption} ${styles.culWordCaption}`}>
              {t('cultures.bangla')}
            </figcaption>
          </Reveal>
          <Motif name="alpana" caption="cultures.alpana" ink="var(--m-bengal)" />
          <div className={styles.culPair}>
            <Motif name="topor" caption="cultures.topor" ink="var(--m-bengal)" size="s" />
            <Motif name="shankha" caption="cultures.shankha" ink="var(--m-bengal)" size="s" />
          </div>
        </div>
      </div>
    </PlateSection>
  );
}
