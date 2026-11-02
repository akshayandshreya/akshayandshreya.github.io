#!/usr/bin/env node
// Self-hosted fonts per language (SPEC 1.5, 6.5). Source: the invitation engine's woff2 files (SIL OFL 1.1, Google
// Fonts' own per-script splits). Runs on the dev desktop in Docker (wedding-site-pw image: node + python3-fonttools +
// brotli); the site build never runs it.
//
//   node scripts/subset-fonts.mjs        (from the repo root, or `npm --prefix tools run fonts`)
//
// Strategy (measured 2026-11-02, see src/assets/README.md):
//   * Indic script faces keep their whole Google per-script file (Amita / Sahitya / Atma / Tiro Bangla: 30-55 KB each),
//     so copy edits after native review can never hit a missing conjunct. Their Latin files are kept too and only load
//     when a Latin character appears (unicode-range).
//   * Faces that ship as one multi-script file are subset with fontTools (layout features '*', hinting dropped):
//     Cormorant Garamond -> Latin; Noto Serif Devanagari / Bengali -> their script + Basic Latin.
//   * Indic pages need only two Latin glyph groups in display faces: the monogram letters (Pinyon "A", "S") and the
//     gold "&" (Cormorant italic 500): tiny dedicated subsets.
//   * Punctuation (",", "·", "(", "“" ...) is not in Google's Indic script files, so one comma in Sahitya or Tiro Bangla
//     used to pull the whole 16-20 KB Latin file. The Indic text faces get a ~1 KB punctuation subset of their own Latin
//     file, and that Latin file's unicode-range leaves those characters out: it loads only for real Latin letters or
//     digits (the "Apple · Outlook (.ics)" line), measured 2026-11-02: hi -33 KB, bn -19 KB on first load.
//   * Words of another script that every page shows are set in the site's faces, not the visitor's system font: the
//     language switch endonyms (English / हिन्दी / मैथिली / বাংলা, in Marcellus / Sahitya / Tiro Bangla) and the
//     Cultures word "বাংলা" in Atma (SPEC 2.3.5). Each is a subset of exactly those characters (1-5 KB).
// Outputs: src/assets/fonts/files/*.woff2, src/assets/fonts/fonts.<lang>.css (@font-face with exact unicode-range from
// each file's cmap, font-display: swap, metric-override fallback faces), src/assets/fonts/font-coverage.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INVITE = path.resolve(process.env.WEDDING_INVITE_SRC || path.join(REPO, '..', 'WeddingInvite2'));
const SRC = path.join(INVITE, 'engine', 'fonts');
const OUT = path.join(REPO, 'src', 'assets', 'fonts');
const FILES = path.join(OUT, 'files');
if (!fs.existsSync(SRC)) throw new Error('engine fonts not found at ' + SRC + ' (set WEDDING_INVITE_SRC)');
fs.mkdirSync(FILES, { recursive: true });

// Google Fonts' unicode-range for its "latin" subset, and the Indic blocks (+ the joiners and the dotted circle)
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const BASIC = 'U+0020-007E,U+00A0,U+00B7,U+2010-2014,U+2018-201D,U+2026,U+2060';
// Google's Devanagari and Bengali ranges, kept for reference (the faces are subset to the copy's own characters)
const _DEVA = 'U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+20F0,U+25CC,U+A830-A839,U+A8E0-A8FF';
const _BENG = 'U+0951-0952,U+0964-0965,U+0980-09FE,U+1CD0,U+1CD2,U+1CD5-1CD6,U+1CD8,U+1CE1,U+1CEA,U+1CED,U+1CF2,U+1CF5-1CF7,U+200C-200D,U+20B9,U+25CC,U+A8F1';

// the punctuation the copy uses (or may use after native review) in Indic text faces; not in the script files
const PUNCT = ',.;:!?()[]\'"‘’“”·-‐–—…/';
// the Cultures display word (src/sections/Cultures.tsx, SPEC 2.3.5), set in Atma on every page
const CULTURES_BANGLA = 'বাংলা';
/** endonym + short label of the given languages, from the generated copy (src/i18n/<lang>.json meta) */
function endonyms(langs) {
  return langs.map((l) => { const m = JSON.parse(fs.readFileSync(path.join(REPO, 'src', 'i18n', `${l}.json`), 'utf8')).meta; return m.endonym + m.short; }).join('');
}

