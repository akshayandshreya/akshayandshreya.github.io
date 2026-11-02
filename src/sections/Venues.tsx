// Venues (spec 2.3.6): one card per city (Kolkata, Saharsa); with reception=0 only Kolkata, centred.
import { useI18n } from '../i18n/context';
import { PaperBand } from '../components/paint/PaperBand';
import { Reveal } from '../components/text/Reveal';
import { VenueCard } from './VenueCard';

export function Venues() {
  const { copy, t } = useI18n();
  return (
    <PaperBand id="venues" palette="blush" labelledBy="venues-title" className="venues">
      <h2 id="venues-title" className="t-title">
        {t('nav.venues')}
      </h2>
      <div className="venues__cards" data-count={copy.cities.length}>
        {copy.cities.map((city, i) => (
          <Reveal key={city} wrap kind="fade" at={150 + i * 200}>
            <VenueCard city={city} index={i} days={copy.days.filter((d) => d.city === i)} />
          </Reveal>
        ))}
      </div>
    </PaperBand>
  );
}
