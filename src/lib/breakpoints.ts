// Frames, breakpoints and the layout table (spec 5.1, 5.2). CSS has no custom media, so the literal queries below are
// repeated in src/styles/layout.css (and tokens.css's comment table); keep the two in step. Everything here is pure
// so the layout rules can be unit-tested without a browser.

/** The plate frame shapes (spec 1.3, 5.1): logical size of each painting. */
export type Frame = 'tall' | 'mid' | 'wide';
export const FRAMES: readonly Frame[] = ['tall', 'mid', 'wide'];
export const FRAME_SIZE: Record<Frame, { W: number; H: number }> = {
  tall: { W: 1080, H: 2340 },
  mid: { W: 1080, H: 1350 },
  wide: { W: 1920, H: 1080 },
};

/** Viewport aspect (width / height) limits between the frames. */
export const TALL_MAX_ASPECT = 3 / 5;
export const WIDE_MIN_ASPECT = 5 / 4;
/** The event two-column (split) layout needs a wide frame and at least this width (5.1). */
export const SPLIT_MIN_WIDTH = 900;
/** Phones held sideways (5.1 `short`). */
export const SHORT_MAX_HEIGHT = 520;
/** The couple's CSS height cap: the source art is only 916-1015 px tall (5.2). */
export const COUPLE_MAX_PX = 640;

/** The literal media queries (the same strings are in layout.css). */
export const MEDIA = {
  tall: '(max-aspect-ratio: 3/5)',
  mid: '(min-aspect-ratio: 3/5) and (max-aspect-ratio: 5/4)',
  wide: '(min-aspect-ratio: 5/4)',
  short: '(max-height: 520px) and (orientation: landscape)',
  split: '(min-aspect-ratio: 5/4) and (min-width: 900px)',
} as const;

/** Width steps inside a frame (5.1). */
export type WidthStep = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export const WIDTH_STEPS: readonly { step: WidthStep; min: number }[] = [
  { step: 'xs', min: 0 },
  { step: 'sm', min: 480 },
  { step: 'md', min: 768 },
  { step: 'lg', min: 1024 },
  { step: 'xl', min: 1440 },
];

export function widthStep(width: number): WidthStep {
  let out: WidthStep = 'xs';
  for (const s of WIDTH_STEPS) if (width >= s.min) out = s.step;
  return out;
}

/** The plate frame for a viewport. Ties go the way the `<source>` order resolves them (tall, then mid, then wide). */
export function frameFor(width: number, height: number): Frame {
  const a = width / Math.max(1, height);
  if (a <= TALL_MAX_ASPECT) return 'tall';
  if (a <= WIDE_MIN_ASPECT) return 'mid';
  return 'wide';
}

export function isShort(width: number, height: number): boolean {
  return height <= SHORT_MAX_HEIGHT && width > height;
}

/**
 * The layout mode of a viewport:
 * - `stacked`: tall and mid frames, and wide windows narrower than 900 px (centred column, like the card);
 * - `split`: wide and >= 900 px (event couple on one side, text on the other, alternating);
 * - `short`: phones in landscape (split-like grid, the section may exceed the viewport).
 */
export type LayoutMode = 'stacked' | 'split' | 'short';

export function layoutFor(width: number, height: number): LayoutMode {
  if (isShort(width, height)) return 'short';
  if (frameFor(width, height) === 'wide' && width >= SPLIT_MIN_WIDTH) return 'split';
  return 'stacked';
}

/** A CSS `clamp(minPx, vh * viewport height, maxPx)`, as numbers (vh is a fraction: 0.4 = 40svh). */
export interface HeightClamp {
  min: number;
  vh: number;
  max: number;
}

export function resolveClamp(c: HeightClamp, viewportHeight: number): number {
  return Math.min(c.max, Math.max(c.min, c.vh * viewportHeight));
}

/** The couple's crown-to-feet box height per layout (5.2), capped at COUPLE_MAX_PX. */
export type CoupleMode = 'short' | 'split' | 'stacked-mid' | 'stacked';
export const COUPLE_CLAMP: Record<CoupleMode, HeightClamp> = {
  short: { min: 0, vh: 0.8, max: COUPLE_MAX_PX },
  split: { min: 0, vh: 0.68, max: COUPLE_MAX_PX },
  'stacked-mid': { min: 0, vh: 0.44, max: COUPLE_MAX_PX },
  stacked: { min: 220, vh: 0.4, max: 460 },
};

/**
 * The same, with the media query of each mode, in the order a `sizes` attribute is evaluated (first match wins):
 * short `min(80svh, 640px)`, split `min(68svh, 640px)`, stacked mid `44svh`, stacked tall `clamp(220px, 40svh, 460px)`.
 */