// id -> how to make it. copy: the engine file as is; subset: fontTools with unicodes / text
const FACES = {
  'pinyon-latin': { family: 'Pinyon Script', weight: 400, style: 'normal', copy: 'PinyonScript-n400-latin.woff2' },
  'pinyon-mono': { family: 'Pinyon Script', weight: 400, style: 'normal', from: 'PinyonScript-n400-latin.woff2', text: 'AS' },
  'marcellus-latin': { family: 'Marcellus', weight: 400, style: 'normal', copy: 'Marcellus-n400-latin.woff2' },
  'cormorant-500-latin': { family: 'Cormorant Garamond', weight: 500, style: 'normal', from: 'CormorantGaramond-n500.woff2', unicodes: LATIN },
  'cormorant-600-latin': { family: 'Cormorant Garamond', weight: 600, style: 'normal', from: 'CormorantGaramond-n600.woff2', unicodes: LATIN },
  'cormorant-i500-latin': { family: 'Cormorant Garamond', weight: 500, style: 'italic', from: 'CormorantGaramond-i500.woff2', unicodes: LATIN },
  'cormorant-i500-amp': { family: 'Cormorant Garamond', weight: 500, style: 'italic', from: 'CormorantGaramond-i500.woff2', text: '&' },
  'amita-deva': { family: 'Amita', weight: 400, style: 'normal', copy: 'Amita-n400-devanagari.woff2' },
  'sahitya-400-deva': { family: 'Sahitya', weight: 400, style: 'normal', copy: 'Sahitya-n400-devanagari.woff2' },
  'sahitya-400-latin': { family: 'Sahitya', weight: 400, style: 'normal', copy: 'Sahitya-n400-latin.woff2' },
  'sahitya-700-deva': { family: 'Sahitya', weight: 700, style: 'normal', copy: 'Sahitya-n700-devanagari.woff2' },
  'sahitya-700-latin': { family: 'Sahitya', weight: 700, style: 'normal', copy: 'Sahitya-n700-latin.woff2' },
  // venue + address faces: the facts are fixed (SPEC 0.2), so these subset to the characters of every event string
  'noto-deva-500': { family: 'Noto Serif Devanagari', weight: 500, style: 'normal', from: 'NotoSerifDevanagari-n500.woff2', unicodes: BASIC + ',U+0964-0965,U+0966-096F,U+200C-200D,U+25CC', textFrom: ['hi', 'mai'] },
  'noto-deva-600': { family: 'Noto Serif Devanagari', weight: 600, style: 'normal', from: 'NotoSerifDevanagari-n600.woff2', unicodes: BASIC + ',U+0964-0965,U+0966-096F,U+200C-200D,U+25CC', textFrom: ['hi', 'mai'] },
  'atma-500-beng': { family: 'Atma', weight: 500, style: 'normal', copy: 'Atma-n500-bengali.woff2' },
  'atma-500-latin': { family: 'Atma', weight: 500, style: 'normal', copy: 'Atma-n500-latin.woff2' },
  'tiro-bangla-beng': { family: 'Tiro Bangla', weight: 400, style: 'normal', copy: 'TiroBangla-n400-bengali.woff2' },
  'tiro-bangla-latin': { family: 'Tiro Bangla', weight: 400, style: 'normal', copy: 'TiroBangla-n400-latin.woff2' },
  'noto-beng-500': { family: 'Noto Serif Bengali', weight: 500, style: 'normal', from: 'NotoSerifBengali-n500.woff2', unicodes: BASIC + ',U+0964-0965,U+09E6-09EF,U+200C-200D,U+25CC', textFrom: ['bn'] },
  // punctuation of the Indic text faces (their Latin files then load only for letters and digits)
  'sahitya-400-punct': { family: 'Sahitya', weight: 400, style: 'normal', from: 'Sahitya-n400-latin.woff2', text: PUNCT, punctOf: 'sahitya-400-latin' },
  'sahitya-700-punct': { family: 'Sahitya', weight: 700, style: 'normal', from: 'Sahitya-n700-latin.woff2', text: PUNCT, punctOf: 'sahitya-700-latin' },
  'tiro-bangla-punct': { family: 'Tiro Bangla', weight: 400, style: 'normal', from: 'TiroBangla-n400-latin.woff2', text: PUNCT, punctOf: 'tiro-bangla-latin' },
  'atma-500-punct': { family: 'Atma', weight: 500, style: 'normal', from: 'Atma-n500-latin.woff2', text: PUNCT, punctOf: 'atma-500-latin' },
  // other scripts' words shown on every page: the switch endonyms and the Cultures "বাংলা"
  'marcellus-endonym': { family: 'Marcellus', weight: 400, style: 'normal', from: 'Marcellus-n400-latin.woff2', textOf: () => endonyms(['en']) },
  'sahitya-endonym': { family: 'Sahitya', weight: 400, style: 'normal', from: 'Sahitya-n400-devanagari.woff2', textOf: () => endonyms(['hi', 'mai']) },
  'tiro-bangla-endonym': { family: 'Tiro Bangla', weight: 400, style: 'normal', from: 'TiroBangla-n400-bengali.woff2', textOf: () => endonyms(['bn']) },
  'atma-500-bangla': { family: 'Atma', weight: 500, style: 'normal', from: 'Atma-n500-bengali.woff2', textOf: () => CULTURES_BANGLA },
};
// per language: faces, and which are needed for the first screen (preload candidates: hand + text face)
const DEVA_SET = ['amita-deva', 'sahitya-400-deva', 'sahitya-400-latin', 'sahitya-400-punct', 'sahitya-700-deva', 'sahitya-700-latin', 'sahitya-700-punct', 'noto-deva-500', 'noto-deva-600', 'pinyon-mono', 'cormorant-i500-amp'];
// faces for the other scripts' endonyms (language switch) and the Cultures "বাংলা" (Atma), per page script
const FOR_LATIN = ['sahitya-endonym', 'tiro-bangla-endonym', 'atma-500-bangla'];
const FOR_DEVA = ['marcellus-endonym', 'tiro-bangla-endonym', 'atma-500-bangla'];
const FOR_BENG = ['marcellus-endonym', 'sahitya-endonym'];
const LANGS = {
  en: { faces: ['pinyon-latin', 'marcellus-latin', 'cormorant-500-latin', 'cormorant-600-latin', 'cormorant-i500-latin', ...FOR_LATIN], preload: ['pinyon-latin', 'marcellus-latin'] },
  hi: { faces: [...DEVA_SET, ...FOR_DEVA], preload: ['amita-deva', 'sahitya-700-deva'] },
  mai: { faces: [...DEVA_SET, ...FOR_DEVA], preload: ['amita-deva', 'sahitya-700-deva'] },
  bn: { faces: ['atma-500-beng', 'atma-500-latin', 'atma-500-punct', 'tiro-bangla-beng', 'tiro-bangla-latin', 'tiro-bangla-punct', 'noto-beng-500', 'pinyon-mono', 'cormorant-i500-amp', ...FOR_BENG], preload: ['atma-500-beng', 'tiro-bangla-beng'] },
};
// local fallbacks per family (metric overrides come from the web font itself)
const FALLBACK = {
  'Pinyon Script': ['Snell Roundhand', 'Apple Chancery', 'Segoe Script', 'Brush Script MT'],
  Marcellus: ['Optima', 'Candara', 'Georgia'],
  'Cormorant Garamond': ['Garamond', 'Georgia', 'Times New Roman'],
  Amita: ['Kohinoor Devanagari', 'Noto Sans Devanagari', 'Nirmala UI', 'Mangal'],
  Sahitya: ['Devanagari MT', 'Noto Serif Devanagari', 'Nirmala UI', 'Mangal'],
  'Noto Serif Devanagari': ['Devanagari MT', 'Noto Serif Devanagari', 'Nirmala UI', 'Mangal'],
  Atma: ['Kohinoor Bangla', 'Noto Sans Bengali', 'Nirmala UI', 'Vrinda'],
  'Tiro Bangla': ['Bangla MN', 'Noto Serif Bengali', 'Nirmala UI', 'Vrinda'],
  'Noto Serif Bengali': ['Bangla MN', 'Noto Serif Bengali', 'Nirmala UI', 'Vrinda'],
};

