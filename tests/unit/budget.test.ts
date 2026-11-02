// scripts/check-budget.mjs helpers (spec 6.5, 6.7): font accounting, coverage, head checks, image picks.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkHead,
  facesForText,
  inRanges,
  inlineScripts,
  jpegSize,
  loadText,
  manifestFiles,
  openingImages,
  pageText,
  parseFontFaces,
  parseUnicodeRange,
  pickCandidate,
  preloadedImages,
  renderedText,
  uncovered,
  withoutHidden,
} from '../../scripts/check-budget.mjs';

const CSS = `@font-face{font-family:'Amita';font-weight:400;src:url('/assets/amita.woff2') format('woff2');unicode-range:U+0020,U+0900-097F}
@font-face{font-family:'Sahitya';font-weight:700;src:url(/assets/sahitya-latin.woff2) format('woff2');unicode-range:U+0041-005A,U+0061-007A}
@font-face{font-family:'Amita Fallback';src:local('Kohinoor Devanagari');ascent-override:90%}`;

describe('fonts', () => {
  it('parses unicode-range lists, including wildcards', () => {
    expect(parseUnicodeRange('U+0020, U+0900-097F,U+4??')).toEqual([
      [0x20, 0x20],
      [0x900, 0x97f],
      [0x400, 0x4ff],
    ]);
    expect(inRanges(0x915, parseUnicodeRange('U+0900-097F'))).toBe(true);
  });

  it('reads the web faces and skips local() fallbacks', () => {
    const faces = parseFontFaces(CSS);
    expect(faces.map((f: { family: string; url: string }) => [f.family, f.url])).toEqual([
      ['Amita', '/assets/amita.woff2'],
      ['Sahitya', '/assets/sahitya-latin.woff2'],
    ]);
  });

  it('counts a face only when the page has a character in its range (spaces alone never load a face)', () => {
    const faces = parseFontFaces(CSS);
    expect(facesForText(faces, 'शुभ विवाह').map((f: { family: string }) => f.family)).toEqual(['Amita']);
    expect(facesForText(faces, 'शुभ विवाह · AS').map((f: { family: string }) => f.family)).toEqual([
      'Amita',
      'Sahitya',
    ]);
    expect(facesForText(faces, '   ')).toEqual([]);
  });

  it('reports characters the language faces miss', () => {
    expect(uncovered('কলকাতা · Kolkata⁠', parseUnicodeRange('U+0020-007E, U+0980-09FE'))).toEqual(['·']);
  });
});

describe('page text', () => {
  it('drops the head, scripts, styles and svg, decodes entities and keeps aria-label/alt text', () => {
    const html = `<html><head><title>X</title><style>a{}</style></head><body><svg><text>ignored</text></svg>
<p>Akshay &amp; Shreya&nbsp;&#x0995;</p><a aria-label="हिन्दी" href="/hi/"></a><script>var a</script></body></html>`;
    const t = pageText(html);
    expect(t).toContain('Akshay & Shreya');
    expect(t).toContain('ক');
    expect(t).toContain('हिन्दी');
    expect(t).not.toMatch(/ignored|var a|a\{\}|<title>/);
  });

  it('rendered text has no attribute text (no font draws an aria-label)', () => {
    const t = renderedText('<head><title>X</title></head><body><p aria-label="हिन्दी">a &amp; b</p></body>');
    expect(t).toContain('a & b');
    expect(t).not.toContain('हिन्दी');
  });

  it('load text leaves out hidden subtrees (a closed menu loads no font), nested tags included', () => {
    const html =
      '<body><p>शुभ</p><div hidden=""><div><span>Apple · Outlook</span></div>x</div><ul hidden><li>Z</li></ul>' +
      '<i data-hidden-ish="1">म</i></body>';
    expect(withoutHidden(html)).toBe('<body><p>शुभ</p><i data-hidden-ish="1">म</i></body>');
    expect(loadText(html)).not.toMatch(/Apple|Z|x/);
    expect(loadText(html)).toContain('म');
    // the Sahitya Latin face is not counted for a page whose only Latin text sits in the closed menu
    const faces = parseFontFaces(CSS);
    expect(facesForText(faces, loadText(html)).map((f: { family: string }) => f.family)).toEqual(['Amita']);
  });
});

