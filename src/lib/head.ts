// The document head per language and variant (spec 6.2) and the per-language fonts (spec 6.5, 6.6).
// headData() is shared: the prerender serialises it into dist/<lang>/[<slug>/]index.html per variant (headHtml), and <HeadManager>
// applies the same tag list on the client for every language/variant change (applyHead), so the two never drift.
import type { Lang, LangFile, VariantKey } from '../i18n/types';
import type { SiteConfig } from '../config';
import { LANGS, VARIANT_SLUGS, variantPath } from './langs';

export interface HeadData {
  lang: Lang;
  title: string;
  description: string;
  robots: string | null;
  themeColor: string;
  og: {
    title: string;
    description: string;
    locale: string | null;
    imageAlt: string;
    image: string | null;
    url: string | null;
  };
  canonical: string | null;
  alternates: { hreflang: string; href: string }[];
}

/** One managed head element. Every element the site manages carries `data-head` (headHtml writes it). */
export interface HeadTag {
  tag: 'meta' | 'link';
  attrs: Record<string, string>;
}

export const THEME_COLOR = '#f2e8d8';
export const OG_IMAGE = { width: 1200, height: 630 } as const;
/** Marker attribute of the managed head elements (and of the per-language font style). */
export const HEAD_ATTR = 'data-head';
export const FONTS_ATTR = 'data-fonts';

