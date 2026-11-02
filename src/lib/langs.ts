// Languages, aliases, detection and URL resolution (spec 2.1). Pure functions: unit-tested, shared by the router, the
// root redirect and (as plain JS) public/redirect.js.
import type { Lang, VariantKey } from '../i18n/types';

export const LANGS: readonly Lang[] = ['en', 'hi', 'mai', 'bn'];
export const DEFAULT_LANG: Lang = 'en';
export const LANG_STORAGE_KEY = 'asw.lang';

/** Endonyms, never translated (spec 2.3.8), and the compact labels used below 480 px. */
export const ENDONYMS: Record<Lang, { full: string; short: string }> = {
  en: { full: 'English', short: 'EN' },
  hi: { full: 'हिन्दी', short: 'हि' },
  mai: { full: 'मैथिली', short: 'मै' },
  bn: { full: 'বাংলা', short: 'বা' },
};

const ALIASES: Record<string, Lang> = {
  en: 'en',
  hi: 'hi',
  mai: 'mai',
  bn: 'bn',
  english: 'en',
  hindi: 'hi',
  maithili: 'mai',
  bangla: 'bn',
  bengali: 'bn',
  // the endonyms as typed or shared (QA r1 I4): /बांग्ला-style paths no longer fall back to English
  'हिन्दी': 'hi',
  'हिंदी': 'hi',
  'मैथिली': 'mai',
  'বাংলা': 'bn',
  'বাঙলা': 'bn',
};

/**
 * Variant paths (spec 2.1, QA r1 T1): `/{lang}/b/` bride's side first, `/{lang}/k/` Kolkata only (no Reception),
 * `/{lang}/bk/` both; `/{lang}/` is the default (groom first, five events). Each is a pre-rendered page of its own, so a
 * link preview (which never runs JS, and cannot pick a file by query string) shows that variant's names, dates and
 * cities. The query (`?side`, `?reception`) still works and wins over the path. Neutral letters on purpose: a guest's
 * link never reads "no reception".
 */
export const VARIANT_SLUGS: Record<VariantKey, string> = { G1: '', B1: 'b', G0: 'k', B0: 'bk' };
const SLUG_KEYS: Record<string, VariantKey> = { b: 'B1', k: 'G0', bk: 'B0', kb: 'B0' };

/** The variant a path segment names ("b", "K", "bk"), or null. */
export function variantOfSlug(segment: string | undefined | null): VariantKey | null {
  return (segment && SLUG_KEYS[segment.toLowerCase()]) || null;
}

/** The canonical path of a language page for a variant ("/bn/bk/"). */
export function variantPath(lang: Lang, key: VariantKey = 'G1'): string {
  const slug = VARIANT_SLUGS[key];
  return slug ? `/${lang}/${slug}/` : `/${lang}/`;
}

export function isLang(x: unknown): x is Lang {
  return typeof x === 'string' && (LANGS as readonly string[]).includes(x);
}

/** A path segment to a language ("EN", "bengali" -> "en", "bn"); null when it is not one. */
export function normalizeLang(segment: string | undefined | null): Lang | null {
  if (!segment) return null;
  let s = segment;
  try {
    s = decodeURIComponent(segment);
  } catch {
    /* keep raw */
  }
  return ALIASES[s.toLowerCase()] ?? ALIASES[s.normalize('NFC')] ?? null;
}

export type PathResolution =
  | { kind: 'root' }
  | { kind: 'page'; lang: Lang; variant: VariantKey | null }
  | { kind: 'redirect'; to: string };

/**
 * Resolve a router pathname (basename already removed) per the URL contract (2.1):
 * "/" -> root (detect); "/en/", "/en/bk/" -> page; "/en", "/EN/", "/english", "/en/anything" -> redirect "/en/";
 * "/en/B", "/en/b/anything" -> redirect "/en/b/"; else "/en/".
 */
export function resolvePath(pathname: string): PathResolution {
  const p = pathname || '/';
  if (p === '/' || p === '') return { kind: 'root' };
  const segments = p.split('/').filter(Boolean);
  const lang = normalizeLang(segments[0]);
  if (!lang) return { kind: 'redirect', to: `/${DEFAULT_LANG}/` };
  const variant = variantOfSlug(segments[1]);
  const canonical = variantPath(lang, variant ?? 'G1');
  return p === canonical ? { kind: 'page', lang, variant } : { kind: 'redirect', to: canonical };
}

/**
 * Default language (2.1.1): a stored choice, else the first of navigator.languages whose primary subtag is mai, bn, hi
 * or en (mai wins over hi: a Maithili browser often lists hi as well), else en.
 */
export function detectLang(stored: string | null | undefined, languages: readonly string[] | undefined): Lang {
  if (isLang(stored)) return stored;
  const primaries = (languages ?? []).map((l) => l.toLowerCase().split(/[-_]/)[0] ?? '');
  for (const p of primaries) {
    if (p === 'hi' && primaries.includes('mai')) return 'mai';
    if (isLang(p)) return p;
  }
  return DEFAULT_LANG;
}

/** Read the stored choice without throwing (private mode, disabled storage). */
export function readStoredLang(): string | null {
  try {
    return window.localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeLang(lang: Lang): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* storage unavailable: the URL still carries the language */
  }
}

/** The switch target for `lang`: the same variant path and query, the section in view as the hash (#opening is
 *  written as no hash). */
export function langHref(
  lang: Lang,
  search: string,
  active: string,
  pathVariant: VariantKey | null = null,
): { pathname: string; search: string; hash: string } {
  return {
    pathname: variantPath(lang, pathVariant ?? 'G1'),
    search,
    hash: active && active !== 'opening' ? `#${active}` : '',
  };
}
