#!/usr/bin/env node
// Text shaped at build time into SVG outlines (SPEC 2.3.5), so no browser has to shape Tirhuta (Safari's support is
// not guaranteed) and no 29 KB font ships:
//   src/assets/glyphs/tirhuta-mithila.svg  "मिथिला" in Mithilakshar: U+114A7 MA, U+114B1 VOWEL SIGN I, U+1149F THA,
//                                          U+114B1 VOWEL SIGN I, U+114AA LA, U+114B0 VOWEL SIGN AA (HarfBuzz reorders
//                                          the pre-base i matras), from NotoSansTirhuta-n400-tirhuta.woff2
//   src/assets/glyphs/monogram-AS.svg / monogram-SA.svg  the Pinyon Script monograms (icons, OG, favicon)
// fill="currentColor": the site sets `color: var(--gold-ink)`. aria-hidden; the caption carries the meaning.
// Native Maithili check required (SPEC 4.8).
//   node tools/glyphs/tirhuta.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import hbPromise from 'harfbuzzjs';
import { INVITE, ASSETS, requireInvite, mkdirp } from '../lib/browser.mjs';

requireInvite();
const hb = await hbPromise;
const FONTS = path.join(INVITE, 'engine', 'fonts');
const OUT = path.join(ASSETS, 'glyphs');
mkdirp(OUT);

/** woff2 -> sfnt bytes (HarfBuzz reads sfnt), via fontTools (python3-fonttools + brotli in the tools image) */
function sfnt(file) {
  const tmp = path.join(os.tmpdir(), path.basename(file) + '.ttf');
  execFileSync('python3', ['-c', 'import sys\nfrom fontTools.ttLib import TTFont\nf=TTFont(sys.argv[1]); f.flavor=None; f.save(sys.argv[2])', file, tmp]);
  const b = fs.readFileSync(tmp); fs.unlinkSync(tmp);
  return b;
}

function shapeToSvg(fontFile, text, { features = '', pad = 0.06, title } = {}) {
  const blob = hb.createBlob(sfnt(fontFile));
  const face = hb.createFace(blob, 0);
  const font = hb.createFont(face);
  const upem = face.upem;
  font.setScale(upem, upem);
  const buf = hb.createBuffer();
  buf.addText(text);
  buf.guessSegmentProperties();
  hb.shape(font, buf, features);
  const glyphs = buf.json();
  let x = 0;
  const parts = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const g of glyphs) {
    const d = font.glyphToPath(g.g);
    const ox = x + g.dx, oy = g.dy;
    if (d) {
      parts.push({ d, ox, oy, gid: g.g });
      // bounds from the path's numbers (font units, y up)
      const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
      for (let i = 0; i + 1 < nums.length; i += 2) { const px = nums[i] + ox, py = nums[i + 1] + oy; if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py; }
    }
    x += g.ax;
  }
  buf.destroy(); font.destroy(); face.destroy(); blob.destroy();
  const p = Math.round(upem * pad);
  const vx = Math.floor(minX) - p, vy = Math.floor(-maxY) - p, vw = Math.ceil(maxX - minX) + 2 * p, vh = Math.ceil(maxY - minY) + 2 * p;
  // y up -> y down: each glyph flips about its own baseline, so the group translates only
  const flipped = parts.map((q) => `<path transform="matrix(1 0 0 -1 ${q.ox} ${-q.oy})" d="${q.d}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" aria-hidden="true" focusable="false"${title ? ` data-text="${title}"` : ''}><g fill="currentColor">${flipped}</g></svg>\n`;
  return { svg, glyphs: glyphs.map((g) => g.g), viewBox: [vx, vy, vw, vh] };
}

const report = {};
{
  const text = String.fromCodePoint(0x114a7, 0x114b1, 0x1149f, 0x114b1, 0x114aa, 0x114b0);
  const r = shapeToSvg(path.join(FONTS, 'NotoSansTirhuta-n400-tirhuta.woff2'), text, { title: 'मिथिला (Tirhuta)' });
  fs.writeFileSync(path.join(OUT, 'tirhuta-mithila.svg'), r.svg);
  report['tirhuta-mithila'] = { bytes: Buffer.byteLength(r.svg), glyphIds: r.glyphs, viewBox: r.viewBox, codepoints: [...text].map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase()) };
  console.log(`tirhuta-mithila.svg: ${Buffer.byteLength(r.svg)} B, glyphs ${r.glyphs.join(',')}`);
}
for (const mono of ['AS', 'SA']) {
  const r = shapeToSvg(path.join(FONTS, 'PinyonScript-n400-latin.woff2'), mono, { pad: 0.04 });
  fs.writeFileSync(path.join(OUT, `monogram-${mono}.svg`), r.svg);
  report[`monogram-${mono}`] = { bytes: Buffer.byteLength(r.svg), glyphIds: r.glyphs, viewBox: r.viewBox };
  console.log(`monogram-${mono}.svg: ${Buffer.byteLength(r.svg)} B`);
}
fs.writeFileSync(path.join(OUT, 'glyphs.json'), JSON.stringify({ schema: 1, note: 'shaped with harfbuzzjs at asset time; fill=currentColor', glyphs: report }, null, 1) + '\n');
