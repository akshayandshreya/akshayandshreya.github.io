// Line-art draw-on plumbing (spec 3.4): the lazy SVG text per motif, its fallback URL, useLineDraw, which drives any
// inline line SVG on the section's timeline or with the scroll, and useScrollLineCanvas, which draws a scroll-linked
// motif on a canvas instead (lineCanvas.ts: the inline SVG's 100-200 masks under a brush filter were the cultures'
// jank). <LineArt> is the component that uses them.
import { useEffect, useRef } from 'react';
import { MOTION, addAnimator, addScrollItem } from '../../lib/motion';
import {
  drawLineArt,
  parseLineSvg,
  prepLineArt,
  releaseLineArt,
  scrollDrawProgress,
  type DrawOptions,
  type LineArtData,
  type LinePrep,
} from '../../lib/linedraw';
import { inkUrl } from './lineCanvas';
import { lineRenderer, type LineRenderer } from './lineCanvasClient';
import { useEntrance, useMotionTier } from './MotionProvider';

export type LineMotif = 'ganesh' | 'shehnai' | 'aripan' | 'alpana' | 'paag' | 'topor' | 'lotus_open' | 'shankha';

const RAW = import.meta.glob('../../assets/motifs/*.svg', { query: '?raw', import: 'default' }) as Record<
  string,
  () => Promise<string>
>;
const URLS = import.meta.glob('../../assets/motifs/*.svg', { query: '?url', import: 'default', eager: true }) as Record<
  string,
  string
>;
const key = (m: LineMotif) => `../../assets/motifs/${m}.svg`;

const texts = new Map<LineMotif, Promise<string>>();
export function loadLineSvg(m: LineMotif): Promise<string> {
  let p = texts.get(m);
  if (!p) {
    const load = RAW[key(m)];
    p = load ? load() : Promise.reject(new Error(`no line art ${m}`));
    p.catch(() => texts.delete(m));
    texts.set(m, p);
  }
  return p;
}

export function lineArtUrl(m: LineMotif): string {
  return URLS[key(m)] ?? '';
}

const parsed = new Map<LineMotif, LineArtData>();
/** The motif as data for the canvas renderer (parsed once per motif). */
export function lineArtData(m: LineMotif, text: string): LineArtData {
  let d = parsed.get(m);
  if (!d) {
    d = parseLineSvg(text);
    parsed.set(m, d);
  }
  return d;
}

export interface LineDrawOptions extends DrawOptions {
  /** entrance: ms after the section trigger */
  at?: number;
  /** entrance: ms */
  dur?: number;
  /** draw with the scroll instead of on the timeline */
  scroll?: boolean;
  /** scroll: the progress at which the figure's caption enters (default .85) */
  captionAt?: number;
}

/**
 * Drive the inline line SVG inside `ref` (re-run when `version` changes, e.g. after the SVG was injected).
 * Entrance mode hides the strokes until its turn on the section's clock, then draws them length-weighted over `dur`.
 */
