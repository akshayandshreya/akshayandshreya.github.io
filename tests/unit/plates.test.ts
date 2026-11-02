// Plate and sprite sources: responsive <picture> sources, `sizes` that make the browser fetch the covered / drawn width,
// and the object-fit: cover math (spec 5.5, 6.6, 3.5).
import { describe, expect, it } from 'vitest';
import {
  PLATE_IDS,
  coverRect,
  lqipVars,
  placeOnCover,
  plateEntry,
  plateLayer,
  platePicture,
  platePreloads,
  plateSizes,
  plateUrl,
  ratio,
} from '../../src/lib/plates';
import { COUPLE_CAP, clampToSizes, coupleImage, coupleSizes, motifSprite, SPRITES } from '../../src/lib/sprites';
import { CHECK_VIEWPORTS, coupleHeight } from '../../src/lib/breakpoints';

/** A tiny `sizes` evaluator for the media features this site uses (enough to check our own strings). */
function evalSizes(sizes: string, w: number, h: number): number {
  const feature = (f: string): boolean => {
    const m = /^\(\s*([a-z-]+)\s*:\s*([^)]+)\)$/.exec(f.trim());
    if (!m) throw new Error(`unknown media ${f}`);
    const [, name, raw] = m as unknown as [string, string, string];
    const v = raw.trim();
    const frac = () => {
      const [a, b] = v.split('/').map(Number);
      return (a ?? 0) / (b ?? 1);
    };
    switch (name) {
      case 'max-aspect-ratio':
        return w / h <= frac();
      case 'min-aspect-ratio':
        return w / h >= frac();
      case 'max-height':
        return h <= parseFloat(v);
      case 'min-width':
        return w >= parseFloat(v);
      case 'orientation':
        return v === 'landscape' ? w > h : h >= w;
      default:
        throw new Error(`unknown feature ${name}`);
    }
  };
  const length = (l: string): number => {
    const m = /^(-?\d+(?:\.\d+)?)(px|vw|vh|lvh)$/.exec(l.trim());
    if (!m) throw new Error(`unknown length ${l}`);
    const n = Number(m[1]);
    return m[2] === 'px' ? n : m[2] === 'vw' ? (n * w) / 100 : (n * h) / 100;
  };
  for (const entry of sizes.split(/,\s*/)) {
    const i = entry.lastIndexOf(' ');
    const cond = i < 0 ? '' : entry.slice(0, i).trim();
    const len = i < 0 ? entry : entry.slice(i + 1);
    if (!cond || cond.split(/\s+and\s+/).every(feature)) return length(len);
  }
  throw new Error('no sizes entry matched');
}

