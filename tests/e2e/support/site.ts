// Shared e2e helpers: the expected copy (read from the generated JSON, never from the page), variants, viewports,
// navigation with a fixed clock, scrolling and small DOM probes.
import { readFileSync } from 'node:fs';
import { expect, type Page, type BrowserContext } from '@playwright/test';
import type { Lang, LangFile, SiteCopy, VariantKey } from '../../../src/i18n/types';

export const LANGS: Lang[] = ['en', 'hi', 'mai', 'bn'];
export const VARIANTS: VariantKey[] = ['G1', 'G0', 'B1', 'B0'];
export const FILES = Object.fromEntries(
  LANGS.map((l) => [l, JSON.parse(readFileSync(new URL(`../../../src/i18n/${l}.json`, import.meta.url), 'utf8'))]),
) as Record<Lang, LangFile>;
export const copyOf = (lang: Lang, key: VariantKey): SiteCopy => FILES[lang].variants[key];

/** Spec 8 "all viewports" (+ the short landscape phone). */
export const VIEWPORTS = {
  phoneS: { width: 360, height: 640 },
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  tabletL: { width: 1024, height: 768 },
  laptop: { width: 1440, height: 900 },
  desktop: { width: 1920, height: 1080 },
  short: { width: 844, height: 390 },
} as const;

/** Before the wedding (the countdown is on), and a fixed instant so every run sees the same numbers. */
export const BEFORE = '2026-11-02T10:00:00Z';
export const AFTER_START = '2026-11-26T12:30:00Z';

export function variantQuery(key: VariantKey): string {
  const q = new URLSearchParams();
  if (key[0] === 'B') q.set('side', 'bride');
  if (key[1] === '0') q.set('reception', '0');
  const s = q.toString();
  return s ? `?${s}` : '';
}
export const pageUrl = (lang: Lang, key: VariantKey = 'G1', hash = '') => `/${lang}/${variantQuery(key)}${hash}`;

/** Hygiene characters out, whitespace collapsed (as the unit helpers). */
export const norm = (s: string | null | undefined) =>
  (s ?? '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[\u2060\u200b]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Fix Date (timers keep running, so motion is real). */
export async function fixClock(target: Page | BrowserContext, iso = BEFORE) {
  await target.clock.setFixedTime(new Date(iso));
}

/**
 * Poll a page function until it returns true (page.waitForFunction evaluates a string, which the site's CSP
 * `script-src 'self'` rightly refuses; page.evaluate runs in Playwright's utility world and is allowed).
 */
export async function waitUntil<A>(page: Page, fn: (arg: A) => boolean, arg: A, timeout = 10_000, interval = 50) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate<boolean, A>(fn as never, arg).catch(() => false)) return true;
    if (Date.now() > end) return false;
    await page.waitForTimeout(interval);
  }
}

/** Go to a page and wait until it is hydrated (the motion tier class is set) and the fonts are in. */
export async function open(page: Page, url: string, opts: { at?: string; js?: boolean } = {}) {
  await fixClock(page, opts.at ?? BEFORE);
  const res = await page.goto(url, { waitUntil: 'load' });
  if (opts.js !== false) {
    const ok = await waitUntil(
      page,
      () => /\bmotion-(full|lite|none)\b/.test(document.documentElement.className),
      null,
    );
    expect(ok, 'the page hydrated (html.motion-* set)').toBe(true);
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return res;
}

/** Scroll to the end in viewport steps (lazy images, reveals, scrollspy all get their turn). */
export async function scrollThrough(page: Page, stepPause = 120) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = await page.evaluate(() => window.innerHeight);
  for (let y = 0; y < h; y += Math.round(vh * 0.8)) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' as ScrollBehavior }), y);
    await page.waitForTimeout(stepPause);
  }
  await page.evaluate(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' as ScrollBehavior }),
  );
  await page.waitForTimeout(stepPause);
}

/** The ids of the sections in the DOM, in order. */
export const sectionIds = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('main > section[id], main section[data-section]')).map((s) => s.id),
  );

/** Separated text of an element (text nodes joined by newlines, so neighbouring digit runs never join). */
export const separatedText = (page: Page, selector = 'body') =>
  page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return '';
    const out: string[] = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = (n.textContent ?? '').trim();
      if (t) out.push(t);
    }
    return out.join('\n');
  }, selector);

export const FORBIDDEN = /fish|matsya|machh?li|मछल|मत्स्य|माछ|মাছ|মৎস/i;
/** A phone-like run: 10+ digits (any numeral system), possibly grouped by spaces, dots or dashes. */
export const PHONE = /(?:[0-9०-९০-৯][\s.-]?){10,}/;

export async function expectNoHorizontalScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(sw, 'horizontal scroll').toBeLessThanOrEqual(cw + 1);
}

/**
 * Wait until the viewport is at rest, at most `ms`: no finite animation runs, no section in view is in a paint-reveal
 * phase (`data-paint`) and no element in view still has its entrance pending or running (`data-reveal`). Entrances are
 * held by the section clock, so "no animation runs" alone can be the moment before the couple starts its feather-in.
 */
export async function settle(page: Page, ms = 3200) {
  await page.waitForTimeout(150);
  await waitUntil(
    page,
    () => {
      const vh = innerHeight;
      const inView = (e: Element) => {
        const r = e.getBoundingClientRect();
        return r.bottom > 0 && r.top < vh && r.width > 0;
      };
      return (
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .every((a) => a.playState !== 'running') &&
        !Array.from(document.querySelectorAll('[data-paint]')).some(inView) &&
        // entrances of triggered sections only (25% visible, spec 3.4); Cultures captions follow the scroll (A-CUL-1)
        !Array.from(document.querySelectorAll('[data-reveal]')).some((e) => {
          const s = e.closest('main > section, footer');
          const r = s?.getBoundingClientRect();
          const seen = r ? Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) : 0;
          const triggered = !r || (r.height > 0 && seen / r.height >= Math.min(0.25, (0.99 * vh) / r.height));
          return inView(e) && triggered && !e.closest('#cultures figcaption');
        })
      );
    },
    null,
    ms,
    100,
  );
}
