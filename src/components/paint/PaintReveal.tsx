// <PaintReveal> (spec 3.5): the section's painting is brushed in over the previous one, like the video's
// P.paintReveal, cheaply enough for phones. Render it inside the section's sticky frame (PlateSection `layers`, last).
//
// Stage: until its reveal, the frame shows the previous section's ground (--prev-ground) with paper grain over the
// plate layers (`data-paint="pending"` on the section), and <BrushEdge> gives the section's top a ragged dry-brush edge.
// Trigger: the section's top crosses 75% of the viewport height (REVEAL_LINE), scrolling down, first time only: never
// later than the section's own content trigger (25% of a section at least one viewport tall is in view at 75%), so the
// text never waits on a bare stage until its safety timer gives up (spec 3.5 says 70%; at 70% a section shorter than
// 1.2 viewports could trigger its text first and show it over the previous ground). The content timeline
// (3.4) is held until 70% of the reveal. A section in view but short of the line starts once the scroll has rested
// 0.9 s; a flick past the line skips the brush; one brush runs at a time. Technique: one <canvas> over the frame at
// 1x (scaled by CSS), at most 1600 px on the long side, painted once as the stage (the previous ground and its paper grain, the same as
// .reveal-ground); bristle stamps (textures/brush-stamps.webp) laid along a few seeded stroke paths per style then
// erase it (`destination-out`), each frame drawing only its new stamps, so the section's own <picture> (plate + gold,
// with its drift and scroll shift) shows through the brush marks: there is no copy of the plate to decode, composite
// or hand over, and no frame copies a whole canvas (that was most of the main thread while scrolling, G-PERF-1). The
// Reception's teal lead is painted on the stage just ahead of the brush; the closing's bloom erases a growing light.
// The last 14% fades the rest of the stage out (canvas opacity). The canvas is released at the end (at most one
// reveal exists at a time).
// Fallbacks: lite = a 500 ms crossfade of the plate over the ground; plate not decoded in 1.5 s = a 400 ms fade;
// leaving the viewport mid-reveal, a nav jump past it, or entering from below = the plate at once; none / no JS = the
// plate is simply there (only JS ever sets the pending state).
import { useEffect, useRef } from 'react';
import stampsUrl from '../../assets/textures/brush-stamps.webp';
import paperUrl from '../../assets/textures/paper-512.webp';
import {
  FrameProbe,
  MOTION,
  addAnimator,
  clamp01,
  easeInOutSine,
  easeSine,
  markRevealed,
  rng,
  smoothstep,
  wasRevealed,
} from '../../lib/motion';
import { sectionClockOf, useMotion } from '../motion/MotionProvider';
import { CELL, DAB, buildRevealPlan, type RevealSpec, type Stamp } from '../motion/revealPlan';

export type { RevealSpec, RevealStyle } from '../motion/revealPlan';

/* --------------------------------------------------------------------------------------------- runtime */

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function release(...cs: Array<HTMLCanvasElement | null | undefined>) {
  for (const c of cs) {
    if (!c) continue;
    c.width = 0;
    c.height = 0;
  }
}

/** Resolve when the image has decoded, or reject after `ms`. */
function decoded(img: HTMLImageElement, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error('decode timeout')), ms);
    const done = () => {
      window.clearTimeout(t);
      resolve();
    };
    const fail = () => {
      window.clearTimeout(t);
      reject(new Error('decode failed'));
    };
    const go = () => {
      if (typeof img.decode === 'function') img.decode().then(done, () => (img.naturalWidth ? done() : fail()));
      else done();
    };
    if (img.complete && img.naturalWidth > 0) go();
    else {
      // a lazy plate may not have started: ask for it now
      if (img.loading === 'lazy') img.loading = 'eager';
      img.addEventListener('load', go, { once: true });
      img.addEventListener('error', fail, { once: true });
    }
  });
}

let stampsImg: HTMLImageElement | null = null;
let stampsReady: Promise<HTMLImageElement> | null = null;
function loadStamps(): Promise<HTMLImageElement> {
  if (stampsReady) return stampsReady;
  stampsImg = new Image();
  stampsImg.decoding = 'async';
  stampsImg.src = stampsUrl;
  stampsReady = (typeof stampsImg.decode === 'function' ? stampsImg.decode() : Promise.resolve()).then(
    () => stampsImg as HTMLImageElement,
  );
  stampsReady.catch(() => {
    stampsReady = null;
  });
  return stampsReady;
}