function abs(siteUrl: string, path: string): string {
  return siteUrl.replace(/\/*$/, '/') + path.replace(/^\/+/, '');
}

/** The preview image of a language and variant (tools/og: og-<lang>.jpg for the default, og-<lang>-<slug>.jpg for the
 *  variant pages /b/, /k/, /bk/: their names in order, their dates and cities, QA r1 T1). */
export function ogImagePath(lang: Lang, key: VariantKey): string {
  const slug = VARIANT_SLUGS[key];
  return slug ? `og/og-${lang}-${slug}.jpg` : `og/og-${lang}.jpg`;
}

export function headData(file: LangFile, key: VariantKey, config: SiteConfig): HeadData {
  const copy = file.variants[key];
  const site = config.siteUrl;
  // every variant has its own page (/{lang}/b/ ...) and preview card, so the head describes this variant throughout
  const url = site ? abs(site, variantPath(file.lang, key)) : null;
  return {
    lang: file.lang,
    title: copy.head.title,
    description: copy.head.description,
    robots: config.seo.indexable ? null : 'noindex, nofollow',
    themeColor: THEME_COLOR,
    og: {
      title: copy.head.title,
      description: copy.head.description,
      locale: file.meta.ogLocale,
      imageAlt: copy.head.ogAlt.includes(copy.pair.text) ? copy.head.ogAlt : `${copy.pair.text} · ${copy.head.ogAlt}`,
      // produced by the asset pipeline (spec 6.5, tools/og); og:image must be absolute (O10)
      image: site ? abs(site, ogImagePath(file.lang, key)) : null,
      url,
    },
    canonical: url,
    alternates: site
      ? [
          ...LANGS.map((l) => ({ hreflang: l, href: abs(site, variantPath(l, key)) })),
          { hreflang: 'x-default', href: abs(site, variantPath('en', key)) },
        ]
      : [],
  };
}

const meta = (attr: 'name' | 'property', key: string, content: string): HeadTag => ({
  tag: 'meta',
  attrs: { [attr]: key, content },
});

/** The managed head elements, in document order (after <title>). */
export function headTags(d: HeadData): HeadTag[] {
  const tags: HeadTag[] = [meta('name', 'description', d.description)];
  if (d.robots) tags.push(meta('name', 'robots', d.robots));
  tags.push(
    meta('name', 'theme-color', d.themeColor),
    meta('property', 'og:type', 'website'),
    meta('property', 'og:title', d.og.title),
    meta('property', 'og:description', d.og.description),
  );
  if (d.og.locale) {
    tags.push(meta('property', 'og:locale', d.og.locale));
    // the other languages' locales, so a preview fetcher knows the alternatives
    for (const l of LANGS) {
      if (OG_LOCALES[l] !== d.og.locale) tags.push(meta('property', 'og:locale:alternate', OG_LOCALES[l]));
    }
  }
  if (d.og.url) tags.push(meta('property', 'og:url', d.og.url));
  if (d.og.image) {
    tags.push(
      meta('property', 'og:image', d.og.image),
      meta('property', 'og:image:type', 'image/jpeg'),
      meta('property', 'og:image:width', String(OG_IMAGE.width)),
      meta('property', 'og:image:height', String(OG_IMAGE.height)),
      meta('property', 'og:image:alt', d.og.imageAlt),
      meta('name', 'twitter:card', 'summary_large_image'),
      meta('name', 'twitter:image:alt', d.og.imageAlt),
    );
  } else {
    tags.push(meta('name', 'twitter:card', 'summary'));
  }
  if (d.canonical) tags.push({ tag: 'link', attrs: { rel: 'canonical', href: d.canonical } });
  for (const a of d.alternates)
    tags.push({ tag: 'link', attrs: { rel: 'alternate', hreflang: a.hreflang, href: a.href } });
  return tags;
}

/** og:locale per language (content meta.ogLocale; mai_IN is not in Facebook's list but is the correct tag, spec 6.2). */
export const OG_LOCALES: Record<Lang, string> = { en: 'en_IN', hi: 'hi_IN', mai: 'mai_IN', bn: 'bn_IN' };

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Head tags as HTML (prerender). The <title> comes first; every managed element is marked with data-head. */
export function headHtml(d: HeadData): string {
  const lines = [`<title>${escapeHtml(d.title)}</title>`];
  for (const t of headTags(d)) {
    const attrs = Object.entries(t.attrs)
      .map(([k, v]) => `${k}="${escapeHtml(v)}"`)
      .join(' ');
    lines.push(`<${t.tag} ${attrs} ${HEAD_ATTR}>`);
  }
  return lines.join('\n    ');
}

const tagKey = (t: HeadTag) =>
  `${t.tag}|${Object.entries(t.attrs)
    .sort()
    .map(([k, v]) => `${k}=${v}`)
    .join('|')}`;

/**
 * Apply head data on the client (language or variant change; the pre-rendered head is already right for G1).
 * Managed elements that are unchanged stay in place; stale ones are removed and new ones appended, so repeated calls
 * never duplicate a tag.
 */
export function applyHead(d: HeadData, doc: Document = document): void {
  doc.documentElement.lang = d.lang;
  doc.documentElement.dir = 'ltr';
  if (doc.title !== d.title) doc.title = d.title;
  const wanted = new Map(headTags(d).map((t) => [tagKey(t), t]));
  for (const el of Array.from(doc.head.querySelectorAll<HTMLElement>(`[${HEAD_ATTR}]`))) {
    const t: HeadTag = {
      tag: el.tagName.toLowerCase() as HeadTag['tag'],
      attrs: Object.fromEntries(
        Array.from(el.attributes)
          .filter((a) => a.name !== HEAD_ATTR)
          .map((a) => [a.name, a.value]),
      ),
    };
    const k = tagKey(t);
    if (wanted.has(k)) wanted.delete(k);
    else el.remove();
  }
  for (const t of wanted.values()) {
    const el = doc.createElement(t.tag);
    for (const [k, v] of Object.entries(t.attrs)) el.setAttribute(k, v);
    el.setAttribute(HEAD_ATTR, '');
    doc.head.appendChild(el);
  }
}

// ---- fonts (spec 6.5, 6.6) ---------------------------------------------------------------------------------------
// src/assets/fonts/fonts.<lang>.css (generated by scripts/subset-fonts.mjs) holds the language's @font-face rules with
// exact unicode-ranges. The prerender inlines the page language's rules in a <style data-fonts="<lang>">; on a client
// language switch the new rules arrive as a small lazy chunk (CSS text, its url()s hashed by Vite) and replace the old
// ones, so a page never declares another script's faces (the endonyms in the language switch would otherwise pull
// 30-55 KB script fonts for two words).
const FONT_CSS = import.meta.glob<string>('../assets/fonts/fonts.*.css', { query: '?inline', import: 'default' });

export function fontCssLoader(lang: Lang): (() => Promise<string>) | undefined {
  return FONT_CSS[`../assets/fonts/fonts.${lang}.css`];
}

/** Comments out, whitespace collapsed (the generated font CSS is pretty-printed; `?inline` CSS is not minified). */
export function compactCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};:,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

const fontLoads = new Map<Lang, Promise<void>>();

/** Make the document declare exactly `lang`'s faces. Resolves once the rules are in the document (not the files). */
export function ensureFonts(lang: Lang, doc: Document = document): Promise<void> {
  const present = doc.head.querySelector<HTMLStyleElement>(`style[${FONTS_ATTR}]`);
  if (present?.getAttribute(FONTS_ATTR) === lang) return Promise.resolve();
  let p = fontLoads.get(lang);
  if (!p) {
    const load = fontCssLoader(lang);
    p = (load ? load() : Promise.resolve('')).then(
      (css) => {
        fontLoads.delete(lang);
        // a later switch may have won the race: only the current language's rules go in
        if (doc.documentElement.lang !== lang) return;
        const el = doc.createElement('style');
        el.setAttribute(FONTS_ATTR, lang);
        el.textContent = compactCss(css);
        for (const old of Array.from(doc.head.querySelectorAll(`style[${FONTS_ATTR}]`))) old.remove();
        doc.head.appendChild(el);
      },
      (err: unknown) => {
        fontLoads.delete(lang);
        console.error(`fonts for ${lang} failed to load`, err);
      },
    );
    fontLoads.set(lang, p);
  }
  return p;
}
