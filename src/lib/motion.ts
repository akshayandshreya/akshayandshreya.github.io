// Motion (spec 3): tokens (3.2, mirrored in src/styles/tokens.css), the entrance timelines (3.4), tier detection and the
// runtime probe (3.3), the single rAF scheduler (3.9), section clocks (one content timeline per section, started once
// per page load) and the small maths every animator shares (easing, seeded randomness). The object-fit cover maths
// lives in src/lib/plates.ts (coverRect, placeOnCover), shared with the static <picture>.
//
// Rules this module enforces for everyone: idle = no rAF; per-frame code only writes; geometry is read in observer
// callbacks and cached; nothing here ever hides content unless the entrance that shows it again is certain to run.

export const MOTION = {
  beat: 627,
  phrase: 10031,
  halfPhrase: 5016,
  tText: 560,
  tReveal: 1254,
  tTitle: 900,
  /** a section already in view at load runs its timeline compressed into this (3.4) */
  compressed: 600,
  /** the opening waits for fonts, at most this long (3.4) */
  openingFontWait: 1200,
  /** lite: the plate crossfades instead of the brush (3.3, 3.5) */
  liteFade: 500,
  /** the reveal waits this long for the plate to decode, then fades (3.5) */
  decodeWait: 1500,
  decodeFallbackFade: 400,
  /** the content timeline starts at this share of the paint-reveal (3.5) */
  revealHandOff: 0.7,
  /** content never stays hidden longer than this after its entrance was due (3.8) */
  safety: 3000,
  /** public/motion-boot.js shows everything this long after navigation; a later first trigger shows the opening at
   *  once (QA r1 M10) */
  bootDeadline: 2800,
  /** a page whose bundle runs this long after its first paint runs the opening compressed (QA r1 M10) */
  lateHydration: 1500,
  easeSilk: 'cubic-bezier(0.22, 1, 0.36, 1)',
  easeSwift: 'cubic-bezier(0.65, 0, 0.35, 1)',
  easeSine: 'cubic-bezier(0.37, 0, 0.63, 1)',
} as const;

/** [start, end] in ms after the section's trigger (spec 3.4). Sections pass `at={T[0]} dur={T[1] - T[0]}`. */
export type Slot = readonly [number, number];

export const ENTRANCE = {
  opening: {
    ganeshLine: [300, 1550],
    ganeshPaint: [600, 1850],
    kicker: [800, 1360],
    kicker2: [900, 1460],
    heading: [1000, 1900],
    rule: [1600, 2000],
    ring: [1750, 2350],
    monogram: [1950, 2350],
    pair: [2100, 2660],
    dateline: [2250, 2810],
    cue: [2250, 2810],
  },
  invitation: {
    kalash: [0, 560],
    shloka: [150, 710],
    blessing: [250, 810],
    host: [400, 960],
    name1: [600, 1500],
    joiner: [1300, 1700],
    name2: [1450, 2350],
    shehnai: [1700, 2400],
  },
  event: {
    title: [0, 900],
    couple: [300, 1500],
    tagline: [500, 1060],
    when: [800, 1360],
    venue: [950, 1510],
    address: [1100, 1660],
    actions: [1250, 1800],
    near: [600, 1600],
    particles: [0, 1800],
  },
  band: {
    title: [0, 900],
    line1: [300, 860],
    line2: [450, 1010],
    line3: [600, 1160],
    actions: [750, 1310],
  },
  closing: {
    ring: [0, 600],
    request: [200, 1100],
    line: [700, 1260],
    rule: [900, 1300],
    regards: [1000, 1560],
    family1: [1150, 1710],
    joiner: [1300, 1700],
    family2: [1450, 1900],
    diya: [300, 860],
    flame: [860, 1260],
    dust: [900, 2700],
  },
} as const satisfies Record<string, Record<string, Slot>>;

export type MotionTier = 'full' | 'lite' | 'none';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Class on <html> set before first paint by the boot script (public/motion-boot.js): entrances may hide [data-enter]. */
export const BOOT_CLASS = 'motion-boot';
/** Class on <html> while the document is hidden: every idle loop pauses. */
export const PAUSED_CLASS = 'motion-paused';
/** sessionStorage key: the runtime probe demoted this session to lite. */
export const LITE_KEY = 'as-motion-lite';

