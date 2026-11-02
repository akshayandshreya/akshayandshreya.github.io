#!/usr/bin/env node
// Asset inventory + budget check (SPEC 6.5 / 6.7): sizes per group, the largest files, and every budget line.
//   node tools/plates/report.mjs [--md]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ASSETS, PUBLIC } from '../lib/browser.mjs';
const md = process.argv.includes('--md');
const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : [];
const files = walk(ASSETS).concat(walk(path.join(PUBLIC, 'og')), ['favicon.svg', 'apple-touch-icon.png', 'icon-512.png'].map((f) => path.join(PUBLIC, f)).filter(fs.existsSync));
const size = (f) => fs.statSync(f).size;
const group = (f) => {
  const r = path.relative(path.dirname(ASSETS), f).split(path.sep);
  if (r[0] === 'assets') { if (r[1] === 'plates') return /-gold\./.test(f) ? 'plates: gold' : /-veil\./.test(f) ? 'plates: veil' : /-strokes\./.test(f) ? 'plates: live strokes' : /\.avif$/.test(f) ? 'plates: base AVIF' : 'plates: base WebP'; if (r[1] === 'sprites') return r[2] === 'couple' ? (/\.avif$/.test(f) ? 'couples AVIF' : 'couples WebP') : r[2] === 'motifs' ? 'motif sprites' : 'particle dabs'; return r[1] === 'fonts' ? 'fonts' : r[1]; }
  return 'public (OG, icons)';
};
const groups = {};
for (const f of files) { const g = group(f); groups[g] ??= { n: 0, bytes: 0 }; groups[g].n++; groups[g].bytes += size(f); }
const kb = (n) => (n / 1024).toFixed(1);
const total = files.reduce((a, f) => a + size(f), 0);
console.log(md ? '| Group | Files | KB |\n|---|---|---|' : 'group                     files      KB');
for (const [g, v] of Object.entries(groups).sort()) console.log(md ? `| ${g} | ${v.n} | ${kb(v.bytes)} |` : `${g.padEnd(26)}${String(v.n).padStart(5)}${kb(v.bytes).padStart(10)}`);
console.log(md ? `| **total** | ${files.length} | ${kb(total)} |` : `${'total'.padEnd(26)}${String(files.length).padStart(5)}${kb(total).padStart(10)}`);
// budgets
const plates = JSON.parse(fs.readFileSync(path.join(ASSETS, 'plates.meta.json'), 'utf8'));
const sprites = JSON.parse(fs.readFileSync(path.join(ASSETS, 'sprites.json'), 'utf8'));
const B = [];
const chk = (name, bytes, limit) => B.push({ name, bytes, limit, ok: bytes <= limit * 1024 });
for (const [id, p] of Object.entries(plates.plates)) {
  chk(`${id} tall-1170.avif`, p.frames.tall.bytes.avif[1170], 160);
  chk(`${id} wide-1920.avif`, p.frames.wide.bytes.avif[1920], 200);
  chk(`${id} wide-2560.avif`, p.frames.wide.bytes.avif[2560], 300);
  for (const f of ['tall', 'mid', 'wide']) { if (p.frames[f].gold) chk(`${id} ${f}-gold`, p.frames[f].gold.bytes, 40); chk(`${id} ${f}-veil`, p.frames[f].veil.bytes, 60); }
}
for (const [ev, c] of Object.entries(sprites.couples)) chk(`couple ${ev} 960h.avif`, c.bytes.avif[960], 220);
for (const [t, v] of Object.entries(sprites.textures)) chk(`texture ${t}`, v.bytes, 40);
for (const f of walk(path.join(ASSETS, 'motifs')).filter((f) => f.endsWith('.svg'))) chk(`line ${path.basename(f)} (raw; gzip ${kb(zlib.gzipSync(fs.readFileSync(f), { level: 9 }).length)} KB)`, size(f), 60);
const g = fs.existsSync(path.join(ASSETS, 'glyphs', 'tirhuta-mithila.svg')) ? size(path.join(ASSETS, 'glyphs', 'tirhuta-mithila.svg')) : 0; chk('tirhuta-mithila.svg', g, 4);
for (const f of walk(path.join(PUBLIC, 'og'))) chk(path.basename(f), size(f), 250);
const fc = JSON.parse(fs.readFileSync(path.join(ASSETS, 'fonts', 'font-coverage.json'), 'utf8'));
for (const [l, v] of Object.entries(fc.languages)) chk(`fonts ${l}: all faces (initial set is smaller)`, v.bytesAllFaces, 220);
const bad = B.filter((b) => !b.ok);
console.log(`\nbudgets: ${B.length - bad.length}/${B.length} within limit`);
for (const b of bad) console.log(`  OVER: ${b.name} ${kb(b.bytes)} KB > ${b.limit} KB`);
