// RSVP (spec 2.4): only when config.rsvp.url is set. One gilt button to the owner's link; no form, no data here.
import { config } from '../config';
import { useT } from '../i18n/context';
import { PaperBand } from '../components/paint/PaperBand';

export function Rsvp() {
  const t = useT();
  if (!config.rsvp.url) return null;
  return (
    <PaperBand id="rsvp" palette="ivory" className="rsvp">
      <a className="btn-gilt" href={config.rsvp.url} target="_blank" rel="noopener noreferrer">
        {t('rsvp.cta')}
        <span className="sr-only"> {t('a11y.newTab')}</span>
      </a>
    </PaperBand>
  );
}
