// <Veil> (spec 3.6, full tier): the plate's drifting veil, a half-resolution layer of 14-20 low-contrast strokes on the
// plate's own flow field, laid on the plate's pixel grid. It drifts against the base (x 7.5 px / 14.5 s, y 5.5 px /
// 16.5 s, scale +-0.0042 / 12.2 s, rotate +-0.06 deg / 21 s, separate tracks; motion.css) at opacity .85, follows
// the plate's scroll shift (.m-shift) and moves 5 px with the pointer parallax. Rendered only in the full tier (the
// files are never fetched in lite or under reduced motion); it fades in after the section's paint-reveal.
//
// It is drawn into a <canvas>, not shown as an <img> (QA r1 T3): a canvas is never a Largest Contentful Paint
// candidate, and as an image the veil (mounted after the opening's entrance, a near full-screen picture) became the
// page's LCP at 3.7-4 s on a slow phone. The canvas is the veil's box (`inset: -2%`, like the plate) at 1x: the layer is
// soft and half resolution, so 1x is all it carries. The file is the frame shape's own (tall / mid / wide), cover-fitted
// on the plate's focal point exactly as the <picture> did (object-fit: cover, object-position: --focal).
import { useEffect, useRef } from 'react';
import { frameFor } from '../../lib/breakpoints';
import { coverRect, plateEntry, plateUrl } from '../../lib/plates';
import { useMotionTier } from '../motion/MotionProvider';

const decoded = new Map<string, Promise<HTMLImageElement>>();
function loadImage(url: string): Promise<HTMLImageElement> {
  let p = decoded.get(url);
  if (!p) {
    const im = new Image();
    im.decoding = 'async';
    im.src = url;
    p = (typeof im.decode === 'function' ? im.decode() : Promise.resolve()).then(() => im);
    p.catch(() => decoded.delete(url));
    decoded.set(url, p);
  }
  return p;
}

function VeilCanvas({ plate }: { plate: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const entry = plateEntry(plate);
    if (!canvas || !entry) return;
    let alive = true;
    let drawn = '';
    const draw = () => {
      const box = canvas.parentElement;
      if (!box) return;
      const w = Math.max(1, Math.round(box.clientWidth));
      const h = Math.max(1, Math.round(box.clientHeight));
      const frame = frameFor(window.innerWidth, window.innerHeight);
      const url = plateUrl(entry.frames[frame].veil);
      const key = `${url}|${w}x${h}`;
      if (!url || key === drawn) return;
      void loadImage(url).then(
        (im) => {
          if (!alive) return;
          const g = canvas.getContext('2d');
          if (!g) return;
          canvas.width = w;
          canvas.height = h;
          const c = coverRect(w, h, im.naturalWidth || w, im.naturalHeight || h, entry.focal);
          g.drawImage(im, c.x, c.y, c.w, c.h);
          drawn = key;
          canvas.dataset.drawn = '';
        },
        () => undefined, // no veil: the plate is whole without it
      );
    };
    draw();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null;
    if (canvas.parentElement) ro?.observe(canvas.parentElement);
    return () => {
      alive = false;
      ro?.disconnect();
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [plate]);
  return <canvas ref={ref} className="veil__canvas" width={0} height={0} aria-hidden="true" />;
}

export function Veil({ plate }: { plate: string }) {
  const tier = useMotionTier();
  if (tier !== 'full') return null;
  return (
    <div className="veil-layer m-shift" data-drift="veil" aria-hidden="true">
      <div className="plate-pointer plate-pointer--veil">
        <div className="veil__pic" data-plate={plate}>
          <VeilCanvas plate={plate} />
        </div>
      </div>
    </div>
  );
}
