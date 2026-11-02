// <LightSweep> (spec 3.6, full tier): a soft band of light crosses the frame at 62 degrees once per phrase (10.031 s),
// 3.2 s long, the first after 2.2 s; on light palettes #fffaf3 at .20 in `screen`, on deep ones #ffd9a8 at .42 in
// `soft-light` (motion.css, by the section's palette). Only the section in view animates (.in-view), all of it pauses
// while the document is hidden. Compositor-only: one transform on a static gradient.
import { useMotionTier } from '../motion/MotionProvider';

export function LightSweep({ delay }: { /** first pass, s (default 2.2) */ delay?: number }) {
  const tier = useMotionTier();
  if (tier !== 'full') return null;
  return (
    <div className="sweep" data-motion="sweep" aria-hidden="true">
      <span className="sweep__band m-idle" style={delay != null ? { animationDelay: `${delay}s` } : undefined} />
    </div>
  );
}
