// Cursor and touch parallax (spec 3.7). Only in the `full` tier, only for sections in view, only with
// config.motion.parallax. The pointer is normalised to -1..1 from the viewport centre (touch: half strength, only while
// a finger is down, easing back to 0 over ~600 ms on release), smoothed by a critically damped spring (~120 ms), and
// written as two CSS variables (--px, --py) on each section in view, in one rAF. Layers multiply them by their depth
// in CSS (motion.css: plate 2 px, veil 5 px, edge motifs 7 px, couple and near motifs 9 px; text 0). No device
// orientation (iOS asks for permission). A touch only moves the layers once the finger has rested for TOUCH_HOLD_MS:
// the browser cancels the pointer as soon as a touch becomes a scroll, so reacting at pointerdown nudged every layer
// at the start of every scroll and every tap, a small jolt against the still text.

import { addAnimator } from './motion';

export const PARALLAX_DEPTH = { plate: 2, veil: 5, edge: 7, near: 9, text: 0 } as const;

/** Touch input moves the layers by half of the pointer depths. */
export const TOUCH_FACTOR = 0.5;

/** Position in the viewport -> -1..1 per axis (0 at the centre), clamped. */
export function normalisePointer(x: number, y: number, w: number, h: number): [number, number] {
  if (w <= 0 || h <= 0) return [0, 0];
  const nx = (x / w) * 2 - 1;
  const ny = (y / h) * 2 - 1;
  return [Math.max(-1, Math.min(1, nx)), Math.max(-1, Math.min(1, ny))];
}

export interface Spring {
  x: number;
  v: number;
}

/** One step of a critically damped spring toward `target` (omega in 1/s; dt in s). Exact for any dt. */
export function springStep(s: Spring, target: number, dt: number, omega: number): Spring {
  const d = s.x - target;
  const e = Math.exp(-omega * dt);
  const k = s.v + omega * d;
  return { x: target + (d + k * dt) * e, v: (s.v - omega * k * dt) * e };
}

/** A touch must rest this long (no scroll took it over) before the layers follow it. */
export const TOUCH_HOLD_MS = 180;

/** ~120 ms to settle (95%) for the pointer; ~600 ms for the touch release. */
export const OMEGA_POINTER = 40;
export const OMEGA_RELEASE = 8;

export interface ParallaxController {
  stop(): void;
  /** Tests: feed a pointer sample directly. */
  feed(nx: number, ny: number, touch?: boolean): void;
  /** Tests: where the spring is now. */
  value(): [number, number];
}

/**
 * Start the parallax. `targets()` returns the elements to write --px/--py on (the sections in view); it is called once
 * per frame while the spring moves. The rAF only runs while the spring is not at rest (idle = no rAF).
 */
export function startParallax(targets: () => Iterable<HTMLElement>, win: Window = window): ParallaxController {
  let tx = 0;
  let ty = 0;
  let sx: Spring = { x: 0, v: 0 };
  let sy: Spring = { x: 0, v: 0 };
  let omega = OMEGA_POINTER;
  let last = 0;
  let stopLoop: (() => void) | null = null;
  let written = new Set<HTMLElement>();

  const write = (x: number, y: number) => {
    const now = new Set<HTMLElement>();
    for (const el of targets()) {
      el.style.setProperty('--px', x.toFixed(4));
      el.style.setProperty('--py', y.toFixed(4));
      now.add(el);
    }
    // a section that left the view eases no further: park it at rest
    for (const el of written) {
      if (!now.has(el)) {
        el.style.removeProperty('--px');
        el.style.removeProperty('--py');
      }
    }
    written = now;
  };

  const tick = (t: number) => {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
    last = t;
    sx = springStep(sx, tx, dt, omega);
    sy = springStep(sy, ty, dt, omega);
    const rest =
      Math.abs(sx.x - tx) < 0.001 && Math.abs(sy.x - ty) < 0.001 && Math.abs(sx.v) < 0.01 && Math.abs(sy.v) < 0.01;
    if (rest) {
      sx = { x: tx, v: 0 };
      sy = { x: ty, v: 0 };
    }
    write(sx.x, sy.x);
    if (rest) {
      stopLoop = null;
      last = 0;
      return false;
    }
    return true;
  };

  const kick = () => {
    if (!stopLoop) stopLoop = addAnimator(tick);
  };

  const feed = (nx: number, ny: number, touch = false) => {
    const k = touch ? TOUCH_FACTOR : 1;
    tx = nx * k;
    ty = ny * k;
    omega = OMEGA_POINTER;
    kick();
  };

  const release = () => {
    tx = 0;
    ty = 0;
    omega = OMEGA_RELEASE;
    kick();
  };

  // touch: the latest finger position, followed only after TOUCH_HOLD_MS without a cancel (scroll) or lift (tap)
  let hold = 0;
  let held = false;
  let touchAt: [number, number] = [0, 0];
  const clearHold = () => {
    if (hold) win.clearTimeout(hold);
    hold = 0;
  };
  const onMove = (e: PointerEvent) => {
    const [nx, ny] = normalisePointer(e.clientX, e.clientY, win.innerWidth, win.innerHeight);
    if (e.pointerType === 'mouse') return feed(nx, ny, false);
    if (e.type === 'pointermove' && e.buttons === 0) return;
    touchAt = [nx, ny];
    if (held) return feed(nx, ny, true);
    if (e.type === 'pointerdown') {
      clearHold();
      hold = win.setTimeout(() => {
        hold = 0;
        held = true;
        feed(touchAt[0], touchAt[1], true);
      }, TOUCH_HOLD_MS);
    }
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    clearHold();
    if (held) release();
    held = false;
  };
  const onLeave = () => release();

  win.addEventListener('pointermove', onMove, { passive: true });
  win.addEventListener('pointerdown', onMove, { passive: true });
  win.addEventListener('pointerup', onUp, { passive: true });
  win.addEventListener('pointercancel', onUp, { passive: true });
  win.document.documentElement.addEventListener('mouseleave', onLeave, { passive: true });

  return {
    stop() {
      clearHold();
      win.removeEventListener('pointermove', onMove);
      win.removeEventListener('pointerdown', onMove);
      win.removeEventListener('pointerup', onUp);
      win.removeEventListener('pointercancel', onUp);
      win.document.documentElement.removeEventListener('mouseleave', onLeave);
      stopLoop?.();
      stopLoop = null;
      for (const el of written) {
        el.style.removeProperty('--px');
        el.style.removeProperty('--py');
      }
      written.clear();
    },
    feed,
    value: () => [sx.x, sy.x],
  };
}
