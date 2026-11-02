// tools/plates/recipes.js against the plate table of spec 1.3: the site paints the card's family (same seeds, styles,
// densities, gold) in three frame shapes, with quiet zones where text and the couple sit. The recipes file is a
// classic browser script for the asset page; here it runs in a sandbox with a stub paint library.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Zone {
  x: number;
  y: number;
  r?: number;
  rx?: number;
  ry?: number;
  k: number;
}
interface Zones {
  calm: Zone[];
  glow?: { x: number; y: number; r: number; k: number };
  floor?: number;
  couple?: [number, number];
  vortices?: { x: number; y: number; r: number; s: number }[];
}
interface Recipe {
  id: string;
  palette: string;
  style: string;
  seed: number;
  density: number;
  contrast: number;
  gold: number;
  goldLines: number;
  flecks: number;
  focal: string;
  mood: 'light' | 'deep';
  hue?: [string, number];
  zones: (frame: 'tall' | 'mid' | 'wide') => Zones;
  under?: (c: [number, number]) => { at: [number, number]; r: number; color: string; alpha: number; blend: string }[];
}

function load() {
  const src = readFileSync(resolve(__dirname, '../../tools/plates/recipes.js'), 'utf8');
  const win: Record<string, unknown> = {};
  const P = {
    palette: (k: string) => ({
      name: k,
      strokes: ['#000000'],
      ground: ['#111111', '#222222', '#333333'],
      lights: ['#444444'],
    }),
    css: (c: unknown) => String(c),
    mix: (a: unknown) => a,
  };
  new Function('window', 'P', src)(win, P);
  return win as {
    RECIPES: Record<string, Recipe>;
    FRAMES: Record<string, { W: number; H: number; widths: number[] }>;
    PAL: Record<string, () => { name: string }>;
  };
}

const { RECIPES, FRAMES, PAL } = load();

// spec 1.3: plate -> palette, style, seed, density, contrast, gold, goldLines, flecks
const TABLE: [string, string, string, number, number, number, number, number, number][] = [
  ['opening', 'ivory', 'halo', 3611, 1, 1, 1, 2, 40],
  ['invitation', 'blush', 'veil', 3621, 0.8, 0.66, 0.7, 0, 30],
  ['mehndi', 'sage', 'swirl', 3631, 0.75, 0.75, 0.5, 0, 26],
  ['engagement', 'rose', 'swirl', 3641, 0.7, 0.55, 0.5, 0, 26],
  ['haldi', 'turmeric', 'veil', 3651, 0.85, 0.85, 0.5, 0, 30],
  ['wedding', 'vermilion', 'swirl', 3661, 0.8, 0.75, 0.5, 2, 40],
  ['reception', 'teal', 'veil', 3761, 0.66, 0.44, 0.5, 0, 26],
  ['cultures', 'ivory', 'halo', 3791, 0.6, 0.5, 0.6, 1, 20],
  ['closing', 'ivory', 'halo', 3681, 1, 1, 1, 1, 50],
];

