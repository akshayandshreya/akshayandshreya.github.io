// The gold system of the card (spec 1.4), as small React pieces. Text always comes from the caller (t() / the copy);
// nothing here holds a word.
//   <GoldLeaf>       gold-leaf text: a gradient + leaf texture clipped to the glyphs (.gold-leaf, typography.css). Only
//                    for the opening heading, both monograms and the "&" / "ও" joiners.
//   <GoldBrushRule>  card.js goldRule: two gentle tapered brush strokes meeting at a gilded bindu.
//   <GoldBrushRing>  card.js goldRing: two tapered arcs from the bottom up to a 14 degree gap at the top, a bindu in it.
//   <Bindu>          the small gilded dot (radial gold-3 -> gold-2 -> gold-1 -> transparent).
// Strokes are SVG: each is a filled, tapered ribbon (gradient through --gold-0..3) plus a thin sheen line on its upper
// edge (the "two paths per stroke"). Every ribbon is revealed through a mask whose centreline has pathLength=1, so the
// motion layer can draw a stroke on by animating `stroke-dashoffset` of `.brush-draw` from 1 to 0; at rest the mask is
// fully open (no animation needed to see it). Geometry is deterministic (seeded), so SSR and hydration agree.
import { useId, type CSSProperties, type ElementType, type ReactNode } from 'react';

/* ---------------------------------------------------------------------------------------------- gold-leaf text */

export interface GoldLeafProps {
  as?: ElementType;
  className?: string;
  /** the glint crosses once every half phrase (motion.css; full tier only). Off for running text. */
  shimmer?: boolean;
  children: ReactNode;
  style?: CSSProperties;
  [attr: string]: unknown;
}

export function GoldLeaf({ as: Tag = 'span', className = '', shimmer = true, children, ...rest }: GoldLeafProps) {
  const cls = ['gold-leaf', shimmer ? 'gold-leaf--shimmer' : '', className].filter(Boolean).join(' ');
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}

/* ---------------------------------------------------------------------------------------------------- geometry */

export type Pt = readonly [number, number];

/** a small deterministic PRNG (mulberry32 on an FNV-1a hash of the key) */
export function rng(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
/** indexed access for arrays the loops below keep in range (noUncheckedIndexedAccess) */
const at = <T,>(a: readonly T[], i: number): T => a[Math.max(0, Math.min(a.length - 1, i))] as T;
const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export interface RibbonOpts {
  /** full width at the fattest point, in viewBox units */
  width: number;
  /** [start, end] fractions of the length over which the stroke swells in and thins out */
  taper: readonly [number, number];
  /** 0..1: how much the brush pressure wanders along the stroke (paint.js goldStroke `pressure`) */
  pressure: number;
  seed: string;
}

/** half-width profile along a stroke, u in [0, 1] (exported for tests) */
export function ribbonProfile(n: number, o: RibbonOpts): number[] {
  const r = rng('pressure:' + o.seed);
  const k1 = 0.9 + r() * 1.6;
  const k2 = 2.3 + r() * 2.1;
  const p1 = r() * 6.283;
  const p2 = r() * 6.283;
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const swell = smooth(u / Math.max(1e-3, o.taper[0])) * smooth((1 - u) / Math.max(1e-3, o.taper[1]));
    const wander =
      1 - o.pressure * 0.32 * (0.5 + 0.5 * Math.sin(u * k1 * 6.283 + p1)) * (0.6 + 0.4 * Math.sin(u * k2 * 6.283 + p2));
    // a hair of width survives at both ends, so the tips read as a brush lifting off, not a hard point
    out.push((o.width / 2) * Math.max(0.06, swell * wander));
  }
  return out;
}

/** a closed path `d` for a tapered ribbon along `pts`: left edge forward, rounded tip, right edge back */
export function ribbonPath(pts: readonly Pt[], o: RibbonOpts): string {
  const n = pts.length - 1;
  const hw = ribbonProfile(n, o);
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = at(pts, i - 1);
    const b = at(pts, i + 1);
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const [x, y] = at(pts, i);
    const w = at(hw, i);
    left.push([x - ty * w, y + tx * w]);
    right.push([x + ty * w, y - tx * w]);
  }
  const fmt = (p: Pt) => `${r2(p[0])} ${r2(p[1])}`;
  // round caps: a quadratic past each end of the centreline, a little beyond the last point
  const tip = (p: Pt, q: Pt): Pt => [p[0] + (p[0] - q[0]) * 0.6, p[1] + (p[1] - q[1]) * 0.6];
  const capEnd = tip(at(pts, n), at(pts, n - 1));
  const capStart = tip(at(pts, 0), at(pts, 1));
  return (
    `M${fmt(at(left, 0))}` +
    left
      .slice(1)
      .map((p) => `L${fmt(p)}`)
      .join('') +
    `Q${fmt(capEnd)} ${fmt(at(right, n))}` +
    right
      .slice(0, n)
      .reverse()
      .map((p) => `L${fmt(p)}`)
      .join('') +
    `Q${fmt(capStart)} ${fmt(at(left, 0))}Z`
  );
}

