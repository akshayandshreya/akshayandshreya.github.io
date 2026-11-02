// Spec section 0 (ground rules and decisions), checked against the repo and the rendered page. Every test names the
// rule it guards. The facts table of SPEC 0.3 is parsed from docs/SPEC.md, so the spec cannot drift from content.json.
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../src/App';
import { ROUTER_FUTURE, config } from '../../src/config';
import { EVENT_FACTS, CONTENT_SHA256 } from '../../src/generated/facts';
import type { EventKey, Lang, VariantKey } from '../../src/i18n/types';
import content from '../../content/content.json';
import pkg from '../../package.json';
import contentRaw from '../../content/content.json?raw';
import sourceMd from '../../content/SOURCE.md?raw';
import specMd from '../../docs/SPEC.md?raw';
import gitignore from '../../.gitignore?raw';
import tirhutaSvg from '../../src/assets/glyphs/tirhuta-mithila.svg?raw';
import { FILES, plainText } from '../helpers';

const LANGS: Lang[] = ['en', 'hi', 'mai', 'bn'];
const VARIANTS: VariantKey[] = ['G1', 'G0', 'B1', 'B0'];
const QUERY: Record<VariantKey, string> = {
  G1: '',
  G0: '?reception=0',
  B1: '?side=bride',
  B0: '?side=bride&reception=0',
};
const norm = (s: string) => plainText(s).replace(/\s+/g, ' ').trim();
const toLatinDigits = (s: string) =>
  s.replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x966)).replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x9e6));

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]} future={ROUTER_FUTURE}>
      <App />
    </MemoryRouter>,
  );
}