export function useLineDraw(
  ref: { current: HTMLElement | null },
  o: LineDrawOptions = {},
  version: unknown = 0,
  enabled = true,
) {
  const tier = useMotionTier();
  const prep = useRef<LinePrep | null>(null);
  const { at = 0, dur = 1250, scroll = false, captionAt = 0.85, overlap = 0.2, mode, lift, reverse } = o;
  const opts: DrawOptions = { overlap, mode, lift, reverse };
  const optsKey = `${overlap}|${mode}|${lift}|${reverse}`;
  // where the entrance is: hidden until its turn, playing, or resting (drawn, no dash styles)
  const phase = useRef<'hidden' | 'playing' | 'rest'>('hidden');

  // measure once per SVG and tier: drawn (rest) or hidden until its entrance
  useEffect(() => {
    const host = ref.current;
    const svg = host?.querySelector('svg');
    if (!enabled || !host || !svg) return;
    if (tier === 'none') {
      prep.current = null;
      return;
    }
    const p = prepLineArt(svg, opts);
    prep.current = p;
    if (!scroll) {
      if (phase.current === 'rest') releaseLineArt(p);
      else drawLineArt(p, 0); // hidden until its turn (a playing entrance draws it on the next frame)
    }
    return () => {
      releaseLineArt(p);
      if (prep.current === p) prep.current = null;
    };
    // opts is described by optsKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, tier, version, scroll, optsKey, enabled]);

  // entrance on the section's clock (none when disabled: no element, no entrance)
  useEntrance(enabled ? ref : NO_ELEMENT, {
    at,
    dur,
    kind: 'draw',
    onPlay: scroll
      ? undefined
      : (delay, d) => {
          phase.current = 'playing';
          const t0 = performance.now() + delay;
          return addAnimator((now) => {
            const p = prep.current;
            if (!p) return now < t0 + d + MOTION.safety; // the SVG is not in yet: draw when it lands
            const q = (now - t0) / d;
            if (q < 0) return true;
            drawLineArt(p, Math.min(1, q));
            if (q >= 1) return false;
            return true;
          });
        },
    onRest: scroll
      ? undefined
      : () => {
          phase.current = 'rest';
          if (prep.current) releaseLineArt(prep.current);
        },
    onArm: scroll
      ? undefined
      : () => {
          phase.current = 'hidden';
          if (prep.current) drawLineArt(prep.current, 0);
        },
  });

  // scroll-linked draw
  useEffect(() => {
    const host = ref.current;
    if (!enabled || !scroll || !host || tier === 'none' || typeof IntersectionObserver === 'undefined') return;
    const caption = followCaption(host, captionAt);
    let docTop = 0;
    let lastP = -1;
    const remove = addScrollItem({
      measure(scrollY) {
        docTop = host.getBoundingClientRect().top + scrollY;
      },
      update(scrollY, vh) {
        const p = scrollDrawProgress(docTop - scrollY, vh);
        if (p !== lastP && prep.current) {
          lastP = p;
          drawLineArt(prep.current, p);
        }
        caption.update(p);
      },
    });
    return () => {
      remove();
      caption.stop();
    };
  }, [ref, scroll, tier, version, captionAt, enabled]);
}

const NO_ELEMENT = { current: null };

/** The <figcaption> of the art's <figure> enters once the drawing passes `at` (3.4 a), once. */
function followCaption(host: HTMLElement, at: number) {
  const fig = host.closest('figure');
  const cap = fig?.querySelector<HTMLElement>('figcaption') ?? null;
  let state: 'pending' | 'in' | 'done' = cap && !cap.hasAttribute('data-shown') ? 'pending' : 'done';
  if (cap && state === 'pending') cap.setAttribute('data-reveal', 'pending');
  let timer = 0;
  return {
    update(p: number) {
      if (!cap || state !== 'pending' || p < at) return;
      state = 'in';
      cap.style.setProperty('--m-delay', '0ms');
      cap.style.setProperty('--m-dur', `${MOTION.tText}ms`);
      cap.setAttribute('data-reveal', 'in');
      timer = window.setTimeout(() => {
        state = 'done';
        cap.removeAttribute('data-reveal');
        cap.setAttribute('data-shown', '');
      }, MOTION.tText + 80);
    },
    stop() {
      window.clearTimeout(timer);
      if (cap) {
        cap.removeAttribute('data-reveal');
        cap.style.removeProperty('--m-delay');
        cap.style.removeProperty('--m-dur');
      }
    },
  };
}

/** A line-art host drawn on a canvas exposes its drawn share (0..1), for the e2e checks and QA tools. */
export interface LineCanvasHost extends HTMLElement {
  lineArtDrawn?: () => number;
}

/** The section ink for the art inside `host` (--m-ink, resolved), or the motif's own. */
function inkOf(host: HTMLElement, data: LineArtData): string {
  return getComputedStyle(host).getPropertyValue('--m-ink').trim() || data.fallbackInk;
}

/**
 * A scroll-drawn motif on a canvas (lineCanvas.ts, painted by a worker where the browser allows:
 * lineCanvasClient.ts): set up when the art comes within a viewport and a half, then drawn by the shared scroll
 * scheduler with p = clamp((vh - top) / (0.8 vh)) as useLineDraw does, the caption entering at `captionAt`. No React
 * state: nothing re-renders while it loads or draws. Under the none tier the art is simply there (the finished ink,
 * no canvas). `slot` is the element the art goes in; `onReady` / `onFail` let the component swap its fallback <img>.
 */
export function useScrollLineCanvas(
  ref: { current: HTMLElement | null },
  slot: { current: HTMLElement | null },
  motif: LineMotif,
  o: LineDrawOptions,
  enabled: boolean,
  onReady: () => void,
  onFail: () => void,
) {
  const tier = useMotionTier();
  const { captionAt = 0.85, overlap = 0.2, mode, lift, reverse } = o;
  const optsKey = `${overlap}|${mode}|${lift}|${reverse}`;
  const cb = useRef({ onReady, onFail });
  cb.current = { onReady, onFail };
  useEffect(() => {
    const host = ref.current as LineCanvasHost | null;
    const box = slot.current;
    if (!enabled || !host || !box) return;
    let alive = true;
    let stop = () => undefined as void;
    const start = (data: LineArtData) => {
      // the finished ink masks a wrapper, not the canvas: a canvas update then never repaints (re-records) the mask.
      // The wrapper is laid out `res` times larger and scaled back down: WebKit rasterises an SVG mask image (and its
      // brush filter) at CSS-pixel resolution, so on a 2x screen the grain would come out blurred at 1x size
      const frame = document.createElement('span');
      frame.className = 'line-art__ink';
      frame.style.aspectRatio = `${data.viewBox[2]} / ${data.viewBox[3]}`;
      const wrap = document.createElement('span');
      wrap.className = 'line-art__ink-res';
      const res = Math.min(3, Math.max(1, Math.ceil((window.devicePixelRatio || 1) - 0.01)));
      if (res > 1) {
        wrap.style.width = wrap.style.height = `${res * 100}%`;
        wrap.style.transform = `scale(${1 / res})`;
      }
      wrap.style.setProperty('--line-art-ink', data.fallbackInk);
      const url = `url("${inkUrl(motif, data)}")`;
      wrap.style.setProperty('-webkit-mask-image', url);
      wrap.style.setProperty('mask-image', url);
      frame.appendChild(wrap);
      box.replaceChildren(frame);
      // none drawn yet: nothing to composite; complete: the ink alone, painted once like any static box (the canvas
      // and its masked layer only exist on screen while the drawing moves)
      let phase = '';
      const setPhase = (p: number) => {
        const next = p <= 0 ? 'none' : p >= 1 ? 'done' : 'drawing';
        if (next === phase) return;
        phase = next;
        frame.setAttribute('data-phase', next);
      };
      if (tier === 'none' || typeof IntersectionObserver === 'undefined') {
        // the art is simply there
        setPhase(1);
        host.lineArtDrawn = () => 1;
        cb.current.onReady();
        return () => undefined;
      }
      const opts = { overlap, mode, lift, reverse };
      let renderer: LineRenderer;
      let state = { p: 0, width: 0, ink: '' };
      const dpr = () => window.devicePixelRatio || 1;
      const redraw = () => renderer.update(state.p, state.width, dpr(), state.ink);
      const mount = () => {
        const c = document.createElement('canvas');
        c.className = 'line-art__canvas';
        wrap.replaceChildren(c);
        renderer = lineRenderer(c, data, opts, inkOf(host, data), () => {
          // the worker gave up on it: a new canvas, painted here, at the progress it had
          if (!alive) return;
          mount();
          redraw();
        });
      };
      mount();
      setPhase(0);
      host.lineArtDrawn = () => renderer.drawn();
      cb.current.onReady();
      const caption = followCaption(host, captionAt);
      let docTop = 0;
      let width = 0;
      let ink = '';
      const remove = addScrollItem({
        measure(scrollY) {
          const r = host.getBoundingClientRect();
          docTop = r.top + scrollY;
          width = r.width;
          ink = inkOf(host, data);
        },
        update(scrollY, vh) {
          // writes only: the renderer paints (or posts to its worker) only what changed
          const p = scrollDrawProgress(docTop - scrollY, vh);
          state = { p, width, ink };
          redraw();
          setPhase(p);
          caption.update(p);
        },
      });
      return () => {
        remove();
        caption.stop();
        renderer.destroy();
      };
    };
    const load = () =>
      loadLineSvg(motif).then(
        (text) => {
          if (!alive) return;
          try {
            stop = start(lineArtData(motif, text));
          } catch {
            // no 2D context after all, or art it cannot read: the <img> stays the art
            box.replaceChildren();
            cb.current.onFail();
          }
        },
        () => alive && cb.current.onFail(),
      );
    // set up only when the art comes within a viewport and a half (nothing of it is needed at load)
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === 'undefined') void load();
    else {
      io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          io?.disconnect();
          void load();
        },
        { rootMargin: '150% 0px 150% 0px' },
      );
      io.observe(host);
    }
    return () => {
      alive = false;
      io?.disconnect();
      stop();
      delete host.lineArtDrawn;
      box.replaceChildren();
    };
    // the draw options are described by optsKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, slot, motif, enabled, tier, captionAt, optsKey]);
}
