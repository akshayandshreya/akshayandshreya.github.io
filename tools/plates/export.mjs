#!/usr/bin/env node
// Asset export: paints the plates and sprites in headless Chromium with the invitation engine's paint library
// (tools/plates/plates.html), encodes them with sharp (AVIF + WebP, Lanczos3 downscales from the largest render) and
// writes src/assets/{plates,sprites,textures}/ plus the manifests src/assets/plates.json and src/assets/sprites.json.
//
//   node tools/plates/export.mjs plates [id,id] [--frames tall,mid,wide] [--jobs 4]
//   node tools/plates/export.mjs sprites | textures | all
//   node tools/plates/export.mjs sprites --motifs ghost-aripan[,id]   only those painted motifs (the rest of
//                                    sprites.json, the couples, bamboo and dabs are kept as they are)
//
// Runs on the dev desktop in Docker (SPEC 9.2). Lossless renders are kept only when KEEP_PNG=/dir is set (never in
// the repo). Deterministic: every painting is seeded (paintcpu=1 = the bit-exact CPU canvas path).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ASSETS, requireInvite, launch, openPage, dataUrlToBuffer, mkdirp, rel, kb } from '../lib/browser.mjs';

const argv = process.argv.slice(2);
const what = argv[0] || 'all';
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const onlyIds = argv[1] && !argv[1].startsWith('--') ? argv[1].split(',') : null;
const FRAMES_SEL = opt('frames', 'tall,mid,wide').split(',');
const JOBS = Number(opt('jobs', 4));
const KEEP = process.env.KEEP_PNG || null;

const PLATE_IDS = ['opening', 'invitation', 'mehndi', 'engagement', 'haldi', 'wedding', 'reception', 'cultures', 'closing'];
const FRAMES = {
  tall: { W: 1080, H: 2340, widths: [540, 828, 1170], gold: 1170, media: '(max-aspect-ratio: 3/5)' },
  mid: { W: 1080, H: 1350, widths: [768, 1152, 1536], gold: 1152, media: '(min-aspect-ratio: 3/5) and (max-aspect-ratio: 5/4)' },
  wide: { W: 1920, H: 1080, widths: [1280, 1920, 2560], gold: 1920, media: '(min-aspect-ratio: 5/4)' },
};
const FOCAL = { opening: '50% 30%', closing: '50% 70%' };

const AVIF = { quality: 50, effort: 6, chromaSubsampling: '4:2:0' };
const WEBP = { quality: 72, effort: 6 };
const WEBP_ALPHA = { quality: 78, alphaQuality: 85, effort: 6 };
const LANCZOS = { kernel: 'lanczos3' };

const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const writeJson = (f, o, min) => fs.writeFileSync(f, (min ? JSON.stringify(o) : JSON.stringify(o, null, 1)) + '\n');
async function write(file, buf) { mkdirp(path.dirname(file)); fs.writeFileSync(file, buf); return { file: rel(file), bytes: buf.length }; }
async function lqip(input, w = 16) {
  const b = await sharp(input).resize({ width: w, ...LANCZOS }).webp({ quality: 40, alphaQuality: 50, effort: 6 }).toBuffer();
  return 'data:image/webp;base64,' + b.toString('base64');
}
function keep(name, buf) { if (KEEP) { mkdirp(KEEP); fs.writeFileSync(path.join(KEEP, name), buf); } }

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

