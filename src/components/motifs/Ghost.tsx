// A ghost ornament (spec 1.7, 2.3.2, 2.3.6): the alpana (Bengal) or aripan (Mithila) as a faint alpha mask in the
// section's own ink, so one file serves every palette: alpana 9% behind the invitation names, 8% in a venue card's
// corner. Decorative and inert.
import type { CSSProperties } from 'react';
import { SPRITES, spriteUrl } from '../../lib/sprites';
import styles from './Ghost.module.css';

export type GhostMotif = 'alpana' | 'aripan';

export function Ghost({
  motif,
  alpha = 0.09,
  large = false,
  className = '',
  style,
}: {
  motif: GhostMotif;
  /** Opacity of the ink (spec: .09 behind names, .08 on venue cards). */
  alpha?: number;
  /** Use the largest mask (1100 px) when the ghost is shown wider than about 640 CSS px on 2x screens. */
  large?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const m = SPRITES.motifs[`ghost-${motif}`];
  if (!m) return null;
  const sizes = Object.keys(m.webp)
    .map(Number)
    .sort((a, b) => a - b);
  const pick = large ? sizes[sizes.length - 1] : sizes[0];
  const url = spriteUrl(m.webp[String(pick)] ?? '');
  if (!url) return null;
  const vars = { '--ghost-mask': `url("${url}")`, '--ghost-alpha': String(alpha), ...style } as CSSProperties;
  return (
    <span
      className={`ghost ghost--${motif} ${styles.ghost} ${className}`}
      data-ghost={motif}
      style={vars}
      aria-hidden="true"
    />
  );
}
