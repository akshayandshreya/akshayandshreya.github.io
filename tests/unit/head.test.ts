// The document head (spec 6.2, G-I18N-2) and the per-language fonts (spec 6.5, 6.6): lib/head.ts.
import { afterEach, describe, expect, it } from 'vitest';
import { FILES } from '../helpers';
import { config, type SiteConfig } from '../../src/config';
import {
  FONTS_ATTR,
  HEAD_ATTR,
  OG_LOCALES,
  applyHead,
  compactCss,
  ensureFonts,
  escapeHtml,
  fontCssLoader,
  headData,
  headHtml,
  headTags,
} from '../../src/lib/head';
import type { Lang, VariantKey } from '../../src/i18n/types';

const LANGS: Lang[] = ['en', 'hi', 'mai', 'bn'];
const KEYS: VariantKey[] = ['G1', 'G0', 'B1', 'B0'];
const withSite = (siteUrl: string | null, indexable = false): SiteConfig => ({
  ...config,
  siteUrl,
  seo: { indexable },
});

function resetHead() {
  document.head.innerHTML = '';
  document.title = '';
  document.documentElement.lang = 'en';
}
afterEach(resetHead);

const metaContent = (sel: string) => document.head.querySelector<HTMLMetaElement>(sel)?.getAttribute('content');

describe('headData', () => {
  for (const lang of LANGS) {
    for (const key of KEYS) {
      it(`${lang} ${key}: title, description and og copy come from the variant's head copy`, () => {
        const d = headData(FILES[lang], key, withSite(null));
        const copy = FILES[lang].variants[key].head;
        expect(d.lang).toBe(lang);
        expect(d.title).toBe(copy.title);
        expect(d.description).toBe(copy.description);
        expect(d.og.title).toBe(copy.title);
        expect(d.og.description).toBe(copy.description);
        expect(d.og.locale).toBe(OG_LOCALES[lang]);
      });
    }
  }

  it('is noindex, nofollow by default and indexable only when the config says so (O6)', () => {
    expect(headData(FILES.en, 'G1', withSite(null)).robots).toBe('noindex, nofollow');
    expect(headData(FILES.en, 'G1', withSite(null, true)).robots).toBeNull();
  });

  it('omits og:image, og:url, canonical and hreflang without VITE_SITE_URL (they must be absolute)', () => {
    const d = headData(FILES.hi, 'G1', withSite(null));
    expect(d.og.image).toBeNull();
    expect(d.og.url).toBeNull();
    expect(d.canonical).toBeNull();
    expect(d.alternates).toEqual([]);
  });

  it('builds absolute og:image, canonical and the four hreflang alternates + x-default under a sub-path', () => {
    const d = headData(FILES.bn, 'G1', withSite('https://example.com/wedding'));
    expect(d.og.image).toBe('https://example.com/wedding/og/og-bn.jpg');
    expect(d.canonical).toBe('https://example.com/wedding/bn/');
    expect(d.og.url).toBe(d.canonical);
    expect(d.alternates).toEqual([
      { hreflang: 'en', href: 'https://example.com/wedding/en/' },
      { hreflang: 'hi', href: 'https://example.com/wedding/hi/' },
      { hreflang: 'mai', href: 'https://example.com/wedding/mai/' },
      { hreflang: 'bn', href: 'https://example.com/wedding/bn/' },
      { hreflang: 'x-default', href: 'https://example.com/wedding/en/' },
    ]);
  });

  it('each variant has its own page and preview card: og:url, canonical, og:image, alternates (QA r1 T1)', () => {
    const d = headData(FILES.bn, 'B0', withSite('https://example.com/wedding'));
    expect(d.og.image).toBe('https://example.com/wedding/og/og-bn-bk.jpg');
    expect(d.canonical).toBe('https://example.com/wedding/bn/bk/');
    expect(d.og.url).toBe(d.canonical);
    expect(d.alternates.map((a) => a.href)).toEqual([
      'https://example.com/wedding/en/bk/',
      'https://example.com/wedding/hi/bk/',
      'https://example.com/wedding/mai/bk/',
      'https://example.com/wedding/bn/bk/',
      'https://example.com/wedding/en/bk/',
    ]);
    expect(headData(FILES.en, 'B1', withSite('https://x.test/')).og.image).toBe('https://x.test/og/og-en-b.jpg');
    expect(headData(FILES.en, 'G0', withSite('https://x.test/')).og.image).toBe('https://x.test/og/og-en-k.jpg');
  });

  it("describes each variant's own preview card with its pair and dateline", () => {
    for (const lang of LANGS) {
      for (const key of KEYS) {
        const v = FILES[lang].variants[key];
        const alt = headData(FILES[lang], key, withSite('https://x.test/')).og.imageAlt;
        expect(alt).toContain(v.pair.text);
        expect(alt).toContain(v.head.ogAlt);
      }
    }
  });
});

