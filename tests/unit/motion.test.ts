// Spec 3 (motion design), the pure parts: tokens and timelines (3.2, 3.4), tiers and the runtime probe (3.3), section
// clocks (3.4, 3.8), the scheduler (3.9), line-art draw-on (3.4 a), parallax (3.7) and the paint-reveal plan (3.5).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ENTRANCE,
  FrameProbe,
  MOTION,
  activeAnimatorCount,
  addAnimator,
  clockFor,
  cubicBezier,
  detectTier,
  easeInOutSine,
  finishClocksBefore,
  markRevealed,
  median,
  plateShift,
  resetMotionState,
  rng,
  smoothstep,
  wasPlayed,
  wasRevealed,
} from '../../src/lib/motion';
import {
  drawLineArt,
  drawSchedule,
  estimateLength,
  prefixIds,
  prepLineArt,
  releaseLineArt,
  scrollDrawProgress,
  quantise,
  strokeProgress,
} from '../../src/lib/linedraw';
import {
  OMEGA_POINTER,
  OMEGA_RELEASE,
  TOUCH_HOLD_MS,
  normalisePointer,
  springStep,
  startParallax,
} from '../../src/lib/parallax';
import { REVEALS, buildRevealPlan } from '../../src/components/motion/revealPlan';

afterEach(() => resetMotionState());

