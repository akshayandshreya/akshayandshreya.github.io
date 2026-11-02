// <GlowPulse> (spec 3.6, full tier): a soft radial pool at the plate's glow point (plates.json `glow`: x, y as
// fractions of the painting, r a fraction of min(W, H), k its strength), breathing opacity 1 -> .94 over the half
// phrase (5.016 s). Placed on the plate's cover box, so it sits on the painted light at every viewport.
import { useRef, type CSSProperties } from 'react';
import { FRAME_SIZE } from '../../lib/breakpoints';
import { plateEntry } from '../../lib/plates';
import { useMotionTier } from '../motion/MotionProvider';
import { useCoverBox } from '../motion/layers';

export function GlowPulse({
  plate,
  strength = 1,
}: {
  plate: string;
  /** multiplies the plate's k */ strength?: number;
}) {
  const tier = useMotionTier();
  const ref = useRef<HTMLDivElement>(null);
  const on = tier === 'full';
  const frame = useCoverBox(ref, plate, on);
  const entry = plateEntry(plate);
  const glow = entry?.frames[frame].glow;
  if (!on || !entry) return null;
  const { W, H } = FRAME_SIZE[frame];
  const style = glow
    ? ({
        '--gx': glow.x,
        '--gy': glow.y,
        // r is a fraction of min(W, H) of the painting; as fractions of the cover box's width and height:
        '--grx': (glow.r * Math.min(W, H)) / W,
        '--gry': (glow.r * Math.min(W, H)) / H,
        '--gk': Math.min(1, glow.k * strength),
      } as CSSProperties)
    : undefined;
  return (
    <div className="glow-layer m-shift" data-motion="glow" aria-hidden="true">
      <div ref={ref} className="glow-layer__box">
        {glow && <span className="glow-pool m-idle" style={style} />}
      </div>
    </div>
  );
}
