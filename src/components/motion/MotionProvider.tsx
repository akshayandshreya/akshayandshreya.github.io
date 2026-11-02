// The motion tier (spec 3.3) as context and as a class on <html> (motion-full|lite|none), so CSS and JS agree. Base
// styles are the still state; every animation lives under .motion-full / .motion-lite. Reduced motion is live: the
// media query listener switches tiers without a reload. The provider also owns the page-wide motion plumbing:
//  - section triggers (3.4): one IntersectionObserver over every [data-section]; a section's content timeline starts
//    when 25% of it is visible, once per page load. A section already in view at load runs a compressed 600 ms version
//    (the opening runs its full entrance after fonts or 1200 ms); sections jumped past show at once.
//  - `in-view` on the sections that intersect the viewport: idle loops (3.6) run only there; `motion-paused` on <html>
//    while the document is hidden.
//  - the plate scroll shift (3.4 b, full tier) and the pointer parallax (3.7, full tier, config.motion.parallax).
//  - the runtime probe's demotion to lite (3.3), kept for the session.
// The boot class (public/motion-boot.js adds `motion-boot` to <html> before first paint unless reduced motion) lets
// entrances hide [data-enter] content that is already on screen at load; it is removed once the timelines are armed
// (or by the boot script itself after 3 s, so content never stays hidden if this bundle fails).
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { config } from '../../config';
import {
  BOOT_CLASS,
  ENTRANCE,
  LITE_KEY,
  MOTION,
  PAUSED_CLASS,
  addScrollItem,
  clockFor,
  detectTier,
  finishClocksBefore,
  markRevealed,
  plateShift,
  readMotionPin,
  setPlateShift,
  type MotionTier,
  type SectionClock,
} from '../../lib/motion';
import { startParallax } from '../../lib/parallax';
import { useReducedMotion } from './useReducedMotion';

interface MotionState {
  tier: MotionTier;
  /** the runtime probe found the device slow: lite for the rest of the session */
  demote: () => void;
  /** the idle layers (veil, live strokes, sweep, glow, edge motifs, lights, particles) may mount: after the opening's
   *  entrance (or at once when the page opens elsewhere), in an idle moment (QA r1 M1) */
  layersReady: boolean;
}

const MotionContext = createContext<MotionState>({ tier: 'none', demote: () => undefined, layersReady: false });

const SECTION_SELECTOR = '[data-section]';
const IN_VIEW = 'in-view';
const IN_FOCUS = 'in-focus';
/** visibility steps at which the section in focus is re-chosen (every 5% of a section's height) */
const FOCUS_STEPS = Array.from({ length: 21 }, (_, i) => i / 20);