export const COUPLE_HEIGHT: readonly { mode: CoupleMode; media: string; h: HeightClamp }[] = [
  { mode: 'short', media: MEDIA.short, h: COUPLE_CLAMP.short },
  { mode: 'split', media: MEDIA.split, h: COUPLE_CLAMP.split },
  { mode: 'stacked-mid', media: MEDIA.mid, h: COUPLE_CLAMP['stacked-mid'] },
  { mode: 'stacked', media: '', h: COUPLE_CLAMP.stacked },
];

/** The couple mode of a viewport. */
export function coupleMode(width: number, height: number): CoupleMode {
  const mode = layoutFor(width, height);
  if (mode !== 'stacked') return mode;
  return frameFor(width, height) === 'mid' ? 'stacked-mid' : 'stacked';
}

/** The couple box height for a viewport, in CSS px. */
export function coupleHeight(width: number, height: number): number {
  return resolveClamp(COUPLE_CLAMP[coupleMode(width, height)], height);
}

/** Which side the event couple takes in the split layout: Mehndi left, Engagement right, ... (2.3.4). */
export function coupleSide(index: number): 'left' | 'right' {
  return index % 2 === 0 ? 'left' : 'right';
}

/**
 * The layout table per section from 360 to 1920 px (spec 5.2), as data: one row per section, one column per layout
 * mode. It documents the CSS in layout.css and drives the layout tests; the CSS remains the source of truth for
 * pixel values.
 */
export type SectionLayoutId =
  'opening' | 'invitation' | 'countdown' | 'celebrations' | 'event' | 'cultures' | 'venues' | 'closing' | 'topbar';

export const LAYOUT_TABLE: Record<SectionLayoutId, Record<LayoutMode, string>> = {
  opening: {
    stacked: 'centred column; Ganesh min(34vw, 15.5svh) (min 88px), ring min(30vw, 15svh); fits 100svh on 360x640',
    split: 'same column, max width 640; Ganesh min(18vw, 15svh), ring 13svh; fits 1280x800',
    short: 'two columns: Ganesh + kicker left; heading, rule, ring, pair, dates right',
  },
  invitation: {
    stacked: 'column; names role; kalash small',
    split: 'column, max 720',
    short: 'column, may be taller than the viewport',
  },
  countdown: {
    stacked: 'card min(92vw, 560px); units in a row',
    split: 'card 640px',
    short: 'card 640px',
  },
  celebrations: {
    stacked: 'chips wrap in rows of 2-3',
    split: 'one row of 4-5 chips',
    short: 'one row, scrolls sideways (snap)',
  },
  event: {
    stacked: 'title at 12-14svh, tagline, couple clamp(220px, 40svh, 460px) (mid 44svh), facts, actions',
    split:
      'grid [couple 45] [text 40], alternating sides; couple min(68svh, 640px), feet on the plate floor (wide .86); text centred',
    short: 'grid as split; couple min(80svh, 640px); may exceed the viewport',
  },
  cultures: {
    stacked: 'Mithila block, lotus divider, Bengal block; motifs min(70vw, 360px)',
    split: 'two halves + lotus seam; motifs min(30vw, 420px)',
    short: 'as split; motifs min(28vw, 70svh)',
  },
  venues: {
    stacked: 'cards stacked, min(92vw, 560px)',
    split: 'cards side by side (2 x 520 max); one card centred with reception=0',
    short: 'as split',
  },
  closing: {
    stacked: 'column; diya at the foot (6svh); ring, request and diya also scale with svh',
    split: 'same, max 720; fits one screen at 1280x800',
    short: 'column; diya after the families',
  },
  topbar: {
    stacked: '56px (64px >= 1024px)',
    split: '64px',
    short: '48px',
  },
};

/** Viewports the layout is checked at (360-1920 px; spec 8.10 matrix plus the frame boundaries). */
export const CHECK_VIEWPORTS: readonly { w: number; h: number; note: string }[] = [
  { w: 360, h: 640, note: 'small Android, tall' },
  { w: 375, h: 667, note: 'iPhone SE, tall' },
  { w: 390, h: 844, note: 'iPhone 14, tall' },
  { w: 430, h: 932, note: 'iPhone Pro Max, tall' },
  { w: 667, h: 375, note: 'iPhone SE landscape, short' },
  { w: 844, h: 390, note: 'iPhone 14 landscape, short' },
  { w: 768, h: 1024, note: 'iPad portrait, mid' },
  { w: 820, h: 1180, note: 'iPad Air portrait, mid' },
  { w: 1024, h: 768, note: 'iPad landscape, split' },
  { w: 1280, h: 800, note: 'laptop, split' },
  { w: 1440, h: 900, note: 'desktop, split' },
  { w: 1920, h: 1080, note: 'full HD, split' },
];
