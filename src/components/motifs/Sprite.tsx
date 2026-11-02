// <Sprite>: a painted sprite from sprites.json (spec 1.7, 2.3.4, 6.6), through src/lib/sprites.ts. Two kinds:
//   <Sprite id="invitation-kalash" sizes="..." />   a motif (WebP with alpha); decorative unless `alt` is given
//   <Sprite couple="mehndi" alt="..." />             an event's couple (AVIF + WebP), always with alt text
// Sprites are lazy and decode off the main thread; the box keeps its aspect ratio before the file arrives (no CLS).
// The couple is a <picture class="couple"> carrying its figure as CSS variables (--couple-aspect, --couple-hs,
// --couple-crown, --couple-feet) for the layout (layout.css `.couple`: feet on the painted floor, 5.2). No LQIP
// behind a cut-out: it would stay visible as a halo around the figure's transparent edge.
import type { CSSProperties } from 'react';
import type { EventKey } from '../../i18n/types';
import { coupleImage, motifSprite } from '../../lib/sprites';
import { Sources } from '../paint/Plate';
import styles from './Sprite.module.css';

/** The painted motif sprites of sprites.json `motifs`. */
export type MotifSpriteId =
  | 'opening-ganesh'
  | 'invitation-kalash'
  | 'ghost-alpana'
  | 'ghost-aripan'
  | 'mehndi-marigold'
  | 'engagement-toran'
  | 'haldi-banana'
  | 'wedding-kalash'
  | 'wedding-shankha'
  | 'closing-diya'
  | 'closing-diya-flame'
  | 'closing-diya-glow';

interface Common {
  className?: string;
  /** Eager only for art in the first viewport (Ganesh). */
  eager?: boolean;
  style?: CSSProperties;
}

export type SpriteProps =
  | (Common & { id: MotifSpriteId; couple?: never; alt?: string; sizes: string })
  | (Common & { couple: EventKey; id?: never; alt: string; sizes?: never });

export function Sprite(props: SpriteProps) {
  return props.couple ? <CoupleSprite {...props} /> : <MotifSprite {...props} />;
}

function MotifSprite({
  id,
  alt,
  sizes,
  className = '',
  eager = false,
  style,
}: Common & { id: MotifSpriteId; alt?: string; sizes: string }) {
  const m = motifSprite(id);
  if (!m) return null;
  const decorative = !alt;
  const several = m.srcSet.includes(',');
  return (
    <img
      className={`sprite ${styles.motif} ${className}`.trim()}
      data-sprite={id}
      src={m.src}
      srcSet={several ? m.srcSet : undefined}
      sizes={several ? sizes : undefined}
      width={m.width}
      height={m.height}
      alt={decorative ? '' : alt}
      aria-hidden={decorative ? true : undefined}
      decoding="async"
      loading={eager ? 'eager' : 'lazy'}
      draggable={false}
      style={{ aspectRatio: `${m.width} / ${m.height}`, ...style }}
    />
  );
}

function CoupleSprite({
  couple,
  alt,
  className = '',
  eager = false,
  style,
}: Common & { couple: EventKey; alt: string }) {
  const c = coupleImage(couple);
  if (!c) return null;
  return (
    <picture
      className={`couple ${styles.couple} ${className}`.trim()}
      data-couple={couple}
      style={{ ...(c.vars as CSSProperties), ...style }}
    >
      <Sources sources={c.sources} />
      <img
        className={styles.coupleImg}
        src={c.img.src}
        srcSet={c.img.srcSet}
        sizes={c.img.sizes}
        width={c.img.width}
        height={c.img.height}
        alt={alt}
        decoding="async"
        loading={eager ? 'eager' : 'lazy'}
        draggable={false}
      />
    </picture>
  );
}
