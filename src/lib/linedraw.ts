// Line art draw-on (spec 3.4): a TypeScript port of the invitation engine's Motifs.draw (vendored motifs.js). The line
// SVGs (src/assets/motifs/*.svg) carry one centreline mask path per stroke (.m-draw); drawing a stroke is moving its
// strokeDashoffset from its length to 0. The schedule is a pure function of p (0..1): strokes follow one another, each
// given time by its length, with a short brush lift between them, optionally overlapping.

export interface DrawOptions {
  /** 'length' (default): time per stroke grows with its length; 'equal': every stroke gets the same time */
  mode?: 'length' | 'equal';
  /** 0 = strictly one after another, 0.5 = half overlap (spec: 0.2 for Ganesh) */
  overlap?: number;
  /** pause between strokes (brush lifted), in units of an average stroke (default 0.12) */
  lift?: number;
  reverse?: boolean;
}

/** [start, end] of each stroke as fractions of p, for strokes of the given lengths (Motifs.draw's time slots). */
export function drawSchedule(lens: readonly number[], o: DrawOptions = {}): Array<[number, number]> {
  const n = lens.length;
  if (!n) return [];
  const total = lens.reduce((a, b) => a + b, 0);
  const lift = o.lift ?? 0.12;
  const ov = o.overlap ?? 0;
  const w = lens.map((l) => (o.mode === 'equal' ? 1 : 0.25 + 0.75 * (l / (total / n))));
  const tot = w.reduce((a, b) => a + b, 0) * (1 - ov) + (w[n - 1] as number) * ov + lift * (n - 1) * (1 - ov);
  const out: Array<[number, number]> = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const wi = w[i] as number;
    out.push([t / tot, (t + wi) / tot]);
    t += wi * (1 - ov) + lift * (1 - ov);
  }
  return out;
}

/** Drawn share (0..1) of stroke i at progress p. */
export function strokeProgress(slot: readonly [number, number], p: number): number {
  const [s, e] = slot;
  if (e <= s) return p >= e ? 1 : 0;
  const q = (p - s) / (e - s);
  return q < 0 ? 0 : q > 1 ? 1 : q;
}

export interface LinePrep {
  list: SVGGeometryElement[];
  lens: number[];
  slots: Array<[number, number]>;
  /** last written drawn share per stroke (to skip writes that change by <= 0.002, spec 3.9) */
  last: Float32Array;
  options: DrawOptions;
  /** the last drawLineArt stopped at its write cap: strokes are still to be written for that progress */
  pending?: boolean;
}

/** Total length of a path, or a stable estimate when the browser cannot measure (jsdom, display: none in old Safari). */
export function lengthOf(el: SVGGeometryElement): number {
  try {
    const l = el.getTotalLength();
    if (Number.isFinite(l) && l > 0) return l;
  } catch {
    /* fall through */
  }
  return estimateLength(el.getAttribute('d') ?? '');
}

/** A polyline estimate of an SVG path's length from its numbers (absolute and relative m/l/h/v/c segments). Only
 *  the relative weights matter for the schedule, so this is a fine fallback. */
export function estimateLength(d: string): number {
  const nums = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
  let len = 0;
  for (let i = 2; i + 1 < nums.length; i += 2) {
    const dx = nums[i] as number;
    const dy = nums[i + 1] as number;
    len += Math.min(400, Math.hypot(dx, dy));
  }
  return Math.max(1, len / 2);
}

/** Measure an inline SVG once: dasharray per stroke, the schedule, nothing drawn yet. */
export function prepLineArt(svg: SVGSVGElement | Element, options: DrawOptions = {}): LinePrep {
  const list = Array.from(svg.querySelectorAll<SVGGeometryElement>('.m-draw'));
  const lens = list.map((el) => lengthOf(el) + 2);
  list.forEach((el, i) => {
    const l = lens[i] as number;
    el.style.strokeDasharray = `${l} ${l}`;
  });
  return { list, lens, slots: drawSchedule(lens, options), last: new Float32Array(list.length).fill(-1), options };
}

/** Draw the art to progress p (0..1). Writes only the strokes whose drawn share changed by more than `eps`, at most
 *  `max` of them (QA r1 M5: a fast scroll flips dozens of strokes at once; the rest follow on the next frame, flagged
 *  by `prep.pending`). */