/** an open polyline `d` (the centreline used by the draw-on mask and the sheen) */
export function linePath(pts: readonly Pt[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${r2(p[0])} ${r2(p[1])}`).join('');
}

/** the sheen: the centreline nudged toward the upper edge of the stroke, between the swell and the far taper */
function sheenPoints(pts: readonly Pt[], o: RibbonOpts, side: 1 | -1): Pt[] {
  const n = pts.length - 1;
  const hw = ribbonProfile(n, o);
  const i0 = Math.round(n * Math.min(0.45, o.taper[0] + 0.06));
  const i1 = Math.round(n * (1 - Math.max(0.18, o.taper[1] * 0.75)));
  const out: Pt[] = [];
  for (let i = i0; i <= i1; i++) {
    const a = at(pts, i - 1);
    const b = at(pts, i + 1);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const p = at(pts, i);
    const w = at(hw, i) * 0.45;
    out.push([p[0] + side * nx * w, p[1] + side * ny * w]);
  }
  return out;
}

export interface Stroke {
  /** the filled tapered ribbon */
  ribbon: string;
  /** the centreline (draw-on mask) */
  centre: string;
  /** the thin highlight along the upper edge */
  sheen: string;
  width: number;
}

const stroke = (pts: Pt[], o: RibbonOpts, sheenSide: 1 | -1): Stroke => ({
  ribbon: ribbonPath(pts, o),
  centre: linePath(pts),
  sheen: linePath(sheenPoints(pts, o, sheenSide)),
  width: o.width,
});

export const RULE_HALF = 78;
export const RULE_VIEWBOX = '-90 -9 180 18';

/** card.js goldRule: x + s * (8 + u * half), y + 2.2 * sin(u * PI) - 1.2 * u, width 2.6, taper [0.12, 0.6] */
export function rulePaths(
  half = RULE_HALF,
  seed = 3612,
): { strokes: Stroke[]; bindu: { cx: number; cy: number; r: number } } {
  const r = rng('rule:' + seed);
  const strokes = ([-1, 1] as const).map((s) => {
    const pts: Pt[] = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      pts.push([s * (8 + u * half), 2.2 * Math.sin(u * Math.PI) - 1.2 * u]);
    }
    // the sheen rides the upper edge: the left normal points down on the right-hand stroke, up on the left-hand one
    return stroke(
      pts,
      { width: 2.6, taper: [0.12, 0.6], pressure: 0.5, seed: String((r() * 1e6) | 0) },
      s === 1 ? -1 : 1,
    );
  });
  return { strokes, bindu: { cx: 0, cy: 0, r: 4 } };
}

export const RING_R = 44;
export const RING_GAP_DEG = 14;
export const RING_VIEWBOX = '-50 -50 100 100';

/** card.js goldRing: two arcs from the bottom (90 deg) sweeping (180 - gap / 2) deg each way, a bindu in the top gap */
export function ringPaths(
  R = RING_R,
  gapDeg = RING_GAP_DEG,
  width = 3,
  seed = 3613,
): { strokes: Stroke[]; bindu: { cx: number; cy: number; r: number }; ends: Pt[] } {
  const r = rng('ring:' + seed);
  const n = 90;
  const ends: Pt[] = [];
  const strokes = ([1, -1] as const).map((dir) => {
    const pts: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const a = ((90 + (dir * (180 - gapDeg / 2) * i) / n) * Math.PI) / 180;
      pts.push([R * Math.cos(a), R * Math.sin(a)]);
    }
    ends.push(at(pts, n));
    // the sheen rides the outside of the ring: for the clockwise arc that is the left normal, for the other the right
    return stroke(
      pts,
      { width, taper: [0.25, 0.35], pressure: 0.35, seed: String((r() * 1e6) | 0) },
      dir === 1 ? -1 : 1,
    );
  });
  return { strokes, bindu: { cx: 0, cy: -R, r: 4.5 }, ends };
}

/* ------------------------------------------------------------------------------------------------- components */

/** a DOM-safe id from useId (React's ":r1:" form works in url(#...) in most engines, but not everywhere) */
function useSafeId(prefix: string): string {
  return prefix + useId().replace(/[^a-zA-Z0-9_-]/g, '');
}

function BinduGradient({ id }: { id: string }) {
  return (
    <radialGradient id={id}>
      <stop offset="0" style={{ stopColor: 'var(--gold-3)' }} />
      <stop offset="0.45" style={{ stopColor: 'var(--gold-2)' }} />
      <stop offset="0.85" style={{ stopColor: 'var(--gold-1)' }} />
      <stop offset="1" style={{ stopColor: 'var(--gold-0)', stopOpacity: 0 }} />
    </radialGradient>
  );
}

/** one stroke: the ribbon and its sheen, revealed through a centreline mask (draw-on hook `.brush-draw`) */
function StrokeGroup({
  s,
  id,
  fill,
  i,
  box,
}: {
  s: Stroke;
  id: string;
  fill: string;
  i: number;
  box: readonly [number, number, number, number];
}) {
  const mask = `${id}-m${i}`;
  return (
    <g className="brush-stroke" data-stroke={i}>
      <mask id={mask} maskUnits="userSpaceOnUse" x={box[0]} y={box[1]} width={box[2]} height={box[3]}>
        <path
          className="brush-draw"
          d={s.centre}
          pathLength={1}
          fill="none"
          stroke="#fff"
          strokeWidth={s.width * 3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </mask>
      <g mask={`url(#${mask})`}>
        <path className="brush-ribbon" d={s.ribbon} fill={`url(#${fill})`} />
        <path
          className="brush-sheen"
          d={s.sheen}
          fill="none"
          strokeWidth={Math.max(0.35, s.width * 0.22)}
          strokeLinecap="round"
        />
      </g>
    </g>
  );
}

const RULE_MASK_BOX = [-100, -20, 200, 40] as const;
const RING_MASK_BOX = [-56, -56, 112, 112] as const;

export interface GoldBrushProps {
  className?: string;
  seed?: number;
  style?: CSSProperties;
}

/** card.js goldRule: two gentle strokes meeting at a 4 px bindu. Decorative (aria-hidden). */
export function GoldBrushRule({ className = '', seed = 3612, style }: GoldBrushProps) {
  const id = useSafeId('gr');
  const { strokes, bindu } = rulePaths(RULE_HALF, seed);
  return (
    <svg
      className={`brush-rule${className ? ` ${className}` : ''}`}
      viewBox={RULE_VIEWBOX}
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      <defs>
        <linearGradient id={`${id}-g`} gradientUnits="userSpaceOnUse" x1="-88" y1="0" x2="88" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--gold-0)' }} />
          <stop offset="0.28" style={{ stopColor: 'var(--gold-1)' }} />
          <stop offset="0.44" style={{ stopColor: 'var(--gold-2)' }} />
          <stop offset="0.5" style={{ stopColor: 'var(--gold-1)' }} />
          <stop offset="0.56" style={{ stopColor: 'var(--gold-2)' }} />
          <stop offset="0.72" style={{ stopColor: 'var(--gold-1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--gold-0)' }} />
        </linearGradient>
        <BinduGradient id={`${id}-b`} />
      </defs>
      {strokes.map((s, i) => (
        <StrokeGroup key={i} s={s} id={id} fill={`${id}-g`} i={i} box={RULE_MASK_BOX} />
      ))}
      <circle className="brush-bindu" cx={bindu.cx} cy={bindu.cy} r={bindu.r} fill={`url(#${id}-b)`} />
    </svg>
  );
}

