#!/usr/bin/env node
// Line art for draw-on (SPEC 1.7, 3.4): the invitation's *_line.svg motifs, cleaned with svgo for the web.
// Kept: every id (prefixed per motif, referenced by mask="url(#..)"), the .m-draw centreline mask paths (their dash
// offset paints the brush on, see tools/plates/vendor/motifs.js), the .m-stroke ribbons, the .m-ink group with its
// --m-ink fill and the brush filter, data-motif/data-kind/data-strokes. Dropped: title, width/height (CSS sizes it),
// the per-stroke data-i index (unused by Motifs.draw). Path data is rounded to `precision` decimals (viewBox units
// are 700-1400 wide, so 1 decimal is far below a device pixel). Filter numbers keep 3 decimals (baseFrequency 0.032).
//   node tools/motifs/optimize.mjs            -> src/assets/motifs/<name>.svg
// A site-owned source in tools/motifs/src/<name>_line.svg wins over the invitation's (the aripan, QA r1 D1: its
// corner buds read as fish; tools/motifs/aripan_site.py redraws them as lotus buds).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { optimize } from 'svgo';
import { INVITE, ASSETS, TOOLS, requireInvite, mkdirp, kb } from '../lib/browser.mjs';

// name -> path precision (decimals)
const LINES = { ganesh: 1, shehnai: 1, aripan: 1, alpana: 0, paag: 1, topor: 1, lotus_open: 1, shankha: 1 };

const config = (precision) => ({
  multipass: true,
  floatPrecision: 3,
  js2svg: { pretty: false },
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          cleanupIds: false, // ids are the motif's own (prefixed) and are referenced by mask/filter urls
          removeViewBox: false,
          mergePaths: false, // each ribbon has its own mask
          collapseGroups: false,
          moveGroupAttrsToElems: false,
          moveElemsAttrsToGroup: false,
          inlineStyles: false,
          removeHiddenElems: false,
          removeUnknownsAndDefaults: { keepDataAttrs: true, keepRoleAttr: true },
          convertPathData: { floatPrecision: precision, transformPrecision: 3, makeArcs: false },
          cleanupNumericValues: { floatPrecision: 3 },
          convertShapeToPath: false,
        },
      },
    },
    'removeDimensions',
    { name: 'removeAttrs', params: { attrs: ['path:data-i'] } },
  ],
});

requireInvite();
const outDir = path.join(ASSETS, 'motifs');
mkdirp(outDir);
const report = {};
for (const [name, precision] of Object.entries(LINES)) {
  const own = path.join(TOOLS, 'motifs', 'src', `${name}_line.svg`);
  const src = fs.existsSync(own) ? own : path.join(INVITE, 'assets', 'motifs', `${name}_line.svg`);
  const raw = fs.readFileSync(src, 'utf8');
  const res = optimize(raw, config(precision));
  let out = res.data.replace(/^<\?xml[^>]*>/, '');
  // masks in user space default to x=y=-10%, w=h=120% of the viewport: when the viewBox starts at 0,0 that covers the
  // whole motif, so the 100-200 repeated x/y/width/height quads can go (alpana, aripan)
  const vb = (out.match(/viewBox="([^"]+)"/) || [0, ''])[1].split(/[\s,]+/).map(Number);
  if (vb[0] === 0 && vb[1] === 0) out = out.replace(/<mask\b([^>]*)>/g, (m, a) => '<mask' + a.replace(/\s(x|y|width|height)="[^"]*"/g, '') + '>');
  // sanity: masks, draw paths and strokes survive one-to-one
  const count = (s, re) => (s.match(re) || []).length;
  const want = [count(raw, /<mask\b/g), count(raw, /class="m-draw"/g), count(raw, /class="m-stroke"/g)];
  const got = [count(out, /<mask\b/g), count(out, /class="m-draw"/g), count(out, /class="m-stroke"/g)];
  if (want.join() !== got.join()) throw new Error(`${name}: structure changed ${want} -> ${got}`);
  if (!/viewBox=/.test(out) || !/feTurbulence[^>]*baseFrequency="0?\.0\d/.test(out)) throw new Error(`${name}: viewBox or filter lost`);
  const file = path.join(outDir, `${name}.svg`);
  fs.writeFileSync(file, out);
  // the viewBox lets the site reserve each drawing's box before its SVG arrives (QA r1 M2: a 0 px tall lazy <img>
  // grew Cultures by ~1000 px under a menu jump)
  report[name] = { raw: raw.length, out: out.length, gzip: zlib.gzipSync(out, { level: 9 }).length, strokes: got[1], viewBox: vb };
  console.log(`${name}: ${kb(raw.length)} -> ${kb(out.length)}, gzip ${kb(report[name].gzip)} (${got[1]} strokes)`);
}
fs.writeFileSync(path.join(outDir, 'motifs.json'), JSON.stringify({ schema: 1, note: 'line art for draw-on; see src/assets/README.md', motifs: report }, null, 1) + '\n');
