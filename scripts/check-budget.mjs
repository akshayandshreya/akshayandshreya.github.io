#!/usr/bin/env node
// Spec 6.5 / 6.7 build gate, run last by `npm run build`. Fails the build on:
//   * initial JS (entry + its static imports + the largest language chunk) > 250 KB gzip, initial CSS > 40 KB gzip
//   * initial fonts of a language (faces whose unicode-range meets the text the page sets in type at load, i.e. not
//     attribute text and not inside a `hidden` subtree such as the closed calendar menu) > 220 KB
//   * a character of src/i18n/<lang>.json that the language's fonts do not cover ("run assets:fonts"), or a character
//     of a page's rendered text (other scripts' endonyms, the Cultures "বাংলা", hard-coded words) that none of the
//     page's own @font-face rules cover: it would be set in the visitor's system font
//   * a file named by src/assets/{plates,sprites}.json (and glyphs/motifs manifests) that does not exist
//   * a page without its <html lang>, title, description, og tags, CSP meta or font rules; robots not "noindex,
//     nofollow" while not indexable; og:image present without VITE_SITE_URL or absent with it
//   * any inline <script> in dist/*.html (the CSP allows script-src 'self' only)
//   * an OG image that is missing, not 1200x630 JPEG or > 250 KB
//   * the static first-load estimate on a phone (HTML + CSS + JS + fonts + the opening's eager images at 1170 w)
//     > 1.5 MB. The measured HAR / Lighthouse numbers come from tools/shots/perf.mjs (QA), not from here.
// Targets (130 KB JS, 25 KB CSS, 160 KB fonts, 700 KB first load) are reported, not enforced.
// The helpers are exported for tests/unit/budget.test.ts; main() runs only when this file is executed.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { resolveSiteUrl } from './lib/site-url.mjs';

export const LIMITS = { js: 250 * 1024, css: 40 * 1024, fonts: 220 * 1024, firstLoad: 1536 * 1024, og: 250 * 1024 };
export const TARGETS = { js: 130 * 1024, css: 25 * 1024, fonts: 160 * 1024, firstLoad: 700 * 1024 };
export const LANGS = ['en', 'hi', 'mai', 'bn'];
const OG_LOCALE = { en: 'en_IN', hi: 'hi_IN', mai: 'mai_IN', bn: 'bn_IN' };

export const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const gz = (buf) => gzipSync(buf, { level: 9 }).length;

/** "U+0020, U+0900-097F" -> [[0x20, 0x20], [0x900, 0x97f]] */
export function parseUnicodeRange(s) {
  return s
    .split(',')
    .map((p) => p.trim().replace(/^U\+/i, ''))
    .filter(Boolean)
    .map((p) => {
      if (p.includes('?')) return [parseInt(p.replace(/\?/g, '0'), 16), parseInt(p.replace(/\?/g, 'F'), 16)];
      const [a, b] = p.split('-');
      return [parseInt(a, 16), parseInt(b ?? a, 16)];
    });
}

export const inRanges = (cp, ranges) => ranges.some(([a, b]) => cp >= a && cp <= b);

/** @font-face blocks of a stylesheet: { family, weight, style, url, ranges } */
export function parseFontFaces(css) {
  const out = [];
  for (const m of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    const body = m[1];
    const get = (prop) => new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body)?.[1]?.trim();
    const url = /url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(get('src') ?? '')?.[1];
    if (!url) continue; // local() fallback faces
    out.push({
      family: (get('font-family') ?? '').replace(/['"]/g, ''),
      weight: get('font-weight') ?? '400',
      style: get('font-style') ?? 'normal',
      url,
      ranges: parseUnicodeRange(get('unicode-range') ?? 'U+0-10FFFF'),
    });
  }
  return out;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) =>
  s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (_, e) => {
    if (e[0] === '#')
      return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? `&${e};`;
  });
const bodyOf = (html) =>
  html.replace(/<head[\s\S]*?<\/head>/i, '').replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ');

