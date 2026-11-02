// The canvas line art (spec 3.4 a, src/components/motion/lineCanvas.ts): the motif SVG read as data in one pass, the
// polyline maths, the finished-ink SVG the canvas is masked by (every ribbon inside its mask's stroke, so dropping
// the masks changes nothing at rest), and the renderer's bookkeeping against a recording 2D context (jsdom has no
// canvas): the same schedule as the SVG draw, nothing painted at p = 0, every visible stroke at p = 1, a scroll frame
// paints only the strokes that moved, scrolling back clears and repaints.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  drawSchedule,
  hasSegment,
  parseLineSvg,
  pathBounds,
  pathLength,
  polyPoints,
  prefixIds,
  strokeProgress,
} from '../../src/lib/linedraw';
import { LineCanvas } from '../../src/components/motion/lineCanvas';

const DIR = resolve(process.cwd(), 'src/assets/motifs');
const motifs = readdirSync(DIR).filter((f) => f.endsWith('.svg'));
const read = (f: string) => readFileSync(resolve(DIR, f), 'utf8');

describe('line SVG as data (3.4 a)', () => {
  it('polyline paths: absolute and relative, implicit linetos, closepath', () => {
    expect(polyPoints('M0 0 L3 4')).toEqual([[0, 0, 3, 4]]);
    expect(polyPoints('m10 10 5 0 0 5z')).toEqual([[10, 10, 15, 10, 15, 15, 10, 10]]);
    expect(polyPoints('M1 1h2v2H0V0')).toEqual([[1, 1, 3, 1, 3, 3, 0, 3, 0, 0]]);
    // svgo's compact numbers: "1.5.5" is 1.5 and .5, "2-2" is 2 and -2
    expect(polyPoints('M0 0l1.5.5 2-2')).toEqual([[0, 0, 1.5, 0.5, 3.5, -1.5]]);
    expect(polyPoints('M0 0C1 1 2 2 3 3')).toBeNull();
    expect(pathLength('M0 0 L3 4 h5')).toBeCloseTo(10, 10);
    expect(pathLength('M0 0 h10 v10 z')).toBeCloseTo(10 + 10 + Math.SQRT2 * 10, 10);
    expect(pathBounds('m10 10 5 0 0 5z')).toEqual([10, 10, 15, 15]);
  });

  it('a lone moveto paints nothing, a short segment does', () => {
    expect(hasSegment('M500 500')).toBe(false);
    expect(hasSegment('M263.2 598h.6')).toBe(true);
    expect(hasSegment('M0 0C1 1 2 2 3 3')).toBe(true);
  });

  it('prefixIds rewrites every id and reference in one pass, and nothing else', () => {
    const t =
      '<g id="a"/><mask id="a-k1"/><mask id="a-k10"/><path mask="url(#a-k1)"/><use href="#a-k10"/><x data-ref="url(#zz)"/>';
    expect(prefixIds(t, 'p')).toBe(
      '<g id="p-a"/><mask id="p-a-k1"/><mask id="p-a-k10"/><path mask="url(#p-a-k1)"/><use href="#p-a-k10"/><x data-ref="url(#zz)"/>',
    );
  });

  it.each(motifs)('%s: strokes in mask order, the finished ink without masks', (f) => {
    const text = read(f);
    const d = parseLineSvg(text);
    const masks = text.match(/<mask\b/g)?.length ?? 0;
    expect(d.strokes).toHaveLength(masks);
    expect(Number(text.match(/data-strokes="(\d+)"/)?.[1])).toBe(masks);
    for (const s of d.strokes) {
      expect(s.width).toBeGreaterThan(0);
      expect(s.ribbon, 'every mask reveals a ribbon').not.toBe('');
      expect(polyPoints(s.centre), 'centrelines are polylines').not.toBeNull();
    }
    expect(d.ink).not.toMatch(/<mask\b|\smask="/);
    expect(d.ink).toMatch(/<filter\b/);
    expect(d.ink).toMatch(/^<svg\b[^>]*\swidth="[\d.]+"[^>]*\sheight="[\d.]+"/);
    const visible = d.strokes.filter((s) => s.visible).length;
    expect(d.ink.match(/class="m-stroke"/g)?.length ?? 0).toBe(visible);
    expect(d.fallbackInk).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it.each(motifs)('%s: every ribbon lies inside its mask stroke (dropping the masks clips nothing at rest)', (f) => {
    const d = parseLineSvg(read(f));
    const dist = (px: number, py: number, s: number[]) => {
      let best = Infinity;
      for (let i = 2; i + 1 < s.length; i += 2) {
        const [x0, y0, x1, y1] = [s[i - 2]!, s[i - 1]!, s[i]!, s[i + 1]!];
        const vx = x1 - x0;
        const vy = y1 - y0;
        const l = vx * vx + vy * vy;
        const t = l ? Math.max(0, Math.min(1, ((px - x0) * vx + (py - y0) * vy) / l)) : 0;
        best = Math.min(best, Math.hypot(px - (x0 + t * vx), py - (y0 + t * vy)));
      }
      return best;
    };
    for (const s of d.strokes.filter((x) => x.visible)) {
      const centre = polyPoints(s.centre)!.flat();
      for (const sub of polyPoints(s.ribbon)!)
        for (let i = 0; i + 1 < sub.length; i += 2)
          expect(dist(sub[i]!, sub[i + 1]!, centre)).toBeLessThanOrEqual(s.width / 2 + 0.6);
    }
  });
});

/* ------------------------------------------------------------------------------- the renderer, recorded */

interface Call {
  op: string;
  args: unknown[];
}
function recordingCanvas() {
  const calls: Call[] = [];
  const ctx = new Proxy(
    { calls },
    {
      get(_target, prop) {
        if (prop === 'calls') return calls;
        if (prop === 'canvas') return undefined;
        return (...args: unknown[]) => calls.push({ op: String(prop), args });
      },
      set(_t, prop, value) {
        calls.push({ op: `=${String(prop)}`, args: [value] });
        return true;
      },
    },
  );
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

class FakePath2D {
  constructor(public d = '') {}
  moveTo() {}
  lineTo() {}
  arc() {}
  closePath() {}
  rect() {}
  addPath() {}
}

describe('LineCanvas (3.4 a)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const svg = (n: number) =>
    `<svg viewBox="0 0 100 100" data-strokes="${n}"><defs><filter id="b"><feTurbulence/></filter>` +
    Array.from(
      { length: n },
      (_, i) => `<mask id="k${i}"><path stroke-width="6" d="M10 ${10 + i * 20}h80" class="m-draw"/></mask>`,
    ).join('') +
    `</defs><g class="m-ink" filter="url(#b)" style="fill:var(--m-ink,#7a3326)">` +
    Array.from(
      { length: n },
      (_, i) => `<path d="M10 ${8 + i * 20}h80v4H10z" class="m-stroke" mask="url(#k${i})"/>`,
    ).join('') +
    '</g></svg>';

  const make = (n = 4) => {
    vi.stubGlobal('Path2D', FakePath2D);
    const { canvas, calls } = recordingCanvas();
    const lc = new LineCanvas(parseLineSvg(svg(n)), { overlap: 0.2 }, '#123456', canvas);
    lc.setSize(200, 2);
    return { lc, calls, canvas };
  };
  const ribbonFills = (calls: Call[]) => calls.filter((c) => c.op === 'fill').length;

  it('sizes the backing store by the art width, at most 2 device pixels per CSS pixel', () => {
    const { lc, canvas } = make();
    expect([canvas.width, canvas.height]).toEqual([400, 400]);
    lc.setSize(200, 3);
    expect(canvas.width).toBe(400);
    lc.setSize(150, 1);
    expect([canvas.width, canvas.height]).toEqual([150, 150]);
  });

  it('p = 0 paints nothing, p = 1 every stroke, the same schedule as the SVG draw', () => {
    const { lc, calls } = make(4);
    lc.draw(0);
    expect(ribbonFills(calls)).toBe(0);
    expect(lc.drawn()).toBe(0);
    lc.draw(1);
    expect(ribbonFills(calls)).toBe(4);
    expect(lc.drawn()).toBe(1);
    // the slots are drawSchedule over (length + 2), as prepLineArt measures them
    const slots = drawSchedule([82, 82, 82, 82], { overlap: 0.2 });
    const p = (slots[1]![0] + slots[1]![1]) / 2;
    const fresh = make(4);
    fresh.lc.draw(p);
    expect(fresh.lc.drawn()).toBeCloseTo(slots.map((s) => strokeProgress(s, p)).reduce((a, b) => a + b, 0) / 4, 3);
  });

  it('a scroll frame paints only the strokes that moved, and clears where it goes back', () => {
    const { lc, calls } = make(4);
    lc.draw(0.1);
    calls.length = 0;
    lc.draw(0.1);
    expect(calls).toHaveLength(0); // nothing moved: no canvas work at all
    lc.draw(0.12);
    const forward = calls.splice(0);
    expect(ribbonFills(forward)).toBeGreaterThan(0);
    expect(ribbonFills(forward)).toBeLessThanOrEqual(2);
    expect(forward.some((c) => c.op === 'clearRect')).toBe(false);
    lc.draw(0.05);
    const back = calls.splice(0);
    expect(back.some((c) => c.op === 'clearRect')).toBe(true);
  });

  it('a new size or ink repaints everything once', () => {
    const { lc, calls } = make(4);
    lc.draw(1);
    calls.length = 0;
    lc.setInk('#654321');
    lc.draw(1);
    expect(calls.some((c) => c.op === 'clearRect')).toBe(true);
    expect(ribbonFills(calls)).toBe(4);
    expect(calls.some((c) => c.op === '=fillStyle' && c.args[0] === '#654321')).toBe(true);
  });

  it('strokes whose centreline is a lone moveto never paint (their mask shows nothing)', () => {
    vi.stubGlobal('Path2D', FakePath2D);
    const { canvas, calls } = recordingCanvas();
    const text = svg(3).replace('d="M10 30h80"', 'd="M10 30"');
    const lc = new LineCanvas(parseLineSvg(text), {}, '#123456', canvas);
    lc.setSize(100, 1);
    lc.draw(1);
    expect(ribbonFills(calls)).toBe(2);
  });
});
