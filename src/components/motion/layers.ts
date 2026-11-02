// Pure helpers of the idle layers (spec 3.6): the plate cover box shared by the live strokes and the glow pulse, the
// live-stroke slots, the particle presets and their seeded dabs, the evening lights. Unit-tested without a browser.
import { useEffect, useState, type CSSProperties } from 'react';
import { FRAME_SIZE, frameFor, type Frame } from '../../lib/breakpoints';
import { rng } from '../../lib/motion';
import { coverRect, plateEntry, type PlateFrame } from '../../lib/plates';

function currentFrame(): Frame {
  if (typeof window === 'undefined') return 'wide';
  return frameFor(window.innerWidth, window.innerHeight);
}

/**
 * The plate's cover rect inside `ref` (a box laid out like the plate: `inset: -2%`), written as --cx --cy --cw --ch
 * (px) on the element, plus the frame shape in use. Updated by a ResizeObserver (geometry is never read per frame).
 */
export function useCoverBox(ref: { current: HTMLElement | null }, plate: string, enabled = true): Frame {
  const [frame, setFrame] = useState<Frame>(currentFrame);
  useEffect(() => {
    const el = ref.current;
    const entry = plateEntry(plate);
    if (!el || !entry || !enabled) return;
    const apply = () => {
      const f = currentFrame();
      setFrame(f);
      const { W, H } = FRAME_SIZE[f];
      const c = coverRect(el.clientWidth, el.clientHeight, W, H, entry.focal);
      el.style.setProperty('--cx', `${c.x.toFixed(1)}px`);
      el.style.setProperty('--cy', `${c.y.toFixed(1)}px`);
      el.style.setProperty('--cw', `${c.w.toFixed(1)}px`);
      el.style.setProperty('--ch', `${c.h.toFixed(1)}px`);
    };
    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    window.addEventListener('resize', apply, { passive: true });
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, [ref, plate, enabled]);
  return frame;
}

export interface StrokeSlot {
  style: CSSProperties;
  sprite: CSSProperties;
}

/** CSS for the three slots of a frame (pure; unit-tested): placement on the cover box, atlas cell, the mask's
 *  direction, period 10-15 s and a seeded phase. */
export function strokeSlots(fr: PlateFrame, atlasUrl: string, seed: string): StrokeSlot[] {
  const r = rng(`live:${seed}`);
  const { width: AW, height: AH, items } = fr.strokes;
  return items.slice(0, 3).map((it) => {
    const [ax = 0, ay = 0, aw = 1, ah = 1] = it.atlas;
    const [fx = 0, fy = 0, fw = 0, fh = 0] = it.frame;
    const [x0 = 0, y0 = 0] = it.from;
    const [x1 = 1, y1 = 1] = it.to;
    // the brush direction in the sprite's own pixels -> the angle the mask wipes along
    const ang = (Math.atan2((y1 - y0) * ah, (x1 - x0) * aw) * 180) / Math.PI;
    const period = r.range(10, 15);
    const style = {
      '--sx': fx + fw / 2,
      '--sy': fy + fh / 2,
      '--sw': fw,
      '--sh': fh,
      '--ang': `${ang.toFixed(1)}deg`,
      '--ls-dur': `${period.toFixed(2)}s`,
      '--ls-delay': `${(-r.range(0, period)).toFixed(2)}s`,
    } as CSSProperties;
    const sprite = {
      backgroundImage: `url("${atlasUrl}")`,
      backgroundSize: `${(AW / aw) * 100}% ${(AH / ah) * 100}%`,
      backgroundPosition: `${AW > aw ? (ax / (AW - aw)) * 100 : 0}% ${AH > ah ? (ay / (AH - ah)) * 100 : 0}%`,
    } as CSSProperties;
    return { style, sprite };
  });
}

export type DabId =
  'opening-spark' | 'mehndi-leaf' | 'engagement-petal' | 'haldi-marigold' | 'wedding-spark' | 'closing-dust';

export interface ParticleSet {
  dab: DabId;
  n: number;
  dir: 'fall' | 'rise';
  /** the region (CSS inset of the frame) the dabs travel in */
  inset: string;
  /** dab size range, px */
  size: [number, number];
  /** one trip, s */
  dur: [number, number];
  /** side-to-side sway amplitude, px */
  sway: [number, number];
  alpha: [number, number];
  seed: number;
}

/** The section presets of 3.6. */
export const PARTICLES: Record<string, ParticleSet> = {
  opening: {
    dab: 'opening-spark',
    n: 6,
    dir: 'rise',
    inset: '4% 26% 46% 26%',
    size: [9, 16],
    dur: [16, 24],
    sway: [6, 12],
    alpha: [0.55, 0.85],
    seed: 3101,
  },
  mehndi: {
    dab: 'mehndi-leaf',
    n: 4,
    dir: 'fall',
    inset: '0 4% 0 4%',
    size: [20, 30],
    dur: [14, 22],
    sway: [14, 26],
    alpha: [0.7, 0.85],
    seed: 3102,
  },
  engagement: {
    dab: 'engagement-petal',
    n: 4,
    dir: 'fall',
    inset: '0 4% 0 4%',
    size: [18, 28],
    dur: [14, 22],
    sway: [14, 26],
    alpha: [0.7, 0.85],
    seed: 3103,
  },
  haldi: {
    dab: 'haldi-marigold',
    n: 4,
    dir: 'fall',
    inset: '0 4% 0 4%',
    size: [18, 28],
    dur: [14, 22],
    sway: [14, 26],
    alpha: [0.75, 0.9],
    seed: 3104,
  },
  wedding: {
    dab: 'wedding-spark',
    n: 4,
    dir: 'rise',
    inset: '38% 8% 6% 8%',
    size: [9, 15],
    dur: [15, 22],
    sway: [6, 12],
    alpha: [0.55, 0.85],
    seed: 3105,
  },
  closing: {
    dab: 'closing-dust',
    n: 5,
    dir: 'rise',
    inset: '42% 36% 4% 36%',
    size: [7, 13],
    dur: [15, 22],
    sway: [5, 10],
    alpha: [0.5, 0.8],
    seed: 3106,
  },
};

export interface Dab {
  style: CSSProperties;
  dab: CSSProperties;
}

/** The seeded dabs of a set (pure; unit-tested). */
export function particleDabs(set: ParticleSet, max: number, url: string): Dab[] {
  const r = rng(`particles:${set.seed}`);
  const n = Math.min(set.n, max, 6);
  const out: Dab[] = [];
  for (let i = 0; i < n; i++) {
    // spread across the region: one lane each, jittered
    const x = ((i + r.range(0.2, 0.8)) / n) * 100;
    const dur = r.range(set.dur[0], set.dur[1]);
    const size = r.range(set.size[0], set.size[1]);
    const swayDur = r.range(4.2, 7.4);
    out.push({
      style: {
        '--x': `${x.toFixed(1)}%`,
        '--pt-dur': `${dur.toFixed(2)}s`,
        '--pt-delay': `${(-r.range(0, dur)).toFixed(2)}s`,
        '--size': `${size.toFixed(1)}px`,
        '--alpha': r.range(set.alpha[0], set.alpha[1]).toFixed(2),
      } as CSSProperties,
      dab: {
        '--sway': `${r.range(set.sway[0], set.sway[1]).toFixed(1)}px`,
        '--sway-dur': `${swayDur.toFixed(2)}s`,
        '--sway-delay': `${(-r.range(0, swayDur)).toFixed(2)}s`,
        '--spin': `${r.range(-60, 60).toFixed(0)}deg`,
        backgroundImage: `url("${url}")`,
        backgroundPosition: `${(r.int(0, 5) / 5) * 100}% 0`,
      } as CSSProperties,
    });
  }
  return out;
}

/** card.js reception lights [x, y, R, alpha] in card units (1080 x 1532.4), as frame fractions and a size factor. */
const CARD_LIGHTS: Array<[number, number, number, number]> = [
  [196, 128, 54, 0.42],
  [884, 150, 46, 0.38],
  [150, 380, 30, 0.3],
  [930, 420, 34, 0.32],
];

export function eveningLights(seed = 3770): CSSProperties[] {
  const r = rng(`lights:${seed}`);
  return CARD_LIGHTS.map(([x, y, R, a]) => {
    const drift = r.range(6, 12);
    const ang = r.range(0, Math.PI * 2);
    return {
      '--lx': `${((x / 1080) * 100).toFixed(1)}%`,
      '--ly': `${((y / 1532.4) * 100).toFixed(1)}%`,
      '--lr': ((R * 1.9) / 1080).toFixed(4),
      '--la': a.toFixed(2),
      '--ldx': `${(Math.cos(ang) * drift).toFixed(1)}px`,
      '--ldy': `${(Math.sin(ang) * drift).toFixed(1)}px`,
      '--l-drift': `${r.range(15, 20).toFixed(2)}s`,
      '--l-delay': `${(-r.range(0, 5.016)).toFixed(2)}s`,
      '--l-drift-delay': `${(-r.range(0, 20)).toFixed(2)}s`,
    } as CSSProperties;
  });
}