interface NavigatorHints {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

/** `?motion=full|lite|none` in the page URL (QA tools pin the tier; never a guest-facing switch). */
export function readMotionPin(search: string): MotionTier | null {
  const v = new URLSearchParams(search).get('motion')?.trim().toLowerCase();
  return v === 'full' || v === 'lite' || v === 'none' ? v : null;
}

/** The tier from the setting, the reduced-motion preference and the device hints (the runtime probe comes later). */
export function detectTier(
  setting: 'auto' | MotionTier,
  reducedMotion: boolean,
  nav: NavigatorHints | undefined,
  probedLite = false,
): MotionTier {
  if (reducedMotion || setting === 'none') return 'none';
  if (setting === 'full' || setting === 'lite') return setting;
  if (probedLite) return 'lite';
  if (nav?.connection?.saveData) return 'lite';
  if (typeof nav?.deviceMemory === 'number' && nav.deviceMemory <= 2) return 'lite';
  if (typeof nav?.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) return 'lite';
  return 'full';
}

/** Runtime probe (3.3, QA r1 M4): over the first paint-reveal, the share of frames that miss two vsyncs or more
 *  (a frame time >= 2.5 display intervals, the interval read from the fastest tenth of the frames, so 60, 90 and 120 Hz
 *  screens are judged alike). The first `skip` frames carry the plate's decode, the canvas allocation and the
 *  entrance start, and do not count. More than `share` of the frames that slow: the device is demoted to lite. */
export class FrameProbe {
  private last = 0;
  private seen = 0;
  private readonly deltas: number[] = [];
  constructor(
    private readonly frames = 60,
    private readonly skip = 5,
    private readonly share = 0.25,
  ) {}
  /** Feed a frame time; returns 'lite' once the verdict is slow, 'ok' when fast, null while still measuring. */
  tick(now: number): 'lite' | 'ok' | null {
    if (this.last > 0) {
      this.seen++;
      if (this.seen > this.skip) this.deltas.push(now - this.last);
    }
    this.last = now;
    if (this.deltas.length < this.frames) return null;
    return this.verdict();
  }
  /** Verdict from what was measured (a reveal on a slow phone may end before 60 frames: 30 are enough). */
  verdict(): 'lite' | 'ok' | null {
    if (this.deltas.length < Math.min(30, this.frames)) return null;
    const sorted = [...this.deltas].sort((a, b) => a - b);
    const p10 = sorted[Math.floor(sorted.length * 0.1)] as number;
    const interval = Math.min(17.5, Math.max(6.9, p10));
    const slow = this.deltas.filter((d) => d >= 2.5 * interval).length;
    return slow / this.deltas.length > this.share ? 'lite' : 'ok';
  }
}

export function median(xs: readonly number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/* ------------------------------------------------------------------------------------------------ scheduler (3.9) */

/** An animator gets the frame time and returns false when it is finished. */
export type Animator = (now: number) => boolean | void;

const animators = new Set<Animator>();
let rafId = 0;

function frame(now: number) {
  rafId = 0;
  for (const a of [...animators]) {
    let keep: boolean | void;
    try {
      keep = a(now);
    } catch (err) {
      keep = false;
      console.error('animator failed', err);
    }
    if (keep === false) animators.delete(a);
  }
  // an animator added during this frame already asked for the next one: never run two loops (every animator would
  // then run twice per frame, doubling the paint-reveal's cost)
  if (animators.size > 0 && !rafId) rafId = requestAnimationFrame(frame);
}

/** Run `a` every frame until it returns false or the returned stop() is called. */
export function addAnimator(a: Animator): () => void {
  animators.add(a);
  if (!rafId && typeof requestAnimationFrame === 'function') rafId = requestAnimationFrame(frame);
  return () => {
    animators.delete(a);
    if (animators.size === 0 && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };
}

/** Run `fn` once on the next frame (coalesced: many calls in one frame run it once). */
export function nextFrame(fn: (now: number) => void): () => void {
  return addAnimator((now) => {
    fn(now);
    return false;
  });
}

/** For tests and the reduced-motion acceptance check (G-MOT-3). */
export function activeAnimatorCount(): number {
  return animators.size;
}

/* -------------------------------------------------------------------------------------------------------- maths */

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
export const easeInOutSine = (t: number) => (1 - Math.cos(Math.PI * clamp01(t))) / 2;

/** A CSS cubic-bezier as a function of time (Newton + bisection), for canvas and line-art timing. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (t: number) => {
    const x = clamp01(t);
    let u = x;
    for (let i = 0; i < 6; i++) {
      const e = sx(u) - x;
      const d = dx(u);
      if (Math.abs(e) < 1e-5) return sy(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    let lo = 0;
    let hi = 1;
    u = x;
    for (let i = 0; i < 24; i++) {
      const v = sx(u);
      if (Math.abs(v - x) < 1e-5) break;
      if (v < x) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return sy(u);
  };
}

export const easeSilk = cubicBezier(0.22, 1, 0.36, 1);
export const easeSine = cubicBezier(0.37, 0, 0.63, 1);

/** Seeded PRNG (mulberry32): deterministic strokes, phases and particle paths. */
export interface Rng {
  (): number;
  range(a: number, b: number): number;
  int(a: number, b: number): number;
}

export function rng(seed: number | string): Rng {
  let s = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
  const next = (() => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.range = (a, b) => a + (b - a) * next();
  next.int = (a, b) => Math.floor(a + (b - a + 1) * next());
  return next;
}

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/* ------------------------------------------------------------------------------------------ section clocks (3.4) */

export interface ClockStart {
  /** performance.now() of the trigger */
  t0: number;
  /** multiply every offset and duration by this (1, or compressed for a section already in view at load) */
  scale: number;
  /** true: show everything at once (jumped past, scrolled into from below, reduced motion) */
  instant: boolean;
}

type ClockListener = (s: ClockStart) => void;

/** Ids whose timeline already ran this page load: a language switch or a remount never replays them (G-I18N-1). */
const doneIds = new Set<string>();
const revealedIds = new Set<string>();

export function markRevealed(id: string) {
  revealedIds.add(id);
}
export function wasRevealed(id: string): boolean {
  return revealedIds.has(id);
}
export function wasPlayed(id: string): boolean {
  return doneIds.has(id);
}

/** One content timeline per section: it starts once, when triggered and no paint-reveal holds it back. */
export class SectionClock {
  state: 'armed' | 'started' = 'armed';
  start: ClockStart | null = null;
  /** the longest end (ms) any subscriber asked for: the compressed version fits it into MOTION.compressed */
  maxEnd = 0;
  private holds = 0;
  private safetyTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private pendingTrigger: { scale: number | 'fit'; t0?: number } | null = null;
  private readonly listeners = new Set<ClockListener>();

  constructor(
    readonly id: string,
    readonly el: Element | null,
  ) {
    if (doneIds.has(id)) this.begin({ t0: 0, scale: 1, instant: true });
  }

  /** Listen for the start; called at once (synchronously) if the clock already started. */
  subscribe(l: ClockListener, end = 0): () => void {
    if (end > this.maxEnd) this.maxEnd = end;
    if (this.start) l(this.start);
    else this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** A paint-reveal holds the timeline until 70% of its brush; returns release(). */
  hold(): () => void {
    if (this.start) return () => undefined;
    this.holds++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holds = Math.max(0, this.holds - 1);
      this.flush();
    };
  }

  /** The section came into view (25%): start, or start when the last hold is released. */
  trigger(scale: number | 'fit' = 1, t0?: number) {
    if (this.start) return;
    this.pendingTrigger = { scale, t0 };
    this.flush();
  }

  /** Show everything at once (jumped past by the nav, entered from below, demoted to none). */
  finishNow() {
    if (this.start) return;
    this.begin({ t0: now(), scale: 0, instant: true });
  }

  private flush() {
    if (this.start || !this.pendingTrigger) return;
    if (this.holds > 0) {
      // a holder that never lets go (a stuck decode, an error) cannot keep the content hidden (3.8)
      if (!this.safetyTimer && typeof setTimeout === 'function')
        this.safetyTimer = setTimeout(() => {
          this.holds = 0;
          this.flush();
        }, MOTION.safety);
      return;
    }
    if (this.safetyTimer) clearTimeout(this.safetyTimer);
    this.safetyTimer = 0;
    const { scale, t0 } = this.pendingTrigger;
    const s = scale === 'fit' ? (this.maxEnd > MOTION.compressed ? MOTION.compressed / this.maxEnd : 1) : scale;
    this.begin({ t0: t0 ?? now(), scale: s, instant: false });
  }

  private begin(s: ClockStart) {
    this.state = 'started';
    this.start = s;
    doneIds.add(this.id);
    const ls = [...this.listeners];
    this.listeners.clear();
    for (const l of ls) l(s);
  }
}

const clocks = new Map<string, SectionClock>();

/** The clock of a section id (one per id per page load). `el` is the section element, used for document order. */
export function clockFor(id: string, el: Element | null = null): SectionClock {
  let c = clocks.get(id);
  if (!c || (el && c.el && c.el !== el && !c.el.isConnected)) {
    c = new SectionClock(id, el);
    clocks.set(id, c);
  }
  return c;
}

/** Armed clocks of sections before `el` in the document: the nav jumped past them, so they show at once. */
export function finishClocksBefore(el: Element) {
  for (const c of clocks.values()) {
    if (c.state !== 'armed' || !c.el || c.el === el) continue;
    if (c.el.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) c.finishNow();
  }
}

export function allClocks(): SectionClock[] {
  return [...clocks.values()];
}

/** Tests only. */
export function resetMotionState() {
  clocks.clear();
  doneIds.clear();
  revealedIds.clear();
  shifts.clear();
}

export const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/* ---------------------------------------------------------------------------------- shared scroll state (3.4 b) */

/** The current plate scroll shift (px) per section id, written by the scroll-linked animator, read by the reveal. */
const shifts = new Map<string, number>();
export function setPlateShift(id: string, px: number) {
  shifts.set(id, px);
}
export function getPlateShift(id: string): number {
  return shifts.get(id) ?? 0;
}

/** Plate drift (3.4 b): translateY((progress - 0.5) * 3%) of the frame height while the section passes.
 *  progress 0 = section top at the viewport bottom, 1 = section bottom at the viewport top. */
export function plateShift(top: number, height: number, vh: number, frameH: number): number {
  const p = clamp01((vh - top) / (vh + height));
  return (p - 0.5) * 0.03 * frameH;
}

/* ------------------------------------------------------------------------------- scroll-linked registry (3.4, 3.9) */

/** A scroll-linked effect: `measure` reads geometry (called from observer/resize callbacks, never per frame);
 *  `update` only writes, from the cached geometry, in the shared rAF after a scroll. */
export interface ScrollItem {
  measure(scrollY: number, vh: number): void;
  update(scrollY: number, vh: number): void;
}

const scrollItems = new Set<ScrollItem>();
let scrollTeardown: (() => void) | null = null;
let scrollQueued: (() => void) | null = null;
let measureQueued = false;

function viewport(): { y: number; vh: number } {
  return {
    y: window.scrollY || window.pageYOffset || 0,
    vh: window.innerHeight || document.documentElement.clientHeight,
  };
}

function runUpdate() {
  scrollQueued = null;
  const { y, vh } = viewport();
  if (measureQueued) {
    measureQueued = false;
    for (const it of scrollItems) it.measure(y, vh);
  }
  for (const it of scrollItems) it.update(y, vh);
}

/** Queue one update on the next frame (many scroll events in a frame cost one update). */
export function requestScrollUpdate(remeasure = false) {
  if (remeasure) measureQueued = true;
  if (!scrollQueued && typeof window !== 'undefined') scrollQueued = nextFrame(runUpdate);
}

function install() {
  const onScroll = () => requestScrollUpdate(false);
  const onResize = () => requestScrollUpdate(true);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  // content above an item can change height (fonts swap, images arrive): the body's size changes with it
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
  ro?.observe(document.body);
  scrollTeardown = () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    ro?.disconnect();
    scrollQueued?.();
    scrollQueued = null;
  };
}

/** Register a scroll-linked item; it is measured and updated on the next frame. Returns remove(). */
export function addScrollItem(item: ScrollItem): () => void {
  if (typeof window === 'undefined') return () => undefined;
  scrollItems.add(item);
  if (!scrollTeardown) install();
  requestScrollUpdate(true);
  return () => {
    scrollItems.delete(item);
    if (scrollItems.size === 0 && scrollTeardown) {
      scrollTeardown();
      scrollTeardown = null;
    }
  };
}

export function scrollItemCount(): number {
  return scrollItems.size;
}
