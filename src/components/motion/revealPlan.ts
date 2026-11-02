// The paint-reveal's brush plan (spec 3.5): the video's style per section and the deterministic stroke schedule of
// each style, as pure data (unit-tested). The runtime that lays the stamps is <PaintReveal>.
import { rng } from '../../lib/motion';

export type RevealStyle = 'sweep' | 'diagonal' | 'swirl' | 'rise' | 'bloom';

export interface RevealSpec {
  style: RevealStyle;
  seed: number;
  /** diagonal: the rows' slope (dy/dx) */
  tilt?: number;
  /** swirl / bloom centre as fractions of the frame (default: the title for swirl, the plate's glow for bloom) */
  origin?: [number, number];
  /** an element inside the section whose centre is the origin (measured when the reveal starts) */
  originSelector?: string;
  /** a dark underpainting colour that runs ahead of the brush (reception: deep teal) */
  lead?: string;
}

/** The video's choices per section (3.5). */
export const REVEALS: Record<string, RevealSpec> = {
  invitation: { style: 'sweep', seed: 2622 },
  mehndi: { style: 'diagonal', seed: 2633 },
  engagement: { style: 'swirl', seed: 2643, originSelector: '.event__title, h3' },
  haldi: { style: 'rise', seed: 2653 },
  wedding: { style: 'diagonal', seed: 2663, tilt: -0.3 },
  reception: { style: 'diagonal', seed: 2763, tilt: 0.3, lead: '#24403f' },
  cultures: { style: 'sweep', seed: 2672 },
  closing: { style: 'bloom', seed: 2702, origin: [0.5, 0.86], originSelector: '.closing__diya, .diya' },
};

/* ----------------------------------------------------------------------------------------------- the plan */

export interface Stamp {
  /** distance along the stroke (px) at which this stamp is laid */
  d: number;
  x: number;
  y: number;
  /** rotation (rad) */
  a: number;
  /** scale of the 128 px cell */
  s: number;
  cell: number;
  alpha: number;
}

export interface PlanStroke {
  t0: number;
  t1: number;
  length: number;
  stamps: Stamp[];
}

export interface RevealPlan {
  strokes: PlanStroke[];
  /** brush width (px) */
  width: number;
  bloom: boolean;
  origin: [number, number];
}

export const CELL = 128;
/** the bristle dab fills about this share of its cell's height */
export const DAB = 0.7;

/** Stamps along a polyline: a broad body plus two thin ragged edges, seeded. */
function stampLine(
  pts: Array<[number, number]>,
  bw: number,
  r: ReturnType<typeof rng>,
): { stamps: Stamp[]; length: number } {
  const stamps: Stamp[] = [];
  let d = 0;
  const body = bw * 0.22;
  let next = 0;
  let nextEdge = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1] as [number, number];
    const [x1, y1] = pts[i] as [number, number];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (seg < 1e-6) continue;
    const a = Math.atan2(y1 - y0, x1 - x0);
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    while (next <= d + seg) {
      const u = (next - d) / seg;
      const jx = r.range(-0.06, 0.06) * bw;
      stamps.push({
        d: next,
        x: x0 + (x1 - x0) * u + nx * jx,
        y: y0 + (y1 - y0) * u + ny * jx,
        a: a + r.range(-0.12, 0.12),
        s: (bw / (CELL * DAB)) * r.range(0.92, 1.08),
        cell: r.int(0, 5),
        alpha: r.range(0.86, 1),
      });
      next += body * r.range(0.8, 1.2);
    }
    while (nextEdge <= d + seg) {
      const u = (nextEdge - d) / seg;
      for (const side of [-1, 1]) {
        const off = side * bw * r.range(0.36, 0.5);
        stamps.push({
          d: nextEdge,
          x: x0 + (x1 - x0) * u + nx * off,
          y: y0 + (y1 - y0) * u + ny * off,
          a: a + r.range(-0.2, 0.2),
          s: ((bw * r.range(0.22, 0.4)) / (CELL * DAB)) * 1,
          cell: r.int(0, 5),
          alpha: r.range(0.5, 0.9),
        });
      }
      nextEdge += body * r.range(1.1, 1.9);
    }
    d += seg;
  }
  stamps.sort((p, q) => p.d - q.d);
  return { stamps, length: d };
}

/**
 * The deterministic brush schedule of a style for a W x H canvas (pure; unit-tested). Rows for sweep / rise /
 * diagonal (5-9 broad strokes, alternating direction, wavy, a little timing scatter so the leading edge is a ragged
 * run of lobes), loose arcs around the origin for swirl, nothing for bloom (it is drawn per frame).
 */
