// Footer (spec 2.3.8): small monogram, the pair, the language switch (full endonyms) and "Back to top". Nothing else.
import { useI18n } from '../../i18n/context';
import { Joiner } from '../text/Joiner';
import { Monogram } from '../text/Monogram';
import { LanguageSwitch } from './LanguageSwitch';

export function Footer() {
  const { copy, t } = useI18n();
  return (
    <footer id="footer" data-section="footer" className="footer paper-band pal-ivory">
      <div className="footer__inner">
        <Monogram value={copy.monogram} size="s" />
        <p className="t-pair footer__pair">
          {copy.pair.first} <Joiner value={copy.pair.joiner} /> {copy.pair.second}
        </p>
        <LanguageSwitch variant="footer" />
        <a className="footer__top t-ui" href="#opening">
          {t('nav.top')}
        </a>
      </div>
    </footer>
  );
}
