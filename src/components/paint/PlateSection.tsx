// A painted section (spec 5.3): a sticky full-viewport frame (LQIP ground, the plate's <picture>, the gold layer, the
// motion layers, hairlines) under the scrolling content. The frame is 100lvh and pinned while the content scrolls, so a
// section taller than the viewport never clips; the content is at least 100svh and pads for the bar and safe areas.
// Transform ownership (3.4): .plate-scroll = scroll shift, .plate-pointer = parallax, the images = idle drift.
// Every plate section gets the motion layers of spec 3.5/3.6 by its plate id (FrameLayers): the veil and live strokes,
// the section's budgeted idle motions (sweep, glow, edge motifs, evening lights, particles), and, except the opening,
// the paint-reveal that brushes it in over the previous section's ground (with the ragged BrushEdge on its top).
import { startTransition, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { EventKey } from '../../i18n/types';
import type { Palette } from '../../lib/palettes';
import { DEEP_PALETTES } from '../../lib/palettes';
import { floorVars, lqipVars, plateEntry } from '../../lib/plates';
import { coupleImage } from '../../lib/sprites';
import type { SectionId } from '../../lib/sections';
import { usePageOptional } from '../../state/page';
import { PARTICLES } from '../motion/layers';
import { useMotion } from '../motion/MotionProvider';
import { clockFor } from '../../lib/motion';
import { useIsomorphicLayoutEffect } from '../../lib/dom';
import { REVEALS } from '../motion/revealPlan';
import { EdgeMotifs } from '../motifs/EdgeMotifs';
import { EveningLights } from '../motifs/EveningLights';
import { Particles } from '../motifs/Particles';
import { BrushEdge } from './BrushEdge';
import { GlowPulse } from './GlowPulse';
import { GoldLayer } from './GoldLayer';
import { Hairlines } from './Hairlines';
import { LightSweep } from './LightSweep';
import { LiveStrokes } from './LiveStrokes';
import { PaintReveal } from './PaintReveal';
import { Plate, Sources } from './Plate';
import { Veil } from './Veil';

/* The section budgets of spec 3.6 (continuous motions besides the plate drift, at most three per viewport):
   opening = sparks + shimmer + glow; invitation = sweep; mehndi = leaves + strand sway + sweep; engagement = petals +
   toran sway + sweep; haldi = petals + leaf + sweep; wedding = sparks + couple breathing + sweep; reception = lights +
   couple breathing + sweep; cultures = sweep; closing = flame + dust + glow. The closing's ring and joiner also
   shimmer (3.6 gold shimmer: monograms and joiners), so its glow is the diya's own (the flame group) and the plate's
   glow pulse stays off there. The veil and live strokes are part of the plate's drift ([data-drift]). */
const SWEEP: ReadonlySet<string> = new Set([
  'invitation',
  'mehndi',
  'engagement',
  'haldi',
  'wedding',
  'reception',
  'cultures',
]);
const GLOW: ReadonlySet<string> = new Set(['opening']);
const EDGE: Readonly<Record<string, EventKey>> = {
  mehndi: 'mehndi',
  engagement: 'engagement',
  haldi: 'haldi',
  reception: 'reception',
};

/** The paper of the bands (palettes.css --paper), the previous ground when a plate section follows a band. */
const BAND_GROUND: Readonly<Partial<Record<SectionId, string>>> = {
  countdown: '#f2e8d8',
  celebrations: '#f2e8d8',
  venues: '#f3e6dc',
  rsvp: '#f2e8d8',
  gallery: '#f2e8d8',
};

/** The ground the paint-reveal starts from (3.5): the previous visible section's painted ground mid, or its paper. */
function previousGround(id: string, visible: readonly SectionId[] | undefined): string | undefined {
  if (!visible) return undefined;
  const i = visible.indexOf(id as SectionId);
  if (i <= 0) return undefined;
  const prev = visible[i - 1] as SectionId;
  return plateEntry(prev)?.groundMid ?? BAND_GROUND[prev];
}

/** The motion layers of a plate's sticky frame (3.5, 3.6), between the gold and the hairlines, in paint order. Each
 *  gates itself by tier (the veil, strokes, sweep, glow and lights are full-tier only; nothing moves under none).
 *  The motion-only idle layers mount once the opening's entrance is over (MotionProvider layersReady), one section per
 *  idle moment or as soon as the section comes within a viewport of the screen: mounting all of them in the commit
 *  that starts the opening froze its first half second on a mid-range phone (QA r1 M1). The edge motifs (part of the
 *  card, still under reduced motion) and the paint-reveal (it must set its stage before the section is seen) are
 *  always there. */
export function FrameLayers({ plate, idle = true }: { plate: string; idle?: boolean }) {
  const edge = EDGE[plate];
  const reveal = plate === 'opening' ? undefined : REVEALS[plate];
  return (
    <>
      {idle && <Veil plate={plate} />}
      {idle && SWEEP.has(plate) && <LightSweep />}
      {idle && GLOW.has(plate) && <GlowPulse plate={plate} />}
      {/* the edge motifs are part of the card (still under reduced motion and without JS): always there */}
      {edge && <EdgeMotifs event={edge} />}
      {idle && <LiveStrokes plate={plate} />}
      {idle && plate === 'reception' && <EveningLights />}
      {idle && PARTICLES[plate] && <Particles preset={plate} />}
      {reveal && <PaintReveal {...reveal} />}
    </>
  );
}

const NEAR = 'near-view';

/* The idle layers of the sections further down mount one section per idle moment once the opening has settled
   (layersReady), nearest first, so a scroll rarely has to mount them itself mid-flick (QA r1 M1, T14). */
type Ric = (cb: () => void, o?: { timeout: number }) => number;
const queue: Array<() => void> = [];
let pumping = false;
function idleTurn(fn: () => void) {
  queue.push(fn);
  if (pumping) return;
  pumping = true;
  const ric: Ric =
    (window as Window & { requestIdleCallback?: Ric }).requestIdleCallback ?? ((cb) => window.setTimeout(cb, 120));
  const step = () => {
    const next = queue.shift();
    if (!next) {
      pumping = false;
      return;
    }
    next();
    ric(step, { timeout: 1500 });
  };
  ric(step, { timeout: 1500 });
}

/** Whether the section has come within a viewport of the screen (sticky: true from then on), and the `near-view` class
 *  while it is within one: off-screen sections drop their idle animations entirely instead of keeping them paused,
 *  so they hold no compositor layers (QA r1 M7, motion.css). */
function useNearView(ref: { current: HTMLElement | null }): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          el.classList.toggle(NEAR, e.isIntersecting);
          if (e.isIntersecting) startTransition(() => setNear(true));
        }
      },
      { rootMargin: '100% 0px 100% 0px', threshold: 0 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      el.classList.remove(NEAR);
    };
  }, [ref]);
  return near;
}