function readProbedLite(): boolean {
  try {
    return window.sessionStorage.getItem(LITE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Show at once every section that has reached the screen (top above the viewport's foot): used when the tier
 *  leaves 'none' mid-visit (the guest turned reduced motion off), so nothing the guest has already read is hidden
 *  again to replay its entrance (QA r1 M9). */
function revealReached() {
  const h = vh();
  for (const el of document.querySelectorAll<HTMLElement>(SECTION_SELECTOR)) {
    const id = el.dataset.section;
    if (!id || el.getBoundingClientRect().top >= h) continue;
    clockFor(id, el).finishNow();
    markRevealed(id);
  }
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  // SSR and the first client render agree on 'none' (still state); the effect picks the real tier. `decided` tells
  // that placeholder apart from a real 'none' (the boot class must survive the placeholder pass).
  const [tier, setTier] = useState<MotionTier>('none');
  const [decided, setDecided] = useState(false);
  const [probedLite, setProbedLite] = useState(false);
  const lastTier = useRef<MotionTier | null>(null);
  // ?motion=full|lite|none pins the tier (QA tools; the runtime probe never demotes a pinned tier)
  const [pin] = useState(() => (typeof window === 'undefined' ? null : readMotionPin(window.location.search)));

  useEffect(() => {
    // without IntersectionObserver nothing can trigger an entrance: the page stays still (old browsers, jsdom)
    const capable = typeof IntersectionObserver !== 'undefined';
    const next = capable
      ? detectTier(
          pin ?? config.motion.tier,
          reduced,
          typeof navigator === 'undefined' ? undefined : (navigator as never),
          probedLite || readProbedLite(),
        )
      : 'none';
    if (lastTier.current === 'none' && next !== 'none') revealReached();
    lastTier.current = next;
    // a transition: the tier commit (every motion consumer re-renders) yields to input and paint (QA r1 M1)
    startTransition(() => {
      setTier(next);
      setDecided(true);
    });
  }, [reduced, probedLite, pin]);

  // the probe's verdict (3.3) takes effect once the section the guest is looking at has left the screen: its veil,
  // strokes and sweep never vanish in one frame under the guest's eyes, and its running entrances keep their timing
  // (QA r1 M4). A pinned tier is never demoted.
  const demote = useCallback(() => {
    if (pin) return;
    try {
      window.sessionStorage.setItem(LITE_KEY, '1');
    } catch {
      /* private mode: this page view only */
    }
    const focus = document.querySelector<HTMLElement>(`.plate-section.${IN_FOCUS}`);
    if (!focus || typeof IntersectionObserver === 'undefined') {
      setProbedLite(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => !e.isIntersecting)) {
        io.disconnect();
        setProbedLite(true);
      }
    });
    io.observe(focus);
  }, [pin]);

  const layersReady = useLayersReady(tier, decided);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('motion-full', 'motion-lite', 'motion-none');
    root.classList.add(`motion-${tier}`);
  }, [tier]);

  useSectionTriggers(tier, decided);
  useInViewAndPause(tier);
  usePlateShift(tier);
  useParallax(tier);

  const value = useMemo(() => ({ tier, demote, layersReady }), [tier, demote, layersReady]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotionTier(): MotionTier {
  return useContext(MotionContext).tier;
}

export function useMotion(): MotionState {
  return useContext(MotionContext);
}

/** The section element and its clock for an element inside a section, or null outside one. */
export function sectionClockOf(el: Element | null): { section: HTMLElement; clock: SectionClock } | null {
  const section = el?.closest<HTMLElement>(SECTION_SELECTOR);
  const id = section?.dataset.section;
  if (!section || !id) return null;
  return { section, clock: clockFor(id, section) };
}

function vh(): number {
  return window.innerHeight || document.documentElement.clientHeight || 1;
}

/* ------------------------------------------------------------------------------------- idle layers, deferred */

const OPENING_END = Math.max(...Object.values(ENTRANCE.opening).map((s) => s[1]));

/** When the idle layers may mount (QA r1 M1): mounting the veils, strokes and particles of every section in the
 *  commit that starts the opening froze its first half second on a mid-range phone. They wait for the opening's
 *  entrance to end (or start at once when it does not run), then for an idle moment. */
function useLayersReady(tier: MotionTier, decided: boolean): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!decided || tier === 'none' || ready) return;
    let timer = 0;
    let idle = 0;
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback;
    const go = () => {
      const done = () => setReady(true);
      if (ric) idle = ric(done, { timeout: 600 });
      else timer = window.setTimeout(done, 50);
    };
    const opening = document.querySelector<HTMLElement>('[data-section="opening"]');
    const unsub = opening
      ? clockFor('opening', opening).subscribe((s) => {
          const left = s.instant ? 0 : s.t0 + OPENING_END * s.scale + 150 - performance.now();
          timer = window.setTimeout(go, Math.max(0, left));
        })
      : (go(), () => undefined);
    // a page that never starts the opening's clock (scrolled away before it started) still gets its layers
    const fallback = window.setTimeout(go, MOTION.openingFontWait + OPENING_END + 600);
    return () => {
      unsub();
      window.clearTimeout(timer);
      window.clearTimeout(fallback);
      const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      if (idle && cic) cic(idle);
    };
  }, [tier, decided, ready]);
  return ready;
}

/* ------------------------------------------------------------------------------------------- section triggers */