export function buildRevealPlan(spec: RevealSpec, W: number, H: number, origin?: [number, number]): RevealPlan {
  const r = rng(`reveal:${spec.seed}`);
  const strokes: PlanStroke[] = [];
  const o: [number, number] = origin ?? spec.origin ?? [0.5, spec.style === 'swirl' ? 0.3 : 0.5];
  if (spec.style === 'bloom') return { strokes, width: 0, bloom: true, origin: o };
  const aspect = H / Math.max(1, W);
  if (spec.style === 'swirl') {
    const bw = 0.2 * Math.max(W, H) * (aspect > 1.4 ? 0.85 : 1);
    const cx = o[0] * W;
    const cy = o[1] * H;
    const maxR = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + bw * 0.35;
    const list: Array<{ rad: number; a0: number; span: number }> = [];
    for (let rad = bw * 0.3; rad < maxR; rad += bw * 0.72) {
      const n = Math.max(1, Math.round((2 * Math.PI * rad) / (3.2 * bw)));
      const a0 = r() * Math.PI * 2;
      for (let k = 0; k < n; k++) list.push({ rad, a0: a0 + (k / n) * Math.PI * 2, span: ((Math.PI * 2) / n) * 1.3 });
    }
    list.forEach(({ rad, a0, span }, j) => {
      const pts: Array<[number, number]> = [];
      const steps = Math.max(8, Math.ceil((rad * span) / 12));
      for (let q = 0; q <= steps; q++) {
        const a = a0 + (q / steps) * span;
        const rr = rad + (q / steps) * bw * 0.25 + 0.06 * bw * Math.sin(q * 0.5 + j);
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
      const t0 = Math.max(0, (j / list.length) * 0.72 + r.range(-0.015, 0.015));
      const { stamps, length } = stampLine(pts, bw * r.range(1.05, 1.25), r);
      strokes.push({ t0, t1: t0 + 0.2, stamps, length });
    });
    // a last pass along the four frame edges: the corners the rings never reach are brushed, not flooded
    const ew = bw * 0.8;
    const ov = bw * 0.3;
    const edges: Array<[[number, number], [number, number]]> = [
      [
        [-ov, ew * 0.25],
        [W + ov, ew * 0.25],
      ],
      [
        [W + ov, H - ew * 0.25],
        [-ov, H - ew * 0.25],
      ],
      [
        [ew * 0.25, H + ov],
        [ew * 0.25, -ov],
      ],
      [
        [W - ew * 0.25, -ov],
        [W - ew * 0.25, H + ov],
      ],
    ];
    edges.forEach(([a, b], j) => {
      const pts: Array<[number, number]> = [];
      for (let q = 0; q <= 40; q++) {
        const u = q / 40;
        pts.push([
          a[0] + (b[0] - a[0]) * u + 10 * Math.sin(u * 7 + j),
          a[1] + (b[1] - a[1]) * u + 10 * Math.cos(u * 6 + j),
        ]);
      }
      const { stamps, length } = stampLine(pts, ew, r);
      strokes.push({ t0: 0.68 + 0.04 * j, t1: 0.88 + 0.02 * j, stamps, length });
    });
    return { strokes, width: bw, bloom: false, origin: o };
  }
  // rows: tall frames need more of them (5-9), each broad and wavy
  const rows = aspect > 1.6 ? 9 : aspect > 0.9 ? 7 : 6;
  const pitch = (H * 1.08) / rows;
  const bw = pitch / 0.62;
  const tilt = spec.style === 'diagonal' ? (spec.tilt ?? 0.32) : 0;
  for (let i = 0; i < rows; i++) {
    const k = spec.style === 'rise' ? rows - 1 - i : i;
    const y = -0.04 * H + (k + 0.5) * pitch + r.range(-0.06, 0.06) * pitch;
    const ltr = i % 2 === 0;
    const x0 = ltr ? -bw * 0.6 : W + bw * 0.6;
    const amp = r.range(0.08, 0.16) * bw;
    const ph = r() * Math.PI * 2;
    const wl = r.range(1.1, 1.6) * W;
    const tl = tilt || r.range(-0.05, 0.05);
    const pts: Array<[number, number]> = [];
    const span = W + bw * 1.2;
    for (let s = 0; s <= span; s += 10) {
      const x = ltr ? x0 + s : x0 - s;
      pts.push([x, y + (x - W / 2) * tl + amp * Math.sin((s / wl) * Math.PI * 2 + ph)]);
    }
    const t0 = (i / rows) * 0.7 + r.range(-0.02, 0.02);
    const { stamps, length } = stampLine(pts, bw * r.range(0.98, 1.12), r);
    strokes.push({ t0: Math.max(0, t0), t1: Math.max(0, t0) + 0.3, stamps, length });
  }
  // diagonal rows leave the corners of the far side: cover them with one more pass along that edge
  if (tilt) {
    const pts: Array<[number, number]> = [];
    const yEdge = tilt > 0 ? H * 1.02 : -H * 0.02;
    for (let s = 0; s <= W + bw; s += 12) pts.push([-bw * 0.5 + s, yEdge - (s - W / 2) * 0.02]);
    const { stamps, length } = stampLine(pts, bw * 0.9, r);
    strokes.push({ t0: 0.66, t1: 0.92, stamps, length });
  }
  return { strokes, width: bw, bloom: false, origin: o };
}