describe('head checks', () => {
  const good = `<html lang="hi" dir="ltr"><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'">
<title>अक्षय & श्रेया</title><meta name="description" content="शुभ विवाह" data-head><meta name="robots" content="noindex, nofollow" data-head>
<meta name="theme-color" content="#f2e8d8" data-head><meta property="og:title" content="t" data-head><meta property="og:description" content="d" data-head>
<meta property="og:locale" content="hi_IN" data-head><style data-fonts="hi">@font-face{}</style><link rel="manifest" href="/hi/site.webmanifest"></head></html>`;

  it('accepts a complete page', () => {
    expect(checkHead(good, 'hi')).toEqual([]);
  });

  it('flags a wrong language, a missing robots tag and og:image rules', () => {
    expect(checkHead(good, 'bn').join('\n')).toMatch(/<html lang="bn">/);
    expect(checkHead(good.replace(/<meta name="robots"[^>]*>/, ''), 'hi')).toEqual([
      'hi: robots is "(none)", expected "noindex, nofollow"',
    ]);
    expect(checkHead(good, 'hi', { siteUrl: 'https://x.test/' })[0]).toMatch(/og:image missing/);
    const withImage = good.replace(
      '</head>',
      '<meta property="og:image" content="https://x.test/og/og-hi.jpg"></head>',
    );
    expect(checkHead(withImage, 'hi', { siteUrl: 'https://x.test/' })).toEqual([]);
    expect(checkHead(withImage, 'hi')[0]).toMatch(/without VITE_SITE_URL/);
  });

  it('counts inline scripts (blocked by the CSP) but not module or classic scripts with src', () => {
    expect(inlineScripts('<script src="/r.js"></script><script type="module" crossorigin src="/a.js"></script>')).toBe(
      0,
    );
    expect(inlineScripts('<script>alert(1)</script><script type="application/ld+json">{}</script>')).toBe(2);
  });
});

describe('first-load estimate', () => {
  it('takes the srcset candidate a 390 px @3x phone uses', () => {
    expect(pickCandidate('/a-540.avif 540w, /a-828.avif 828w, /a-1170.avif 1170w')).toBe('/a-1170.avif');
    expect(pickCandidate('/a-540.avif 540w, /a-828.avif 828w')).toBe('/a-828.avif');
    expect(pickCandidate('/a.avif 1x, /b.avif 3x')).toBe('/b.avif');
  });

  it('counts the tall-frame plate the head preloads (the image a phone fetches first)', () => {
    const head = `<link rel="preload" as="image" fetchpriority="high" type="image/avif" media="(max-aspect-ratio: 3/5)" imagesrcset="/assets/t-540.avif 540w, /assets/t-1170.avif 1170w">
<link rel="preload" as="image" type="image/avif" imagesrcset="/assets/w-1920.avif 1920w">`;
    expect(preloadedImages(head)).toEqual(['/assets/t-1170.avif']);
    expect(preloadedImages('<link rel="preload" as="font" href="/a.woff2">')).toEqual([]);
  });

  it('counts the eager images of the opening only', () => {
    const html = `<section id="opening"><picture><source type="image/avif" srcSet="/assets/t-828.avif 828w, /assets/t-1170.avif 1170w"/>
<img src="/assets/w.webp" loading="eager"/></picture><img src="/assets/ganesh.webp" alt=""/><img src="/assets/lazy.webp" loading="lazy"/></section>
<section id="invitation"><img src="/assets/inv.avif"/></section>`;
    expect(openingImages(html)).toEqual(['/assets/t-1170.avif', '/assets/ganesh.webp']);
  });
});

describe('assets', () => {
  it('lists the files a manifest names, not source references', () => {
    expect(
      manifestFiles({
        a: { file: 'plates/opening/tall-828.avif', source: 'couples_original/x.png' },
        b: ['sprites/couple/haldi-480h.webp'],
      }),
    ).toEqual(['plates/opening/tall-828.avif', 'sprites/couple/haldi-480h.webp']);
  });

  it('reads the size of the committed preview images (1200 x 630)', () => {
    for (const lang of ['en', 'hi', 'mai', 'bn']) {
      expect(jpegSize(readFileSync(resolve(process.cwd(), `public/og/og-${lang}.jpg`)))).toEqual({
        width: 1200,
        height: 630,
      });
    }
  });
});