const py = (code, ...args) => execFileSync('python3', ['-c', code, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
const INFO = `
import sys, json
from fontTools.ttLib import TTFont
f = TTFont(sys.argv[1])
cmap = sorted(f.getBestCmap().keys())
h = f['hhea']; o = f['OS/2']; upm = f['head'].unitsPerEm
typo = bool(getattr(o, 'fsSelection', 0) & (1 << 7))
asc, desc, gap = (o.sTypoAscender, -o.sTypoDescender, o.sTypoLineGap) if typo else (h.ascent, -h.descent, h.lineGap)
print(json.dumps({'cmap': cmap, 'upm': upm, 'ascent': asc, 'descent': desc, 'lineGap': gap, 'glyphs': len(f.getGlyphOrder()), 'avg': o.xAvgCharWidth}))
`;
function ranges(cps) {
  const out = []; let a = null, b = null;
  for (const c of cps) { if (a === null) { a = b = c; } else if (c === b + 1) b = c; else { out.push([a, b]); a = b = c; } }
  if (a !== null) out.push([a, b]);
  return out;
}
const hex = (n) => n.toString(16).toUpperCase().padStart(4, '0');
const urange = (cps) => ranges(cps).map(([a, b]) => (a === b ? `U+${hex(a)}` : `U+${hex(a)}-${hex(b)}`)).join(', ');

// every string under variants[lang][order].events / single_page / reception_only / without_reception (venues, addresses,
// dates, map lines): the text the venue/address faces can ever show
const CONTENT = JSON.parse(fs.readFileSync(fs.existsSync(path.join(REPO, 'content', 'content.json')) ? path.join(REPO, 'content', 'content.json') : path.join(INVITE, 'assets', 'copy', 'content.json'), 'utf8'));
function eventText(langs) {
  const out = new Set();
  const walk = (o) => { if (typeof o === 'string') for (const ch of o) out.add(ch); else if (o && typeof o === 'object') for (const v of Object.values(o)) walk(v); };
  for (const l of langs) for (const v of Object.values(CONTENT.variants[l])) for (const k of ['events', 'single_page', 'reception_only', 'without_reception', 'city']) walk(v[k]);
  return [...out].join('');
}
const info = {};
for (const [id, F] of Object.entries(FACES)) {
  const out = path.join(FILES, `${id}.woff2`);
  if (F.copy) fs.copyFileSync(path.join(SRC, F.copy), out);
  else {
    const args = ['-m', 'fontTools.subset', path.join(SRC, F.from), `--output-file=${out}`, '--flavor=woff2', "--layout-features=*", '--no-hinting', '--desubroutinize', '--name-IDs=*', '--name-languages=*', '--notdef-outline', '--drop-tables+=DSIG'];
    if (F.unicodes) args.push(`--unicodes=${F.unicodes}`);
    if (F.text) args.push(`--text=${F.text}`);
    if (F.textFrom) args.push(`--text=${eventText(F.textFrom)}`);
    if (F.textOf) args.push(`--text=${F.textOf()}`);
    execFileSync('python3', args, { stdio: ['ignore', 'inherit', 'inherit'] });
  }
  const i = JSON.parse(py(INFO, out));
  info[id] = Object.assign(i, { bytes: fs.statSync(out).size, source: F.copy || F.from, mode: F.copy ? 'copy' : F.text ? `text "${F.text}"` : F.textOf ? `text "${F.textOf()}"` : F.textFrom ? `event strings of ${F.textFrom.join('+')} + digits/punctuation` : 'unicodes' });
  console.log(`${id}: ${(info[id].bytes / 1024).toFixed(1)} KB, ${i.cmap.length} code points, ${i.glyphs} glyphs (${info[id].mode})`);
}

const pct = (v) => `${((v * 100)).toFixed(2)}%`;
const coverage = { schema: 1, note: 'code point coverage per language; the site build checks every string of src/i18n/<lang>.json against it', languages: {}, faces: {} };
for (const [lang, L] of Object.entries(LANGS)) {
  let css = `/* Generated by scripts/subset-fonts.mjs for lang="${lang}". Fonts: SIL Open Font License 1.1 (see ./OFL.md). */\n`;
  const fams = new Set();
  for (const id of L.faces) {
    const F = FACES[id], I = info[id];
    fams.add(F.family);
    // control characters never trigger a download; on Indic pages the Latin files also leave the spaces to the script
    // face, so they load only when a real Latin letter, digit or mark is on the page
    const latinOnIndic = lang !== 'en' && /-latin$|-mono$|-amp$|-endonym$/.test(id);
    // a Latin file whose punctuation has its own subset on this page leaves those characters to it
    const punct = L.faces.map((k) => FACES[k]).find((P) => P.punctOf === id);
    const punctCps = punct ? new Set(info[L.faces.find((k) => FACES[k].punctOf === id)].cmap) : new Set();
    const cps = I.cmap.filter((c) => c >= 0x20 && !(latinOnIndic && (c === 0x20 || c === 0xa0)) && !(punct && punctCps.has(c)) && !(FACES[id].punctOf && (c === 0x20 || c === 0xa0)) && !(/-endonym$|-bangla$/.test(id) && (c === 0x20 || c === 0xa0)));
    css += `@font-face {\n  font-family: '${F.family}';\n  font-style: ${F.style};\n  font-weight: ${F.weight};\n  font-display: swap;\n  src: url('./files/${id}.woff2') format('woff2');\n  unicode-range: ${urange(cps)};\n}\n`;
  }
  // metric-override fallbacks: the local face takes the web font's vertical metrics, so swapping fonts does not move
  // line boxes (size-adjust is not set: the visitors' local fallbacks differ by platform, nothing to measure against)
  for (const fam of fams) {
    const id = L.faces.find((k) => FACES[k].family === fam && !/mono|amp|punct|endonym|bangla/.test(k)) || L.faces.find((k) => FACES[k].family === fam);
    const I = info[id];
    css += `@font-face {\n  font-family: '${fam} Fallback';\n  src: ${FALLBACK[fam].map((n) => `local('${n}')`).join(', ')};\n  ascent-override: ${pct(I.ascent / I.upm)};\n  descent-override: ${pct(I.descent / I.upm)};\n  line-gap-override: ${pct(I.lineGap / I.upm)};\n}\n`;
  }
  fs.writeFileSync(path.join(OUT, `fonts.${lang}.css`), css);
  const all = new Set();
  for (const id of L.faces) for (const c of info[id].cmap) all.add(c);
  const total = L.faces.reduce((a, id) => a + info[id].bytes, 0);
  coverage.languages[lang] = { faces: L.faces, preload: L.preload.map((id) => `files/${id}.woff2`), families: [...fams], bytesAllFaces: total, bytesPreload: L.preload.reduce((a, id) => a + info[id].bytes, 0), ranges: urange([...all].sort((a, b) => a - b)) };
  console.log(`${lang}: ${L.faces.length} faces, ${(total / 1024).toFixed(1)} KB if every face loads; preload ${(coverage.languages[lang].bytesPreload / 1024).toFixed(1)} KB`);
}
for (const [id, I] of Object.entries(info)) coverage.faces[id] = { family: FACES[id].family, weight: FACES[id].weight, style: FACES[id].style, file: `files/${id}.woff2`, bytes: I.bytes, source: I.source, mode: I.mode, ranges: urange(I.cmap) };
fs.writeFileSync(path.join(OUT, 'font-coverage.json'), JSON.stringify(coverage) + '\n');