export interface PlateSectionProps {
  id: string;
  palette: Palette;
  /** plates.json id; defaults to the section id. Unknown ids show the palette's paper (no plate). */
  plate?: string;
  labelledBy?: string;
  label?: string;
  className?: string;
  /** Eager, high priority (6.6). Defaults to true for the opening plate (the LCP element); everything else is lazy. */
  eager?: boolean;
  /** The layers inside the sticky frame, between the gold layer and the hairlines (veil, sweep, glow, edge motifs,
   *  live strokes, the reveal canvas: spec 3). Defaults to the plate's own set (FrameLayers). */
  layers?: ReactNode;
  /** The previous section's ground (mid), for the paint-reveal stage (3.5); exposed as --prev-ground. Defaults to the
   *  previous visible section's ground (previousGround). */
  prevGround?: string;
  children: ReactNode;
}

export function PlateSection({
  id,
  palette,
  plate,
  labelledBy,
  label,
  className = '',
  eager,
  layers,
  prevGround,
  children,
}: PlateSectionProps) {
  const plateId = plate ?? id;
  const entry = plateEntry(plateId);
  const isEager = eager ?? plateId === 'opening';
  const page = usePageOptional();
  const ground = prevGround ?? previousGround(id, page?.visible);
  const ref = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const near = useNearView(ref);
  const { layersReady } = useMotion();
  const [turn, setTurn] = useState(false);
  useEffect(() => {
    if (!layersReady || turn) return;
    let alive = true;
    idleTurn(() => alive && startTransition(() => setTurn(true)));
    return () => {
      alive = false;
    };
  }, [layersReady, turn]);
  const idle = layersReady && (near || turn);
  // idle layers that arrive after the section's own timeline has begun (the opening's, after its entrance) fade in
  // (motion.css .frame[data-late]); the others are still behind the section's paint-reveal stage when they mount
  useIsomorphicLayoutEffect(() => {
    const frame = frameRef.current;
    if (!idle || !frame || !clockFor(id, ref.current).start) return;
    frame.setAttribute('data-late', '');
    const t = window.setTimeout(() => frame.removeAttribute('data-late'), 1200);
    return () => {
      window.clearTimeout(t);
      frame.removeAttribute('data-late');
    };
  }, [idle, id]);
  // the paint-reveal (in FrameLayers) comes with its ragged top edge; a caller that passes its own layers owns both
  const reveals = layers === undefined && Boolean(entry) && plateId !== 'opening' && Boolean(REVEALS[plateId]);
  const style = {
    ...(entry ? { ...lqipVars(plateId), ...floorVars(plateId), '--focal': entry.focal } : {}),
    ...(ground ? { '--prev-ground': ground } : {}),
  } as CSSProperties;
  return (
    <section
      ref={ref}
      id={id}
      data-section={id}
      data-plate={plateId}
      data-tone={DEEP_PALETTES.has(palette) ? 'deep' : 'light'}
      className={`plate-section pal-${palette} ${className}`.trim()}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      style={style}
    >
      <div ref={frameRef} className="frame" aria-hidden="true">
        {entry ? <div className="frame__ground" /> : <div className="frame__paper" />}
        {entry && (
          <div className="plate-scroll">
            <div className="plate-pointer">
              <Plate id={plateId} eager={isEager} />
              <GoldLayer id={plateId} />
            </div>
          </div>
        )}
        {layers ?? (entry ? <FrameLayers plate={plateId} idle={idle} /> : null)}
        <Hairlines />
      </div>
      <div className="content">{children}</div>
      {/* positioned above the section's top edge, over the previous painting; after the content in the DOM */}
      {reveals && <BrushEdge />}
    </section>
  );
}

/**
 * An event couple (2.3.4) sized by the layout table (5.2): the figure box takes the layout's couple height (CSS), the
 * sprite inside is drawn at heightScale of it, standing at the box's foot. `sizes` lets the browser fetch by the drawn
 * width; lazy and async (6.6).
 */
export function CoupleFigure({ event, alt, className = '' }: { event: string; alt: string; className?: string }) {
  const c = coupleImage(event);
  if (!c) return <figure className={`couple couple--empty ${className}`.trim()} aria-hidden="true" />;
  return (
    <figure className={`couple ${className}`.trim()} data-couple={event} style={c.vars as CSSProperties}>
      <picture className="couple__pic">
        <Sources sources={c.sources} />
        <img
          src={c.img.src}
          srcSet={c.img.srcSet}
          sizes={c.img.sizes}
          width={c.img.width}
          height={c.img.height}
          alt={alt}
          decoding="async"
          loading="lazy"
          draggable={false}
        />
      </picture>
    </figure>
  );
}