describe('headTags / headHtml', () => {
  it('puts the <title> first and marks every managed element with data-head', () => {
    const html = headHtml(headData(FILES.en, 'G1', withSite('https://x.test/')));
    const lines = html.split('\n').map((l) => l.trim());
    expect(lines[0]).toMatch(/^<title>.+<\/title>$/);
    for (const l of lines.slice(1)) expect(l).toMatch(new RegExp(` ${HEAD_ATTR}>$`));
  });

  it('escapes &, quotes and angle brackets', () => {
    expect(escapeHtml(`A & "B" <c>`)).toBe('A &amp; &quot;B&quot; &lt;c&gt;');
    const html = headHtml(headData(FILES.en, 'G1', withSite(null)));
    expect(html).toContain('<title>Akshay &amp; Shreya');
    expect(html).not.toMatch(/content="[^"]*[<>][^"]*"/);
  });

  it('uses a large-image card only when there is an image', () => {
    const card = (site: string | null) =>
      headTags(headData(FILES.en, 'G1', withSite(site))).find((t) => t.attrs.name === 'twitter:card')?.attrs.content;
    expect(card(null)).toBe('summary');
    expect(card('https://x.test/')).toBe('summary_large_image');
    const tags = headTags(headData(FILES.en, 'G1', withSite('https://x.test/')));
    const prop = (p: string) => tags.find((t) => t.attrs.property === p)?.attrs.content;
    expect(prop('og:image:width')).toBe('1200');
    expect(prop('og:image:height')).toBe('630');
    expect(prop('og:type')).toBe('website');
  });

  it('lists the other three languages as og:locale:alternate', () => {
    const alts = headTags(headData(FILES.mai, 'G1', withSite(null)))
      .filter((t) => t.attrs.property === 'og:locale:alternate')
      .map((t) => t.attrs.content);
    expect(alts.sort()).toEqual(['bn_IN', 'en_IN', 'hi_IN']);
  });
});

describe('applyHead', () => {
  it('leaves a pre-rendered head untouched when the data matches (no duplicates, same nodes)', () => {
    const d = headData(FILES.hi, 'G1', withSite('https://x.test/'));
    document.head.innerHTML = headHtml(d);
    document.documentElement.lang = 'hi';
    const before = Array.from(document.head.querySelectorAll(`[${HEAD_ATTR}]`));
    applyHead(d);
    const after = Array.from(document.head.querySelectorAll(`[${HEAD_ATTR}]`));
    expect(after).toHaveLength(before.length);
    after.forEach((el, i) => expect(el).toBe(before[i]));
  });

  it('switches language and variant: lang, title, description, locale; never duplicates a tag', () => {
    document.head.innerHTML = headHtml(headData(FILES.en, 'G1', withSite(null)));
    applyHead(headData(FILES.bn, 'B0', withSite(null)));
    applyHead(headData(FILES.bn, 'B0', withSite(null)));
    expect(document.documentElement.lang).toBe('bn');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.title).toBe(FILES.bn.variants.B0.head.title);
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(metaContent('meta[name="description"]')).toBe(FILES.bn.variants.B0.head.description);
    expect(metaContent('meta[property="og:locale"]')).toBe('bn_IN');
    expect(metaContent('meta[name="robots"]')).toBe('noindex, nofollow');
  });

  it('adds and removes the image, canonical and hreflang tags with the site URL', () => {
    applyHead(headData(FILES.mai, 'G1', withSite('https://x.test/')));
    expect(metaContent('meta[property="og:image"]')).toBe('https://x.test/og/og-mai.jpg');
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://x.test/mai/');
    expect(document.head.querySelectorAll('link[rel="alternate"][hreflang]')).toHaveLength(5);
    applyHead(headData(FILES.mai, 'G1', withSite(null)));
    expect(document.head.querySelector('meta[property="og:image"]')).toBeNull();
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.head.querySelectorAll('link[rel="alternate"]')).toHaveLength(0);
  });

  it('never touches head elements it does not manage', () => {
    document.head.innerHTML =
      '<meta charset="utf-8"><link rel="icon" href="/favicon.svg"><style data-fonts="en"></style>';
    applyHead(headData(FILES.hi, 'G1', withSite(null)));
    expect(document.head.querySelector('meta[charset]')).not.toBeNull();
    expect(document.head.querySelector('link[rel="icon"]')).not.toBeNull();
    expect(document.head.querySelector(`style[${FONTS_ATTR}]`)).not.toBeNull();
  });
});

describe('fonts', () => {
  it('has a font stylesheet for every language', () => {
    for (const lang of LANGS) expect(fontCssLoader(lang)).toBeTypeOf('function');
  });

  it('compacts CSS without changing the declarations', () => {
    const css = `/* c */\n@font-face {\n  font-family: 'Tiro Bangla';\n  src: url('./a.woff2') format('woff2'), local('Bangla MN');\n  unicode-range: U+0020, U+0980-09FE;\n}\n`;
    expect(compactCss(css)).toBe(
      "@font-face{font-family:'Tiro Bangla';src:url('./a.woff2') format('woff2'),local('Bangla MN');unicode-range:U+0020,U+0980-09FE}",
    );
  });

  it('declares exactly the current language: a switch replaces the previous rules', async () => {
    document.documentElement.lang = 'hi';
    await ensureFonts('hi');
    expect(document.head.querySelectorAll(`style[${FONTS_ATTR}]`)).toHaveLength(1);
    expect(document.head.querySelector(`style[${FONTS_ATTR}]`)?.getAttribute(FONTS_ATTR)).toBe('hi');
    document.documentElement.lang = 'bn';
    await ensureFonts('bn');
    const styles = document.head.querySelectorAll(`style[${FONTS_ATTR}]`);
    expect(styles).toHaveLength(1);
    expect(styles[0]?.getAttribute(FONTS_ATTR)).toBe('bn');
  });

  it('keeps the pre-rendered rules when they are already the right language', async () => {
    document.head.innerHTML = `<style ${FONTS_ATTR}="mai">/* prerendered */</style>`;
    const el = document.head.querySelector('style');
    document.documentElement.lang = 'mai';
    await ensureFonts('mai');
    expect(document.head.querySelector('style')).toBe(el);
  });

  it('drops a stale load: rules for a language the page has already left are not inserted', async () => {
    document.documentElement.lang = 'hi';
    const p = ensureFonts('hi');
    document.documentElement.lang = 'en';
    await p;
    expect(document.head.querySelector(`style[${FONTS_ATTR}="hi"]`)).toBeNull();
  });
});
