// "Language switch keeps the place" (spec 2.1.2): before switching, remember { id, ratio } of the section in view
// (ratio = how far the viewport top is into that section); after the new copy renders, scroll there instantly.
import { markOwnScroll } from './hold';

export interface Place {
  id: string;
  /** how far the viewport top is into the section (0..1), when it is inside it */
  ratio: number;
  /** px from the viewport top down to the section top, when the viewport top is above the section */
  offset: number;
}

let pendingPlace: Place | null = null;

function docTop(el: Element): number {
  return el.getBoundingClientRect().top + window.scrollY;
}

/** Measure the place of section `id` now. */
export function measurePlace(id: string): Place | null {
  const el = document.getElementById(id);
  if (!el) return null;
  const top = docTop(el);
  const h = el.getBoundingClientRect().height || 1;
  const into = window.scrollY - top;
  return { id, ratio: Math.min(1, Math.max(0, into / h)), offset: into < 0 ? -into : 0 };
}

export function rememberPlace(id: string): void {
  pendingPlace = measurePlace(id);
}

export function hasPendingPlace(): boolean {
  return pendingPlace !== null;
}

/** The scroll position of a place now (the section's current top and height), or null when the section is gone. */
export function placeTop(place: Place): number | null {
  const el = document.getElementById(place.id);
  if (!el) return null;
  return docTop(el) + place.ratio * el.getBoundingClientRect().height - place.offset;
}

/** Scroll to the remembered place (instant, never smooth) and forget it. Returns the place when it scrolled: the
 *  caller holds it while the new language's fonts and copy settle (state/hold.ts, QA r1 I1). */
export function restorePlace(): Place | null {
  const place = pendingPlace;
  pendingPlace = null;
  if (!place) return null;
  const top = placeTop(place);
  if (top === null) return null;
  markOwnScroll();
  window.scrollTo({ top, left: 0, behavior: 'instant' as ScrollBehavior });
  return place;
}
