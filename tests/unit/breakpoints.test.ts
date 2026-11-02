// Frames, layout modes and the couple height table (spec 5.1, 5.2).
import { describe, expect, it } from 'vitest';
import {
  CHECK_VIEWPORTS,
  COUPLE_HEIGHT,
  COUPLE_MAX_PX,
  LAYOUT_TABLE,
  MEDIA,
  coupleHeight,
  coupleMode,
  coupleSide,
  frameFor,
  isShort,
  layoutFor,
  resolveClamp,
  widthStep,
  type LayoutMode,
} from '../../src/lib/breakpoints';
import { SPRITES } from '../../src/lib/sprites';

describe('frames (5.1)', () => {
  const cases: [number, number, string, LayoutMode][] = [
    [360, 640, 'tall', 'stacked'],
    [390, 844, 'tall', 'stacked'],
    [430, 932, 'tall', 'stacked'],
    [768, 1024, 'mid', 'stacked'],
    [820, 1180, 'mid', 'stacked'],
    [1000, 1000, 'mid', 'stacked'],
    [1024, 768, 'wide', 'split'],
    [800, 600, 'wide', 'stacked'], // a wide window narrower than 900 px stays stacked on the wide plate
    [1440, 900, 'wide', 'split'],
    [1920, 1080, 'wide', 'split'],
    [844, 390, 'wide', 'short'],
    [667, 375, 'wide', 'short'],
  ];
  for (const [w, h, frame, mode] of cases) {
    it(`${w}x${h} -> ${frame}, ${mode}`, () => {
      expect(frameFor(w, h)).toBe(frame);
      expect(layoutFor(w, h)).toBe(mode);
    });
  }

  it('ties resolve like the <source> order (tall at exactly 3/5, mid at exactly 5/4)', () => {
    expect(frameFor(600, 1000)).toBe('tall');
    expect(frameFor(1250, 1000)).toBe('mid');
  });

  it('short means landscape and at most 520 px tall', () => {
    expect(isShort(844, 390)).toBe(true);
    expect(isShort(1024, 520)).toBe(true);
    expect(isShort(1024, 521)).toBe(false);
    expect(isShort(400, 500)).toBe(false);
  });

  it('width steps', () => {
    expect([360, 479, 480, 767, 768, 1023, 1024, 1439, 1440, 1920].map(widthStep)).toEqual([
      'xs',
      'xs',
      'sm',
      'sm',
      'md',
      'md',
      'lg',
      'lg',
      'xl',
      'xl',
    ]);
  });

  it('the media strings are the literal queries of layout.css', () => {
    expect(MEDIA.tall).toBe('(max-aspect-ratio: 3/5)');
    expect(MEDIA.wide).toBe('(min-aspect-ratio: 5/4)');
    expect(MEDIA.split).toBe('(min-aspect-ratio: 5/4) and (min-width: 900px)');
    expect(MEDIA.short).toBe('(max-height: 520px) and (orientation: landscape)');
  });
});

describe('the couple (5.2)', () => {
  it('heights per layout', () => {
    expect(coupleHeight(390, 844)).toBeCloseTo(337.6); // 40svh
    expect(coupleHeight(360, 500)).toBe(220); // clamp minimum
    expect(coupleHeight(820, 1180)).toBeCloseTo(519.2); // mid 44svh
    expect(coupleHeight(1440, 900)).toBeCloseTo(612); // 68svh
    expect(coupleHeight(1920, 1080)).toBe(640); // the cap
    expect(coupleHeight(844, 390)).toBeCloseTo(312); // short 80svh
    expect(coupleMode(800, 600)).toBe('stacked');
  });

  it('is never drawn taller than 640 px, anywhere from 360 to 2560 px', () => {
    for (let w = 360; w <= 2560; w += 40) {
      for (let h = 320; h <= 1600; h += 40) expect(coupleHeight(w, h)).toBeLessThanOrEqual(COUPLE_MAX_PX);
    }
    for (const row of COUPLE_HEIGHT) expect(row.h.max).toBeLessThanOrEqual(COUPLE_MAX_PX);
  });

  it('the widest couple fits its column at every checked viewport (no clipping)', () => {
    const widest = Math.max(...Object.values(SPRITES.couples).map((c) => c.aspect * c.heightScale));
    for (const { w, h } of CHECK_VIEWPORTS) {
      const drawn = coupleHeight(w, h) * widest;
      const frameIn = Math.min(32, Math.max(10, 0.033 * w)) + Math.min(13, Math.max(6, 0.0105 * w));
      const content = w - 2 * (frameIn + Math.min(96, Math.max(20, 0.06 * w)) * 0.5);
      const mode = layoutFor(w, h);
      // split/short: the couple column is 45 of 85 parts after the gutter (clamp(32px, 8%, 128px))
      const stackedMax = frameFor(w, h) === 'mid' ? Math.min(0.88 * w, 720) : Math.min(0.88 * w, 620);
      const col = mode === 'stacked' ? Math.min(content, stackedMax) : (Math.min(content, 1280) * 0.92 * 45) / 85;
      expect(drawn, `${w}x${h}`).toBeLessThanOrEqual(col);
    }
  });

  it('alternates sides: Mehndi left, Engagement right, Haldi left, Wedding right, Reception left', () => {
    expect([0, 1, 2, 3, 4].map(coupleSide)).toEqual(['left', 'right', 'left', 'right', 'left']);
  });

  it('resolveClamp', () => {
    expect(resolveClamp({ min: 220, vh: 0.4, max: 460 }, 100)).toBe(220);
    expect(resolveClamp({ min: 220, vh: 0.4, max: 460 }, 2000)).toBe(460);
  });
});

describe('the layout table (5.2)', () => {
  it('has a row for every section and a cell for every layout mode', () => {
    const sections = [
      'opening',
      'invitation',
      'countdown',
      'celebrations',
      'event',
      'cultures',
      'venues',
      'closing',
      'topbar',
    ];
    expect(Object.keys(LAYOUT_TABLE).sort()).toEqual([...sections].sort());
    for (const row of Object.values(LAYOUT_TABLE)) {
      for (const mode of ['stacked', 'split', 'short'] as const) expect(row[mode].length).toBeGreaterThan(3);
    }
  });

  it('checks 360 to 1920 px wide viewports, each frame and the short mode', () => {
    const ws = CHECK_VIEWPORTS.map((v) => v.w);
    expect(Math.min(...ws)).toBe(360);
    expect(Math.max(...ws)).toBe(1920);
    const modes = new Set(CHECK_VIEWPORTS.map((v) => `${frameFor(v.w, v.h)}:${layoutFor(v.w, v.h)}`));
    expect(modes).toEqual(new Set(['tall:stacked', 'mid:stacked', 'wide:split', 'wide:short']));
  });
});