export function drawLineArt(prep: LinePrep, p: number, eps = 0.002, max = Infinity): number {
  const n = prep.list.length;
  let writes = 0;
  prep.pending = false;
  for (let i = 0; i < n; i++) {
    if (writes >= max) {
      prep.pending = true;
      break;
    }
    const k = prep.options.reverse ? n - 1 - i : i;
    const q = strokeProgress(prep.slots[i] as [number, number], p);
    const prev = prep.last[k] as number;
    if (prev >= 0 && Math.abs(q - prev) <= eps && q !== 0 && q !== 1) continue;
    if (prev === q) continue;
    prep.last[k] = q;
    const el = prep.list[k] as SVGGeometryElement;
    el.style.strokeDashoffset = String((prep.lens[k] as number) * (1 - q));
    writes++;
  }
  return writes;
}

/** Remove the dash styles: the art is simply there (reduced motion, after a finished entrance). */
export function releaseLineArt(prep: LinePrep) {
  for (const el of prep.list) {
    el.style.strokeDasharray = '';
    el.style.strokeDashoffset = '';
  }
  prep.last.fill(1);
}

/** Rename every id (and its url(#..) / href="#.." references) so a motif can be inlined more than once per page.
 *  One pass over the text: alpana has 400 ids in 80 KB, and a pass per id (32 MB of regex scanning) was a 135 ms
 *  task at 4x CPU, run while the guest scrolls towards the cultures. */
export function prefixIds(text: string, pre: string): string {
  if (!pre) return text;
  const ids = new Set<string>();
  for (const m of text.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1] as string);
  if (!ids.size) return text;
  return text.replace(/(id="|url\(#|href="#)([^")]+)(?=[")])/g, (all, lead: string, id: string) =>
    ids.has(id) ? `${lead}${pre}-${id}` : all,
  );
}

/* ------------------------------------------------------------------------------------ the line SVG as data */

/** One stroke of a line motif: the centreline its mask draws along, and the ribbon (the filled ink) it reveals. */
export interface LineStroke {
  /** centreline path data (the mask's .m-draw path), viewBox units */
  centre: string;
  /** the mask's stroke width (viewBox units) */
  width: number;
  /** the ribbon's path data (the .m-stroke path); '' when no ribbon uses this mask */
  ribbon: string;
  /** false when the centreline has no segment (a lone moveto): its mask paints nothing, the ribbon never shows */
  visible: boolean;
}

export interface LineArtData {
  /** x, y, width, height */
  viewBox: [number, number, number, number];
  /** in mask (.m-draw) order, the order prepLineArt schedules them */
  strokes: LineStroke[];
  /** the finished ink as a standalone SVG: the visible ribbons under the brush filter, no per-stroke masks. Every
   *  ribbon lies inside its centreline's stroke (checked for all eight motifs), so at rest the masks clip nothing:
   *  this renders exactly like the finished drawing, at a fraction of the cost (one filter, no 100-200 mask layers). */
  ink: string;
  /** the motif's own ink colour (the --m-ink fallback in its SVG) */
  fallbackInk: string;
}

const attr = (tag: string, name: string): string | undefined => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

