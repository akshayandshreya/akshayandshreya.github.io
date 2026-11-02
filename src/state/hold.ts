// Holding a place while the page settles (spec 2.1, 2.1.2; QA r1 I1, M2, T6). A jump (deep link, language switch,
// menu anchor, rotation) lands where it should, then web fonts swap in, lazy art arrives and copy reflows above the
// target, and the page moves under the guest. A hold re-applies the jump whenever the page's size changes (and once
// the fonts are ready) until the guest takes over (wheel, touch, pointer, key), someone else scrolls the page away, or
// its time is up. One hold at a time: a new one replaces the last.
//
// Own scrolls: every scroll a hold (or a jump of the site's own) makes is stamped, so listeners that react to the
// guest's scrolling (the bar that hides on scroll down, the hold's own "someone else scrolled" check) can tell them
// from the guest's (QA r1 I3).

let ownScrollAt = -Infinity;

/** Stamp a scroll the site makes itself (an instant jump, a restore). */
export function markOwnScroll(): void {
  ownScrollAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Whether the scroll events of the last `ms` belong to one of the site's own jumps. */
export function isOwnScroll(ms = 300): boolean {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return now - ownScrollAt < ms;
}

export interface HoldOptions {
  /** true while the page is away from the held place */
  off: () => boolean;
  /** put it back (scrollTo / scrollIntoView) */
  fix: () => void;
  /** how long the hold lasts at most (ms) */
  ms: number;
  /** a scroll that is not ours and leaves the place ends the hold (deep links, a switch); off for smooth jumps,
   *  whose own animation moves the page for a while */
  stopOnForeignScroll?: boolean;
  /** "left the place" for stopOnForeignScroll (default: off()) */
  away?: () => boolean;
}

const INPUTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
let current: (() => void) | null = null;

/** Hold a place (see above). Returns release(). */
export function holdPlace(o: HoldOptions): () => void {
  current?.();
  if (typeof window === 'undefined') return () => undefined;
  let done = false;
  const apply = () => {
    if (done || !o.off()) return;
    markOwnScroll();
    o.fix();
  };
  const onScroll = () => {
    if (!isOwnScroll(200) && (o.away ?? o.off)()) stop();
  };
  const main = document.getElementById('main') ?? document.body;
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  const stop = () => {
    if (done) return;
    done = true;
    ro?.disconnect();
    window.clearTimeout(timer);
    window.removeEventListener('scroll', onScroll);
    fonts?.removeEventListener?.('loadingdone', apply);
    for (const e of INPUTS) window.removeEventListener(e, stop);
    if (current === stop) current = null;
  };
  const timer = window.setTimeout(stop, o.ms);
  for (const e of INPUTS) window.addEventListener(e, stop, { passive: true });
  if (o.stopOnForeignScroll) window.addEventListener('scroll', onScroll, { passive: true });
  ro?.observe(main);
  fonts?.addEventListener?.('loadingdone', apply);
  void fonts?.ready.then(apply, () => undefined);
  current = stop;
  return stop;
}

/** The scroll position that puts `el`'s top at the viewport top (minus its scroll-margin-top). */
export function scrollTopOf(el: Element): number {
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  return el.getBoundingClientRect().top + window.scrollY - margin;
}
