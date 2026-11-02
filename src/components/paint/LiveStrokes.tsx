// <LiveStrokes> (spec 3.6, full tier): a hidden painter adds a stroke now and then. Three slots per plate, each a
// pre-painted stroke from the plate's own flow field and colours (the plate's strokes atlas) revealed along its
// length by a moving mask over 2.6-4.4 s, resting, then sinking back over ~3.5 s; each slot repeats every 10-15 s with
// a seeded phase. Placed outside the calm zones (the atlas placement is), at alpha .55, on the plate's own cover box
// so they sit exactly on the painting and follow its scroll shift (.m-shift) and parallax.
import { useRef } from 'react';
import { plateEntry, plateUrl } from '../../lib/plates';
import { useMotionTier } from '../motion/MotionProvider';
import { strokeSlots, useCoverBox } from '../motion/layers';

export function LiveStrokes({ plate }: { plate: string }) {
  const tier = useMotionTier();
  const ref = useRef<HTMLDivElement>(null);
  const on = tier === 'full';
  const frame = useCoverBox(ref, plate, on);
  const entry = plateEntry(plate);
  if (!on || !entry) return null;
  const fr = entry.frames[frame];
  const url = plateUrl(fr.strokes.file);
  if (!url) return null;
  const slots = strokeSlots(fr, url, `${plate}:${frame}`);
  return (
    <div className="live-strokes m-shift" data-drift="strokes" aria-hidden="true">
      <div className="plate-pointer live-strokes__pointer">
        <div ref={ref} className="live-strokes__box">
          {slots.map((s, i) => (
            <span key={`${frame}-${i}`} className="ls-slot" style={s.style}>
              <span className="ls-slot__rot m-idle">
                <span className="ls-slot__sprite" style={s.sprite} />
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
