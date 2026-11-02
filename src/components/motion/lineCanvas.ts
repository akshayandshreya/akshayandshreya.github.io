// Scroll-drawn line art on a canvas (spec 3.4 a): what the inline SVG showed, at a fraction of the cost. The SVG draws
// a stroke by moving the dash of its centreline inside a <mask>, one mask per stroke (100-200 per motif) under one
// brush filter (two turbulences and a displacement), so every dash change made the browser redo every mask layer and
// the filter over the whole motif: ~30 ms of raster per scroll frame, 470 effect nodes to layerize, and a 6 s software
// render of alpana.
//
// Here the finished ink is a CSS mask image on the canvas: the motif SVG without its per-stroke masks (they clip
// nothing at rest: LineArtData.ink), rasterised by the browser once per size, off the main thread. The canvas only
// paints *where* the drawing has reached, in the ink colour: per stroke, its ribbon grown by the brush's spread,
// clipped to the drawn part of its centreline as the mask's stroke covers it (round caps and joins, built as quads
// and discs: the same region the dash paints). The grown edge never covers the ribbon of a neighbour that is not
// complete yet (where a hatch crosses a line, the hatch must not show before it is drawn). What shows is the
// finished drawing wherever a stroke has reached. A scroll frame repaints only the stretch of the strokes that moved
// (forward: painted on top, the reveal only grows; back: that stretch is cleared and what remains in it repainted),
// never the page, never the filter.
import {
  drawSchedule,
  pathBounds,
  pathLength,
  polyPoints,
  strokeProgress,
  type DrawOptions,
  type LineArtData,
} from '../../lib/linedraw';

/** The brush filter moves the ink by up to 1.3 viewBox units (feDisplacementMap scale 2.6): every reveal shape grows
 *  by this, plus a device pixel of antialiasing, so a drawn stroke shows all of its own ink. */
const SPREAD = 1.4;
/** Changes of a stroke's drawn share up to this are skipped (as drawLineArt, spec 3.9), except reaching 0 or 1. */
const EPS = 0.002;
/** The backing store never exceeds this many device pixels per CSS pixel (the brush grain is finer than a pixel). */
export const MAX_DPR = 2;

type Box = [number, number, number, number];

interface Geo {
  /** centreline length + 2: the dash length and the schedule weight, as prepLineArt measures them */
  len: number;
  width: number;
  visible: boolean;
  centreD: string;
  ribbonD: string;
  ribbon: Path2D | null;
  /** the centreline's points per subpath with their running length, for the stretch a frame moved */
  walk: Array<{ pts: number[]; at: number[] }> | null;
  /** strokes whose ribbon comes within the spread of this one's (a superset, by grid cell; null: not looked up) */
  near: number[] | null;
  /** the ribbon's outline points per subpath (parsed once) */
  ribbonPts: number[][] | null;
  /** viewBox units: ribbon and centreline points, unpadded */
  raw: Box;
  /** raw, padded for the current scale */
  box: Box;
}

/** Is the canvas renderer possible here (not jsdom, not a browser without CSS masks)? */
export function lineCanvasSupported(): boolean {
  if (typeof window === 'undefined' || typeof Path2D !== 'function' || typeof CSS === 'undefined' || !CSS.supports)
    return false;
  if (!CSS.supports('mask-image', 'url("x.svg")') && !CSS.supports('-webkit-mask-image', 'url("x.svg")')) return false;
  try {
    return !!document.createElement('canvas').getContext('2d');
  } catch {
    return false;
  }
}

const inkUrls = new Map<string, string>();
/** A blob: URL of the finished ink, one per motif for the page's life (the CSP's img-src allows blob:). */
export function inkUrl(key: string, data: LineArtData): string {
  let u = inkUrls.get(key);
  if (!u) {
    u = URL.createObjectURL(new Blob([data.ink], { type: 'image/svg+xml' }));
    inkUrls.set(key, u);
  }
  return u;
}