/* ------------------------------------------------------------------------------------------------- plates */
async function plates(browser) {
  const ids = onlyIds || PLATE_IDS;
  const jobs = ids.flatMap((id) => FRAMES_SEL.map((f) => ({ id, f })));
  // plates.meta.json: everything (bytes, calm zones, ...), for tools and the budget report; plates.json: the minified
  // runtime subset the site imports (file names, sizes, LQIP, focal point, palette, glow, live-stroke placement)
  const manFile = path.join(ASSETS, 'plates.meta.json');
  const man = readJson(manFile, { schema: 1, frames: {}, plates: {} });
  for (const [k, F] of Object.entries(FRAMES)) man.frames[k] = { W: F.W, H: F.H, media: F.media, widths: F.widths };
  const pages = await Promise.all(Array.from({ length: Math.min(JOBS, jobs.length) }, () => openPage(browser, '/tools/plates/plates.html?paintcpu=1')));
  let next = 0;
  const results = [];
  await Promise.all(pages.map(async ({ page, logs }) => {
    while (next < jobs.length) {
      const { id, f } = jobs[next++];
      const F = FRAMES[f], maxW = F.widths[F.widths.length - 1];
      const t0 = Date.now();
      const r = await page.evaluate(([a, b, c]) => window.PLATES.paint(a, b, c), [id, f, maxW]);
      const dir = path.join(ASSETS, 'plates', id);
      const basePng = dataUrlToBuffer(r.base);
      keep(`${id}-${f}-${maxW}.png`, basePng);
      const entry = { W: F.W, H: F.H, base: { avif: {}, webp: {} }, bytes: { avif: {}, webp: {} } };
      for (const w of F.widths) {
        const img = sharp(basePng).resize({ width: w, ...LANCZOS });
        const a = await write(path.join(dir, `${f}-${w}.avif`), await img.clone().avif(AVIF).toBuffer());
        const wb = await write(path.join(dir, `${f}-${w}.webp`), await img.clone().webp(WEBP).toBuffer());
        entry.base.avif[w] = a.file; entry.base.webp[w] = wb.file; entry.bytes.avif[w] = a.bytes; entry.bytes.webp[w] = wb.bytes;
      }
      entry.height = Object.fromEntries(F.widths.map((w) => [w, Math.round((w * F.H) / F.W)]));
      entry.lqip = await lqip(basePng);
      if (r.gold) {
        const g = await write(path.join(dir, `${f}-gold.webp`), await sharp(dataUrlToBuffer(r.gold)).resize({ width: F.gold, ...LANCZOS }).webp({ quality: 80, alphaQuality: 80, effort: 6 }).toBuffer());
        entry.gold = { file: g.file, width: F.gold, bytes: g.bytes };
      }
      const vbuf = dataUrlToBuffer(r.veil), vmeta = await sharp(vbuf).metadata();
      const v = await write(path.join(dir, `${f}-veil.webp`), await sharp(vbuf).webp({ quality: 62, alphaQuality: 62, effort: 6 }).toBuffer());
      entry.veil = { file: v.file, width: vmeta.width, height: vmeta.height, bytes: v.bytes };
      const sbuf = dataUrlToBuffer(r.strokes), smeta = await sharp(sbuf).metadata();
      const s = await write(path.join(dir, `${f}-strokes.webp`), await sharp(sbuf).webp({ quality: 75, alphaQuality: 80, effort: 6 }).toBuffer());
      entry.strokes = { file: s.file, width: smeta.width, height: smeta.height, bytes: s.bytes, scale: r.strokeScale, items: r.strokeMeta };
      entry.calm = r.calm; entry.glow = r.glow; entry.couple = r.couple; entry.floor = r.floor;
      man.plates[id] ??= {};
      Object.assign(man.plates[id], { palette: r.palette, paper: r.paper, groundMid: r.groundMid, deep: r.deep, focal: FOCAL[id] || '50% 45%' });
      man.plates[id].frames ??= {};
      man.plates[id].frames[f] = entry;
      results.push({ id, f, paintMs: r.ms, ms: Date.now() - t0, avif: entry.bytes.avif[maxW], webp: entry.bytes.webp[maxW], gold: entry.gold?.bytes, veil: v.bytes });
      console.log(`${id}/${f}: paint ${r.ms} ms, total ${Date.now() - t0} ms; ${maxW}w avif ${kb(entry.bytes.avif[maxW])} webp ${kb(entry.bytes.webp[maxW])}; gold ${entry.gold ? kb(entry.gold.bytes) : '-'}; veil ${kb(v.bytes)}; strokes ${kb(s.bytes)}`);
      if (logs.length) { console.warn(logs.join('\n')); logs.length = 0; }
    }
  }));
  for (const p of pages) await p.context.close();
  // stable key order
  man.plates = Object.fromEntries(PLATE_IDS.filter((k) => man.plates[k]).map((k) => [k, man.plates[k]]));
  writeJson(manFile, man);
  const rt = { schema: 1, frames: man.frames, plates: {} };
  for (const [id, p] of Object.entries(man.plates)) {
    rt.plates[id] = { palette: p.palette, paper: p.paper, groundMid: p.groundMid, deep: p.deep, focal: p.focal, frames: {} };
    for (const [f, e] of Object.entries(p.frames)) {
      rt.plates[id].frames[f] = { W: e.W, H: e.H, avif: e.base.avif, webp: e.base.webp, lqip: e.lqip, gold: e.gold?.file ?? null, veil: e.veil.file,
        strokes: { file: e.strokes.file, width: e.strokes.width, height: e.strokes.height, items: e.strokes.items }, glow: e.glow, couple: e.couple, floor: e.floor };
    }
  }
  fs.writeFileSync(path.join(ASSETS, 'plates.json'), JSON.stringify(rt) + '\n');
  return results;
}