function useSectionTriggers(tier: MotionTier, decided: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    if (!decided) return;
    if (tier === 'none' || typeof IntersectionObserver === 'undefined') {
      root.classList.remove(BOOT_CLASS);
      return;
    }
    const boot = root.classList.contains(BOOT_CLASS);
    const timers: number[] = [];
    const seen = new WeakSet<Element>();

    const classify = (section: HTMLElement) => {
      if (seen.has(section)) return;
      seen.add(section);
      const id = section.dataset.section;
      if (!id) return;
      const clock = clockFor(id, section);
      if (clock.start) return;
      const r = section.getBoundingClientRect();
      const h = vh();
      if (r.bottom <= 0) {
        clock.finishNow(); // above the fold at load (deep link): simply there
      } else if (r.top < h) {
        // on screen at load: animate only if the boot class kept it hidden, else it is already visible: leave it
        if (!boot) clock.finishNow();
        else if (id === 'opening') {
          let fired = false;
          const go = () => {
            if (fired) return;
            fired = true;
            // the boot script shows everything at 3 s whatever happens; a page that hydrates that late shows the
            // opening at once, and one that hydrates late (> 1.5 s after its first paint) runs the compressed
            // version: the heading is never held back for a full 2.9 s after a slow load (QA r1 M10)
            const t = performance.now();
            if (t > MOTION.bootDeadline) return clock.finishNow();
            const fcp = performance.getEntriesByName?.('first-contentful-paint')[0]?.startTime;
            const late = typeof fcp === 'number' && t - fcp > MOTION.lateHydration;
            // start on a frame after the tier's commit has been presented, so its first frames are not skipped
            // (QA r1 M1)
            requestAnimationFrame(() => requestAnimationFrame(() => clock.trigger(late ? 'fit' : 1)));
          };
          timers.push(window.setTimeout(go, MOTION.openingFontWait));
          document.fonts?.ready.then(go, go);
        } else clock.trigger('fit');
      }
      // below the fold: armed; the observer starts it
    };

    const io = new IntersectionObserver(
      (entries) => {
        const h = vh();
        for (const e of entries) {
          const section = e.target as HTMLElement;
          const id = section.dataset.section;
          if (!id || !e.isIntersecting) continue;
          const tall = e.intersectionRect.height >= 0.6 * h;
          if (e.intersectionRatio < 0.25 && !tall) continue;
          const clock = clockFor(id, section);
          if (clock.start) continue;
          finishClocksBefore(section);
          clock.trigger(1);
        }
      },
      { threshold: [0, 0.1, 0.25, 0.5] },
    );

    const scan = () => {
      for (const s of document.querySelectorAll<HTMLElement>(SECTION_SELECTOR)) {
        classify(s);
        io.observe(s);
      }
    };
    scan();
    // children's effects have armed their entrances by now: the boot class may go
    root.classList.remove(BOOT_CLASS);

    // sections come and go with the variant (reception=0) and the countdown; observe new ones
    const main = document.getElementById('main') ?? document.body;
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(scan) : null;
    mo?.observe(main, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo?.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [tier, decided]);
}

/* ------------------------------------------------------------------------------------ in view, hidden document */

function useInViewAndPause(tier: MotionTier) {
  useEffect(() => {
    const root = document.documentElement;
    const onVis = () => root.classList.toggle(PAUSED_CLASS, document.hidden);
    onVis();
    document.addEventListener('visibilitychange', onVis);
    if (tier === 'none' || typeof IntersectionObserver === 'undefined') {
      return () => document.removeEventListener('visibilitychange', onVis);
    }
    // in-view: every section that touches the viewport (its drift and shimmer run); in-focus: the one that covers most
    // of it, the only one whose idle layers (sweep, glow, sway, particles, lights) run, so a viewport that straddles
    // two sections never shows both sections' budgets at once (3.6, at most three continuous motions per viewport)
    const visible = new Set<Element>();
    let focus: Element | null = null;
    const refocus = () => {
      const h = vh();
      let best: Element | null = null;
      let bestH = 0;
      for (const el of visible) {
        const r = el.getBoundingClientRect();
        const seen = Math.min(r.bottom, h) - Math.max(r.top, 0);
        if (seen > bestH) {
          bestH = seen;
          best = el;
        }
      }
      if (best === focus) return;
      focus?.classList.remove(IN_FOCUS);
      best?.classList.add(IN_FOCUS);
      focus = best;
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          e.target.classList.toggle(IN_VIEW, e.isIntersecting);
          if (e.isIntersecting) visible.add(e.target);
          else visible.delete(e.target);
        }
        refocus();
      },
      { threshold: FOCUS_STEPS },
    );
    const scan = () => document.querySelectorAll(SECTION_SELECTOR).forEach((s) => io.observe(s));
    scan();
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(scan) : null;
    mo?.observe(document.getElementById('main') ?? document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      io.disconnect();
      mo?.disconnect();
      document.querySelectorAll(`.${IN_VIEW}, .${IN_FOCUS}`).forEach((s) => s.classList.remove(IN_VIEW, IN_FOCUS));
    };
  }, [tier]);
}

/* ---------------------------------------------------------------------------------------- plate scroll shift */

interface ShiftGeom {
  el: HTMLElement;
  id: string;
  /** the plate's .plate-scroll and the layers painted on it (.m-shift: veil, live strokes, glow) */
  layers: HTMLElement[];
  top: number;
  height: number;
  frameH: number;
  last: number;
}

function usePlateShift(tier: MotionTier) {
  useEffect(() => {
    if (tier !== 'full') return;
    let items: ShiftGeom[] = [];
    const remove = addScrollItem({
      measure(scrollY) {
        const prev = new Map(items.map((g) => [g.el, g.last]));
        items = [];
        for (const el of document.querySelectorAll<HTMLElement>('.plate-section')) {
          const frame = el.querySelector<HTMLElement>(':scope > .frame');
          const layers = frame
            ? Array.from(frame.querySelectorAll<HTMLElement>(':scope > :is(.plate-scroll, .m-shift)'))
            : [];
          if (!frame || !layers.length) continue;
          const r = el.getBoundingClientRect();
          items.push({
            el,
            id: el.dataset.section ?? '',
            layers,
            top: r.top + scrollY,
            height: r.height,
            frameH: frame.clientHeight,
            last: prev.get(el) ?? NaN,
          });
        }
      },
      update(scrollY, h) {
        for (const g of items) {
          const top = g.top - scrollY;
          if (top > h || top + g.height < 0) continue; // off screen: leave it where it is
          const px = Math.round(plateShift(top, g.height, h, g.frameH) * 10) / 10;
          if (px === g.last) continue;
          g.last = px;
          for (const l of g.layers) l.style.transform = `translate3d(0, ${px}px, 0)`;
          setPlateShift(g.id, px);
        }
      },
    });
    return () => {
      remove();
      for (const g of items) {
        for (const l of g.layers) l.style.transform = '';
        setPlateShift(g.id, 0);
      }
    };
  }, [tier]);
}

