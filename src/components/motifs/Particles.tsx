// Particles (spec 3.6): a few painted dabs (sprites/dabs-<palette>.webp, one row of 6 cells) drifting in a region of
// the frame: opening sparks x6 rising slowly in the halo; mehndi leaves, engagement petals and haldi marigold petals
// x4 falling over 14-22 s with a slow sway; wedding sparks x4; closing dust x5 rising from the lamp. At most 6 per
// section (lite: 3); none under reduced motion (nothing is rendered). They fade in over 1.8 s when the section's
// timeline starts. Paths, sizes and phases are seeded: the same every visit. Compositor-only (transforms, opacity).
import { useRef } from 'react';
import { ENTRANCE } from '../../lib/motion';
import { SPRITES, spriteUrl } from '../../lib/sprites';
import { useEntrance, useMotionTier } from '../motion/MotionProvider';
import { PARTICLES, particleDabs, type ParticleSet } from '../motion/layers';

export function Particles({ set, preset, className = '' }: { set?: ParticleSet; preset?: string; className?: string }) {
  const tier = useMotionTier();
  const ref = useRef<HTMLDivElement>(null);
  const s = set ?? (preset ? PARTICLES[preset] : undefined);
  const [p0, p1] = ENTRANCE.event.particles;
  useEntrance(ref, { at: p0, dur: p1 - p0, kind: 'fade' });
  if (tier === 'none' || !s) return null;
  const meta = SPRITES.dabs[s.dab];
  const url = meta ? spriteUrl(meta.file) : '';
  if (!url) return null;
  const dabs = particleDabs(s, tier === 'lite' ? 3 : 6, url);
  return (
    <div
      ref={ref}
      className={`particles particles--${s.dir} ${className}`.trim()}
      style={{ inset: s.inset }}
      aria-hidden="true"
      data-enter="fade"
      data-motion="particles"
    >
      {dabs.map((d, i) => (
        <span key={i} className="pt m-idle" style={d.style}>
          <span className="pt__dab m-idle" style={d.dab} />
        </span>
      ))}
    </div>
  );
}
