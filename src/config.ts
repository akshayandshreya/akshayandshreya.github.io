// Site switches (spec 2.4). Everything optional is off unless set here. Facts never live here: they come from
// content/content.json through the generated src/i18n/*.json.
import type { Lang } from './i18n/types';

export interface GalleryItem {
  src: string;
  w: number;
  h: number;
  alt: Record<Lang, string>;
}

export type MotionTierSetting = 'auto' | 'full' | 'lite' | 'none';

export interface SiteConfig {
  /** Absolute origin + base (for example https://example.com/). Needed for canonical, hreflang and og:image. */
  siteUrl: string | null;
  seo: { indexable: boolean };
  sections: { countdown: boolean; cultures: boolean };
  countdown: { showSeconds: boolean };
  calendar: { durationMinutes: number | null; google: boolean };
  rsvp: { url: string | null };
  music: { src: string | null; credit: Record<Lang, string> | null; startAt: number };
  gallery: GalleryItem[];
  motion: { tier: MotionTierSetting; parallax: boolean };
  syncHashOnScroll: boolean;
  prerender: { sideShells: boolean };
}

const env = import.meta.env;

export const config: SiteConfig = {
  siteUrl: env.VITE_SITE_URL || null, // O10
  seo: { indexable: false }, // robots noindex,nofollow unless true (O6)
  sections: { countdown: true, cultures: true }, // venues, celebrations, invitation, opening, closing are always on (O1)
  countdown: { showSeconds: false },
  calendar: { durationMinutes: null, google: true }, // O3: no end times exist
  rsvp: { url: null }, // content.json says "no RSVP": hidden until the owner sets a URL (O5)
  music: { src: null, credit: null, startAt: 0 }, // O4: never autoplay; the owner supplies a track he may publish
  gallery: [], // empty: section hidden. Only images the owner has rights to.
  motion: { tier: 'auto', parallax: true },
  syncHashOnScroll: true,
  prerender: { sideShells: false }, // O7
};

/** Router basename from Vite's base ("/" -> undefined, "/wedding/" -> "/wedding"). */
export function routerBasename(): string | undefined {
  const base = env.BASE_URL ?? '/';
  const trimmed = base.replace(/\/+$/, '');
  return trimmed === '' ? undefined : trimmed;
}

/** react-router v7 behaviour, opted into now (no console warnings, no surprise on upgrade). */
export const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