/* ------------------------------------------------------------------------------------------------ parallax */

function useParallax(tier: MotionTier) {
  useEffect(() => {
    if (tier !== 'full' || !config.motion.parallax) return;
    const ctl = startParallax(() => document.querySelectorAll<HTMLElement>(`.plate-section.${IN_VIEW}`));
    return () => ctl.stop();
  }, [tier]);
}

/* ---------------------------------------------------------------------------------------------- entrances */

export type EntranceKind = 'text' | 'fade' | 'paint' | 'title' | 'feather' | 'rise' | 'light' | 'draw';

export interface EntranceOptions {
  /** offset (ms) after the section's trigger */
  at?: number;
  /** length (ms) */
  dur?: number;
  /** the element's data-enter kind; 'draw' runs no CSS animation (line art draws itself through onPlay) */
  kind?: EntranceKind;
  /** JS entrances (line art): called when the entrance is due with its delay and length (ms, already scaled) */
  onPlay?: (delay: number, dur: number) => void | (() => void);
  /** called when the element rests (shown at once: still, instant, reduced motion, or after its entrance) */
  onRest?: () => void;
  /** called when the entrance is armed (it will run: hide what a JS entrance draws) */
  onArm?: () => void;
}

const clearEntrance = (el: HTMLElement) => {
  el.removeAttribute('data-reveal');
  el.style.removeProperty('--m-delay');
  el.style.removeProperty('--m-dur');
};

/**
 * Arm an entrance on `el` (3.4, 3.8): hidden ("pending") only when the entrance will run, then played once on the
 * section's clock with a CSS animation (motion.css) delayed by `at`. The resting state is the base CSS: on reduced
 * motion, SSR, no JS, a section shown at once, or after the entrance, nothing is left on the element.
 */
export function useEntrance(ref: { current: HTMLElement | null }, o: EntranceOptions = {}) {
  const tier = useMotionTier();
  const { at = 0, dur = MOTION.tText, kind = 'text' } = o;
  // callbacks are read through a ref so a parent re-render never re-arms a finished entrance
  const cb = useCallbacks(o.onPlay, o.onRest, o.onArm);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (tier === 'none' || typeof IntersectionObserver === 'undefined') {
      cb.current.rest?.();
      return;
    }
    const sc = sectionClockOf(el);
    if (!sc || sc.clock.start?.instant) {
      cb.current.rest?.();
      return;
    }
    if (!el.hasAttribute('data-enter')) el.setAttribute('data-enter', kind);
    const js = kind === 'draw';
    let timer = 0;
    let stopPlay: (() => void) | void;
    if (!sc.clock.start && !js) el.setAttribute('data-reveal', 'pending');
    if (!sc.clock.start) cb.current.arm?.();
    const rest = () => {
      clearEntrance(el);
      cb.current.rest?.();
    };
    const unsub = sc.clock.subscribe((s) => {
      if (s.instant) return rest();
      const k = tier === 'lite' ? 0.7 : 1;
      const d = Math.max(160, dur * s.scale * k);
      const delay = at * s.scale * k - (performance.now() - s.t0);
      if (delay + d <= 0) return rest(); // long past (a late subscriber): just show it
      if (js) {
        stopPlay = cb.current.play?.(delay, d);
      } else {
        el.style.setProperty('--m-delay', `${Math.round(delay)}ms`);
        el.style.setProperty('--m-dur', `${Math.round(d)}ms`);
        el.setAttribute('data-reveal', 'in');
      }
      timer = window.setTimeout(rest, Math.max(0, delay) + d + 80);
    }, at + dur);
    return () => {
      unsub();
      window.clearTimeout(timer);
      if (stopPlay) stopPlay();
      clearEntrance(el);
    };
  }, [tier, at, dur, kind, ref, cb]);
}

function useCallbacks(play: EntranceOptions['onPlay'], rest: EntranceOptions['onRest'], arm: EntranceOptions['onArm']) {
  const [box] = useState(() => ({ current: { play, rest, arm } }));
  box.current = { play, rest, arm };
  return box;
}