const union = (a: Box, b: Box): Box => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[2], b[2]),
  Math.max(a[3], b[3]),
];
/** grid cell for the neighbour lookup, viewBox units */
const CELL = 12;
const meets = (a: Box, b: Box) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const EMPTY: Box = [Infinity, Infinity, -Infinity, -Infinity];

type Surface = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** The draw timing of a motif without a canvas: every stroke's slot (as LineCanvas and prepLineArt schedule it). */
export interface LineSchedule {
  slots: Array<[number, number]>;
  visible: boolean[];
  reverse: boolean;
}
export function lineSchedule(data: LineArtData, opts: DrawOptions): LineSchedule {
  return {
    slots: drawSchedule(
      data.strokes.map((s) => pathLength(s.centre) + 2),
      opts,
    ),
    visible: data.strokes.map((s) => s.visible && !!s.ribbon),
    reverse: !!opts.reverse,
  };
}
/** The mean drawn share (0..1) of the visible strokes at progress p. */
export function drawnAt(s: LineSchedule, p: number): number {
  const n = s.slots.length;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const k = s.reverse ? n - 1 - i : i;
    if (!s.visible[k]) continue;
    sum += strokeProgress(s.slots[i] as [number, number], p);
    count++;
  }
  return count ? sum / count : 1;
}

export class LineCanvas {
  readonly canvas: Surface;
  private readonly ctx: Ctx;
  private readonly geo: Geo[];
  private readonly slots: Array<[number, number]>;
  /** drawn share per stroke, as it is on the canvas */
  private readonly q: Float32Array;
  private readonly next: Float32Array;
  private readonly reverse: boolean;
  private readonly vb: Box;
  private ink: string;
  private sx = 1;
  private sy = 1;
  /** viewBox units: the brush spread plus a device pixel */
  private spread = SPREAD + 1;
  /** the whole canvas must be repainted (new size, new ink) */
  private stale = true;
  /** ribbon segments by grid cell (viewBox units), for the neighbours of a stroke */
  private grid: Map<number, number[]> | null = null;

  constructor(data: LineArtData, opts: DrawOptions, ink: string, canvas: Surface) {
    const ctx = canvas.getContext('2d') as Ctx | null;
    if (!ctx) throw new Error('no 2d canvas');
    this.canvas = canvas;
    this.ctx = ctx;
    this.vb = data.viewBox;
    this.ink = ink || data.fallbackInk;
    this.reverse = !!opts.reverse;
    const [vx, vy, vw, vh] = data.viewBox;
    this.geo = data.strokes.map((s) => {
      const r = s.ribbon ? pathBounds(s.ribbon) : null;
      const c = pathBounds(s.centre);
      const raw: Box = r && c ? union(r, c) : (r ?? c ?? [vx, vy, vx + vw, vy + vh]);
      return {
        len: pathLength(s.centre) + 2,
        width: s.width,
        visible: s.visible && !!s.ribbon,
        centreD: s.centre,
        ribbonD: s.ribbon,
        ribbon: null,
        walk: null,
        near: null,
        ribbonPts: null,
        raw,
        box: raw,
      };
    });
    this.slots = drawSchedule(
      this.geo.map((g) => g.len),
      opts,
    );
    this.q = new Float32Array(this.geo.length);
    this.next = new Float32Array(this.geo.length);
  }

  /** Size the backing store for the art's CSS width (the height follows the viewBox). */
  setSize(cssW: number, dpr: number) {
    const r = Math.min(MAX_DPR, Math.max(1, dpr || 1));
    const w = Math.max(1, Math.round(cssW * r));
    const h = Math.max(1, Math.round((cssW * r * this.vb[3]) / this.vb[2]));
    if (w === this.canvas.width && h === this.canvas.height && this.sx === w / this.vb[2]) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.sx = w / this.vb[2];
    this.sy = h / this.vb[3];
    this.spread = SPREAD + 1 / Math.min(this.sx, this.sy);
    for (const g of this.geo) {
      g.box = this.pad(g.raw, g.width);
      g.near = null;
    }
    this.grid = null;
    this.stale = true;
  }

  setInk(ink: string) {
    if (!ink || ink === this.ink) return;
    this.ink = ink;
    this.stale = true;
  }

