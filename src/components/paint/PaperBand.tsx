// A paper band (spec 1.3): no plate, the palette's paper with grain and two radial washes.
import type { ReactNode } from 'react';
import type { Palette } from '../../lib/palettes';

export function PaperBand({
  id,
  palette = 'ivory',
  labelledBy,
  className = '',
  children,
}: {
  id: string;
  palette?: Palette;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      data-section={id}
      className={`paper-band pal-${palette} ${className}`}
      aria-labelledby={labelledBy}
    >
      <div className="paper-band__inner">{children}</div>
    </section>
  );
}