/** Read a line motif SVG (src/assets/motifs, tools/motifs/optimize.mjs) without building a DOM: one regex pass. */
export function parseLineSvg(text: string): LineArtData {
  const vb = (attr(text.match(/<svg\b[^>]*>/)?.[0] ?? '', 'viewBox') ?? '0 0 100 100')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const viewBox = [vb[0] ?? 0, vb[1] ?? 0, vb[2] || 100, vb[3] || 100] as [number, number, number, number];
  const strokes: LineStroke[] = [];
  const byMask = new Map<string, LineStroke>();
  for (const m of text.matchAll(/<mask\b([^>]*)>([\s\S]*?)<\/mask>/g)) {
    const path = (m[2] as string).match(/<path\b[^>]*class="m-draw"[^>]*>/)?.[0];
    if (!path) continue;
    const centre = attr(path, 'd') ?? '';
    const s: LineStroke = {
      centre,
      width: Number(attr(path, 'stroke-width') ?? 1) || 1,
      ribbon: '',
      visible: hasSegment(centre),
    };
    strokes.push(s);
    const id = attr(m[1] as string, 'id');
    if (id) byMask.set(id, s);
  }
  const ink = text
    .replace(/^<\?xml[^>]*>/, '')
    .replace(/<mask\b[^>]*>[\s\S]*?<\/mask>/g, '')
    .replace(/<g\b[^>]*class="m-draw-set"[^>]*>\s*<\/g>/g, '')
    .replace(/<path\b[^>]*class="m-stroke"[^>]*>/g, (tag) => {
      const id = attr(tag, 'mask')?.match(/url\(#([^)]+)\)/)?.[1];
      const s = id ? byMask.get(id) : undefined;
      if (s) s.ribbon = attr(tag, 'd') ?? '';
      if (s && !s.visible) return '';
      return tag.replace(/\smask="[^"]*"/, '');
    })
    .replace(/<svg\b(?![^>]*\swidth=)/, `<svg width="${viewBox[2]}" height="${viewBox[3]}"`);
  const fallbackInk = text.match(/var\(--m-ink,\s*([^)\s]+)\s*\)/)?.[1] ?? '#7a3326';
  return { viewBox, strokes, ink, fallbackInk };
}

/** The subpaths of a polyline path (M/L/H/V/Z, absolute and relative, implicit linetos) as flat [x0, y0, x1, y1, ..]
 *  point lists (a closed subpath repeats its first point), or null for any other command (curves, arcs). */
export function polyPoints(d: string): number[][] | null {
  const tok = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const subs: number[][] = [];
  let cur: number[] | null = null;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = '';
  let i = 0;
  const num = () => Number(tok[i++]);
  const lineTo = (nx: number, ny: number) => {
    if (!cur) {
      cur = [x, y];
      subs.push(cur);
    }
    x = nx;
    y = ny;
    cur.push(x, y);
  };
  while (i < tok.length) {
    const t = tok[i] as string;
    if (/^[a-zA-Z]$/.test(t)) {
      i++;
      cmd = t;
      if (cmd === 'z' || cmd === 'Z') {
        if (cur) cur.push(sx, sy);
        x = sx;
        y = sy;
        cur = null;
      }
      continue;
    }
    const before = i;
    switch (cmd) {
      case 'M':
      case 'm': {
        const nx = num();
        const ny = num();
        x = cmd === 'm' ? x + nx : nx;
        y = cmd === 'm' ? y + ny : ny;
        cur = [x, y];
        subs.push(cur);
        sx = x;
        sy = y;
        cmd = cmd === 'm' ? 'l' : 'L';
        break;
      }
      case 'L':
        lineTo(num(), num());
        break;
      case 'l': {
        const dx = num();
        const dy = num();
        lineTo(x + dx, y + dy);
        break;
      }
      case 'H':
        lineTo(num(), y);
        break;
      case 'h':
        lineTo(x + num(), y);
        break;
      case 'V':
        lineTo(x, num());
        break;
      case 'v':
        lineTo(x, y + num());
        break;
      default:
        return null;
    }
    if (i === before || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  }
  return subs;
}

/** Length of a path from its data: exact for polylines (what getTotalLength returns), estimated otherwise. */
export function pathLength(d: string): number {
  const subs = polyPoints(d);
  if (!subs) return estimateLength(d);
  let len = 0;
  for (const s of subs)
    for (let i = 2; i + 1 < s.length; i += 2)
      len += Math.hypot((s[i] as number) - (s[i - 2] as number), (s[i + 1] as number) - (s[i - 1] as number));
  return len;
}

/** Does the path paint anything when stroked? A lone moveto does not (no caps either, SVG 2 13.6.2). */
export function hasSegment(d: string): boolean {
  const subs = polyPoints(d);
  return subs ? subs.some((s) => s.length >= 4) : true; // curves or arcs: assume it paints
}

/** [x0, y0, x1, y1] of a polyline path's points; null for a path without points or with curves (unknown). */
export function pathBounds(d: string): [number, number, number, number] | null {
  const pts = polyPoints(d)?.flat() ?? [];
  if (pts.length < 2) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const px = pts[i] as number;
    const py = pts[i + 1] as number;
    if (px < x0) x0 = px;
    if (px > x1) x1 = px;
    if (py < y0) y0 = py;
    if (py > y1) y1 = py;
  }
  return [x0, y0, x1, y1];
}

/** Scroll-linked draw (3.4 a, QA r1 D2): p = clamp((0.85 vh - mid) / (0.4 vh)) for an element whose vertical centre is
 *  `mid` px from the viewport top: 0 while its centre is below 85% of the viewport, 1 once the centre has climbed to
 *  45%. Per motif, so the first row of a section is complete while its title is read. */
export function scrollDrawProgress(mid: number, vh: number): number {
  if (vh <= 0) return 1;
  const p = (0.85 * vh - mid) / (0.4 * vh);
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/** Scroll-linked progress in `steps` equal steps (QA r1 M5: most frames then write nothing, and the filtered SVG is not
 *  repainted on every scroll frame). 0 and 1 stay exact. */
export function quantise(p: number, steps = 48): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return Math.round(p * steps) / steps;
}