let paperReady: Promise<HTMLImageElement> | null = null;
/** The paper grain of the stage (the same texture as .reveal-ground::after). */
function loadPaper(): Promise<HTMLImageElement> {
  if (paperReady) return paperReady;
  const im = new Image();
  im.decoding = 'async';
  im.src = paperUrl;
  paperReady = (typeof im.decode === 'function' ? im.decode() : Promise.resolve()).then(() => im);
  paperReady.catch(() => {
    paperReady = null;
  });
  return paperReady;
}

/** The stamp sprite in one colour (the Reception's lead), as a bitmap so drawing it never copies a canvas. */
async function tintedStamps(img: HTMLImageElement, color: string): Promise<CanvasImageSource> {
  const c = makeCanvas(img.naturalWidth || CELL * 6, img.naturalHeight || CELL);
  const t = c.getContext('2d');
  if (!t) return img;
  t.drawImage(img, 0, 0);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = color;
  t.fillRect(0, 0, c.width, c.height);
  if (typeof createImageBitmap !== 'function') return c;
  try {
    const b = await createImageBitmap(c);
    release(c);
    return b;
  } catch {
    return c;
  }
}

function drawStamp(g: CanvasRenderingContext2D, img: CanvasImageSource, s: Stamp, k = 1) {
  const c = Math.cos(s.a) * s.s * k;
  const n = Math.sin(s.a) * s.s * k;
  g.setTransform(c, n, -n, c, s.x, s.y);
  g.globalAlpha = s.alpha;
  g.drawImage(img, s.cell * CELL, 0, CELL, CELL, -CELL / 2, -CELL / 2, CELL, CELL);
}

