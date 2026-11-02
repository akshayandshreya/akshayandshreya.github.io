// Gallery (spec 2.4): empty by default (section hidden). Only images the owner has rights to; we never add photos.
import { config } from '../config';
import { useI18n } from '../i18n/context';
import { PaperBand } from '../components/paint/PaperBand';

export function Gallery() {
  const { lang, t } = useI18n();
  if (config.gallery.length === 0) return null;
  return (
    <PaperBand id="gallery" palette="ivory" labelledBy="gallery-title" className="gallery">
      <h2 id="gallery-title" className="t-title">
        {t('gallery.title')}
      </h2>
      <ul className="gallery__grid">
        {config.gallery.slice(0, 12).map((g) => (
          <li key={g.src}>
            <img src={g.src} width={g.w} height={g.h} alt={g.alt[lang]} loading="lazy" decoding="async" />
          </li>
        ))}
      </ul>
    </PaperBand>
  );
}
