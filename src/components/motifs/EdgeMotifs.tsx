// The painted edge motifs of an event's frame (spec 1.7, 3.6, card.js PROPS): Mehndi's two marigold strands hanging
// from the top (rotate +-1.5 deg about their top, phase-offset, 5.016 s), the Engagement toran across the top (the
// same sway), the Haldi banana leaf at the lower left (rotated -9 deg about its foot, breathing +-.8 deg over 6.2 s),
// the Reception's gold Madhubani bamboo at both sides (still). They keep to the frame's edges, clear of the text column
// and the couple (A-EV-8; placement per frame shape in motion.css), move 7 px with the pointer parallax, sway in the
// full and lite tiers, and are still under reduced motion. Decorative.
import type { EventKey } from '../../i18n/types';
import { SPRITES, spriteUrl } from '../../lib/sprites';
import { Sprite } from './Sprite';

export function EdgeMotifs({ event }: { event: EventKey }) {
  return (
    <div className={`edge-motifs edge-motifs--${event}`} data-motion="sway" aria-hidden="true">
      <div className="plate-pointer plate-pointer--edge">
        {event === 'mehndi' && (
          <>
            <span className="edge edge--strand edge--strand-l">
              <Sprite
                id="mehndi-marigold"
                sizes="(max-aspect-ratio: 3/5) 30px, 60px"
                className="edge__img edge__sway m-idle"
              />
            </span>
            <span className="edge edge--strand edge--strand-r">
              <Sprite
                id="mehndi-marigold"
                sizes="(max-aspect-ratio: 3/5) 24px, 40px"
                className="edge__img edge__sway m-idle"
              />
            </span>
          </>
        )}
        {event === 'engagement' && (
          <span className="edge edge--toran">
            <Sprite
              id="engagement-toran"
              sizes="(max-aspect-ratio: 3/5) 92vw, 60vw"
              className="edge__img edge__sway m-idle"
            />
          </span>
        )}
        {event === 'haldi' && (
          <span className="edge edge--banana">
            <Sprite
              id="haldi-banana"
              sizes="(max-aspect-ratio: 3/5) 60px, 150px"
              className="edge__img edge__leaf m-idle"
            />
          </span>
        )}
        {event === 'reception' && (
          <>
            <Bamboo side="left" />
            <Bamboo side="right" />
          </>
        )}
      </div>
    </div>
  );
}

function Bamboo({ side }: { side: 'left' | 'right' }) {
  const b = SPRITES.bamboo[side];
  const url = b ? spriteUrl(b.file) : '';
  if (!b || !url) return null;
  return (
    <span className={`edge edge--bamboo edge--bamboo-${side}`}>
      <img
        className="edge__img"
        src={url}
        width={b.width}
        height={b.height}
        alt=""
        decoding="async"
        loading="lazy"
        draggable={false}
        style={{ aspectRatio: `${b.width} / ${b.height}` }}
      />
    </span>
  );
}