/** One canvas frame of the bloom: an irregular, feathered light growing from the origin, with dry-brush bristles. */
function drawBloom(
  g: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  W: number,
  H: number,
  o: [number, number],
  q: number,
  seed: number,
) {
  const cx = o[0] * W;
  const cy = o[1] * H;
  const corner = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
  const feather = 0.22 * Math.max(W, H);
  const e = 0.45 * q + 0.55 * easeInOutSine(q);
  // an ease-in onset (no cloud on the first frame), the area growing about evenly afterwards
  const R = (corner * 1.18 + feather) * Math.pow(e, 0.8);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  // the light erases the stage it grows over (it only grows, so each frame adds to the last)
  g.globalCompositeOperation = 'destination-out';
  if (R <= 1) return;
  const r = rng(`bloom:${seed}`);
  const N = 72;
  const ph1 = r() * 10;
  const ph2 = r() * 10;
  const shape = (a: number) => {
    const s = Math.sin(a);
    // reaches further upward (the top edge is the farthest from the lamp), a little wider than tall below
    const up = 1 + 0.28 * Math.max(0, -s) + 0.06 * Math.cos(a) ** 2;
    const n =
      0.55 * Math.sin(a * 3 + ph1 + q * 1.4) + 0.3 * Math.sin(a * 7 + ph2 - q) + 0.15 * Math.sin(a * 13 + ph1 * 2);
    return up * (1 + 0.1 * n);
  };
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.25);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(Math.max(0, 1 - (feather * 1.4) / (R * 1.25)), 'rgba(255,255,255,1)');
  grad.addColorStop(0.92, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = R * 1.25 * shape(a);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.fill();
  // bristles on the soft edge: dabs laid along the rays, riding out with the edge
  if (img) {
    const NB = 56;
    for (let i = 0; i < NB; i++) {
      const a = ((i + r.range(-0.4, 0.4)) / NB) * Math.PI * 2;
      const rr = R * shape(a) * r.range(0.86, 1.04);
      drawStamp(g, img, {
        d: 0,
        x: cx + Math.cos(a) * rr,
        y: cy + Math.sin(a) * rr,
        a,
        s: (feather * r.range(0.35, 0.6)) / (CELL * DAB),
        cell: i % 6,
        alpha: r.range(0.35, 0.7),
      });
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
  }
}

type Phase = 'pending' | 'run' | 'fade' | 'done';

/** The share of the viewport height the section's top has to cross for its brush to start. */
const REVEAL_LINE = 0.75;
/** A section whose top is below the line but already in view starts its brush once the scroll has rested this long
 *  (a guest who stops with only the top of the next painting showing never looks at a half-staged edge, QA r1 D18). */
const REST_START_MS = 900;
/** A section crossing the line this fast (its top would reach the viewport top within this time) is a flick: no
 *  brush, the painting is simply there (QA r1 M3). */
const FLICK_MS = 500;

/* At most one reveal runs at a time (spec 3.5: one canvas, iOS canvas memory; QA r1 M3: a flick ran three at once and
   every brush added its frame cost): a new brush finishes the running one at once. */
let running: ((instant: boolean) => void) | null = null;
/* The runtime probe (3.3) watches the first brush only: a later slow frame (a busy moment, a big decode) never
   demotes a device the first reveal found fast (QA r1 M4). */
let probeUsed = false;

/* the scroll speed (px/ms, + = down) from the last scroll events, for the flick test */
let speedT = 0;
let speedY = 0;
let speed = 0;
let speedListening = false;
function listenSpeed() {
  if (speedListening || typeof window === 'undefined') return;
  speedListening = true;
  speedT = performance.now();
  speedY = window.scrollY;
  window.addEventListener(
    'scroll',
    () => {
      const t = performance.now();
      const y = window.scrollY;
      const dt = t - speedT;
      speed = dt > 0 && dt < 200 ? 0.5 * speed + 0.5 * ((y - speedY) / dt) : 0;
      speedT = t;
      speedY = y;
    },
    { passive: true },
  );
}
function scrollSpeed(): number {
  return performance.now() - speedT > 150 ? 0 : speed;
}

export function PaintReveal(spec: RevealSpec) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { tier, demote } = useMotion();
  const { style, seed, tilt, lead } = spec;
  const originKey = spec.origin?.join(',') ?? '';
  const originSelector = spec.originSelector;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || tier === 'none' || typeof IntersectionObserver === 'undefined') return;
    const sc = sectionClockOf(canvas);
    const section = canvas.closest<HTMLElement>('.plate-section') ?? sc?.section;
    if (!section) return;
    const id = section.dataset.section ?? '';
    if (wasRevealed(id) || sc?.clock.start) return;
    const h0 = window.innerHeight || document.documentElement.clientHeight;
    if (section.getBoundingClientRect().top < h0 * REVEAL_LINE) {
      markRevealed(id); // reached already at mount (deep link, first screen): the plate is simply there
      return;
    }

    const frame = canvas.parentElement as HTMLElement;
    const setPhase = (p: Phase | null) => {
      if (p) section.dataset.paint = p;
      else delete section.dataset.paint;
    };
    setPhase('pending');
    const releaseHold = sc?.clock.hold() ?? (() => undefined);
    if (tier === 'full') void loadStamps().catch(() => undefined);
    listenSpeed();

    let phase: Phase = 'pending';
    let stop: (() => void) | null = null;
    let timers: number[] = [];
    let canvases: HTMLCanvasElement[] = [];
    let alive = true;

    const cleanupCanvases = () => {
      release(canvas, ...canvases);
      canvases = [];
      canvas.style.opacity = '';
    };
    const finish = (instant: boolean) => {
      if (phase === 'done' || !alive) return;
      phase = 'done';
      if (running === finish) running = null;
      stop?.();
      stop = null;
      releaseHold();
      markRevealed(id);
      if (instant) {
        setPhase(null);
        cleanupCanvases();
        return;
      }
      setPhase('done');
      // the static picture is under the canvas's last frame: drop the canvas next frame, the classes after the
      // late layers' fade-in
      requestAnimationFrame(cleanupCanvases);
      timers.push(window.setTimeout(() => alive && section.dataset.paint === 'done' && setPhase(null), 1200));
    };
    const fade = (ms: number) => {
      if (phase !== 'pending') return;
      phase = 'fade';
      section.style.setProperty('--fade-dur', `${ms}ms`);
      setPhase('fade');
      timers.push(window.setTimeout(releaseHold, ms * MOTION.revealHandOff));
      timers.push(
        window.setTimeout(() => {
          phase = 'run';
          finish(false);
          section.style.removeProperty('--fade-dur');
        }, ms),
      );
    };

    const brush = async () => {
      const img = section.querySelector<HTMLImageElement>('.plate img');
      if (!img) return finish(true);
      let stamps: HTMLImageElement | null = null;
      try {
        await decoded(img, MOTION.decodeWait);
        stamps = await Promise.race([
          loadStamps(),
          new Promise<null>((res) => window.setTimeout(() => res(null), 300)),
        ]);
      } catch {
        if (alive) fade(MOTION.decodeFallbackFade);
        return;
      }
      if (!alive || phase !== 'pending') return;
      if (!stamps && style !== 'bloom') return fade(MOTION.decodeFallbackFade);

      // geometry, read once here (never inside the frame loop). The canvas is drawn at 1x and scaled by CSS: the
      // stage is a soft ground and the brush marks soft-edged, and a 3x phone paints 2.25x fewer pixels per frame
      // than at 1.5x (QA r1 T14)
      const fr = frame.getBoundingClientRect();
      const fw = Math.max(1, frame.clientWidth);
      const fh = Math.max(1, frame.clientHeight);
      const k = Math.min(1, 1600 / Math.max(fw, fh));
      const W = Math.max(1, Math.round(fw * k));
      const H = Math.max(1, Math.round(fh * k));
      const css = getComputedStyle(section);
      const ground =
        css.getPropertyValue('--prev-ground').trim() || css.getPropertyValue('--paper').trim() || '#f2e8d8';

      let origin = spec.origin;
      if (originSelector) {
        const el = section.querySelector<HTMLElement>(originSelector);
        const er = el?.getBoundingClientRect();
        if (er && er.width > 0)
          origin = [
            clamp01((er.left + er.width / 2 - fr.left) / fw),
            Math.min(1.15, Math.max(-0.1, (er.top + er.height / 2 - fr.top) / fh)),
          ];
      }
      const plan = buildRevealPlan({ style, seed, tilt, lead }, W, H, origin);
      const [paper, leadStamps] = await Promise.all([
        Promise.race([loadPaper(), new Promise<null>((res) => window.setTimeout(() => res(null), 150))]).catch(
          () => null,
        ),
        lead && stamps ? tintedStamps(stamps, lead) : Promise.resolve(null),
      ]);
      if (!alive || phase !== 'pending') return;
      const g = canvas.getContext('2d');
      if (!g) return fade(MOTION.decodeFallbackFade);
      canvas.width = W;
      canvas.height = H;
      // the stage, as .reveal-ground draws it: the previous ground with the paper grain in soft-light at .18
      g.fillStyle = ground;
      g.fillRect(0, 0, W, H);
      const grain = paper ? g.createPattern(paper, 'repeat') : null;
      if (grain && paper) {
        grain.setTransform?.(new DOMMatrix().scale((512 * k) / (paper.naturalWidth || 512)));
        g.globalCompositeOperation = 'soft-light';
        g.globalAlpha = 0.18;
        g.fillStyle = grain;
        g.fillRect(0, 0, W, H);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }

      const cursor = new Int32Array(plan.strokes.length);
      const leadCursor = new Int32Array(plan.strokes.length);
      const probe = new FrameProbe();
      let probed = probeUsed;
      probeUsed = true;
      let handed = false;
      const t0 = performance.now();
      phase = 'run';
      setPhase('run');

      const lay = (img: CanvasImageSource, op: GlobalCompositeOperation, cur: Int32Array, p: number) => {
        let n = 0;
        g.globalCompositeOperation = op;
        plan.strokes.forEach((s, i) => {
          const u = (p - s.t0) / (s.t1 - s.t0);
          if (u <= 0) return;
          const head = easeInOutSine(clamp01(u)) * s.length;
          let j = cur[i] as number;
          while (j < s.stamps.length && (s.stamps[j] as Stamp).d <= head) {
            drawStamp(g, img, s.stamps[j] as Stamp);
            j++;
            n++;
          }
          cur[i] = j;
        });
        return n;
      };

      stop = addAnimator((now) => {
        if (!alive) return false;
        const q = clamp01((now - t0) / MOTION.tReveal);
        if (!probed) {
          const v = probe.tick(now);
          if (v) {
            probed = true;
            if (v === 'lite') demote();
          }
        }
        if (!handed && q >= MOTION.revealHandOff) {
          handed = true;
          releaseHold();
        }
        let fl: number;
        if (plan.bloom) {
          drawBloom(g, stamps, W, H, plan.origin, q, seed);
          fl = 1 - (1 - 0.15 * smoothstep(0.05, 1, q)) * (1 - smoothstep(0.7, 1, q));
        } else {
          const p = easeSine(q);
          // the lead underpainting runs just ahead of the brush, on the stage; the brush then erases both
          if (leadStamps)
            lay(leadStamps, 'source-over', leadCursor, Math.min(1, p + 0.18 * easeInOutSine(clamp01(q / 0.25))));
          lay(stamps as HTMLImageElement, 'destination-out', cursor, p);
          fl = smoothstep(0.86, 1, q);
        }
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        // what the brush has not reached yet fades out at the end (compositor only)
        if (fl > 0) canvas.style.opacity = String(Math.max(0, 1 - fl));
        if (q >= 1) {
          if (!probed && probe.verdict() === 'lite') demote();
          finish(false);
          return false;
        }
        return true;
      });
    };

    const start = () => {
      if (phase !== 'pending') return;
      window.clearTimeout(restTimer);
      trig.disconnect();
      peek.disconnect();
      // one brush at a time: the one still running (a fast scroll) is finished at once
      if (running && running !== finish) running(true);
      running = finish;
      if (tier === 'lite') fade(MOTION.liteFade);
      else void brush();
    };

    // the brush starts when the section's top crosses REVEAL_LINE of the viewport, scrolling down
    const trig = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || phase !== 'pending') continue;
          trig.disconnect();
          const top = e.boundingClientRect.top;
          const v = scrollSpeed();
          if (top <= 0)
            finish(true); // entered from below or jumped to: no brush
          else if (v > 0 && top / v < FLICK_MS)
            finish(true); // a flick: the painting is simply there
          else start();
        }
      },
      { rootMargin: `0px 0px -${Math.round((1 - REVEAL_LINE) * 100)}% 0px`, threshold: 0 },
    );
    trig.observe(section);
    // in view but short of the line, and the guest has stopped scrolling: brush it in now
    let restTimer = 0;
    let peeking = false;
    const restCheck = () => {
      if (!peeking || phase !== 'pending') return;
      if (scrollSpeed() !== 0) restTimer = window.setTimeout(restCheck, REST_START_MS);
      else start();
    };
    const peek = new IntersectionObserver((entries) => {
      for (const e of entries) {
        peeking = e.isIntersecting && phase === 'pending';
        window.clearTimeout(restTimer);
        if (peeking) restTimer = window.setTimeout(restCheck, REST_START_MS);
      }
    });
    peek.observe(section);
    // leaving the viewport mid-reveal completes it at once (fast scrolling)
    const away = new IntersectionObserver((entries) => {
      for (const e of entries) if (!e.isIntersecting && (phase === 'run' || phase === 'fade')) finish(true);
    });
    away.observe(section);
    // the nav jumped past this section: its clock finished at once
    const unsub = sc?.clock.subscribe((s) => {
      if (s.instant && phase === 'pending') finish(true);
    });

    return () => {
      alive = false;
      if (running === finish) running = null;
      trig.disconnect();
      peek.disconnect();
      window.clearTimeout(restTimer);
      away.disconnect();
      unsub?.();
      stop?.();
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
      releaseHold();
      cleanupCanvases();
      section.style.removeProperty('--fade-dur');
      delete section.dataset.paint;
      if (phase !== 'done') phase = 'done';
    };
    // originKey stands for spec.origin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, style, seed, tilt, lead, originKey, originSelector, demote]);

  return (
    <>
      <div className="reveal-ground" aria-hidden="true" />
      <canvas ref={canvasRef} className="reveal-canvas" aria-hidden="true" width={0} height={0} />
    </>
  );
}
