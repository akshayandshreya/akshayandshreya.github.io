// Plate contrast audit (SPEC 1.2.1, 6.1, G-A11Y-2 at the asset level). For every plate x frame: decode the largest
// base AVIF, composite the gold layer and the veil at rest (the pixels a visitor actually sees behind text), take the
// pixels of each calm zone (plates.meta.json: where text and the couple sit) and measure the section palette's text inks
// (--ink, --ink-soft, --gold-ink from src/styles/palettes.css) against the worst pixels: the 5th percentile by
// luminance for dark inks, the 95th for light inks. WCAG 2.x ratio; AA needs 4.5 for small text, 3 for large.
//
//   node plates/contrast.mjs [--strict] [--json /work/contrast.json]       (from tools/, dev desktop Docker)
//
// Report only by default; --strict exits 1 when an ink falls below 4.5 in any calm zone. The DOM-level check (every
// rendered text box against the pixels behind it) is the QA tool tools/shots/contrast.mjs (spec 8.10).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSETS = path.join(REPO, 'src', 'assets');
const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const JSON_OUT = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

// ---- colour maths
const hexRgb = (h) => {
  const s = h.replace('#', '');
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
};
const lin = (c) => {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
export const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/** `.pal-name { --ink: #...; }` blocks -> { name: { ink, inkSoft, goldInk } } (first definition of each class wins). */
export function parsePalettes(css) {
  const out = {};
  for (const m of css.matchAll(/\.pal-([a-z-]+)\s*{([^}]*)}/g)) {
    const [, name, body] = m;
    if (out[name]) continue;
    const get = (p) => new RegExp(`--${p}\\s*:\\s*(#[0-9a-fA-F]{3,6})\\b`).exec(body)?.[1];
    const ink = get('ink');
    if (!ink) continue;
    out[name] = { ink, inkSoft: get('ink-soft'), goldInk: get('gold-ink') };
  }
  return out;
}

/** Is pixel (px, py) of a W x H frame inside a calm zone ({x, y, r} circle of min(W,H) or {x, y, rx, ry} ellipse)? */
export function inZone(z, px, py, W, H) {
  const dx = px / W - z.x;
  const dy = py / H - z.y;
  if (z.r !== undefined) {
    const r = z.r * Math.min(W, H);
    return (dx * W) ** 2 + (dy * H) ** 2 <= r * r;
  }
  return (dx / z.rx) ** 2 + (dy / z.ry) ** 2 <= 1;
}

const PALETTE_CLASS = { 'teal-evening': 'teal' };

async function frameRgb(plateId, frame, f) {
  const widths = Object.keys(f.base.avif).map(Number).sort((a, b) => b - a);
  const W = widths[0];
  const H = f.height?.[W] ?? Math.round((W * f.H) / f.W);
  const layers = [];
  for (const layer of [f.gold?.file, f.veil?.file]) {
    if (layer && fs.existsSync(path.join(ASSETS, layer))) {
      layers.push({ input: await sharp(path.join(ASSETS, layer)).resize(W, H, { fit: 'fill' }).png().toBuffer() });
    }
  }
  const { data, info } = await sharp(path.join(ASSETS, f.base.avif[W]))
    .resize(W, H, { fit: 'fill' })
    .composite(layers)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height, id: `${plateId}/${frame}` };
}

async function main() {
  const meta = JSON.parse(fs.readFileSync(path.join(ASSETS, 'plates.meta.json'), 'utf8'));
  const palettes = parsePalettes(fs.readFileSync(path.join(REPO, 'src', 'styles', 'palettes.css'), 'utf8'));
  const rows = [];
  for (const [plateId, plate] of Object.entries(meta.plates)) {
    const cls = PALETTE_CLASS[plate.palette] ?? plate.palette;
    const pal = palettes[cls];
    if (!pal) {
      console.warn(`contrast: no .pal-${cls} in palettes.css for ${plateId}`);
      continue;
    }
    for (const [frame, f] of Object.entries(plate.frames)) {
      const { data, W, H } = await frameRgb(plateId, frame, f);
      (f.calm ?? []).forEach((z, zi) => {
        const px = [];
        const step = Math.max(1, Math.round(Math.sqrt((W * H) / 400000)));
        for (let y = 0; y < H; y += step) {
          for (let x = 0; x < W; x += step) {
            if (!inZone(z, x, y, W, H)) continue;
            const i = (y * W + x) * 3;
            px.push([data[i], data[i + 1], data[i + 2]]);
          }
        }
        if (!px.length) return;
        px.sort((a, b) => luminance(a) - luminance(b));
        const dark = px[Math.floor(px.length * 0.05)];
        const light = px[Math.floor(px.length * 0.95)];
        const ratios = {};
        for (const [k, hex] of Object.entries(pal)) {
          if (!hex) continue;
          const ink = hexRgb(hex);
          // a dark ink is limited by the lightest background pixels, a light ink by the darkest
          const worstBg = luminance(ink) < 0.5 * (luminance(dark) + luminance(light)) ? light : dark;
          ratios[k] = +contrast(ink, worstBg).toFixed(2);
        }
        rows.push({ plate: plateId, frame, zone: zi, palette: cls, n: px.length, p5: dark, p95: light, ...ratios });
      });
    }
  }
  const fmt = (v) => (v === undefined ? '  -  ' : `${v < 4.5 ? '!' : ' '}${v.toFixed(2)}`);
  console.log('plate        frame zone palette     ink    ink-soft gold-ink   bg p5 .. p95');
  for (const r of rows) {
    console.log(
      `${r.plate.padEnd(12)} ${r.frame.padEnd(5)} ${String(r.zone).padEnd(4)} ${r.palette.padEnd(10)} ${fmt(r.ink)} ${fmt(r.inkSoft)} ${fmt(r.goldInk)}   rgb(${r.p5}) .. rgb(${r.p95})`,
    );
  }
  const worst = (k) => rows.reduce((m, r) => (r[k] !== undefined && r[k] < m.v ? { v: r[k], r } : m), { v: Infinity, r: null });
  for (const k of ['ink', 'inkSoft', 'goldInk']) {
    const w = worst(k);
    if (w.r) console.log(`worst ${k}: ${w.v} (${w.r.plate}/${w.r.frame} zone ${w.r.zone})`);
  }
  const below = rows.filter((r) => ['ink', 'inkSoft', 'goldInk'].some((k) => r[k] !== undefined && r[k] < 4.5));
  console.log(`contrast: ${rows.length} calm zones, ${below.length} with an ink below 4.5:1 (! marks; >= 3 is still AA for large text)`);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(rows, null, 1));
  if (STRICT && below.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