/** card.js goldRing: the brush ring that holds the monogram. Put the monogram text over it (.brush-ring-wrap). */
export function GoldBrushRing({ className = '', seed = 3613, style }: GoldBrushProps) {
  const id = useSafeId('gg');
  const { strokes, bindu } = ringPaths(RING_R, RING_GAP_DEG, 3, seed);
  return (
    <svg
      className={`brush-ring${className ? ` ${className}` : ''}`}
      viewBox={RING_VIEWBOX}
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      <defs>
        <linearGradient id={`${id}-g`} gradientUnits="userSpaceOnUse" x1="-44" y1="44" x2="44" y2="-44">
          <stop offset="0" style={{ stopColor: 'var(--gold-0)' }} />
          <stop offset="0.3" style={{ stopColor: 'var(--gold-1)' }} />
          <stop offset="0.52" style={{ stopColor: 'var(--gold-2)' }} />
          <stop offset="0.7" style={{ stopColor: 'var(--gold-1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--gold-0)' }} />
        </linearGradient>
        <BinduGradient id={`${id}-b`} />
      </defs>
      {strokes.map((s, i) => (
        <StrokeGroup key={i} s={s} id={id} fill={`${id}-g`} i={i} box={RING_MASK_BOX} />
      ))}
      <circle className="brush-bindu" cx={bindu.cx} cy={bindu.cy} r={bindu.r} fill={`url(#${id}-b)`} />
    </svg>
  );
}

/** the gilded dot on its own (CSS, .bindu in base.css). Decorative. */
export function Bindu({ className = '' }: { className?: string }) {
  return <span className={`bindu${className ? ` ${className}` : ''}`} aria-hidden="true" />;
}