/* ------------------------------------------------------------------------------------------------ sprites */
const MOTIF_VARS = {
  ivory: { '--m-ink': '#a07a34' },
  mehndi: { '--m-ink': '#4f5b3c', '--m-marigold': '#d39a4f', '--m-marigold-hi': '#e9c27f', '--m-marigold-sh': '#a46a35', '--m-leaf': '#8b9a6b', '--m-leaf-hi': '#b9c398', '--m-leaf-sh': '#5d6b47', '--m-thread': '#9a5a40' },
  engagement: { '--m-ink': '#5e3a4a', '--m-petal': '#c9a2b4', '--m-leaf': '#9ba68c', '--m-leaf-hi': '#c4cab2', '--m-leaf-sh': '#6f7a64', '--m-marigold': '#cf9d92', '--m-marigold-hi': '#ead0c7', '--m-marigold-sh': '#a3716c', '--m-thread': '#9b6a7e' },
  haldi: { '--m-ink': '#7a4a1c', '--m-gold': '#c99a3a', '--m-leaf': '#b0a465', '--m-leaf-hi': '#d8cc98', '--m-leaf-sh': '#867845', '--m-ivory-hi': '#e2d9aa' },
  wedding: { '--m-ink': '#6e231e', '--m-gold': '#d1a24a', '--m-gold-hi': '#f0d88e', '--m-gold-sh': '#9a6a24', '--m-leaf': '#7f8c5b', '--m-leaf-hi': '#a9b382', '--m-leaf-sh': '#56603c', '--m-thread': '#e2b15a', '--m-red': '#c0473a' },
};
const SOFT = 'saturate(0.68) brightness(1.1) contrast(0.82) sepia(0.12)';
// [id, spec, sizes] (sizes are px on the spec's axis: w or h); used by SPEC 1.7 / 2.3
const MOTIFS = [
  ['opening-ganesh', { name: 'ganesh', vars: MOTIF_VARS.ivory, q: [72, 80] }, { w: [320, 560] }],
  ['invitation-kalash', { name: 'kalash', vars: MOTIF_VARS.wedding }, { h: [240] }],
  ['ghost-alpana', { name: 'alpana', hide: ['alpana-ground'], mask: true }, { w: [640, 1100] }],
  ['ghost-aripan', { name: 'aripan', hide: ['aripan-ground'], mask: true }, { w: [640] }],
  ['mehndi-marigold', { name: 'marigold_strand', vars: MOTIF_VARS.mehndi, filter: SOFT }, { h: [440, 760] }],
  ['engagement-toran', { name: 'toran', vars: MOTIF_VARS.engagement }, { w: [960, 1700] }],
  ['haldi-banana', { name: 'banana_leaf', vars: MOTIF_VARS.haldi }, { h: [520, 880] }],
  ['wedding-kalash', { name: 'kalash', vars: MOTIF_VARS.wedding }, { h: [520] }],
  ['wedding-shankha', { name: 'shankha', vars: MOTIF_VARS.wedding }, { w: [400] }],
  ['closing-diya', { name: 'diya', hide: ['diya-flame', 'diya-glow'] }, { w: [480] }],
  ['closing-diya-flame', { name: 'diya', only: ['diya-flame'] }, { w: [480] }],
  ['closing-diya-glow', { name: 'diya', only: ['diya-glow'] }, { w: [480] }],
];
const DABS = [
  ['opening-spark', 'spark', 'ivory', 64, 3612], ['mehndi-leaf', 'leaf', 'sage', 96, 3632], ['engagement-petal', 'petal', 'rose', 96, 3642],
  ['haldi-marigold', 'marigold', 'turmeric', 96, 3652], ['wedding-spark', 'spark', 'vermilion', 64, 3662], ['closing-dust', 'dust', 'ivory', 64, 3682],
];
const COUPLES = ['mehndi', 'engagement', 'haldi', 'wedding', 'reception'];
const COUPLE_H = [480, 720, 960];

