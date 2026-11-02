// scripts/prerender.mjs helpers (spec 6.2, 6.3, 6.6, 9.5): page assembly, LCP preloads, critical CSS, shells,
// manifests, headers, redirects and the link-integrity scan.
import { describe, expect, it } from 'vitest';
import {
  assemblePage,
  attrsOf,
  complementMedia,
  csp,
  exclusiveMedia,
  fileForUrl,
  headersFile,
  inlineEntryCss,
  langChunkPreload,
  lcpPreloads,
  normalizeBase,
  openingMarkup,
  referencedUrls,
  rewriteRedirects,
  shellPage,
  webmanifest,
} from '../../scripts/prerender.mjs';

// a tiny evaluator for the aspect-ratio-only media queries the plates use: "(min-aspect-ratio: a/b) and (...)"
function matches(media: string | undefined, ratio: number): boolean {
  if (!media) return true;
  return media.split(/\s+and\s+/).every((q) => {
    const m = /\((min|max)-aspect-ratio:\s*(\d+)\/(\d+)\)/.exec(q);
    if (!m) throw new Error(`cannot evaluate ${q}`);
    const r = Number(m[2]) / Number(m[3]);
    return m[1] === 'min' ? ratio >= r : ratio <= r;
  });
}

// what <Plate eager> renders: three frame shapes x AVIF/WebP, React's camelCase srcSet, an eager <img>
const PLATE = `<section id="opening" data-plate="opening" class="plate-section"><div class="plate" aria-hidden="true"><picture>
<source type="image/avif" media="(max-aspect-ratio: 3/5)" srcSet="/assets/tall-540-a.avif 540w, /assets/tall-1170-b.avif 1170w" sizes="100vw"/>
<source type="image/webp" media="(max-aspect-ratio: 3/5)" srcSet="/assets/tall-540-a.webp 540w" sizes="100vw"/>
<source type="image/avif" media="(max-aspect-ratio: 5/4)" srcSet="/assets/mid-768-c.avif 768w" sizes="100vw"/>
<source type="image/avif" srcSet="/assets/wide-1920-d.avif 1920w" sizes="(max-aspect-ratio: 16/9) 177.78lvh, 100vw"/>
<img src="/assets/wide-1920-d.webp" alt="" loading="eager" fetchpriority="high"/></picture></div><header><h1>Shubh Vivah</h1></header></section>
<section id="invitation"><picture><source type="image/avif" srcSet="/assets/inv.avif 1170w"/><img src="/assets/inv.webp" loading="lazy" alt=""/></picture></section>`;

describe('media queries for preloads', () => {
  it('complements aspect-ratio bounds exactly and anything else with level-4 not', () => {
    expect(complementMedia('(max-aspect-ratio: 3/5)')).toBe('(min-aspect-ratio: 3001/5000)');
    expect(complementMedia('(min-aspect-ratio: 5/4)')).toBe('(max-aspect-ratio: 4999/4000)');
    expect(complementMedia('(min-width: 600px)')).toBe('(not (min-width: 600px))');
  });

  it('makes the frame sources mutually exclusive: exactly one preload matches any viewport', () => {
    const media: (string | undefined)[] = exclusiveMedia([
      '(max-aspect-ratio: 3/5)',
      '(max-aspect-ratio: 5/4)',
      undefined,
    ]);
    for (let r = 0.3; r <= 3.5; r += 0.0137) {
      const hits = media.filter((m) => matches(m, r)).length;
      expect(hits, `aspect ${r.toFixed(3)}`).toBe(1);
    }
    // and the one that matches is the one the <picture> would pick
    expect(matches(media[0], 390 / 844)).toBe(true);
    expect(matches(media[1], 768 / 1024)).toBe(true);
    expect(matches(media[2], 1440 / 900)).toBe(true);
  });
});

