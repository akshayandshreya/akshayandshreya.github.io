// The card's fine gold frame (spec 1.1, 1.6): two hairlines inset from the edge (the inner one at 60% opacity) and a
// small gold diamond at each corner, centred between the lines. Decorative only.
//   variant "frame": the full-viewport frame of a plate section (insets from tokens.css, plus the safe areas)
//   variant "card" : the same frame in miniature on paper-band cards (two hairlines 8 px apart, 6 px diamonds)
// Styles: src/styles/base.css (.frame-lines).

export type HairlinesVariant = 'frame' | 'card';

export const HAIRLINE_CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

export function Hairlines({ variant = 'frame', className = '' }: { variant?: HairlinesVariant; className?: string }) {
  return (
    <div className={`frame-lines frame-lines--${variant}${className ? ` ${className}` : ''}`} aria-hidden="true">
      <span className="frame-lines__line frame-lines__line--outer" />
      <span className="frame-lines__line frame-lines__line--inner" />
      {HAIRLINE_CORNERS.map((c) => (
        <i key={c} className={`frame-lines__d frame-lines__d--${c}`} />
      ))}
    </div>
  );
}