describe('motion tokens and timelines (3.2, 3.4)', () => {
  it('the beat ladder: 627 ms, a phrase of 16 beats, half phrase', () => {
    expect(MOTION.beat).toBe(627);
    expect(MOTION.phrase).toBe(10031);
    expect(MOTION.halfPhrase).toBe(5016);
    expect(MOTION.tReveal).toBe(2 * MOTION.beat);
    expect(MOTION.tText).toBe(560);
    expect(MOTION.tTitle).toBe(900);
  });

  it('every event element is in place 1.8 s after the trigger', () => {
    for (const [, [s, e]] of Object.entries(ENTRANCE.event)) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(e).toBeGreaterThan(s);
      expect(e).toBeLessThanOrEqual(1800);
    }
    expect(ENTRANCE.event.title).toEqual([0, 900]);
    expect(ENTRANCE.event.couple).toEqual([300, 1500]);
    expect(ENTRANCE.event.actions).toEqual([1250, 1800]);
  });

  it('the opening completes within 2.9 s of fonts-ready (A-OPEN-4) and keeps the card order', () => {
    const o = ENTRANCE.opening;
    const ends = Object.values(o).map(([, e]) => e);
    expect(Math.max(...ends)).toBeLessThanOrEqual(2900);
    expect(o.dateline[1]).toBeLessThanOrEqual(2900);
    const order = [o.kicker, o.heading, o.rule, o.ring, o.pair, o.dateline].map(([s]) => s);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('the closing lights its flame at 860 ms', () => {
    expect(ENTRANCE.closing.flame[0]).toBe(860);
    expect(ENTRANCE.closing.flame[1] - ENTRANCE.closing.flame[0]).toBe(400);
  });
});

describe('easing and randomness', () => {
  it('cubic-bezier matches its end points and the CSS curve shape', () => {
    const silk = cubicBezier(0.22, 1, 0.36, 1);
    expect(silk(0)).toBeCloseTo(0, 5);
    expect(silk(1)).toBeCloseTo(1, 5);
    expect(silk(0.25)).toBeGreaterThan(0.6); // a soft decelerate is far along early
    const sine = cubicBezier(0.37, 0, 0.63, 1);
    expect(sine(0.5)).toBeCloseTo(0.5, 3);
    for (let t = 0; t < 1; t += 0.05) expect(sine(t + 0.05)).toBeGreaterThanOrEqual(sine(t) - 1e-6);
  });

  it('inOutSine and smoothstep are clamped', () => {
    expect(easeInOutSine(-1)).toBe(0);
    expect(easeInOutSine(2)).toBeCloseTo(1, 10);
    expect(easeInOutSine(0.5)).toBeCloseTo(0.5, 10);
    expect(smoothstep(0.9, 1, 0.5)).toBe(0);
    expect(smoothstep(0.9, 1, 1)).toBe(1);
  });

  it('rng is deterministic per seed', () => {
    const a = rng(2622);
    const b = rng(2622);
    const c = rng(2633);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(c()).not.toBe(xs[0]);
    const r = rng('x');
    for (let i = 0; i < 100; i++) {
      const v = r.range(3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(5);
      const k = r.int(0, 5);
      expect(Number.isInteger(k) && k >= 0 && k <= 5).toBe(true);
    }
  });
});

describe('tiers (3.3)', () => {
  it('reduced motion or the setting none wins over everything', () => {
    expect(detectTier('auto', true, { hardwareConcurrency: 16 })).toBe('none');
    expect(detectTier('full', true, undefined)).toBe('none');
    expect(detectTier('none', false, { hardwareConcurrency: 16 })).toBe('none');
  });

  it('save-data, little memory, few cores or the probe give lite', () => {
    expect(detectTier('auto', false, { connection: { saveData: true }, hardwareConcurrency: 16 })).toBe('lite');
    expect(detectTier('auto', false, { deviceMemory: 2, hardwareConcurrency: 16 })).toBe('lite');
    expect(detectTier('auto', false, { hardwareConcurrency: 4 })).toBe('lite');
    expect(detectTier('auto', false, { hardwareConcurrency: 8 }, true)).toBe('lite');
    expect(detectTier('auto', false, { hardwareConcurrency: 8, deviceMemory: 8 })).toBe('full');
    expect(detectTier('lite', false, { hardwareConcurrency: 16 })).toBe('lite');
  });

  it('the runtime probe: a quarter of the frames missing two vsyncs demotes; the first 5 frames do not count', () => {
    const run = (deltas: number[]) => {
      const p = new FrameProbe();
      let t = 0;
      let v: ReturnType<FrameProbe['tick']> = null;
      p.tick((t += 16.7));
      for (const d of deltas) v = p.tick((t += d)) ?? v;
      return { v, p };
    };
    // a steady 60 Hz reveal with one long first frame (the decode): fast
    expect(run([400, ...Array(65).fill(16.7)]).v).toBe('ok');
    // 60 Hz with every third frame at 50 ms (33%): slow
    expect(run(Array.from({ length: 66 }, (_, i) => (i % 3 === 2 ? 50 : 16.7))).v).toBe('lite');
    // 60 Hz with every fifth frame missing one vsync (33 ms): still fine
    expect(run(Array.from({ length: 66 }, (_, i) => (i % 5 === 4 ? 33.4 : 16.7))).v).toBe('ok');
    // 120 Hz judged by its own interval: 25 ms frames are two missed vsyncs there
    expect(run(Array.from({ length: 66 }, (_, i) => (i % 2 ? 25 : 8.3))).v).toBe('lite');
    // a short reveal on a slow phone: 30 counted frames are enough for a verdict
    const short = run(Array.from({ length: 36 }, (_, i) => (i % 2 ? 60 : 16.7)));
    expect(short.p.verdict()).toBe('lite');
    expect(new FrameProbe().verdict()).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe('section clocks (3.4, 3.8)', () => {
  it('starts once on trigger and replays to late subscribers', () => {
    const c = clockFor('mehndi');
    const seen: number[] = [];
    c.subscribe((s) => seen.push(s.scale));
    c.trigger(1);
    c.trigger(1);
    expect(seen).toEqual([1]);
    c.subscribe((s) => seen.push(s.scale));
    expect(seen).toEqual([1, 1]);
    expect(wasPlayed('mehndi')).toBe(true);
  });

  it('a paint-reveal holds the timeline until it releases', () => {
    const c = clockFor('haldi');
    const fn = vi.fn();
    c.subscribe(fn);
    const release = c.hold();
    c.trigger(1);
    expect(fn).not.toHaveBeenCalled();
    release();
    release(); // idempotent
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('a stuck hold cannot keep the content hidden longer than the safety timer', () => {
    vi.useFakeTimers();
    try {
      const c = clockFor('wedding');
      const fn = vi.fn();
      c.subscribe(fn);
      c.hold();
      c.trigger(1);
      vi.advanceTimersByTime(MOTION.safety - 1);
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2);
      expect(fn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("'fit' compresses the longest subscriber into 600 ms (a section in view at load)", () => {
    const c = clockFor('invitation');
    let scale = 0;
    c.subscribe((s) => (scale = s.scale), 2400);
    c.subscribe(() => undefined, 900);
    c.trigger('fit');
    expect(scale).toBeCloseTo(600 / 2400, 6);
  });

  it('finishNow shows everything at once; a remount never replays (G-I18N-1)', () => {
    const c = clockFor('closing');
    let instant = false;
    c.subscribe((s) => (instant = s.instant));
    c.finishNow();
    expect(instant).toBe(true);
    const again = clockFor('closing', document.createElement('section'));
    let replay: boolean | null = null;
    again.subscribe((s) => (replay = s.instant));
    expect(replay).toBe(true);
  });

  it('sections jumped past by the nav show at once', () => {
    const main = document.createElement('main');
    const [a, b, c] = ['mehndi', 'engagement', 'haldi'].map((id) => {
      const s = document.createElement('section');
      s.dataset.section = id;
      main.append(s);
      return s;
    }) as [HTMLElement, HTMLElement, HTMLElement];
    document.body.append(main);
    const ca = clockFor('mehndi', a);
    const cb = clockFor('engagement', b);
    const cc = clockFor('haldi', c);
    finishClocksBefore(c);
    expect(ca.start?.instant).toBe(true);
    expect(cb.start?.instant).toBe(true);
    expect(cc.start).toBeNull();
    main.remove();
  });

  it('remembers revealed paintings for the page load', () => {
    expect(wasRevealed('mehndi')).toBe(false);
    markRevealed('mehndi');
    expect(wasRevealed('mehndi')).toBe(true);
  });
});

describe('scheduler (3.9): idle = no rAF', () => {
  it('runs animators until they return false, then stops the loop', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    let n = 0;
    addAnimator(() => ++n < 3);
    expect(activeAnimatorCount()).toBe(1);
    for (let t = 0; frames.length && t < 10; t++) frames.shift()!(t * 16);
    expect(n).toBe(3);
    expect(activeAnimatorCount()).toBe(0);
    expect(frames.length).toBe(0);
    vi.unstubAllGlobals();
  });

  it('keeps one loop when an animator starts another mid-frame (no doubled frames)', () => {
    let id = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.set(++id, cb);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (h: number) => frames.delete(h));
    let a = 0;
    let b = 0;
    let started = false;
    addAnimator(() => {
      a++;
      if (!started) {
        started = true;
        addAnimator(() => ++b < 4);
      }
      return a < 6;
    });
    for (let t = 0; frames.size && t < 20; t++) {
      expect(frames.size).toBe(1); // exactly one pending frame callback, every frame
      const [k, cb] = [...frames][0]!;
      frames.delete(k);
      cb(t * 16);
    }
    expect([a, b]).toEqual([6, 4]); // each animator ran once per frame
    expect(activeAnimatorCount()).toBe(0);
    vi.unstubAllGlobals();
  });

  it('the plate scroll shift is (progress - 0.5) x 3% of the frame height', () => {
    expect(plateShift(800, 800, 800, 800)).toBeCloseTo(-12, 6); // entering at the bottom
    expect(plateShift(-800, 800, 800, 800)).toBeCloseTo(12, 6); // leaving at the top
    expect(plateShift(0, 800, 800, 800)).toBeCloseTo(0, 6); // filling the viewport
  });
});

describe('line art draw-on (3.4)', () => {
  it('length-weighted slots run from 0 to 1, in order, with lifts between them', () => {
    const s = drawSchedule([100, 300, 50, 200]);
    expect(s[0]![0]).toBe(0);
    expect(s[s.length - 1]![1]).toBeCloseTo(1, 10);
    for (let i = 1; i < s.length; i++) expect(s[i]![0]).toBeGreaterThan(s[i - 1]![1]);
    // a longer stroke gets more time
    expect(s[1]![1] - s[1]![0]).toBeGreaterThan(s[0]![1] - s[0]![0]);
    const o = drawSchedule([100, 100, 100], { overlap: 0.5, lift: 0 });
    expect(o[1]![0]).toBeLessThan(o[0]![1]);
    expect(o[2]![1]).toBeCloseTo(1, 10);
    expect(drawSchedule([])).toEqual([]);
  });

  it('strokeProgress clamps', () => {
    expect(strokeProgress([0.2, 0.4], 0.1)).toBe(0);
    expect(strokeProgress([0.2, 0.4], 0.3)).toBeCloseTo(0.5, 10);
    expect(strokeProgress([0.2, 0.4], 0.9)).toBe(1);
  });

  it('draws by dash offset and writes only strokes that changed (> 0.002)', () => {
    const host = document.createElement('div');
    host.innerHTML = `<svg viewBox="0 0 100 100"><path class="m-draw" d="M0 0 L50 0"/><path class="m-draw" d="M0 10 L100 10"/></svg>`;
    const prep = prepLineArt(host.querySelector('svg')!);
    expect(prep.list).toHaveLength(2);
    expect(drawLineArt(prep, 0)).toBe(2);
    for (const [i, el] of prep.list.entries()) expect(Number(el.style.strokeDashoffset)).toBeCloseTo(prep.lens[i]!, 6);
    expect(drawLineArt(prep, 0)).toBe(0);
    expect(drawLineArt(prep, 1)).toBe(2);
    for (const el of prep.list) expect(Number(el.style.strokeDashoffset)).toBe(0);
    releaseLineArt(prep);
    expect(prep.list[0]!.style.strokeDasharray).toBe('');
  });

  it('estimates a path length when the browser cannot measure', () => {
    expect(estimateLength('M0 0 L30 40')).toBeGreaterThan(1);
  });

  it('prefixes ids and their references so a motif can be inlined twice', () => {
    const t = '<mask id="a-k0"/><path mask="url(#a-k0)"/><use href="#a-k0"/>';
    expect(prefixIds(t, 'p1')).toBe('<mask id="p1-a-k0"/><path mask="url(#p1-a-k0)"/><use href="#p1-a-k0"/>');
  });

  it('scroll progress per motif centre: 0 below 85% of the viewport, 1 from 45% (QA r1 D2); quantised', () => {
    // the motif's centre: 0 below 85% of the viewport, 1 from 45% up (QA r1 D2)
    expect(scrollDrawProgress(1000, 800)).toBe(0);
    expect(scrollDrawProgress(680, 800)).toBe(0);
    expect(scrollDrawProgress(520, 800)).toBeCloseTo(0.5, 10);
    expect(scrollDrawProgress(360, 800)).toBe(1);
    expect(scrollDrawProgress(-500, 800)).toBe(1);
    expect(quantise(0)).toBe(0);
    expect(quantise(1)).toBe(1);
    expect(quantise(0.5004, 48)).toBe(0.5);
    expect(quantise(0.02, 48)).toBeCloseTo(1 / 48, 10);
    expect(quantise(0.005, 48)).toBe(0);
  });
});

describe('parallax (3.7)', () => {
  it('a touch moves the layers only after it rests; a scroll or a tap never nudges them', () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    const base = activeAnimatorCount();
    const ctl = startParallax(() => [el]);
    const touch = (type: string, x: number, y: number, buttons = 1) =>
      window.dispatchEvent(
        Object.assign(new Event(type), { pointerType: 'touch', clientX: x, clientY: y, buttons }) as Event,
      );
    // a tap (down + up inside the hold) and the start of a scroll (down + cancel)
    touch('pointerdown', 0, 0);
    vi.advanceTimersByTime(TOUCH_HOLD_MS - 20);
    touch('pointerup', 0, 0, 0);
    touch('pointerdown', 0, 0);
    touch('pointercancel', 0, 0, 0);
    vi.advanceTimersByTime(TOUCH_HOLD_MS * 2);
    expect(activeAnimatorCount()).toBe(base); // nothing was asked to move
    // a finger held still: followed at half strength
    touch('pointerdown', 0, 0);
    vi.advanceTimersByTime(TOUCH_HOLD_MS + 1);
    expect(activeAnimatorCount()).toBe(base + 1); // the spring runs toward the finger
    ctl.stop();
    expect(activeAnimatorCount()).toBe(base);
    vi.useRealTimers();
  });

  it('normalises the pointer to -1..1 about the centre', () => {
    expect(normalisePointer(0, 0, 200, 100)).toEqual([-1, -1]);
    expect(normalisePointer(100, 50, 200, 100)).toEqual([0, 0]);
    expect(normalisePointer(400, 100, 200, 100)).toEqual([1, 1]);
  });

  it('the spring settles in about 120 ms (pointer) and 600 ms (touch release), without overshoot', () => {
    const settle = (omega: number) => {
      let s = { x: 0, v: 0 };
      let t = 0;
      let max = 0;
      while (Math.abs(s.x - 1) > 0.05 && t < 2) {
        s = springStep(s, 1, 1 / 120, omega);
        max = Math.max(max, s.x);
        t += 1 / 120;
      }
      return { t, max };
    };
    const p = settle(OMEGA_POINTER);
    expect(p.t).toBeGreaterThan(0.08);
    expect(p.t).toBeLessThan(0.16);
    expect(p.max).toBeLessThanOrEqual(1.0001);
    const r = settle(OMEGA_RELEASE);
    expect(r.t).toBeGreaterThan(0.45);
    expect(r.t).toBeLessThan(0.75);
  });

  it('writes --px/--py on the sections in view, touch at half strength, and stops its loop at rest', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const el = document.createElement('section');
    const ctl = startParallax(() => [el]);
    ctl.feed(1, -1, true);
    let t = 0;
    while (frames.length && t < 400) frames.shift()!((t += 1) * 16);
    expect(Number(el.style.getPropertyValue('--px'))).toBeCloseTo(0.5, 2);
    expect(Number(el.style.getPropertyValue('--py'))).toBeCloseTo(-0.5, 2);
    expect(frames.length).toBe(0); // at rest: no rAF
    ctl.stop();
    expect(el.style.getPropertyValue('--px')).toBe('');
    vi.unstubAllGlobals();
  });
});

describe('paint-reveal plan (3.5)', () => {
  it('the styles per section are the video choices', () => {
    expect(REVEALS.invitation).toMatchObject({ style: 'sweep', seed: 2622 });
    expect(REVEALS.mehndi).toMatchObject({ style: 'diagonal', seed: 2633 });
    expect(REVEALS.engagement).toMatchObject({ style: 'swirl', seed: 2643 });
    expect(REVEALS.haldi).toMatchObject({ style: 'rise', seed: 2653 });
    expect(REVEALS.wedding).toMatchObject({ style: 'diagonal', seed: 2663, tilt: -0.3 });
    expect(REVEALS.reception).toMatchObject({ style: 'diagonal', seed: 2763, tilt: 0.3, lead: '#24403f' });
    expect(REVEALS.cultures).toMatchObject({ style: 'sweep', seed: 2672 });
    expect(REVEALS.closing).toMatchObject({ style: 'bloom', seed: 2702 });
  });

  const frames: Array<[number, number]> = [
    [585, 1266], // a phone at 1.5x
    [1152, 1440],
    [1600, 900],
  ];

  for (const style of ['sweep', 'rise', 'diagonal', 'swirl'] as const) {
    it(`${style}: deterministic, timed inside the reveal, covering the whole frame`, () => {
      for (const [W, H] of frames) {
        const spec = { style, seed: 2622, tilt: style === 'diagonal' ? 0.3 : undefined };
        const a = buildRevealPlan(spec, W, H);
        const b = buildRevealPlan(spec, W, H);
        expect(a).toEqual(b);
        if (style !== 'swirl') {
          const rows = a.strokes.length - (style === 'diagonal' ? 1 : 0);
          expect(rows).toBeGreaterThanOrEqual(5);
          expect(rows).toBeLessThanOrEqual(9);
        }
        for (const s of a.strokes) {
          expect(s.t0).toBeGreaterThanOrEqual(0);
          expect(s.t1).toBeLessThanOrEqual(1);
          expect(s.t1).toBeGreaterThan(s.t0);
          expect(s.stamps.length).toBeGreaterThan(3);
        }
        // every cell of a coarse grid lies under some body stamp (radius ~ half the brush)
        const half = a.width * 0.42;
        const cells = 12;
        for (let gx = 0; gx < cells; gx++)
          for (let gy = 0; gy < cells; gy++) {
            const x = ((gx + 0.5) / cells) * W;
            const y = ((gy + 0.5) / cells) * H;
            const hit = a.strokes.some((s) =>
              s.stamps.some((p) => Math.hypot(p.x - x, p.y - y) <= Math.max(half, p.s * 64)),
            );
            expect(hit, `${style} ${W}x${H} cell ${gx},${gy}`).toBe(true);
          }
      }
    });
  }

  it('rise paints from the bottom first; sweep from the top', () => {
    const rise = buildRevealPlan({ style: 'rise', seed: 2653 }, 600, 1200);
    const sweep = buildRevealPlan({ style: 'sweep', seed: 2622 }, 600, 1200);
    const y0 = (p: typeof rise) => p.strokes[0]!.stamps[0]!.y;
    expect(y0(rise)).toBeGreaterThan(900);
    expect(y0(sweep)).toBeLessThan(300);
  });

  it('bloom has no strokes: it grows from its origin each frame', () => {
    const p = buildRevealPlan(REVEALS.closing!, 600, 1200);
    expect(p.bloom).toBe(true);
    expect(p.strokes).toHaveLength(0);
    expect(p.origin).toEqual([0.5, 0.86]);
  });
});