describe('lcpPreloads', () => {
  it('finds only the opening section', () => {
    expect(openingMarkup(PLATE)).toContain('Shubh Vivah');
    expect(openingMarkup(PLATE)).not.toContain('inv.avif');
  });

  it('preloads one AVIF per frame shape with exclusive media, its srcset and sizes, at high priority', () => {
    const { tags, warnings } = lcpPreloads(PLATE);
    expect(warnings).toEqual([]);
    expect(tags).toHaveLength(3);
    for (const t of tags) {
      expect(t).toMatch(/^<link rel="preload" as="image" fetchpriority="high" type="image\/avif"/);
      expect(t).not.toContain('.webp');
    }
    expect(tags[0]).toContain('media="(max-aspect-ratio: 3/5)"');
    expect(tags[0]).toContain('imagesrcset="/assets/tall-540-a.avif 540w, /assets/tall-1170-b.avif 1170w"');
    expect(tags[1]).toContain('media="(min-aspect-ratio: 3001/5000) and (max-aspect-ratio: 5/4)"');
    expect(tags[2]).toContain('imagesizes="(max-aspect-ratio: 16/9) 177.78lvh, 100vw"');
  });

  it('warns when the opening plate is lazy and when there is no plate', () => {
    expect(lcpPreloads(PLATE.replace('loading="eager"', 'loading="lazy"')).warnings[0]).toMatch(/lazy/);
    const none = lcpPreloads('<section id="opening"><h1>x</h1></section>');
    expect(none.tags).toEqual([]);
    expect(none.warnings[0]).toMatch(/LCP preload skipped/);
  });

  it('reads attributes case-insensitively and decodes &amp;', () => {
    expect(attrsOf('<source srcSet="/a.avif?x=1&amp;y=2 1x" type="image/avif">')).toEqual({
      srcset: '/a.avif?x=1&y=2 1x',
      type: 'image/avif',
    });
  });
});

describe('page assembly', () => {
  const template =
    '<html lang="en" dir="ltr"><head><meta charset="utf-8" /><!--head--><link rel="stylesheet" crossorigin href="/assets/index-x.css"></head><body><div id="root"><!--app-html--></div></body></html>';
  const parts = {
    html: '<p>$& $1 price</p>',
    head: '<title>T</title>',
    preloads: '<link rel="preload" as="font">',
    fonts: '<style data-fonts="bn">@font-face{}</style>',
    htmlLang: 'bn',
  };

  it('fills the placeholders literally ($ patterns stay), sets the language and marks the prerender', () => {
    const page = assemblePage(template, parts, {
      base: '/',
      preloads: ['<link rel="modulepreload" href="/assets/bn.js">'],
    });
    expect(page).toContain('<html lang="bn"');
    expect(page).toContain('<div id="root" data-prerendered="bn" data-variant="G1"><p>$& $1 price</p></div>');
    const b0 = assemblePage(template, parts, { base: '/', variant: 'B0', preloads: [] });
    expect(b0).toContain('data-prerendered="bn" data-variant="B0"');
    expect(page.indexOf('Content-Security-Policy')).toBeLessThan(page.indexOf('<title>'));
    expect(page).toContain('<link rel="manifest" href="/bn/site.webmanifest">');
    expect(page.indexOf('modulepreload')).toBeLessThan(page.indexOf('data-fonts'));
  });

  it('inlines a small entry stylesheet and keeps a large or relative one linked', () => {
    const page = assemblePage(template, parts, { base: '/', preloads: [] });
    const small = inlineEntryCss(page, () => Buffer.from('body{color:#5c3f17;background:url(/assets/p.webp)}'), '/');
    expect(small.inlined).toBe(true);
    expect(small.page).toContain('<style data-entry-css>body{color:#5c3f17');
    expect(small.page).not.toContain('index-x.css');
    const relative = inlineEntryCss(page, () => Buffer.from('a{background:url(./p.webp)}'), '/');
    expect(relative.inlined).toBe(false);
    const big = inlineEntryCss(page, () => Buffer.from('a{}'), '/', 1);
    expect(big.inlined).toBe(false);
    expect(big.page).toContain('index-x.css');
  });

  it('modulepreloads the language chunk from the Vite manifest', () => {
    const manifest = { 'src/i18n/hi.json': { file: 'assets/hi-abc.js' } };
    expect(langChunkPreload(manifest, 'hi', '/wed/')).toBe(
      '<link rel="modulepreload" crossorigin href="/wed/assets/hi-abc.js">',
    );
    expect(langChunkPreload(manifest, 'bn', '/')).toBe('');
  });
});