async function sprites(browser) {
  const manFile = path.join(ASSETS, 'sprites.json');
  const man = readJson(manFile, { schema: 1 });
  const { page, context, logs } = await openPage(browser, '/tools/plates/plates.html?paintcpu=1');
  const out = [];
  const onlyMotifs = opt('motifs', null)?.split(',') ?? null;
  // couples
  if (!onlyMotifs) man.couples = {};
  for (const ev of onlyMotifs ? [] : COUPLES) {
    const r = await page.evaluate((e) => window.SPRITES.couple(e), ev);
    const buf = dataUrlToBuffer(r.png);
    keep(`couple-${ev}.png`, buf);
    const e = { source: r.source, aspect: +(r.width / r.height).toFixed(4), figure: r.figure, heightScale: r.heightScale, palette: r.palette, avif: {}, webp: {}, bytes: { avif: {}, webp: {} } };
    for (const h of COUPLE_H) {
      const hh = Math.min(h, r.height);
      const img = sharp(buf).resize({ height: hh, ...LANCZOS });
      const a = await write(path.join(ASSETS, 'sprites', 'couple', `${ev}-${h}h.avif`), await img.clone().avif({ quality: 55, effort: 6 }).toBuffer());
      const w = await write(path.join(ASSETS, 'sprites', 'couple', `${ev}-${h}h.webp`), await img.clone().webp({ quality: 80, alphaQuality: 90, effort: 6 }).toBuffer());
      e.avif[h] = a.file; e.webp[h] = w.file; e.bytes.avif[h] = a.bytes; e.bytes.webp[h] = w.bytes;
    }
    e.width = Object.fromEntries(COUPLE_H.map((h) => [h, Math.round(Math.min(h, r.height) * e.aspect)]));
    e.lqip = await lqip(buf, 12);
    man.couples[ev] = e;
    out.push(`couple ${ev}: ${r.width}x${r.height} -> 960h avif ${kb(e.bytes.avif[960])} webp ${kb(e.bytes.webp[960])}`);
  }
  // painted motifs
  if (!onlyMotifs) man.motifs = {};
  for (const [id, spec, sizes] of onlyMotifs ? MOTIFS.filter(([id]) => onlyMotifs.includes(id)) : MOTIFS) {
    const axis = sizes.w ? 'w' : 'h', list = sizes[axis], big = Math.max(...list);
    const r = await page.evaluate((s) => window.SPRITES.motif(s), Object.assign({}, spec, { [axis]: big * 1 }));
    const buf = dataUrlToBuffer(r.png);
    const e = { motif: spec.name, aspect: +(r.width / r.height).toFixed(4), viewBox: r.viewBox, webp: {}, bytes: {} };
    for (const s of list) {
      let src = await sharp(buf).resize(axis === 'w' ? { width: s, ...LANCZOS } : { height: s, ...LANCZOS }).png().toBuffer();
      if (spec.mask) {
        // ghosts are alpha masks (flat black RGB): the site tints them with CSS mask-image + background-color
        const m = await sharp(src).metadata();
        const alpha = await sharp(src).ensureAlpha().extractChannel(3).toBuffer();
        src = await sharp({ create: { width: m.width, height: m.height, channels: 3, background: '#000000' } }).joinChannel(alpha).png().toBuffer();
      }
      const [q, aq] = spec.mask ? [40, 60] : spec.q || [80, 90];
      const w = await write(path.join(ASSETS, 'sprites', 'motifs', `${id}-${s}${axis === 'h' ? 'h' : ''}.webp`), await sharp(src).webp({ quality: q, alphaQuality: aq, effort: 6 }).toBuffer());
      e.webp[s] = w.file; e.bytes[s] = w.bytes;
    }
    e.axis = axis === 'w' ? 'width' : 'height';
    if (spec.mask) e.mask = true;
    man.motifs[id] = e;
    out.push(`motif ${id}: ${list.map((s) => `${s}${axis} ${kb(e.bytes[s])}`).join(', ')}`);
  }
  // reception bamboo
  if (!onlyMotifs) {
    const r = await page.evaluate(() => window.SPRITES.bamboo(1.5));
    man.bamboo = {};
    for (const side of ['left', 'right']) {
      const b = r[side];
      const w = await write(path.join(ASSETS, 'sprites', 'motifs', `reception-bamboo-${side}.webp`), await sharp(dataUrlToBuffer(b.png)).webp({ quality: 75, alphaQuality: 80, effort: 6 }).toBuffer());
      man.bamboo[side] = { file: w.file, width: b.width, height: b.height, bytes: w.bytes, box: b.box, page: b.page,
        note: 'box in card units (page 1080 x 1532.4, ground line 1142); place as fractions of the frame, anchored to the floor' };
      out.push(`bamboo ${side}: ${b.width}x${b.height} ${kb(w.bytes)}`);
    }
  }
  // particle dabs
  if (!onlyMotifs) man.dabs = {};
  for (const [id, kind, pal, size, seed] of onlyMotifs ? [] : DABS) {
    const r = await page.evaluate(([k, p, s, sd]) => window.SPRITES.dabs(k, p, 6, s, sd), [kind, pal, size, seed]);
    const w = await write(path.join(ASSETS, 'sprites', `dabs-${id}.webp`), await sharp(dataUrlToBuffer(r.png)).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toBuffer());
    man.dabs[id] = { file: w.file, kind, palette: pal, n: r.n, cell: r.size, bytes: w.bytes };
    out.push(`dabs ${id}: ${kb(w.bytes)}`);
  }
  if (logs.length) console.warn(logs.join('\n'));
  await context.close();
  writeJson(manFile, man, true);
  for (const l of out) console.log(l);
}

