#!/usr/bin/env node
// QA contact sheets (not shipped): node qa/sheet.mjs <out.png> <frame> <width> [ids] [--gold]
// Decodes the encoded files (AVIF) exactly as browsers get them; with --gold the gold layer is composited on top.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ASSETS } from '../lib/browser.mjs';
const [out, frame = 'tall', width = '540', idsArg] = process.argv.slice(2);
const gold = process.argv.includes('--gold');
const man = JSON.parse(fs.readFileSync(path.join(ASSETS, 'plates.json'), 'utf8'));
const ids = idsArg && !idsArg.startsWith('--') ? idsArg.split(',') : Object.keys(man.plates);
const tiles = [];
for (const id of ids) {
  const e = man.plates[id].frames[frame];
  let img = sharp(path.join(ASSETS, e.avif[width]));
  if (gold && e.gold) {
    const g = await sharp(path.join(ASSETS, e.gold)).resize({ width: Number(width) }).toBuffer();
    img = sharp(await img.composite([{ input: g }]).png().toBuffer());
  }
  tiles.push(await img.png().toBuffer());
}
const meta = await sharp(tiles[0]).metadata();
const cols = Math.min(tiles.length, frame === 'wide' ? 3 : 9), rows = Math.ceil(tiles.length / cols), gap = 8;
const sheet = sharp({ create: { width: cols * (meta.width + gap) + gap, height: rows * (meta.height + gap) + gap, channels: 3, background: '#333' } });
await sheet.composite(tiles.map((t, i) => ({ input: t, left: gap + (i % cols) * (meta.width + gap), top: gap + Math.floor(i / cols) * (meta.height + gap) }))).png().toFile(out);
console.log('wrote', out);
