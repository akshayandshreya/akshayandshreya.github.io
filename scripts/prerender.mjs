// Spec 6.2, 6.3, 6.6, 9.5. After `vite build` (client) and `vite build --ssr` (dist-ssr/entry-server.js) this writes:
//   dist/{en,hi,mai,bn}/index.html  the G1 page of each language, and dist/<lang>/{b,k,bk}/index.html its other three
//                                   variants (bride first, Kolkata only, both): CSP + referrer meta, title/description/robots/og
//                                   (lib/head.ts), the language's @font-face rules inline, preloads for the LCP plate,
//                                   the two first-screen fonts and the language chunk, and the entry CSS inline when
//                                   it fits the critical budget (one less render-blocking request)
//   dist/index.html, dist/404.html  the root (language detection) and unknown-path shells: redirect.js + plain links,
//                                   and the English preview tags, so a shared bare domain still gets a link preview
//   dist/site.webmanifest, dist/<lang>/site.webmanifest, dist/_headers (Netlify / Cloudflare Pages), dist/_redirects
// and fails when a page references a same-origin file that is not in dist/.
// The pure helpers are exported for tests/unit/prerender.test.ts; main() runs only when this file is executed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { resolveSiteUrl } from './lib/site-url.mjs';

export const PAPER = '#f2e8d8';
/** Inline the entry CSS when its gzip size is at most this (spec 6.6: critical CSS <= 14 KB, one TCP initial window). */
export const CRITICAL_CSS_MAX_GZ = 14 * 1024;

export function normalizeBase(b = '/') {
  const lead = b.startsWith('/') ? b : `/${b}`;
  return lead.endsWith('/') ? lead : `${lead}/`;
}

/** Spec 6.3. The meta version cannot carry frame-ancestors (browsers ignore it there); the header version does. */
export function csp({ header = false, mediaOrigin = '' } = {}) {
  const d = [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "font-src 'self'",
    `media-src 'self'${mediaOrigin ? ` ${mediaOrigin}` : ''}`,
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'none'",
    "object-src 'none'",
  ];
  if (header) d.push("frame-ancestors 'none'");
  return d.join('; ');
}

export const SECURITY_HEADERS = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

/** Attributes of one start tag (case-insensitive names, as React's SSR writes srcSet / fetchPriority). */
export function attrsOf(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    const name = m[1].toLowerCase();
    if (
      name ===
      tag
        .slice(1)
        .split(/[\s>/]/)[0]
        .toLowerCase()
    )
      continue; // the tag name itself
    out[name] = (m[2] ?? m[3] ?? m[4] ?? '').replace(/&amp;/g, '&');
  }
  return out;
}

/** The markup of the opening section (from its start tag to the next section's), or ''. */
export function openingMarkup(appHtml) {
  const start = appHtml.search(/<section\b[^>]*\bid="opening"/);
  if (start < 0) return '';
  const next = appHtml.slice(start + 8).search(/<section\b/);
  return next < 0 ? appHtml.slice(start) : appHtml.slice(start, start + 8 + next);
}

/**
 * Preloads for the LCP image: the opening plate (spec 6.6). Derived from the rendered markup, so they always match
 * what the page will request: one per AVIF <source> of the opening's first <picture> (each with its media query and
 * sizes; type="image/avif" lets browsers without AVIF skip it), or the <img> srcset when there is no <picture>.
 * Returns { tags, warnings }.
 */
export function lcpPreloads(appHtml) {
  const warnings = [];
  const open = openingMarkup(appHtml);
  if (!open) return { tags: [], warnings: ['no <section id="opening"> in the page'] };
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const link = (a) =>
    `<link rel="preload" as="image" fetchpriority="high"${a.type ? ` type="${a.type}"` : ''}${a.media ? ` media="${esc(a.media)}"` : ''}` +
    `${a.srcset ? ` imagesrcset="${esc(a.srcset)}"` : ''}${a.sizes ? ` imagesizes="${esc(a.sizes)}"` : ''}${a.href ? ` href="${esc(a.href)}"` : ''}>`;
  const picture = /<picture\b[\s\S]*?<\/picture>/.exec(open)?.[0];
  if (picture) {
    const sources = [...picture.matchAll(/<source\b[^>]*>/g)].map((m) => attrsOf(m[0]));
    const avif = sources.filter((s) => (s.type ?? '').toLowerCase() === 'image/avif' && s.srcset);
    const img = /<img\b[^>]*>/.exec(picture);
    if (img && attrsOf(img[0]).loading === 'lazy')
      warnings.push('the opening plate <img> is loading="lazy" (it is the LCP element)');
    // a <picture> takes the FIRST matching source; preloads match independently, so each one gets its own media AND
    // the complement of every earlier source's media: exactly one fires per viewport
    const pick = (list, type) => {
      const exclusive = exclusiveMedia(list.map((s) => s.media));
      return list.map((s, i) => link({ type: type ?? s.type, media: exclusive[i], srcset: s.srcset, sizes: s.sizes }));
    };
    if (avif.length) return { tags: pick(avif, 'image/avif'), warnings };
    const any = sources.filter((s) => s.srcset);
    if (any.length) return { tags: pick(any), warnings };
  }
  const img = /<img\b[^>]*>/.exec(open);
  if (img) {
    const a = attrsOf(img[0]);
    if (a.loading === 'lazy') warnings.push('the opening <img> is loading="lazy" (it is the LCP element)');
    if (a.srcset || a.src)
      return { tags: [link({ srcset: a.srcset, sizes: a.sizes, href: a.srcset ? '' : a.src })], warnings };
  }
  return { tags: [], warnings: [...warnings, 'no plate <picture>/<img> in the opening yet: LCP preload skipped'] };
}