/** SHA-256 (FIPS 180-4) of a UTF-8 string, hex. Kept local so the test needs neither node:crypto nor WebCrypto. */
function sha256Hex(text: string): string {
  const primes: number[] = [];
  for (let n = 2; primes.length < 64; n++) if (primes.every((p) => n % p !== 0)) primes.push(n);
  const K = Uint32Array.from(primes, (p) => Math.floor((Math.cbrt(p) % 1) * 2 ** 32) >>> 0);
  const H = Uint32Array.from([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const bytes = new TextEncoder().encode(text);
  const len = Math.ceil((bytes.length + 9) / 64) * 64;
  const m = new Uint8Array(len);
  m.set(bytes);
  m[bytes.length] = 0x80;
  const view = new DataView(m.buffer);
  view.setUint32(len - 8, Math.floor((bytes.length * 8) / 2 ** 32));
  view.setUint32(len - 4, (bytes.length * 8) >>> 0);
  const W = new Uint32Array(64);
  const rot = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < len; off += 64) {
    for (let t = 0; t < 64; t++) {
      if (t < 16) W[t] = view.getUint32(off + t * 4);
      else {
        const a = W[t - 15]!;
        const b = W[t - 2]!;
        const s0 = rot(a, 7) ^ rot(a, 18) ^ (a >>> 3);
        const s1 = rot(b, 17) ^ rot(b, 19) ^ (b >>> 10);
        W[t] = (W[t - 16]! + s0 + W[t - 7]! + s1) >>> 0;
      }
    }
    let [a, b, c, d, e, f, g, h] = Array.from(H) as [number, number, number, number, number, number, number, number];
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[t]! + W[t]!) >>> 0;
      const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      [h, g, f, e, d, c, b, a] = [g, f, e, (d + t1) >>> 0, c, b, a, (t1 + t2) >>> 0];
    }
    [a, b, c, d, e, f, g, h].forEach((x, i) => (H[i] = (H[i]! + x) >>> 0));
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- content.json is untyped
const RAW = content as any;

// Plain file reads for the source scans: Vite's ?raw cannot load CSS while vitest runs with css: false, and the test
// tsconfig has no Node types, so node:fs is loaded untyped and given the one signature used here.
const fs = (await import(/* @vite-ignore */ 'node:' + 'fs')) as { readFileSync(path: string, enc: 'utf8'): string };
/** [path, text] for every file matched by an import.meta.glob key list (paths are relative to the repo root). */
const readAll = (globbed: Record<string, unknown>) =>
  Object.keys(globbed).map((path) => [path, fs.readFileSync(`.${path}`, 'utf8')] as const);

describe('0.1 sources: the content snapshot', () => {
  it('sha256 helper is correct (FIPS 180-4 test vector)', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('content/content.json matches the hash recorded in SOURCE.md and in the generated facts', () => {
    const recorded = /sha256\s*\|\s*`([0-9a-f]{64})`/.exec(sourceMd)?.[1];
    expect(recorded).toBeDefined();
    expect(sha256Hex(contentRaw)).toBe(recorded);
    expect(CONTENT_SHA256).toBe(recorded);
  });
  it('SOURCE.md names the read-only source path', () => {
    expect(sourceMd).toContain('/Volumes/workplace/WeddingInvite2/assets/copy/content.json');
  });
});

describe('0.3 the facts table in SPEC.md equals content.json and the generated facts', () => {
  const section = specMd.slice(specMd.indexOf('### 0.3'), specMd.indexOf('### 0.4'));
  const rows = section
    .split('\n')
    .filter((l) => l.startsWith('| ') && !l.startsWith('| Event') && !l.startsWith('|---'))
    .map((l) =>
      l
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim()),
    );

  it('has one row per event, in page order', () => {
    expect(rows.map((r) => r[0]!.split(/\s/)[0]!.toLowerCase())).toEqual(Object.keys(RAW.facts.events));
  });

  let lastAddress = '';
  for (const r of rows) {
    const [label, date, time, venue, address, utc] = r as [string, string, string, string, string, string];
    const key = label.split(/\s/)[0]!.toLowerCase() as EventKey;
    const addr = address === '(same)' ? lastAddress : address;
    lastAddress = addr;
    it(`${key}: date, time, venue, address and UTC start`, () => {
      const fact = RAW.facts.events[key];
      const en = RAW.variants.en.G.events[key];
      expect(date).toBe(fact.date_iso);
      expect(date.startsWith(RAW.facts.year_inferred)).toBe(true);
      expect(time).toBe(fact.time_24h);
      expect(venue).toBe(en.venue_name_full);
      expect(addr).toBe(en.venue_address);
      const computed = new Date(`${date}T${time}:00+05:30`).toISOString().replace('.000', '');
      expect(utc).toBe(computed);
      expect(EVENT_FACTS[key].startUtc).toBe(computed);
    });
  }

  it('states no end time (none exists in content.json)', () => {
    for (const e of Object.values(RAW.facts.events) as Record<string, unknown>[]) {
      expect(Object.keys(e).some((k) => /end/i.test(k))).toBe(false);
    }
    expect(config.calendar.durationMinutes).toBeNull();
  });
});

describe('0.2 binding rules on the rendered page, 4 languages x 4 variants', () => {
  for (const lang of LANGS) {
    for (const vk of VARIANTS) {
      const url = `/${lang}/${QUERY[vk]}`;
      it(`${url}: facts, order, reception, nothing invented, no fish, no third-party request`, () => {
        renderAt(url);
        const V = FILES[lang].variants[vk];
        const body = norm(document.body.textContent ?? '');

        // rule 1: every event fact of this variant is on the page, exactly as generated from content.json
        for (const e of V.events) {
          const section = document.getElementById(e.key);
          expect(section, `#${e.key}`).not.toBeNull();
          const text = norm(section!.textContent ?? '');
          for (const part of [e.title, e.time, e.venue, ...e.address]) expect(text).toContain(norm(part));
        }
        // rule 1: nothing invented: no phone-like numbers, no hashtags, no RSVP while it is off
        const digits = toLatinDigits(body);
        expect(digits).not.toMatch(/(?:\d[\s\-.]?){10,}/);
        expect(body).not.toMatch(/(^|\s)#[\p{L}\p{N}_]+/u);
        if (config.rsvp.url === null) expect(body).not.toMatch(/\bRSVP\b/i);

        // rule 2: no fish, in any script
        expect(body.toLowerCase()).not.toMatch(/fish|matsya|मछली|मत्स्य|माछ|মাছ|মৎস্য/);

        // rule 3: order (monogram, the pair, the hosting family first in the closing)
        const order = vk[0];
        expect(document.querySelector('#opening .monogram__text')?.textContent).toBe(order === 'G' ? 'AS' : 'SA');
        const pair = norm(document.querySelector('#opening .t-pair')?.textContent ?? '');
        expect(pair.indexOf(norm(V.pair.first))).toBe(0);
        expect(pair.indexOf(norm(V.pair.second))).toBeGreaterThan(0);
        expect(V.names.first.role).toBe(order === 'G' ? 'groom' : 'bride');
        const closing = norm(document.getElementById('closing')?.textContent ?? '');
        const [host, , guest] = V.closing.families.map(norm) as [string, string, string];
        const hostFamily = order === 'G' ? /Jha|झा|ঝা/ : /Sil|सील|শীল/;
        expect(host).toMatch(hostFamily);
        expect(guest).not.toMatch(hostFamily);
        const at = closing.indexOf(host);
        expect(at).toBeGreaterThanOrEqual(0);
        expect(closing.indexOf(guest, at + host.length)).toBeGreaterThan(at);

        // rule 4: reception=0 removes the Reception, its venue and its city; the default shows all five
        const withRec = FILES[lang].variants[`${order}1` as VariantKey];
        const rec = withRec.events.find((e) => e.key === 'reception')!;
        if (vk[1] === '0') {
          expect(document.getElementById('reception')).toBeNull();
          expect(body).not.toContain(norm(rec.venue));
          expect(body).not.toContain(norm(withRec.cities[1]!));
          expect(V.events).toHaveLength(4);
        } else {
          expect(document.getElementById('reception')).not.toBeNull();
          expect(V.events).toHaveLength(5);
        }

        // rule 5: no third-party request: every absolute URL in the DOM is a click-only link to an allowed host
        for (const el of Array.from(document.querySelectorAll('*'))) {
          for (const attr of ['src', 'srcset', 'href', 'poster', 'data', 'action', 'style', 'xlink:href']) {
            const v = el.getAttribute(attr);
            if (!v || !/(?:https?:)?\/\//.test(v)) continue;
            if (el.namespaceURI === 'http://www.w3.org/2000/svg' && attr !== 'href' && attr !== 'xlink:href') continue;
            expect(el.tagName, `${el.tagName} ${attr}=${v}`).toBe('A');
            expect(attr).toBe('href');
            const host = new URL(v, 'https://site.invalid/').host;
            expect(['www.google.com', 'calendar.google.com', 'maps.google.com'], v).toContain(host);
            expect(el.getAttribute('rel') ?? '').toContain('noopener');
          }
        }
      });
    }
  }
});

describe('0.2 binding rules in the source tree', () => {
  const shipped = readAll(
    import.meta.glob([
      '/index.html',
      '/src/**/*.{ts,tsx,css,svg,json,html}',
      '/public/**/*.{js,html,txt,svg,json,webmanifest}',
      '/public/_redirects',
    ]),
  );

  it('rule 2: no fish in any shipped file, motif id or asset name', () => {
    expect(shipped.length).toBeGreaterThan(20);
    const assetNames = Object.keys(import.meta.glob(['/src/assets/**/*', '/public/**/*']));
    for (const name of assetNames) expect(name.toLowerCase()).not.toMatch(/fish|matsya|machh/);
    for (const [path, src] of shipped) {
      expect(src.toLowerCase(), path).not.toMatch(/\bfish|matsya|मछली|मत्स्य|माछ|মাছ|মৎস্য/);
    }
  });

  it('rule 5: shipped code loads nothing from another origin (no CDN fonts, analytics, embeds)', () => {
    const allowed = new Set(['www.w3.org', 'www.google.com', 'calendar.google.com', 'example.com']);
    for (const [path, src] of shipped) {
      for (const m of src.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
        expect(allowed.has(m[1]!.toLowerCase()), `${path}: ${m[0]}`).toBe(true);
      }
      expect(src, path).not.toMatch(/@import\s+url\(\s*['"]?https?:/i);
      expect(src, path).not.toMatch(/<(?:script|link|iframe)[^>]+(?:src|href)=["']https?:/i);
      expect(src, path).not.toMatch(/googletagmanager|google-analytics|gtag\(|plausible|segment\.io|hotjar/i);
    }
  });

  it('rule 5: robots noindex by default', () => {
    expect(config.seo.indexable).toBe(false);
  });

  it('rule 6: node_modules and dist never enter the repo', () => {
    const lines = gitignore.split('\n').map((l) => l.trim());
    for (const entry of ['node_modules/', 'dist/', 'dist-ssr/']) expect(lines).toContain(entry);
  });

  it('rule 7: inclusive language in code, copy and docs', () => {
    const docs = readAll(
      import.meta.glob([
        '/src/**/*.{ts,tsx,css,json,md}',
        '/scripts/**/*.{mjs,mts,sh}',
        '/tests/**/*.{ts,tsx}',
        '/tools/**/*.{mjs,js,html,md}',
        '!/tools/**/node_modules/**',
        '/docs/*.md',
        '/content/*.{md,json}',
        '/README.md',
        '/index.html',
      ]),
    );
    // the terms are assembled so that this file does not contain them
    const terms = ['mas' + 'ter', 'sla' + 've', 'white' + 'list', 'black' + 'list', 'white' + 'day', 'black' + 'day'];
    const re = new RegExp(`\\b(?:${terms.join('|')})s?\\b`, 'i');
    for (const [path, src] of docs) expect(re.exec(src)?.[0], path).toBeUndefined();
  });
});

describe('0.4 decisions at a glance', () => {
  const deps = pkg.dependencies as Record<string, string>;
  const dev = pkg.devDependencies as Record<string, string>;

  it('stack: React 18.3, react-router-dom 6.28, Vite 5, TypeScript 5, and nothing else at runtime', () => {
    expect(Object.keys(deps).sort()).toEqual(['react', 'react-dom', 'react-router-dom']);
    expect(deps.react).toMatch(/^\^?18\.3\./);
    expect(deps['react-dom']).toMatch(/^\^?18\.3\./);
    expect(deps['react-router-dom']).toMatch(/^\^?6\.28\./);
    expect(dev.vite).toMatch(/^\^?5\./);
    expect(dev.typescript).toMatch(/^\^?5\./);
  });

  it('animation: no animation library or UI kit anywhere in the dependency list', () => {
    const banned = [
      'framer-motion',
      'motion',
      'gsap',
      'react-spring',
      '@react-spring/web',
      'animejs',
      'lottie-web',
      'lenis',
      'locomotive-scroll',
      '@mui/material',
      'antd',
      '@chakra-ui/react',
      'bootstrap',
      'tailwindcss',
      'styled-components',
      '@emotion/react',
    ];
    for (const name of banned) {
      expect(deps[name], name).toBeUndefined();
      expect(dev[name], name).toBeUndefined();
    }
  });

  it('painted backgrounds are pre-rendered images; the browser never loads the paint library', () => {
    const plates = Object.keys(import.meta.glob('/src/assets/plates/**/*.{avif,webp}'));
    expect(plates.length).toBeGreaterThan(0);
    const code = readAll(import.meta.glob('/src/**/*.{ts,tsx}'));
    for (const [path, src] of code) expect(src, path).not.toMatch(/paint\/paint\.js|engine\/lib|WeddingInvite2/);
  });

  it('rendering: a prerender step writes one HTML per language', () => {
    expect(Object.keys(import.meta.glob('/scripts/prerender.mjs'))).toHaveLength(1);
    expect(pkg.scripts.build).toContain('prerender');
  });

  it('i18n: four generated language files, each with the four variants', () => {
    for (const lang of LANGS) expect(Object.keys(FILES[lang].variants).sort()).toEqual(['B0', 'B1', 'G0', 'G1']);
  });

  it('fonts: self-hosted woff2 only, no Tirhuta font shipped', () => {
    const fonts = Object.keys(import.meta.glob('/src/assets/fonts/**/*.{woff2,woff,ttf,otf}'));
    expect(fonts.length).toBeGreaterThan(0);
    for (const f of fonts) {
      expect(f).toMatch(/\.woff2$/);
      expect(f.toLowerCase()).not.toMatch(/tirh/);
    }
  });

  it('Tirhuta: the Mithilakshar flourish is an SVG of outlines, not live text', () => {
    expect(tirhutaSvg).toMatch(/<path\b/);
    expect(tirhutaSvg).not.toMatch(/<text\b/);
    expect(tirhutaSvg).toContain('aria-hidden="true"');
  });

  it('optional modules: RSVP, music and gallery are off by default', () => {
    expect(config.rsvp.url).toBeNull();
    expect(config.music.src).toBeNull();
    expect(config.gallery).toHaveLength(0);
  });
});