  /** The mean drawn share (0..1) of the visible strokes, for tests and QA. */
  drawn(): number {
    let s = 0;
    let n = 0;
    for (let i = 0; i < this.geo.length; i++) {
      if (!(this.geo[i] as Geo).visible) continue;
      s += this.q[i] as number;
      n++;
    }
    return n ? s / n : 1;
  }

  /** Draw to progress p (0..1). Returns the number of strokes painted. */
  draw(p: number): number {
    const n = this.geo.length;
    const { q, next } = this;
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const k = this.reverse ? n - 1 - i : i;
      const v = strokeProgress(this.slots[i] as [number, number], p);
      const prev = q[k] as number;
      next[k] = prev;
      if (v === prev) continue;
      if (!this.stale && Math.abs(v - prev) <= EPS && v !== 0 && v !== 1) continue;
      next[k] = v;
      if ((this.geo[k] as Geo).visible) moved++;
      else q[k] = v;
    }
    const ctx = this.ctx;
    if (this.stale) {
      this.stale = false;
      q.set(next);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      let painted = 0;
      for (let k = 0; k < n; k++)
        if ((q[k] as number) > 0 && (this.geo[k] as Geo).visible) painted += this.paint(k, q[k] as number);
      return painted;
    }
    if (!moved) return 0;
    // un-draw: the stretches that went back are cleared, and what remains of any stroke there is repainted
    let back: Box = EMPTY;
    for (let k = 0; k < n; k++) {
      const v = next[k] as number;
      const prev = q[k] as number;
      if (v < prev) back = union(back, this.stretch(k, v, prev));
    }
    let painted = 0;
    if (back !== EMPTY) {
      for (let k = 0; k < n; k++) if ((next[k] as number) < (q[k] as number)) q[k] = next[k] as number;
      const R = this.devRect(back);
      if (R) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.beginPath();
        ctx.rect(R[0], R[1], R[2], R[3]);
        ctx.clip();
        ctx.clearRect(R[0], R[1], R[2], R[3]);
        for (let k = 0; k < n; k++) {
          const g = this.geo[k] as Geo;
          if ((q[k] as number) > 0 && g.visible && meets(g.box, back)) painted += this.paint(k, q[k] as number);
        }
        ctx.restore();
      }
    }
    // draw on: a reveal shape only grows with p, so the stretch a stroke moved is painted over what is there
    for (let k = 0; k < n; k++) {
      const v = next[k] as number;
      const prev = q[k] as number;
      if (v <= prev) continue;
      q[k] = v;
      painted += this.paint(k, v, prev);
    }
    return painted;
  }

  /** a viewBox box padded for a mark of the given stroke width at the current scale */
  private pad(b: Box, width: number): Box {
    const m = width / 2 + this.spread + 1 / Math.min(this.sx, this.sy);
    return [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
  }

  /** the padded box of the centreline between drawn shares a and b (a < b): what a move between them can change */
  private stretch(k: number, a: number, b: number): Box {
    const g = this.geo[k] as Geo;
    if (a <= 0 || b >= 1) return g.box; // starting or finishing: the whole stroke (once per stroke)
    const walk = walkOf(g);
    if (!walk.length) return g.box;
    const lo = a * g.len;
    const hi = b * g.len;
    let box: Box = EMPTY;
    // the dash restarts on every subpath (Skia, and the canvas spec)
    for (const { pts, at } of walk) {
      for (let i = 0; i < at.length; i++) {
        const s0 = at[i] as number;
        const s1 = (at[i + 1] ?? s0) as number;
        if (s1 < lo || s0 > hi) continue;
        const x = pts[2 * i] as number;
        const y = pts[2 * i + 1] as number;
        if (s0 >= lo) box = union(box, [x, y, x, y]);
        if (i + 1 < at.length) {
          const t0 = s1 > s0 ? Math.max(0, (lo - s0) / (s1 - s0)) : 0;
          const t1 = s1 > s0 ? Math.min(1, (hi - s0) / (s1 - s0)) : 1;
          const x1 = pts[2 * i + 2] as number;
          const y1 = pts[2 * i + 3] as number;
          for (const t of [t0, t1]) {
            const px = x + (x1 - x) * t;
            const py = y + (y1 - y) * t;
            box = union(box, [px, py, px, py]);
          }
        }
      }
    }
    return box === EMPTY ? g.box : this.pad(box, g.width);
  }

  /** viewBox box -> [x, y, w, h] in whole device pixels on the canvas (null when outside it) */
  private devRect(b: Box): Box | null {
    const [vx, vy] = this.vb;
    const x0 = Math.max(0, Math.floor((b[0] - vx) * this.sx) - 1);
    const y0 = Math.max(0, Math.floor((b[1] - vy) * this.sy) - 1);
    const x1 = Math.min(this.canvas.width, Math.ceil((b[2] - vx) * this.sx) + 1);
    const y1 = Math.min(this.canvas.height, Math.ceil((b[3] - vy) * this.sy) + 1);
    return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
  }

  private toView(c: Ctx) {
    const [vx, vy] = this.vb;
    c.setTransform(this.sx, 0, 0, this.sy, -vx * this.sx, -vy * this.sy);
  }

  private ribbonOf(g: Geo): Path2D {
    g.ribbon ??= new Path2D(g.ribbonD);
    return g.ribbon;
  }

  /** Paint stroke k at drawn share v over the canvas. `from` (0..v): only the stretch from there can have changed. */
  private paint(k: number, v: number, from = 0): number {
    const g = this.geo[k] as Geo;
    const ctx = this.ctx;
    ctx.save();
    this.toView(ctx);
    if (v < 1) {
      // partly drawn: clipped to where the mask's stroke (plus the spread) has reached
      const region = this.reach(g, from, v);
      if (!region) {
        ctx.restore();
        return 0;
      }
      ctx.clip(region);
    }
    const ribbon = this.ribbonOf(g);
    ctx.fillStyle = this.ink;
    ctx.strokeStyle = this.ink;
    ctx.fill(ribbon);
    // the spread (the brush's displaced edge): a round-joined outline, kept off the ribbons of the neighbours that
    // are not complete (their ink there must wait for their own stroke)
    const keepOff = this.undone(k);
    if (keepOff) ctx.clip(keepOff, 'evenodd');
    ctx.lineWidth = 2 * this.spread;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash([]);
    ctx.stroke(ribbon);
    ctx.restore();
    return 1;
  }

  /** stroke k's box but the ribbons of its neighbours that are not complete (an evenodd clip), or null if none */
  private undone(k: number): Path2D | null {
    const near = this.nearOf(k);
    let path: Path2D | null = null;
    for (const j of near) {
      if ((this.q[j] as number) >= 1) continue;
      if (!path) {
        // the stroke's own box, not the canvas: the clip is rasterised over its bounds
        const [x0, y0, x1, y1] = (this.geo[k] as Geo).box;
        path = new Path2D();
        path.rect(x0, y0, x1 - x0, y1 - y0);
      }
      path.addPath(this.ribbonOf(this.geo[j] as Geo));
    }
    return path;
  }

  /** the visible strokes whose ribbon has a segment in a grid cell within the spread of stroke k's ribbon */
  private nearOf(k: number): number[] {
    const g = this.geo[k] as Geo;
    if (g.near) return g.near;
    const cell = CELL;
    const pad = this.spread + 1;
    const key = (cx: number, cy: number) => cx * 65536 + cy;
    const cells = (s: number[], fn: (key: number) => void) => {
      for (let i = 0; i + 1 < s.length; i += 2) {
        const x0 = s[i] as number;
        const y0 = s[i + 1] as number;
        const x1 = (s[i + 2] ?? x0) as number;
        const y1 = (s[i + 3] ?? y0) as number;
        const cx0 = Math.floor((Math.min(x0, x1) - pad) / cell);
        const cx1 = Math.floor((Math.max(x0, x1) + pad) / cell);
        const cy0 = Math.floor((Math.min(y0, y1) - pad) / cell);
        const cy1 = Math.floor((Math.max(y0, y1) + pad) / cell);
        for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) fn(key(cx + 32768, cy + 32768));
      }
    };
    if (!this.grid) {
      const grid = new Map<number, number[]>();
      this.geo.forEach((h, j) => {
        if (!h.visible) return;
        for (const s of (h.ribbonPts ??= polyPoints(h.ribbonD) ?? []))
          cells(s, (c) => {
            const list = grid.get(c);
            if (!list) grid.set(c, [j]);
            else if (list[list.length - 1] !== j) list.push(j);
          });
      });
      this.grid = grid;
    }
    const found = new Set<number>();
    for (const s of (g.ribbonPts ??= polyPoints(g.ribbonD) ?? []))
      cells(s, (c) => this.grid?.get(c)?.forEach((j) => j !== k && found.add(j)));
    g.near = [...found];
    return g.near;
  }

  /** The region the centreline's stroke covers between drawn shares a and b (a < b), as wide as the mask's stroke
   *  plus the spread, round caps and joins: one quad per segment and a disc per point, all wound the same way so
   *  that nonzero filling makes their union. The dash restarts on every subpath (Skia, and the canvas spec). */
  private reach(g: Geo, a: number, b: number): Path2D | null {
    const walk = walkOf(g);
    if (!walk.length) return null;
    const r = g.width / 2 + this.spread;
    const lo = a * g.len;
    const hi = b * g.len;
    const path = new Path2D();
    let any = false;
    for (const { pts, at } of walk) {
      const end = at[at.length - 1] as number;
      if (lo > end) continue;
      // the points from lo to min(hi, end) along this subpath
      const xs: number[] = [];
      for (let i = 0; i < at.length; i++) {
        const s0 = at[i] as number;
        const x = pts[2 * i] as number;
        const y = pts[2 * i + 1] as number;
        if (i + 1 < at.length) {
          const s1 = at[i + 1] as number;
          const x1 = pts[2 * i + 2] as number;
          const y1 = pts[2 * i + 3] as number;
          if (s1 < lo || s0 > hi) continue;
          const t0 = s1 > s0 ? Math.max(0, (lo - s0) / (s1 - s0)) : 0;
          const t1 = s1 > s0 ? Math.min(1, (hi - s0) / (s1 - s0)) : 1;
          const ax = x + (x1 - x) * t0;
          const ay = y + (y1 - y) * t0;
          if (!xs.length || xs[xs.length - 2] !== ax || xs[xs.length - 1] !== ay) xs.push(ax, ay);
          xs.push(x + (x1 - x) * t1, y + (y1 - y) * t1);
        } else if (at.length === 1 && lo <= 0) xs.push(x, y);
      }
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const x = xs[i] as number;
        const y = xs[i + 1] as number;
        path.moveTo(x + r, y);
        path.arc(x, y, r, 0, 2 * Math.PI, true);
        path.closePath();
        any = true;
        if (i + 3 >= xs.length) continue;
        const x1 = xs[i + 2] as number;
        const y1 = xs[i + 3] as number;
        const d = Math.hypot(x1 - x, y1 - y);
        if (d === 0) continue;
        // the left normal: every quad then winds like the anticlockwise discs
        const nx = (-(y1 - y) / d) * r;
        const ny = ((x1 - x) / d) * r;
        path.moveTo(x + nx, y + ny);
        path.lineTo(x1 + nx, y1 + ny);
        path.lineTo(x1 - nx, y1 - ny);
        path.lineTo(x - nx, y - ny);
        path.closePath();
      }
    }
    return any ? path : null;
  }
}

/** the centreline's points per subpath with their running length (built once per stroke) */
function walkOf(g: Geo): Array<{ pts: number[]; at: number[] }> {
  g.walk ??= (polyPoints(g.centreD) ?? []).map((pts) => {
    const at = [0];
    for (let i = 2; i + 1 < pts.length; i += 2)
      at.push(
        (at[at.length - 1] as number) +
          Math.hypot((pts[i] as number) - (pts[i - 2] as number), (pts[i + 1] as number) - (pts[i - 1] as number)),
      );
    return { pts, at };
  });
  return g.walk;
}
