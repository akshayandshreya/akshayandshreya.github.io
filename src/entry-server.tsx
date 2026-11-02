// Prerender entry (spec 6.2, 6.6, 7.1): render(lang, key) -> one variant's page of a language with StaticRouter, plus its head:
// title/meta/og (lib/head.ts), the language's @font-face rules inline and preloads for its two first-screen faces.
// scripts/prerender.mjs assembles dist/<lang>/index.html from it (CSP, critical CSS, LCP and chunk preloads).
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { App } from './App';
import { ROUTER_FUTURE, config, routerBasename } from './config';
import { loadLang } from './i18n';
import { FONTS_ATTR, compactCss, fontCssLoader, headData, headHtml } from './lib/head';
import type { Lang, VariantKey } from './i18n/types';
import { VARIANT_SLUGS, variantPath } from './lib/langs';
import coverage from './assets/fonts/font-coverage.json';

// the font CSS comes through the same lazy loader the client uses (lib/head.ts: its url()s hashed by Vite, identical to
// the client build's file names, both being content hashes); the font files' URLs are eager here, in the SSR bundle only
const FONT_FILES = import.meta.glob<string>('./assets/fonts/files/*.woff2', {
  query: '?url',
  import: 'default',
  eager: true,
});

interface Coverage {
  languages: Record<string, { preload: string[] }>;
}

export interface PageParts {
  /** The app markup for #root. */
  html: string;
  /** Title, meta, og, canonical/hreflang (managed tags, data-head). */
  head: string;
  /** <link rel=preload> for the first-screen fonts. */
  preloads: string;
  /** <style data-fonts> with the language's @font-face rules. */
  fonts: string;
  htmlLang: string;
  fontUrls: string[];
  /** Web app manifest name / short_name (the G1 title and pair). */
  manifest: { name: string; shortName: string };
}

export async function fontParts(lang: Lang): Promise<{ css: string; preload: string[] }> {
  const load = fontCssLoader(lang);
  if (!load) throw new Error(`entry-server: no src/assets/fonts/fonts.${lang}.css (run assets:fonts)`);
  const css = compactCss(await load());
  const rel = (coverage as Coverage).languages[lang]?.preload ?? [];
  const preload = rel.map((r) => {
    const url = FONT_FILES[`./assets/fonts/${r}`];
    if (!url) throw new Error(`entry-server: preload font ${r} of ${lang} is not in src/assets/fonts`);
    return url;
  });
  return { css, preload };
}

/** One page per language and variant (spec 2.1, 6.2; QA r1 T1): /{lang}/ is G1, /{lang}/b/, /k/, /bk/ the others. */
export async function render(lang: Lang, key: VariantKey = 'G1'): Promise<PageParts> {
  const file = await loadLang(lang);
  const base = routerBasename() ?? '';
  const html = renderToString(
    <StrictMode>
      <StaticRouter location={`${base}${variantPath(lang, key)}`} basename={routerBasename()} future={ROUTER_FUTURE}>
        <App />
      </StaticRouter>
    </StrictMode>,
  );
  const { css, preload } = await fontParts(lang);
  return {
    html,
    head: headHtml(headData(file, key, config)),
    preloads: preload
      .map((href) => `<link rel="preload" as="font" type="font/woff2" href="${href}" crossorigin>`)
      .join('\n    '),
    fonts: `<style ${FONTS_ATTR}="${lang}">${css}</style>`,
    htmlLang: lang,
    fontUrls: preload,
    manifest: { name: file.variants.G1.head.title, shortName: file.variants.G1.pair.text },
  };
}

export const LANGS_TO_PRERENDER: Lang[] = ['en', 'hi', 'mai', 'bn'];
/** The variants with their own page, and the folder each is written to ('' = the language's own folder). */
export const VARIANTS_TO_PRERENDER: { key: VariantKey; slug: string }[] = (['G1', 'B1', 'G0', 'B0'] as const).map(
  (key) => ({ key, slug: VARIANT_SLUGS[key] }),
);
