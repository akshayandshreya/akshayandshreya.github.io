// Line art that draws itself (spec 3.4), from the line SVGs in src/assets/motifs (each stroke a ribbon revealed by a
// centreline mask path, .m-draw). Two ways to drive it:
//   <LineArt motif="shehnai" at={1700} dur={700} />      an entrance on the section's content timeline
//   <LineArt motif="alpana" scroll />                     drawn by scrolling: p = clamp((vh - top) / (0.8 vh)), so
//                                                         scrolling back un-draws it; the <figcaption> of its <figure>
//                                                         enters once the art passes p = 0.85 (3.4 a)
// and the hook `useLineDraw(ref, ...)` drives any inline line SVG already in the page (the Ganesh overlay).
// The SVG text is a lazy chunk per motif (alpana is 15 KB gzip): before it arrives, and without JS, an <img> of the
// same file shows the finished drawing. Under reduced motion the art is simply there. The ink comes from --m-ink.
// A scroll-drawn motif is painted on a canvas under the finished ink (useScrollLineCanvas, lineCanvas.ts; by a worker
// where the browser allows) wherever the browser can: the same drawing, without re-rendering 100-200 SVG masks and a
// brush filter on every scroll frame. Elsewhere (and in jsdom) it is the inline SVG, as an entrance is.
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { prefixIds } from '../../lib/linedraw';
import {
  lineArtUrl,
  loadLineSvg,
  useLineDraw,
  useScrollLineCanvas,
  type LineDrawOptions,
  type LineMotif,
} from '../motion/lineArt';
import { lineCanvasSupported } from '../motion/lineCanvas';

export interface LineArtProps extends LineDrawOptions {
  motif: LineMotif;
  className?: string;
  /** the ink (default: the section's --m-ink) */
  ink?: string;
  style?: CSSProperties;
}

let canvasOk: boolean | undefined;
/** Decided once per page; the rendered markup is the same either way, so SSR and hydration agree. */
const canvasRenderer = () => (canvasOk ??= lineCanvasSupported());

export function LineArt({ motif, className = '', ink, style, ...draw }: LineArtProps) {
  const host = useRef<HTMLSpanElement>(null);
  const svgHost = useRef<HTMLSpanElement>(null);
  const [version, setVersion] = useState(0);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const canvas = !!draw.scroll && typeof window !== 'undefined' && canvasRenderer();

  useEffect(() => {
    if (canvas) return;
    let alive = true;
    // the inline SVG is on its way: hide the finished <img> meanwhile, so an entrance never flashes the drawing first
    host.current?.setAttribute('data-js', '');
    const load = () =>
      loadLineSvg(motif).then(
        (text) => {
          const el = svgHost.current;
          if (!alive || !el) return;
          el.innerHTML = prefixIds(text.replace(/^<\?xml[^>]*>/, ''), `${uid}${motif}`);
          el.querySelector('svg')?.setAttribute('aria-hidden', 'true');
          el.querySelector('svg')?.setAttribute('focusable', 'false');
          host.current?.setAttribute('data-inline', '');
          setVersion((v) => v + 1);
        },
        () => host.current?.removeAttribute('data-js'), // no SVG: the <img> stays the art
      );
    // parse the SVG only when the art comes within a viewport and a half (alpana alone is 80 KB of markup with
    // brush filters: nothing of it is needed at load)
    const el = host.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      void load();
      return () => {
        alive = false;
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        void load();
      },
      { rootMargin: '150% 0px 150% 0px' },
    );
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [motif, uid, canvas]);

  useLineDraw(host, draw, version, !canvas);
  useScrollLineCanvas(
    host,
    svgHost,
    motif,
    draw,
    canvas,
    () => host.current?.setAttribute('data-inline', ''),
    () => {
      host.current?.removeAttribute('data-inline');
      host.current?.removeAttribute('data-js');
    },
  );
  // the canvas is on its way: the finished <img> waits hidden, so the drawing never shows complete first
  useEffect(() => {
    const el = host.current;
    if (!canvas || !el) return;
    el.setAttribute('data-js', '');
    return () => el.removeAttribute('data-inline');
  }, [canvas]);

  const vars = { ...(ink ? { '--m-ink': ink } : {}), ...style } as CSSProperties;
  return (
    <span
      ref={host}
      className={`line-art line-art--${motif} ${className}`.trim()}
      data-enter={draw.scroll ? undefined : 'draw'}
      style={vars}
      aria-hidden="true"
    >
      <img className="line-art__img" src={lineArtUrl(motif)} alt="" decoding="async" loading="lazy" draggable={false} />
      <span ref={svgHost} className="line-art__svg" />
    </span>
  );
}
