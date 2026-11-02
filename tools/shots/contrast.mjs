#!/usr/bin/env node
// G-A11Y-2 (spec 6.1, 8.0): the contrast of every text block against the real pixels behind it. Per screen: one
// screenshot as is, one with all text made transparent; the pixels that differ are the glyphs. The block's contrast is
// the 80th percentile of the per-pixel WCAG ratio (glyph pixel vs the same pixel without text) over its glyph pixels,
// so anti-aliased edges do not drag it down and gradients (gold leaf), shadows and plates are measured as rendered.
// Required: 4.5:1 below 24 px (18.66 px bold), 3:1 above. Exit code 1 when anything fails.
//   node tools/shots/contrast.mjs [--langs en,bn] [--variants G1,B1] [--viewports 390x844,1440x900] [--base URL]
import fs from 'node:fs';
import path from 'node:path';
import { args, baseUrl, launchChromium, openPage, outDir, variantQuery, viewport } from './lib.mjs';

const a = args();
const list = (v, d) => (v && v !== true ? String(v).split(',') : d);
const langs = list(a.langs, ['en', 'hi', 'mai', 'bn']);
const variants = list(a.variants, ['G1', 'G0', 'B1', 'B0']);
const viewports = list(a.viewports, ['390x844', '1440x900']);
const out = outDir(a, 'contrast');

const HIDE = `*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important;
  text-shadow: none !important; caret-color: transparent !important; text-decoration-color: transparent !important; }`;

/** Text blocks fully inside the viewport: rect, size class, sample text. */
function blocks() {
  const out = [];
  const seen = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const el = n.parentElement;
    const text = (n.textContent ?? '').trim();
    if (!el || !text || seen.has(el) || el.closest('.sr-only, [hidden], #section-nav[hidden], noscript, script, style')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.1) continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 2 && r.height > 2);
    if (!rects.length) continue;
    const l = Math.min(...rects.map((r) => r.left));
    const t = Math.min(...rects.map((r) => r.top));
    const r = Math.max(...rects.map((x) => x.right));
    const b = Math.max(...rects.map((x) => x.bottom));
    if (l < 0 || t < 0 || r > innerWidth || b > innerHeight) continue;
    seen.add(el);
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    out.push({
      l, t, r, b,
      large: size >= 24 || (bold && size >= 18.66),
      size,
      text: text.slice(0, 40),
      where: `${el.closest('section, footer')?.id ?? (el.closest('header') ? 'bar' : '?')} ${el.tagName.toLowerCase()}.${el.classList[0] ?? ''}`,
    });
  }
  return out;
}

/** Runs in a blank page: decode both PNGs, measure each block. */
async function measure({ shown, hidden, boxes, dpr }) {
  const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
  const [A, B] = await Promise.all([load(shown), load(hidden)]);
  const px = (img) => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, c.width, c.height);
  };
  const a = px(A);
  const b = px(B);
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (d, i) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
  return boxes.map((box) => {
    const ratios = [];
    const x0 = Math.max(0, Math.floor(box.l * dpr)), x1 = Math.min(a.width, Math.ceil(box.r * dpr));
    const y0 = Math.max(0, Math.floor(box.t * dpr)), y1 = Math.min(a.height, Math.ceil(box.b * dpr));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * a.width + x) * 4;
        const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
        if (d < 48) continue; // not a glyph pixel (or a faint edge)
        const l1 = lum(a.data, i), l2 = lum(b.data, i);
        ratios.push((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
      }
    }
    ratios.sort((p, q) => p - q);
    const ratio = ratios.length ? ratios[Math.floor(ratios.length * 0.8)] : null;
    return { ...box, ratio, glyphPixels: ratios.length };
  });
}

const { base, stop } = await baseUrl(a);
const { browser } = await launchChromium();
const results = [];
try {
  const blank = await browser.newPage();
  for (const lang of langs) {
    for (const key of variants) {
      for (const vpName of viewports) {
        const vp = viewport(vpName);
        // 2x: thin strokes of 15 px Devanagari need real core pixels, else anti-aliasing reads as low contrast
        const dpr = Number(a.dpr ?? 2);
        const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
        const page = await ctx.newPage();
        await openPage(page, `${base}/${lang}/${variantQuery(key)}`);
        const h = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < h; y += Math.round(vp.height * 0.75)) {
          await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
          await page.waitForTimeout(250);
          const boxes = await page.evaluate(blocks);
          if (!boxes.length) continue;
          const shown = (await page.screenshot()).toString('base64');
          const style = await page.addStyleTag({ content: HIDE });
          await page.waitForTimeout(30);
          const hidden = (await page.screenshot()).toString('base64');
          await style.evaluate((s) => s.remove());
          const m = await blank.evaluate(measure, { shown: `data:image/png;base64,${shown}`, hidden: `data:image/png;base64,${hidden}`, boxes, dpr });
          for (const r of m) results.push({ lang, key, vp: vpName, scrollY: y, ...r, need: r.large ? 3 : 4.5 });
        }
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
  stop();
}
// one result per (variant, viewport, text): the worst sample
const worst = new Map();
for (const r of results) {
  if (r.ratio === null) continue;
  const k = `${r.lang}|${r.key}|${r.vp}|${r.where}|${r.text}`;
  if (!worst.has(k) || worst.get(k).ratio > r.ratio) worst.set(k, r);
}
const all = [...worst.values()];
const fails = all.filter((r) => r.ratio < r.need);
fs.writeFileSync(path.join(out, 'contrast.json'), JSON.stringify(all, null, 1));
const fmt = (r) => `${r.lang} ${r.key} ${r.vp} ${r.where} "${r.text}" ${r.ratio.toFixed(2)}:1 (need ${r.need}, ${r.size}px)`;
console.log(`contrast: ${all.length} text blocks measured, ${fails.length} below the line; details ${path.join(out, 'contrast.json')}`);
const lowest = [...all].sort((p, q) => p.ratio / p.need - q.ratio / q.need).slice(0, 12);
console.log('lowest margins:\n  ' + lowest.map(fmt).join('\n  '));
if (fails.length) {
  console.log('FAIL:\n  ' + fails.map(fmt).join('\n  '));
  process.exitCode = 1;
}