describe('plate sources (5.5)', () => {
  it('knows all nine plates', () => {
    expect(PLATE_IDS.sort()).toEqual(
      ['closing', 'cultures', 'engagement', 'haldi', 'invitation', 'mehndi', 'opening', 'reception', 'wedding'].sort(),
    );
  });

  it('sizes are the covered width of each frame', () => {
    expect(ratio(1080, 2340)).toBe('6/13'); // = 18/39
    expect(plateSizes('tall')).toBe('(max-aspect-ratio: 6/13) 46.15lvh, 100vw');
    expect(plateSizes('mid')).toBe('(max-aspect-ratio: 4/5) 80lvh, 100vw');
    expect(plateSizes('wide')).toBe('(max-aspect-ratio: 16/9) 177.78lvh, 100vw');
    // a 390x844 phone covers by height (0.462 < 0.4615 is false): 100vw; a 360x800 one by height
    expect(evalSizes(plateSizes('tall'), 390, 844)).toBe(390);
    expect(evalSizes(plateSizes('tall'), 360, 800)).toBeCloseTo(369.2, 1);
    expect(evalSizes(plateSizes('wide'), 1440, 900)).toBeCloseTo(1600, 0); // 16:10 is narrower than 16:9
    expect(evalSizes(plateSizes('wide'), 1920, 1080)).toBeCloseTo(1920, -1);
    expect(evalSizes(plateSizes('wide'), 1280, 1000)).toBeCloseTo(1777.8, 1);
  });

  for (const id of ['opening', 'mehndi', 'reception', 'closing']) {
    it(`${id}: AVIF then WebP per frame, tall -> mid -> wide, every URL resolved`, () => {
      const pic = platePicture(id);
      expect(pic).toBeDefined();
      if (!pic) return;
      expect(pic.sources.map((s) => `${s.type}|${s.media ?? ''}`)).toEqual([
        'image/avif|(max-aspect-ratio: 3/5)',
        'image/webp|(max-aspect-ratio: 3/5)',
        'image/avif|(max-aspect-ratio: 5/4)',
        'image/webp|(max-aspect-ratio: 5/4)',
        'image/avif|',
        'image/webp|',
      ]);
      expect(pic.sources[0]?.srcSet).toMatch(/ 540w, .* 828w, .* 1170w$/);
      expect(pic.sources[2]?.srcSet).toMatch(/ 768w, .* 1152w, .* 1536w$/);
      expect(pic.sources[4]?.srcSet).toMatch(/ 1280w, .* 1920w, .* 2560w$/);
      for (const s of pic.sources) {
        for (const c of s.srcSet.split(', ')) expect(c).toMatch(/^\S+\.(avif|webp) \d+w$/);
      }
      expect(pic.img).toMatchObject({ width: 1920, height: 1080 });
      expect(pic.img.src).toMatch(/wide-1920.*\.webp$/);
      expect(pic.focal).toBe(plateEntry(id)?.focal);
    });
  }

  it('a phone at 3x fetches the 1170 tall file, a 1440 desktop the 1920 wide one (largest needed <= available)', () => {
    const pick = (srcSet: string, need: number) => {
      const ws = srcSet.split(', ').map((c) => Number(c.split(' ')[1]?.replace('w', '')));
      return ws.find((x) => x >= need) ?? Math.max(...ws);
    };
    const pic = platePicture('mehndi');
    expect(pick(pic?.sources[0]?.srcSet ?? '', evalSizes(plateSizes('tall'), 390, 844) * 3)).toBe(1170);
    expect(pick(pic?.sources[0]?.srcSet ?? '', evalSizes(plateSizes('tall'), 360, 640) * 2)).toBe(828);
    expect(pick(pic?.sources[4]?.srcSet ?? '', evalSizes(plateSizes('wide'), 1440, 900) * 1)).toBe(1920);
  });

  it('gold and veil layers: one file per frame on the same grid', () => {
    const g = plateLayer('wedding', 'gold');
    expect(g?.sources.map((s) => s.media)).toEqual(['(max-aspect-ratio: 3/5)', '(max-aspect-ratio: 5/4)']);
    expect(g?.sources[0]?.srcSet).toMatch(/tall-gold.*\.webp$/);
    expect(g?.img.src).toMatch(/wide-gold.*\.webp$/);
    expect(plateLayer('wedding', 'veil')?.img.src).toMatch(/wide-veil.*\.webp$/);
    expect(plateLayer('nope', 'gold')).toBeUndefined();
  });

  it('LQIPs as CSS variables, preloads with matching media', () => {
    const v = lqipVars('opening');
    expect(Object.keys(v)).toEqual(['--lqip-tall', '--lqip-mid', '--lqip-wide']);
    expect(v['--lqip-tall']).toMatch(/^url\("data:image\/webp;base64,/);
    const pre = platePreloads('opening');
    expect(pre.map((p) => p.media)).toEqual([
      '(max-aspect-ratio: 3/5)',
      '(min-aspect-ratio: 3/5) and (max-aspect-ratio: 5/4)',
      '(min-aspect-ratio: 5/4)',
    ]);
    expect(pre[0]?.imageSizes).toBe(plateSizes('tall'));
    expect(plateUrl('plates/none.avif')).toBe('');
  });
});

describe('cover math (3.5: the reveal canvas and the <picture> coincide)', () => {
  it('height-bound and width-bound, with the focal point', () => {
    // 390x844 box, tall 1080x2340 image: width-bound (scale 0.3611 x, 0.3607 y -> max)
    const r = coverRect(390, 844, 1080, 2340, '50% 45%');
    expect(r.w).toBeCloseTo(390, 0);
    expect(r.h).toBeCloseTo(845, 0);
    expect(r.x).toBeCloseTo(0, 0);
    // 1440x900 box, wide 1920x1080: scale 0.8333 -> 1600x900; free x = -160, at 50% -> -80
    const w = coverRect(1440, 900, 1920, 1080, '50% 45%');
    expect(w).toMatchObject({ y: 0, w: 1600, h: 900 });
    expect(w.x).toBeCloseTo(-80);
    // 30% focal shifts the crop left of centre; keywords work
    expect(coverRect(1440, 900, 1920, 1080, '30% 50%').x).toBeCloseTo(-48);
    expect(coverRect(1440, 900, 1920, 1080, 'left top').x).toBeCloseTo(0);
    expect(coverRect(1440, 900, 1920, 1080, 'right').x).toBeCloseTo(-160);
  });

  it('places frame fractions on the covered image', () => {
    const c = { x: -80, y: 0, w: 1600, h: 900 };
    expect(placeOnCover([0.5, 0.5, 0.1, 0.2], c)).toEqual({ x: 720, y: 450, w: 160, h: 180 });
  });
});

describe('couple sprites (2.3.4, 5.2, 6.6)', () => {
  const events = ['mehndi', 'engagement', 'haldi', 'wedding', 'reception'];

  it('every event has an AVIF + WebP picture with real widths and a height-derived sizes', () => {
    for (const e of events) {
      const c = coupleImage(e);
      expect(c, e).toBeDefined();
      if (!c) continue;
      const entry = SPRITES.couples[e as keyof typeof SPRITES.couples];
      expect(c.sources[0]?.type).toBe('image/avif');
      expect(c.sources[0]?.srcSet.split(', ')).toHaveLength(3);
      expect(c.img.srcSet).toContain(`${entry.width['960']}w`);
      expect(c.img.width / c.img.height).toBeCloseTo(entry.aspect, 2);
      expect(c.vars['--couple-hs']).toBe(String(entry.heightScale));
      expect(c.img.sizes.split(', ').at(-1)).toMatch(/^\d+px$/); // the last entry has no condition
    }
    expect(coupleImage('nope')).toBeUndefined();
  });

  it("Haldi's nominal 960 file is 927 px tall (never upscaled)", () => {
    expect(coupleImage('haldi')?.img.height).toBe(927);
  });

  it('sizes equals the drawn width (height x heightScale x aspect) at every checked viewport', () => {
    for (const e of events) {
      const entry = SPRITES.couples[e as keyof typeof SPRITES.couples];
      const sizes = coupleSizes(entry);
      for (const { w, h } of CHECK_VIEWPORTS) {
        const drawn = coupleHeight(w, h) * entry.heightScale * entry.aspect;
        expect(evalSizes(sizes, w, h), `${e} ${w}x${h}`).toBeCloseTo(drawn, -0.5);
      }
    }
  });

  it('clampToSizes writes a clamp as conditioned lengths', () => {
    expect(clampToSizes('', { min: 220, vh: 0.4, max: 460 }, 0.5)).toEqual([
      '(max-height: 550px) 110px',
      '(max-height: 1150px) 20vh',
      '230px',
    ]);
    expect(clampToSizes('(min-width: 900px)', { min: 0, vh: 0.68, max: 640 }, 1)).toEqual([
      '(min-width: 900px) and (max-height: 941px) 68vh',
      '(min-width: 900px) 640px',
    ]);
    expect(COUPLE_CAP).toBe(640);
  });

  it('motif sprites: width descriptors from height-keyed files', () => {
    const k = motifSprite('invitation-kalash');
    expect(k?.srcSet).toMatch(/ 184w$/); // 240h x 0.7667
    expect(k).toMatchObject({ height: 240, mask: false });
    expect(motifSprite('ghost-alpana')?.mask).toBe(true);
    expect(motifSprite('nope')).toBeUndefined();
  });
});
