// The closing's diya (spec 2.3.7, 3.4, 3.6): three painted layers on one box (glow, lamp, flame; sprites.json
// closing-diya*). Entrance on the closing's timeline: the lamp fades in 300-860 ms, the flame lights at 860 ms (scaleY
// 0 -> 1 over 400 ms about its base) with its glow. Then the only flame on the site flickers: scaleY 1 +- .04 and
// rotate +- 1.5 deg about its base on two non-harmonic tracks (1.13 s and .83 s, alternate) that read as noise, the
// glow breathing .85-1 (full and lite). Under reduced motion it is a still, lit lamp. Decorative.
import { useRef } from 'react';
import { ENTRANCE } from '../../lib/motion';
import { useEntrance } from '../motion/MotionProvider';
import { Sprite } from './Sprite';

const SIZES = '(min-width: 1024px) 220px, 28vw';

export function Diya({
  className = '',
  at = 0,
}: {
  className?: string;
  /** shifts the closing's diya slots (ms) */ at?: number;
}) {
  const body = useRef<HTMLSpanElement>(null);
  const flame = useRef<HTMLSpanElement>(null);
  const glow = useRef<HTMLSpanElement>(null);
  const [d0, d1] = ENTRANCE.closing.diya;
  const [f0, f1] = ENTRANCE.closing.flame;
  useEntrance(body, { at: at + d0, dur: d1 - d0, kind: 'fade' });
  useEntrance(flame, { at: at + f0, dur: f1 - f0, kind: 'light' });
  useEntrance(glow, { at: at + f0, dur: 600, kind: 'fade' });
  return (
    <span className={`diya ${className}`.trim()} data-motion="flame" aria-hidden="true">
      <span ref={glow} className="diya__layer diya__glow" data-enter="fade">
        <Sprite id="closing-diya-glow" sizes={SIZES} className="diya__img diya__glow-img m-idle" />
      </span>
      <span ref={body} className="diya__layer diya__body" data-enter="fade">
        <Sprite id="closing-diya" sizes={SIZES} className="diya__img" />
      </span>
      <span ref={flame} className="diya__layer diya__flame" data-enter="light">
        <Sprite id="closing-diya-flame" sizes={SIZES} className="diya__img diya__flame-img m-idle" />
      </span>
    </span>
  );
}