/** The complement of one media query. Aspect-ratio bounds get an exact numeric complement (MQ level 3, every browser);
 *  anything else uses level-4 `not` (a browser that cannot parse it skips that preload; the <picture> still loads). */
export function complementMedia(m) {
  const r = /^\(\s*(max|min)-aspect-ratio\s*:\s*(\d+)\s*\/\s*(\d+)\s*\)$/.exec(m.trim());
  if (r) {
    const [, side, a, b] = r;
    const n = Number(a) * 1000 + (side === 'max' ? 1 : -1);
    return `(${side === 'max' ? 'min' : 'max'}-aspect-ratio: ${n}/${Number(b) * 1000})`;
  }
  return `(not ${m.trim().startsWith('(') ? m.trim() : `(${m.trim()})`})`;
}

/** Media per <source> such that at most one matches: own media AND NOT every earlier media. */
export function exclusiveMedia(medias) {
  return medias.map((m, i) => {
    const parts = medias.slice(0, i).filter(Boolean).map(complementMedia);
    if (m) parts.push(m.trim());
    return parts.length ? parts.join(' and ') : undefined;
  });
}

/** <link rel=modulepreload> for the language chunk main.tsx imports before the first render. */
export function langChunkPreload(manifest, lang, base) {
  const chunk = manifest[`src/i18n/${lang}.json`];
  return chunk ? `<link rel="modulepreload" crossorigin href="${base}${chunk.file}">` : '';
}

/**
 * Replace the entry stylesheet link with the CSS itself when it is small enough and has no relative url()s (they
 * would resolve against the page instead of /assets/). Returns { page, inlined, gz, file }.
 */
