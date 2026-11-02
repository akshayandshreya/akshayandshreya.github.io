// Ganesh on the opening (spec 2.3.1, 1.7): the painted sprite with the line drawing on top at 45% opacity, in the
// ivory sections' gold ink (--m-ink #a07a34). Both share the motif's viewBox, so they register exactly. The line SVG
// is inlined (it is our own file, 3.8 KB gzip) so CSS sets its ink and the draw-on of spec 3.4 can drive its
// .m-draw strokes; at rest it is fully drawn. Entrance (opening timeline, 3.4): the line draws on 300-1550 ms
// (length-weighted), the paint rises from a faint 30% to full over 600-1850 ms. Decorative: the invocation text
// carries the meaning (6.1).
import { useRef } from 'react';
import ganeshLine from '../../assets/motifs/ganesh.svg?raw';
import { ENTRANCE } from '../../lib/motion';
import { useLineDraw } from '../motion/lineArt';
import { Reveal } from '../text/Reveal';
import { Sprite } from './Sprite';
import styles from './Ganesh.module.css';

const [L0, L1] = ENTRANCE.opening.ganeshLine;
const [P0, P1] = ENTRANCE.opening.ganeshPaint;

export function Ganesh({ className = '' }: { className?: string }) {
  const line = useRef<HTMLSpanElement>(null);
  useLineDraw(line, { at: L0, dur: L1 - L0 });
  return (
    <span className={`ganesh ${styles.ganesh} ${className}`} aria-hidden="true">
      <Reveal wrap kind="paint" at={P0} dur={P1 - P0}>
        <Sprite id="opening-ganesh" eager className={styles.paint} sizes="(min-width: 1024px) 260px, 34vw" />
      </Reveal>
      <span
        ref={line}
        className={`ganesh__line ${styles.line}`}
        data-enter="draw"
        dangerouslySetInnerHTML={{ __html: ganeshLine }}
      />
    </span>
  );
}
