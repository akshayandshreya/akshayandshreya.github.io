// The Reception's evening lights (spec 1.7, 3.6, full tier): four soft gold bokeh discs in the upper teal, clear of the
// title (card.js reception), breathing opacity .72-1 on the half phrase with seeded phases and drifting 6-12 px over
// 15-20 s; never off. `screen` blend, so they lift the teal like lamplight. Decorative.
import { useMotionTier } from '../motion/MotionProvider';
import { eveningLights } from '../motion/layers';

export function EveningLights({ className = '' }: { className?: string }) {
  const tier = useMotionTier();
  if (tier !== 'full') return null;
  return (
    <div className={`evening-lights ${className}`.trim()} data-motion="lights" aria-hidden="true">
      {eveningLights().map((s, i) => (
        <span key={i} className="evening-light m-idle" style={s}>
          <span className="evening-light__disc m-idle" />
        </span>
      ))}
    </div>
  );
}