export function inlineEntryCss(page, readAsset, base, maxGz = CRITICAL_CSS_MAX_GZ) {
  const quoted = base.replace(/[.*+?^$()|[\]\\{}]/g, (c) => `\\${c}`);
  const m = new RegExp(`<link rel="stylesheet"(?: crossorigin)? href="${quoted}(assets/[^"]+\\.css)">`).exec(page);
  if (!m) return { page, inlined: false, gz: 0, file: null };
  const css = readAsset(m[1]);
  const gz = gzipSync(css, { level: 9 }).length;
  const relative = /url\(\s*['"]?(?!data:|https?:|\/|#)/.test(css);
  if (gz > maxGz || relative) return { page, inlined: false, gz, file: m[1] };
  return {
    page: page.replace(m[0], () => `<style data-entry-css>${css.toString('utf8').trim()}</style>`),
    inlined: true,
    gz,
    file: m[1],
  };
}

/** One page from the Vite template and the SSR parts. */
export function assemblePage(template, parts, extra) {
  const head = [
    `<meta http-equiv="Content-Security-Policy" content="${csp()}">`,
    parts.head,
    ...extra.preloads,
    parts.preloads,
    parts.fonts,
    `<link rel="manifest" href="${extra.base}${parts.htmlLang}/site.webmanifest">`,
  ]
    .filter(Boolean)
    .join('\n    ');
  return template
    .replace(/<html lang="[^"]*"/, `<html lang="${parts.htmlLang}"`)
    .replace('<!--head-->', () => head)
    .replace(
      '<div id="root"><!--app-html--></div>',
      () =>
        `<div id="root" data-prerendered="${parts.htmlLang}" data-variant="${extra.variant ?? 'G1'}">${parts.html}</div>`,
    );
}

export function webmanifest({ base, lang, name, shortName }) {
  return `${JSON.stringify(
    {
      name,
      short_name: shortName,
      lang,
      dir: 'ltr',
      start_url: lang ? `${base}${lang}/` : base,
      scope: base,
      display: 'standalone',
      background_color: PAPER,
      theme_color: PAPER,
      icons: [
        { src: `${base}favicon.svg`, sizes: 'any', type: 'image/svg+xml' },
        { src: `${base}apple-touch-icon.png`, sizes: '180x180', type: 'image/png' },
        { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' },
      ],
    },
    null,
    2,
  )}\n`;
}

/** Netlify / Cloudflare Pages `_headers` (spec 6.3, 9.5). Hashed files are immutable; pages are revalidated. */
export function headersFile({ base, indexable, langs }) {
  const block = (path, headers) =>
    `${path}\n${Object.entries(headers)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n')}\n`;
  const all = { 'Content-Security-Policy': csp({ header: true }), ...SECURITY_HEADERS };
  if (!indexable) all['X-Robots-Tag'] = 'noindex, nofollow';
  const pages = [base, `${base}index.html`, `${base}404.html`, ...langs.map((l) => `${base}${l}/*`)];
  return [
    '# Generated by scripts/prerender.mjs (spec 6.3). Netlify and Cloudflare Pages read this file from the publish dir.',
    block(`${base}*`, all),
    ...pages.map((p) => block(p, { 'Cache-Control': 'no-cache' })),
    block(`${base}assets/*`, { 'Cache-Control': 'public, max-age=31536000, immutable' }),
  ].join('\n');
}

export function rewriteRedirects(text, base) {
  return text
    .split('\n')
    .map((line) =>
      line.startsWith('/') && base !== '/' ? line.replace(/^\/(\S*)\s+\/(\S*)/, `${base}$1   ${base}$2`) : line,
    )
    .join('\n');
}

const ENDONYMS = { en: 'English', hi: 'हिन्दी', mai: 'मैथिली', bn: 'বাংলা' };

/** The root / 404 page: no app bundle, redirect.js, plain language links without JS, the English preview tags. */
export function shellPage({ mode, base, langs, head = '', title = 'Akshay & Shreya' }) {
  const links = langs
    .map((l) => `<li><a href="${base}${l}/" hreflang="${l}" lang="${l}">${ENDONYMS[l] ?? l}</a></li>`)
    .join('');
  return `<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="color-scheme" content="light">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <meta http-equiv="Content-Security-Policy" content="${csp()}">
    ${head || `<title>${title}</title>\n    <meta name="robots" content="noindex, nofollow">\n    <meta name="theme-color" content="${PAPER}">`}
    <link rel="icon" href="${base}favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="${base}apple-touch-icon.png">
    <link rel="manifest" href="${base}site.webmanifest">
    <script src="${base}redirect.js" data-base="${base}" data-mode="${mode}"></script>
    ${mode === 'root' ? `<noscript><meta http-equiv="refresh" content="0; url=${base}en/"></noscript>` : ''}
    <style>html{background:${PAPER}}body{margin:0;min-height:100vh;min-height:100svh;display:grid;place-items:center;background:${PAPER};color:#5c3f17;font:18px/1.5 Georgia,'Times New Roman',serif}ul{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;list-style:none;margin:0;padding:24px}a{display:inline-block;min-width:44px;min-height:44px;box-sizing:border-box;padding:10px 20px;border:1px solid #9a6a24;border-radius:999px;color:inherit;text-decoration:none}a:focus-visible{outline:2px solid #6f4f22;outline-offset:3px}</style>
  </head>
  <body>
    <nav aria-label="Language / भाषा / ভাষা"><ul>${links}</ul></nav>
  </body>
</html>
`;
}

/** Same-origin URLs a page references (href, src, srcset, imagesrcset, url() in inline styles). */
export function referencedUrls(page, base) {
  const urls = new Set();
  const add = (u) => {
    const v = u.trim().replace(/&amp;/g, '&');
    if (v.startsWith(base) && !v.startsWith('//')) urls.add(v.split(/[?#]/)[0]);
  };
  for (const m of page.matchAll(/\s(?:href|src)="([^"]+)"/gi)) add(m[1]);
  for (const m of page.matchAll(/\s(?:srcset|imagesrcset)="([^"]+)"/gi))
    for (const c of m[1].split(',')) add(c.trim().split(/\s+/)[0]);
  for (const m of page.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) add(m[1]);
  return [...urls];
}

/** The dist/ file a same-origin URL maps to ("/en/" -> "en/index.html"). */
export function fileForUrl(url, base) {
  const rel = decodeURIComponent(url.slice(base.length));
  return rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel;
}

async function main() {
  const ROOT = new URL('../', import.meta.url).pathname;
  const DIST = `${ROOT}dist/`;
  const SSR = `${ROOT}dist-ssr/entry-server.js`;
  const BASE = normalizeBase(process.env.VITE_BASE ?? '/');
  const INDEXABLE = process.env.VITE_SEO_INDEXABLE === '1';

  if (!existsSync(`${DIST}index.html`) || !existsSync(SSR) || !existsSync(`${DIST}.vite/manifest.json`)) {
    console.error('prerender: run `vite build` and `vite build --ssr src/entry-server.tsx --outDir dist-ssr` first');
    process.exit(1);
  }
  const site = resolveSiteUrl();
  if (!site.url) {
    console.warn(
      'prerender: no site URL (VITE_SITE_URL, or the host\'s own): canonical, hreflang and og:image/og:url are omitted ' +
        '(spec 6.2, O10; link previews show a text-only card)',
    );
  } else console.log(`prerender: site URL ${site.url} (from ${site.source})`);
  const template = readFileSync(`${DIST}index.html`, 'utf8');
  if (!template.includes('<!--head-->') || !template.includes('<!--app-html-->')) {
    console.error(
      'prerender: dist/index.html lost its <!--head--> / <!--app-html--> placeholders (already prerendered?)',
    );
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(`${DIST}.vite/manifest.json`, 'utf8'));
  const { render, LANGS_TO_PRERENDER, VARIANTS_TO_PRERENDER } = await import(pathToFileURL(SSR).href);
  const readAsset = (rel) => readFileSync(`${DIST}${rel}`);

  const report = [];
  const problems = [];
  const pages = [];
  let enParts = null;
  // one page per language and variant (spec 2.1, 6.2; QA r1 T1): dist/<lang>/index.html is G1, dist/<lang>/b/, /k/ and
  // /bk/ the bride-first, Kolkata-only and both pages, each with its own head and preview card (link previews never
  // run JS and cannot pick a file by query string)
  for (const lang of LANGS_TO_PRERENDER) {
    for (const { key, slug } of VARIANTS_TO_PRERENDER) {
      const parts = await render(lang, key);
      if (lang === 'en' && key === 'G1') enParts = parts;
      const lcp = lcpPreloads(parts.html);
      for (const w of lcp.warnings) console.warn(`prerender: ${lang} ${key}: ${w}`);
      let page = assemblePage(template, parts, {
        base: BASE,
        variant: key,
        preloads: [...lcp.tags, langChunkPreload(manifest, lang, BASE)],
      });
      const css = inlineEntryCss(page, readAsset, BASE);
      page = css.page;
      const dir = slug ? `${lang}/${slug}` : lang;
      mkdirSync(`${DIST}${dir}`, { recursive: true });
      writeFileSync(`${DIST}${dir}/index.html`, page);
      pages.push(`${dir}/index.html`);
      if (key !== 'G1') continue;
      writeFileSync(
        `${DIST}${lang}/site.webmanifest`,
        webmanifest({ base: BASE, lang, name: parts.manifest.name, shortName: parts.manifest.shortName }),
      );
      const html = Buffer.byteLength(page);
      report.push(
        `${lang}/index.html ${(html / 1024).toFixed(1)} KB (${(gzipSync(page).length / 1024).toFixed(1)} KB gz; ` +
          `CSS ${css.inlined ? 'inline' : 'linked'} ${(css.gz / 1024).toFixed(1)} KB gz; ${lcp.tags.length} LCP preload(s))`,
      );
    }
  }

  // root + 404 carry the English G1 preview tags (bots do not run redirect.js); the 404 also gets noindex via head
  const shellHead = enParts.head;
  const notFoundHead = /name="robots"/.test(shellHead)
    ? shellHead
    : `${shellHead}\n    <meta name="robots" content="noindex">`;
  writeFileSync(
    `${DIST}index.html`,
    shellPage({ mode: 'root', base: BASE, langs: LANGS_TO_PRERENDER, head: shellHead }),
  );
  writeFileSync(
    `${DIST}404.html`,
    shellPage({ mode: '404', base: BASE, langs: LANGS_TO_PRERENDER, head: notFoundHead }),
  );
  writeFileSync(
    `${DIST}site.webmanifest`,
    webmanifest({ base: BASE, lang: 'en', name: enParts.manifest.name, shortName: enParts.manifest.shortName }),
  );
  writeFileSync(`${DIST}_headers`, headersFile({ base: BASE, indexable: INDEXABLE, langs: LANGS_TO_PRERENDER }));
  writeFileSync(`${DIST}_redirects`, rewriteRedirects(readFileSync(`${ROOT}public/_redirects`, 'utf8'), BASE));

  // every same-origin file a page references must exist (fonts from inlined CSS, plates, chunks, icons, manifests)
  for (const page of ['index.html', '404.html', ...pages]) {
    for (const url of referencedUrls(readFileSync(`${DIST}${page}`, 'utf8'), BASE)) {
      const f = fileForUrl(url, BASE);
      if (!existsSync(`${DIST}${f}`)) problems.push(`${page} references ${url}, but dist/${f} does not exist`);
    }
  }
  if (problems.length) {
    console.error(`prerender: FAILED\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(
    `prerender: ok (base ${BASE}). ${report.join('; ')}; ${pages.length} pages (4 variants per language), root + 404 ` +
      'shells, manifests, _headers, _redirects',
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