describe('plate recipes (spec 1.3)', () => {
  it('has exactly the nine plates', () => {
    expect(Object.keys(RECIPES).sort()).toEqual(TABLE.map((r) => r[0]).sort());
  });

  for (const [id, palette, style, seed, density, contrast, gold, goldLines, flecks] of TABLE) {
    it(`${id}: the card's seed and settings`, () => {
      const r = RECIPES[id]!;
      expect(r.id).toBe(id);
      expect({
        palette: r.palette,
        style: r.style,
        seed: r.seed,
        density: r.density,
        contrast: r.contrast,
        gold: r.gold,
        goldLines: r.goldLines,
        flecks: r.flecks,
      }).toEqual({
        palette,
        style,
        seed,
        density,
        contrast,
        gold,
        goldLines,
        flecks,
      });
      expect(r.mood).toBe(palette === 'vermilion' || palette === 'teal' ? 'deep' : 'light');
      // every frame has at least one calm zone, all inside the frame
      for (const f of ['tall', 'mid', 'wide'] as const) {
        const z = r.zones(f);
        expect(z.calm.length, `${id} ${f}`).toBeGreaterThan(0);
        for (const c of z.calm) {
          expect(c.x).toBeGreaterThan(0);
          expect(c.x).toBeLessThan(1);
          expect(c.y).toBeGreaterThan(0);
          expect(c.y).toBeLessThan(1);
          expect(c.k).toBeGreaterThan(0.6);
        }
      }
    });
  }

  it('frames: tall 1080x2340, mid 1080x1350, wide 1920x1080, three widths each', () => {
    expect(FRAMES).toEqual({
      tall: { W: 1080, H: 2340, widths: [540, 828, 1170] },
      mid: { W: 1080, H: 1350, widths: [768, 1152, 1536] },
      wide: { W: 1920, H: 1080, widths: [1280, 1920, 2560] },
    });
  });

  it('opening: the vortex and quiet zones at Ganesh and the text column', () => {
    const t = RECIPES.opening!.zones('tall');
    expect(t.vortices).toEqual([{ x: 0.5, y: 0.24, r: 0.55, s: 1.2 }]);
    expect(t.calm).toEqual([
      { x: 0.5, y: 0.24, r: 0.28, k: 0.82 },
      { x: 0.5, y: 0.6, rx: 0.44, ry: 0.3, k: 0.8 },
    ]);
    const w = RECIPES.opening!.zones('wide');
    expect(w.calm).toEqual([
      { x: 0.5, y: 0.26, r: 0.28, k: 0.82 },
      { x: 0.5, y: 0.66, rx: 0.3, ry: 0.3, k: 0.8 },
    ]);
  });

  it('invitation: the single-hue clamp and the calm names zone', () => {
    expect(RECIPES.invitation!.hue).toEqual(['#ead2c6', 0.55]);
    expect(RECIPES.invitation!.zones('tall').calm).toEqual([{ x: 0.5, y: 0.52, rx: 0.48, ry: 0.34, k: 0.88 }]);
    expect(RECIPES.invitation!.zones('wide').calm).toEqual([{ x: 0.5, y: 0.52, rx: 0.34, ry: 0.4, k: 0.88 }]);
  });

  it('events: stacked calm zones, a painted floor, the couple alternating sides on wide', () => {
    const stacked = RECIPES.mehndi!.zones('tall');
    expect(stacked.calm).toEqual([
      { x: 0.5, y: 0.13, rx: 0.44, ry: 0.07, k: 0.8 },
      { x: 0.5, y: 0.47, rx: 0.36, ry: 0.2, k: 0.74 },
      { x: 0.5, y: 0.82, rx: 0.46, ry: 0.1, k: 0.88 },
    ]);
    expect(stacked.floor).toBe(0.74);
    const sides: Record<string, number> = { mehndi: 0.3, engagement: 0.7, haldi: 0.3, wedding: 0.7, reception: 0.3 };
    for (const [id, cx] of Object.entries(sides)) {
      const w = RECIPES[id]!.zones('wide');
      expect(w.floor, id).toBe(0.86);
      expect(w.couple![0], id).toBe(cx);
      expect(w.calm[0], id).toEqual({ x: cx, y: 0.55, rx: 0.18, ry: 0.35, k: 0.7 });
      expect(w.calm[1], id).toEqual({ x: 1 - cx, y: 0.5, rx: 0.25, ry: 0.38, k: 0.88 });
    }
  });

  it("the card's glows: haldi sun, wedding warmth, reception lamps", () => {
    const haldi = RECIPES.haldi!.under!([0.5, 0.47]);
    expect(haldi.map((g) => [g.color, g.blend])).toEqual([
      ['#eea23a', 'soft-light'],
      ['#ffe7ad', 'screen'],
      ['#fff4d8', 'screen'],
    ]);
    expect(haldi[0]!.at[1]).toBe(0.17);
    expect(haldi[1]!.at[1]).toBe(0.13);
    expect(RECIPES.wedding!.under!([0.5, 0.47])).toEqual([
      { at: [0.5, 0.47], r: 0.43, color: '#fbdcc4', alpha: 0.26, blend: 'screen' },
    ]);
    const rec = RECIPES.reception!.under!([0.5, 0.47]);
    expect(rec.map((g) => [g.color, g.alpha])).toEqual([
      ['#f0d29a', 0.34],
      ['#d9b77e', 0.1],
    ]);
  });

  it('cultures: two quiet halves; closing: the glow at the diya', () => {
    expect(RECIPES.cultures!.zones('wide').calm.map((c) => [c.x, c.y])).toEqual([
      [0.28, 0.5],
      [0.72, 0.5],
    ]);
    expect(RECIPES.cultures!.zones('tall').calm.map((c) => [c.x, c.y])).toEqual([
      [0.5, 0.3],
      [0.5, 0.72],
    ]);
    expect(RECIPES.cultures!.zones('tall').glow).toEqual({ x: 0.5, y: 0.5, r: 0.7, k: 0.5 });
    const c = RECIPES.closing!.zones('tall');
    expect(c.glow).toEqual({ x: 0.5, y: 0.86, r: 0.5, k: 0.7 });
    expect(c.calm).toEqual([
      { x: 0.5, y: 0.42, rx: 0.46, ry: 0.3, k: 0.92 },
      { x: 0.5, y: 0.86, rx: 0.24, ry: 0.08, k: 0.7 },
    ]);
  });

  it('focal points for object-position (5.3)', () => {
    expect(RECIPES.opening!.focal).toBe('50% 30%');
    expect(RECIPES.closing!.focal).toBe('50% 70%');
    for (const id of ['mehndi', 'engagement', 'haldi', 'wedding', 'reception'])
      expect(RECIPES[id]!.focal).toBe('50% 45%');
  });

  it('palettes: the blush and evening-teal variants of card.js', () => {
    expect(PAL.blush!().name).toBe('blush');
    expect(PAL.teal!().name).toBe('teal-evening');
    for (const k of ['ivory', 'sage', 'rose', 'turmeric', 'vermilion']) expect(PAL[k]!().name).toBe(k);
  });
});