describe('security and hosting files', () => {
  it('keeps the CSP strict: no inline script, frame-ancestors only in the header', () => {
    expect(csp()).toContain("script-src 'self'");
    expect(csp()).not.toContain('unsafe-eval');
    expect(csp()).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp()).not.toContain('frame-ancestors');
    expect(csp({ header: true })).toContain("frame-ancestors 'none'");
  });

  it('writes _headers with the security headers, noindex while not indexable, immutable hashed assets', () => {
    const h = headersFile({ base: '/wed/', indexable: false, langs: ['en', 'hi'] });
    expect(h).toContain('/wed/*\n  Content-Security-Policy:');
    expect(h).toContain('X-Robots-Tag: noindex, nofollow');
    expect(h).toContain('X-Content-Type-Options: nosniff');
    expect(h).toContain('/wed/hi/*\n  Cache-Control: no-cache');
    expect(h).toContain('/wed/assets/*\n  Cache-Control: public, max-age=31536000, immutable');
    expect(headersFile({ base: '/', indexable: true, langs: ['en'] })).not.toContain('X-Robots-Tag');
  });

  it('prefixes _redirects with the base', () => {
    expect(rewriteRedirects('# c\n/english   /en/   301\n/*  /en/  302', '/wed/')).toBe(
      '# c\n/wed/english   /wed/en/   301\n/wed/*   /wed/en/  302',
    );
    expect(rewriteRedirects('/english /en/ 301', '/')).toBe('/english /en/ 301');
    expect(normalizeBase('wed')).toBe('/wed/');
  });

  it('writes a valid web manifest per language that starts on that language', () => {
    const m = JSON.parse(
      webmanifest({ base: '/wed/', lang: 'bn', name: 'অক্ষয় ও শ্রেয়া · শুভ বিবাহ', shortName: 'অক্ষয় ও শ্রেয়া' }),
    );
    expect(m.start_url).toBe('/wed/bn/');
    expect(m.scope).toBe('/wed/');
    expect(m.lang).toBe('bn');
    expect(m.icons.map((i: { src: string }) => i.src)).toEqual([
      '/wed/favicon.svg',
      '/wed/apple-touch-icon.png',
      '/wed/icon-512.png',
    ]);
  });
});

describe('root and 404 shells', () => {
  const head =
    '<title>Akshay &amp; Shreya</title>\n    <meta property="og:title" content="Akshay &amp; Shreya" data-head>';
  it('carry the preview tags, load redirect.js as a file and link every language without JS', () => {
    const root = shellPage({ mode: 'root', base: '/', langs: ['en', 'hi', 'mai', 'bn'], head });
    expect(root).toContain('og:title');
    expect(root).toContain('<script src="/redirect.js" data-base="/" data-mode="root"></script>');
    expect(root).toContain('<noscript><meta http-equiv="refresh" content="0; url=/en/"></noscript>');
    for (const [l, name] of [
      ['en', 'English'],
      ['hi', 'हिन्दी'],
      ['mai', 'मैथिली'],
      ['bn', 'বাংলা'],
    ])
      expect(root).toContain(`<a href="/${l}/" hreflang="${l}" lang="${l}">${name}</a>`);
    expect(root).toMatch(/min-height:44px/);
    const notFound = shellPage({ mode: '404', base: '/', langs: ['en'], head });
    expect(notFound).toContain('data-mode="404"');
    expect(notFound).not.toContain('<noscript>');
  });
});

describe('link integrity scan', () => {
  it('collects same-origin href, src, srcset, imagesrcset and url() targets', () => {
    const page = `<link rel="preload" imagesrcset="/assets/a.avif 1x, /assets/b.avif 2x"><a href="/hi/?side=bride#haldi">x</a>
<a href="https://www.google.com/maps/search/?api=1">m</a><a href="#opening">o</a><img srcset="/assets/c.webp 540w">
<style>@font-face{src:url(/assets/f.woff2) format('woff2')}</style><script src="/assets/i.js"></script>`;
    expect(referencedUrls(page, '/').sort()).toEqual([
      '/assets/a.avif',
      '/assets/b.avif',
      '/assets/c.webp',
      '/assets/f.woff2',
      '/assets/i.js',
      '/hi/',
    ]);
  });

  it('maps URLs to dist files', () => {
    expect(fileForUrl('/hi/', '/')).toBe('hi/index.html');
    expect(fileForUrl('/wed/', '/wed/')).toBe('index.html');
    expect(fileForUrl('/wed/assets/a%20b.js', '/wed/')).toBe('assets/a b.js');
  });
});