async function textures(browser) {
  const manFile = path.join(ASSETS, 'sprites.json');
  const man = readJson(manFile, { schema: 1 });
  const { page, context, logs } = await openPage(browser, '/tools/plates/plates.html?paintcpu=1');
  const r = await page.evaluate(() => window.SPRITES.textures());
  man.textures = {};
  for (const [name, d] of Object.entries(r)) {
    const buf = dataUrlToBuffer(d);
    const isAlpha = name.startsWith('brush');
    const enc = name === 'paper-512' ? sharp(buf).greyscale().webp({ quality: 40, effort: 6 }) : isAlpha ? sharp(buf).webp({ quality: 90, alphaQuality: 90, effort: 6 }) : sharp(buf).webp({ quality: 82, effort: 6 });
    const w = await write(path.join(ASSETS, 'textures', `${name}.webp`), await enc.toBuffer());
    const m = await sharp(buf).metadata();
    man.textures[name] = { file: w.file, width: m.width, height: m.height, bytes: w.bytes };
    console.log(`texture ${name}: ${m.width}x${m.height} ${kb(w.bytes)}`);
  }
  if (logs.length) console.warn(logs.join('\n'));
  await context.close();
  writeJson(manFile, man, true);
}

requireInvite();
mkdirp(ASSETS);
const browser = await launch();
try {
  if (what === 'plates' || what === 'all') await plates(browser);
  if (what === 'textures' || what === 'all') await textures(browser);
  if (what === 'sprites' || what === 'all') await sprites(browser);
} finally {
  await browser.close();
}