/** The visible text of a page (scripts, styles and tags dropped, entities decoded), plus attribute text people read. */
export function pageText(html) {
  const body = bodyOf(html);
  const attrs = [...body.matchAll(/\s(?:aria-label|alt|title)="([^"]*)"/g)].map((m) => m[1]).join(' ');
  return decode(`${body.replace(/<[^>]+>/g, ' ')} ${attrs}`);
}

/** The text a page sets in type (no attribute text: screen readers speak it, no font draws it). */
export function renderedText(html) {
  return decode(bodyOf(html).replace(/<[^>]+>/g, ' '));
}

/** The markup without the subtrees of elements that carry the `hidden` attribute (closed menus and disclosures). */
export function withoutHidden(html) {
  let out = html;
  for (;;) {
    const m = /<([a-zA-Z][\w-]*)\b[^>]*\shidden(?:=(?:""|''|"hidden"))?(?=[\s>/])[^>]*>/.exec(out);
    if (!m) return out;
    const tag = m[1].toLowerCase();
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
    re.lastIndex = m.index + m[0].length;
    let depth = 1;
    let end = out.length;
    for (let t = re.exec(out); t; t = re.exec(out)) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) {
        end = t.index + t[0].length;
        break;
      }
    }
    out = out.slice(0, m.index) + out.slice(end);
  }
}

/** The text that makes a browser fetch fonts at load: set in type and not inside a `hidden` subtree. */
export function loadText(html) {
  return renderedText(withoutHidden(html));
}

/** Faces a page will download: those whose unicode-range meets a character of its text (an upper bound). */
export function facesForText(faces, text) {
  const cps = new Set([...text].map((c) => c.codePointAt(0)).filter((c) => c > 0x20));
  return faces.filter((f) => [...cps].some((cp) => inRanges(cp, f.ranges)));
}

/** Every string value of a JSON value. */
export function strings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out);
  return out;
}

/** Characters of `text` the ranges do not cover (controls, joiners and the language switch's other scripts aside). */
export function uncovered(text, ranges) {
  const miss = new Set();
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp < 0x20 || cp === 0x2060 || cp === 0x200b || cp === 0xfe0f) continue;
    if (!inRanges(cp, ranges)) miss.add(ch);
  }
  return [...miss];
}

/** The asset paths a manifest names (relative to src/assets). */
export function manifestFiles(json) {
  return strings(json).filter((s) =>
    /^(plates|sprites|textures|motifs|glyphs|fonts)\/[^\s]+\.(avif|webp|svg|png|jpg|woff2)$/.test(s),
  );
}

/** Width x height of a baseline/progressive JPEG (SOF0-2 marker), or null. */
export function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc2) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

/** Head checks of one pre-rendered page; returns a list of problems. */
/** The variant pages of a language (spec 2.1, QA r1 T1): folder slug ('' = the language's own) and preview file. */
export const VARIANT_PAGES = [
  { key: 'G1', slug: '' },
  { key: 'B1', slug: 'b' },
  { key: 'G0', slug: 'k' },
  { key: 'B0', slug: 'bk' },
];
export const ogFile = (lang, slug = '') => `og-${lang}${slug ? `-${slug}` : ''}.jpg`;

