// The Mithilakshar flourish (spec 2.3.5): "मिथिला" in Tirhuta (U+114A7 U+114B1 U+1149F U+114B1 U+114AA U+114B0), shaped
// with HarfBuzz at asset time and stored as outlines, so every browser shows the same glyphs without a Tirhuta font
// (Safari's Tirhuta shaping is not guaranteed). Paths only, gold ink via currentColor, aria-hidden: the caption next to
// it carries the meaning. Never place it next to the Bengali word (video QA).
import svg from '../../assets/glyphs/tirhuta-mithila.svg?raw';
import styles from './TirhutaFlourish.module.css';

export function TirhutaFlourish({ className = '' }: { className?: string }) {
  return (
    <span
      className={`tirhuta ${styles.flourish} ${className}`}
      aria-hidden="true"
      data-text="मिथिला"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
