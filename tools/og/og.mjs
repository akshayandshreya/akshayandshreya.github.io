#!/usr/bin/env node
// Link-preview images and icons (SPEC 6.2, 6.5): screenshots of tools/og/og.html in headless Chromium.
//   public/og/og-<lang>.jpg      1200 x 630, <= 250 KB: the wide opening plate + gold, Ganesh, the heading in gold
//                                leaf, the pair and the dateline in that language (G1, the default preview)
//   public/og/og-<lang>-<slug>.jpg  the same for the variant pages /<lang>/b/ (bride first), /k/ (Kolkata only, no
//                                Reception) and /bk/ (both): their names in order, their dates and cities (QA r1 T1)
//   node tools/og/og.mjs [--previews-only]   (--previews-only: the 16 cards, not the icons)
//   public/favicon.svg           ivory disc, gold ring, Pinyon "AS" (vector, ~3 KB)
//   public/apple-touch-icon.png  180 x 180;  public/icon-512.png 512 x 512 (painted medallion)
// Needs the plates, sprites, motifs, fonts and glyphs already exported (run after export.mjs, optimize.mjs,
// subset-fonts.mjs and tirhuta.mjs).   node tools/og/og.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { REPO, PUBLIC, ASSETS, launch, serve, ORIGIN, mkdirp, kb } from '../lib/browser.mjs';

const LANGS = ['en', 'hi', 'mai', 'bn'];
const VARIANTS = [['G1', ''], ['B1', 'b'], ['G0', 'k'], ['B0', 'bk']];
const PREVIEWS_ONLY = process.argv.includes('--previews-only');
mkdirp(path.join(PUBLIC, 'og'));
const browser = await launch();
const shot = async (q, sel, w, h) => {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await serve(context, { '/content/': path.join(REPO, 'content'), '/i18n/': path.join(REPO, 'src', 'i18n') });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push(e.message));
  await page.goto(`${ORIGIN}/tools/og/og.html?${q}`);
  await page.waitForFunction(() => window.__READY === true, null, { timeout: 60000 });
  const buf = await page.locator(sel).screenshot({ type: 'png' });
  if (logs.length) console.warn(q, logs.join('\n'));
  await context.close();
  return buf;
};
const report = {};
for (const lang of LANGS) {
  for (const [variant, slug] of VARIANTS) {
    const png = await shot(`lang=${lang}&variant=${variant}&mode=og`, '#card', 1200, 630);
    let q = 86, jpg;
    do { jpg = await sharp(png).jpeg({ quality: q, mozjpeg: true, chromaSubsampling: '4:2:0' }).toBuffer(); q -= 4; } while (jpg.length > 250 * 1024 && q > 60);
    const name = `og-${lang}${slug ? `-${slug}` : ''}.jpg`;
    fs.writeFileSync(path.join(PUBLIC, 'og', name), jpg);
    report[name] = jpg.length;
    console.log(`${name}: ${kb(jpg.length)} (q ${q + 4})`);
  }
}
if (!PREVIEWS_ONLY) {
  const png = await shot('mode=icon', '#icon', 512, 512);
  fs.writeFileSync(path.join(PUBLIC, 'icon-512.png'), await sharp(png).png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 }).toBuffer());
  fs.writeFileSync(path.join(PUBLIC, 'apple-touch-icon.png'), await sharp(png).resize(180, 180, { kernel: 'lanczos3' }).png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 }).toBuffer());
  console.log('icon-512.png, apple-touch-icon.png');
}
if (!PREVIEWS_ONLY) {
  // favicon.svg: vector medallion (no plate): ivory disc, gold ring with its gap and bindu, the AS monogram
  const mono = fs.readFileSync(path.join(ASSETS, 'glyphs', 'monogram-AS.svg'), 'utf8');
  const vb = mono.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const inner = mono.replace(/^[\s\S]*?<g fill="currentColor">/, '').replace(/<\/g><\/svg>\s*$/, '');
  // the monogram fills most of the ring and carries a hairline outline in its own ink: Pinyon's strokes are too thin
  // to read at 16-32 px tab sizes otherwise (2026-11-02 integration check)
  const s = 40 / Math.max(vb[2], vb[3] * 1.1), r = 26, cx = 32, cy = 32, gap = 14, weight = 0.9;
  const pt = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)].map((v) => +v.toFixed(2));
  const [x0, y0] = pt(90), [xl, yl] = pt(270 - gap / 2), [xr, yr] = pt(-90 + gap / 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8c6526"/><stop offset=".5" stop-color="#bf9644"/><stop offset="1" stop-color="#8c6526"/></linearGradient></defs><circle cx="32" cy="32" r="31" fill="#f2e8d8"/><path d="M${x0} ${y0}A${r} ${r} 0 0 1 ${xl} ${yl}M${x0} ${y0}A${r} ${r} 0 0 0 ${xr} ${yr}" fill="none" stroke="url(#g)" stroke-width="2.4" stroke-linecap="round"/><circle cx="32" cy="${cy - r}" r="2.2" fill="#d1a24a"/><g transform="translate(${(32 - (vb[0] + vb[2] / 2) * s).toFixed(2)} ${(33 - (vb[1] + vb[3] / 2) * s).toFixed(2)}) scale(${s.toFixed(5)})" fill="#7e5a22" stroke="#7e5a22" stroke-width="${(weight / s).toFixed(1)}" stroke-linejoin="round">${inner}</g></svg>\n`;
  fs.writeFileSync(path.join(PUBLIC, 'favicon.svg'), svg);
  console.log(`favicon.svg: ${svg.length} B`);
}
await browser.close();