export function checkHead(html, lang, { indexable = false, siteUrl = '', slug = '' } = {}) {
  const p = [];
  const has = (re, what) => re.test(html) || p.push(`${lang}: ${what} missing`);
  has(new RegExp(`<html lang="${lang}"`), `<html lang="${lang}">`);
  has(/<title>[^<]{3,}<\/title>/, '<title>');
  has(/<meta name="description" content="[^"]{3,}"/, 'meta description');
  has(/<meta property="og:title" content="[^"]+"/, 'og:title');
  has(/<meta property="og:description" content="[^"]+"/, 'og:description');
  has(new RegExp(`<meta property="og:locale" content="${OG_LOCALE[lang]}"`), `og:locale ${OG_LOCALE[lang]}`);
  has(/<meta http-equiv="Content-Security-Policy" content="[^"]*script-src 'self'/, 'CSP meta');
  has(new RegExp(`<style data-fonts="${lang}">@font-face`), 'inline font rules');
  has(/<meta name="theme-color" content="#[0-9a-f]{6}"/i, 'theme-color');
  has(/<link rel="manifest" href="[^"]+"/, 'manifest link');
  const robots = /<meta name="robots" content="([^"]*)"/.exec(html)?.[1];
  if (!indexable && robots !== 'noindex, nofollow')
    p.push(`${lang}: robots is "${robots ?? '(none)'}", expected "noindex, nofollow"`);
  if (indexable && robots) p.push(`${lang}: robots "${robots}" on an indexable build`);
  const ogImage = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
  if (siteUrl && !ogImage?.startsWith('http'))
    p.push(`${lang}: og:image missing or not absolute although VITE_SITE_URL is set`);
  if (siteUrl && ogImage && !ogImage.endsWith(`og/${ogFile(lang, slug)}`))
    p.push(`${lang}${slug ? `/${slug}` : ''}: og:image ${ogImage} is not ${ogFile(lang, slug)}`);
  if (!siteUrl && ogImage) p.push(`${lang}: og:image present without VITE_SITE_URL (must be absolute)`);
  return p;
}

/** Inline scripts (no src): the CSP blocks them. */
export function inlineScripts(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(
    (m) => !/\ssrc=/.test(m[1]) && m[2].trim(),
  ).length;
}

/** The srcset candidate a 1170 device-px wide phone frame takes (the smallest >= target, else the largest). */
export function pickCandidate(srcset, target = 1170) {
  const c = srcset
    .split(',')
    .map((s) => s.trim().split(/\s+/))
    .filter((x) => x[0])
    .map(([url, d = '1x']) => ({ url, w: d.endsWith('w') ? parseInt(d, 10) : parseFloat(d) * 390 }));
  c.sort((a, b) => a.w - b.w);
  return (c.find((x) => x.w >= target) ?? c[c.length - 1])?.url ?? null;
}

/** The image a phone fetches through the head's image preloads: the first one (the tall frame), at 1170 w. */
export function preloadedImages(html, base = '/') {
  const first = /<link rel="preload" as="image"[^>]*\simagesrcset="([^"]+)"/.exec(html)?.[1];
  const u = first ? pickCandidate(first.replace(/&amp;/g, '&')) : null;
  return u && u.startsWith(base) ? [u] : [];
}

/** Same-origin images the opening fetches on a phone without scrolling: eager <img>s (their first <source>). */
export function openingImages(html, base = '/') {
  const start = html.search(/<section\b[^>]*\bid="opening"/);
  if (start < 0) return [];
  const rest = html.slice(start + 8);
  const end = rest.search(/<section\b/);
  const open = html.slice(start, end < 0 ? undefined : start + 8 + end);
  const urls = new Set();
  for (const m of open.matchAll(/<picture\b[\s\S]*?<\/picture>|<img\b[^>]*>/g)) {
    const block = m[0];
    const img = /<img\b[^>]*>/.exec(block)?.[0] ?? '';
    if (/\sloading="lazy"/.test(img)) continue;
    const src = /<source\b[^>]*\ssrc[sS]et="([^"]+)"/.exec(block)?.[1] ?? /\ssrc[sS]et="([^"]+)"/.exec(img)?.[1];
    const u = src ? pickCandidate(src) : /\ssrc="([^"]+)"/.exec(img)?.[1];
    if (u && u.startsWith(base)) urls.add(u);
  }
  return [...urls];
}

function main() {
  const ROOT = new URL('../', import.meta.url).pathname;
  const DIST = `${ROOT}dist/`;
  const BASE = (() => {
    const b = process.env.VITE_BASE ?? '/';
    const lead = b.startsWith('/') ? b : `/${b}`;
    return lead.endsWith('/') ? lead : `${lead}/`;
  })();
  const SITE = resolveSiteUrl().url ?? '';
  const INDEXABLE = process.env.VITE_SEO_INDEXABLE === '1';
  const errors = [];
  const notes = [];

  const manifestPath = `${DIST}.vite/manifest.json`;
  if (!existsSync(manifestPath)) {
    console.error('check-budget: dist/.vite/manifest.json missing (build.manifest must be true)');
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const file = (rel) => readFileSync(`${DIST}${rel}`);
  const urlToFile = (u) => {
    const rel = decodeURIComponent(u.slice(BASE.length));
    return rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel;
  };

  // ---- JS + CSS (entry chunk graph + largest language chunk)
  const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry);
  if (!entryKey) {
    console.error('check-budget: no entry chunk in the manifest');
    process.exit(1);
  }
  const js = new Set();
  const css = new Set();
  const visit = (key) => {
    const chunk = manifest[key];
    if (!chunk || js.has(chunk.file)) return;
    js.add(chunk.file);
    for (const c of chunk.css ?? []) css.add(c);
    for (const i of chunk.imports ?? []) visit(i);
  };
  visit(entryKey);
  const langChunks = Object.entries(manifest)
    .filter(([k]) => /src\/i18n\/(en|hi|mai|bn)\.json$/.test(k))
    .map(([k, c]) => ({ key: k, file: c.file, gz: gz(file(c.file)) }))
    .sort((a, b) => b.gz - a.gz);
  const jsGz = [...js].reduce((s, f) => s + gz(file(f)), 0) + (langChunks[0]?.gz ?? 0);
  const cssGz = [...css].reduce((s, f) => s + gz(file(f)), 0);
  if (jsGz > LIMITS.js) errors.push(`initial JS ${kb(jsGz)} > ${kb(LIMITS.js)}`);
  if (cssGz > LIMITS.css) errors.push(`initial CSS ${kb(cssGz)} > ${kb(LIMITS.css)}`);

  // ---- pages
  for (const page of [
    'index.html',
    '404.html',
    'redirect.js',
    'site.webmanifest',
    ...LANGS.flatMap((l) => VARIANT_PAGES.map((v) => `${l}/${v.slug ? `${v.slug}/` : ''}index.html`)),
  ]) {
    if (!existsSync(`${DIST}${page}`)) errors.push(`dist/${page} missing`);
  }
  // every variant page carries its own head and preview card
  for (const lang of LANGS)
    for (const v of VARIANT_PAGES.filter((x) => x.slug)) {
      const f = `${DIST}${lang}/${v.slug}/index.html`;
      if (existsSync(f))
        errors.push(...checkHead(readFileSync(f, 'utf8'), lang, { indexable: INDEXABLE, siteUrl: SITE, slug: v.slug }));
    }
  for (const f of readdirSync(DIST, { recursive: true }).filter((f) => String(f).endsWith('.html'))) {
    const n = inlineScripts(readFileSync(`${DIST}${f}`, 'utf8'));
    if (n) errors.push(`dist/${f}: ${n} inline <script> (blocked by the CSP; use a file)`);
  }

  // ---- per language: head, fonts, coverage, first-load estimate
  const coverage = JSON.parse(readFileSync(`${ROOT}src/assets/fonts/font-coverage.json`, 'utf8'));
  const rows = [];
  for (const lang of LANGS) {
    if (!existsSync(`${DIST}${lang}/index.html`)) continue;
    const html = readFileSync(`${DIST}${lang}/index.html`, 'utf8');
    errors.push(...checkHead(html, lang, { indexable: INDEXABLE, siteUrl: SITE }));

    const fontCss = /<style data-fonts="[^"]*">([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    const faces = facesForText(parseFontFaces(fontCss), loadText(html));
    let fontBytes = 0;
    for (const f of faces) {
      const rel = urlToFile(f.url);
      if (!existsSync(`${DIST}${rel}`)) errors.push(`${lang}: font ${f.url} is not in dist/`);
      else fontBytes += statSync(`${DIST}${rel}`).size;
    }
    if (fontBytes > LIMITS.fonts) errors.push(`${lang}: initial fonts ${kb(fontBytes)} > ${kb(LIMITS.fonts)}`);

    // every character of the language's copy must be in its faces, and every character the page sets in type in
    // one of the faces the page declares (the other scripts' endonyms and the Cultures word have their own subsets)
    const L = coverage.languages[lang];
    const copy = JSON.parse(readFileSync(`${ROOT}src/i18n/${lang}.json`, 'utf8'));
    const cp = (c) => `"${c}" U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
    const miss = uncovered(strings(copy).join(''), parseUnicodeRange(L.ranges));
    if (miss.length) errors.push(`${lang}: the fonts do not cover ${miss.map(cp).join(', ')} (run assets:fonts)`);
    const declared = parseFontFaces(fontCss).flatMap((f) => f.ranges);
    const unset = uncovered(renderedText(html), declared);
    if (unset.length) {
      errors.push(
        `${lang}: the page shows ${unset.map(cp).join(', ')}, which no @font-face of the page covers (system font; ` +
          'add a subset in scripts/subset-fonts.mjs and run assets:fonts)',
      );
    }

    // first load on a phone: HTML + linked CSS + JS + fonts + the opening's eager images
    const htmlGz = gz(Buffer.from(html));
    const linkedCss = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"/g)].reduce(
      (s, m) => s + (existsSync(`${DIST}${urlToFile(m[1])}`) ? gz(file(urlToFile(m[1]))) : 0),
      0,
    );
    const images = [...new Set([...preloadedImages(html, BASE), ...openingImages(html, BASE)])]
      .map((u) => urlToFile(u))
      .filter((r) => existsSync(`${DIST}${r}`));
    const imgBytes = images.reduce((s, r) => s + statSync(`${DIST}${r}`).size, 0);
    const first = htmlGz + linkedCss + jsGz + fontBytes + imgBytes;
    if (first > LIMITS.firstLoad) errors.push(`${lang}: first-load estimate ${kb(first)} > ${kb(LIMITS.firstLoad)}`);
    rows.push(
      `${lang}: html ${kb(htmlGz)} gz, fonts ${kb(fontBytes)} (${faces.length} faces), opening images ${kb(imgBytes)} (${images.length}), ` +
        `first load ~${kb(first)}${first > TARGETS.firstLoad ? ' (over the 700 KB target)' : ''}`,
    );
    if (fontBytes > TARGETS.fonts) notes.push(`${lang}: fonts ${kb(fontBytes)} over the ${kb(TARGETS.fonts)} target`);
  }

  // ---- generated asset manifests name files that exist
  for (const m of ['plates.json', 'sprites.json', 'glyphs/glyphs.json', 'motifs/motifs.json']) {
    const p = `${ROOT}src/assets/${m}`;
    if (!existsSync(p)) {
      if (/plates|sprites/.test(m)) errors.push(`src/assets/${m} missing (run the asset tools)`);
      continue;
    }
    for (const rel of manifestFiles(JSON.parse(readFileSync(p, 'utf8')))) {
      if (!existsSync(`${ROOT}src/assets/${rel}`)) errors.push(`src/assets/${m} names ${rel}, which does not exist`);
    }
  }

  // ---- OG images: one per language and variant
  for (const lang of LANGS)
    for (const v of VARIANT_PAGES) {
      const name = ogFile(lang, v.slug);
      const p = `${DIST}og/${name}`;
      if (!existsSync(p)) {
        errors.push(`dist/og/${name} missing (run assets:og)`);
        continue;
      }
      const buf = readFileSync(p);
      const size = jpegSize(buf);
      if (!size || size.width !== 1200 || size.height !== 630) errors.push(`${name} is not a 1200x630 JPEG`);
      if (buf.length > LIMITS.og) errors.push(`${name} ${kb(buf.length)} > ${kb(LIMITS.og)}`);
    }

  console.log(
    `check-budget: initial JS ${kb(jsGz)} gzip (limit ${kb(LIMITS.js)}, target ${kb(TARGETS.js)}; ${js.size} entry chunk(s) + language ` +
      `${langChunks[0] ? kb(langChunks[0].gz) : 'n/a'}), entry CSS ${kb(cssGz)} gzip (limit ${kb(LIMITS.css)}, target ${kb(TARGETS.css)})\n  ` +
      rows.join('\n  '),
  );
  for (const n of notes) console.warn(`check-budget: note: ${n}`);
  if (errors.length) {
    console.error(`check-budget: FAILED\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
