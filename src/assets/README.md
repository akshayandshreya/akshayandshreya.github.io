# src/assets: generated visual assets

Everything in this folder (except this README and `fonts/OFL.md`) is **generated** by the dev-desktop asset tools in
`tools/` and committed. The site build (`npm run build`) never runs them: no Chromium, sharp, Python or fonttools is
needed to build the site. Regenerate only when art, recipes or copy change (see "Regenerating" below).

Generated 2026-11-02 on the dev desktop (Docker image `wedding-site-pw` = `node:20-bookworm` + Chromium deps +
`python3-fonttools`), from the invitation project `/Volumes/workplace/WeddingInvite2` (engine paint library, couple
art, motifs, fonts) and `content/content.json`. Paintings are seeded and painted on the bit-exact CPU canvas path
(`?paintcpu=1`); a second full run reproduced the first run's file sizes (spot-checked).

Total: **343 generated files + this README and `fonts/OFL.md`, 10.5 MB** in `src/assets` + 7 files, 0.4 MB in `public/` (OG images, icons). A phone visitor loads
only a small part of it (one frame shape, one width, one format, one language).

## Where things are (and why `src/assets`, not `public/`)

SPEC 6.5 names `public/plates/...` with hand-made content hashes. These files live in `src/assets/` instead, so Vite
fingerprints them itself (`name.<hash>.avif`) when the app imports them, and unused files never reach `dist/`. Only
files that need a fixed URL stay in `public/`: `og/og-<lang>.jpg`, `favicon.svg`, `apple-touch-icon.png`,
`icon-512.png`.

The manifests use paths relative to this folder (`plates/mehndi/tall-828.avif`). Map them to hashed URLs once:

```ts
// src/lib/assetUrl.ts (sketch)
const files = import.meta.glob('../assets/**/*.{avif,webp,svg,woff2}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const assetUrl = (rel: string) => files['../assets/' + rel] ?? (() => { throw new Error('missing asset ' + rel); })();
```

(`eager` with `?url` only inlines URL strings, not the files. Fonts are better referenced from CSS: see Fonts.)

| Path | What |
|---|---|
| `plates.json` | runtime plate manifest (minified, 27 KB; mostly the 27 LQIPs). Import it lazily or per section if the JS budget is tight |
| `plates.meta.json` | full plate manifest for tools: bytes per file, calm zones, everything (do not import in the app) |
| `plates/<id>/<frame>-<w>.{avif,webp}` | the painted backgrounds (opaque base layer) |
| `plates/<id>/<frame>-gold.webp`, `-veil.webp`, `-strokes.webp` | gold leaf layer, drifting veil, live-stroke atlas |
| `sprites.json` | couples, painted motif sprites, bamboo, dabs, textures (minified, 9 KB) |
| `sprites/couple/<event>-<h>h.{avif,webp}` | couple cut-outs, painted in, 480/720/960 px tall |
| `sprites/motifs/*.webp` | painted motif sprites (tinted per section) |
| `sprites/dabs-*.webp` | particle dab atlases |
| `textures/*.webp` | paper grain, gold leaf, brush stamps, brush edge, brush wipe |
| `motifs/*.svg` + `motifs.json` | line art for draw-on (svgo) |
| `fonts/fonts.<lang>.css`, `fonts/files/*.woff2`, `fonts/font-coverage.json`, `fonts/OFL.md` | self-hosted fonts |
| `glyphs/tirhuta-mithila.svg`, `glyphs/monogram-{AS,SA}.svg`, `glyphs/glyphs.json` | shaped text as outlines |

## 1. Plates (SPEC 1.3, 5.5, 6.4)

Nine paintings x three frame shapes, painted by the invitation engine's own `P.paint()` (vendored in
`tools/plates/vendor/`, hashes in `SOURCE.md`) with the card's seeds and settings (`tools/plates/recipes.js`), then
the card's finishing: the Invitation's single-hue clamp, the Haldi sun / Wedding / Reception glows, paper grain
soft-light 0.20, palette vignette. Nothing position-critical is baked in (no couple, shadow or prop).

Frames: `tall` 1080x2340 (`(max-aspect-ratio: 3/5)`), `mid` 1080x1350 (`3/5 .. 5/4`), `wide` 1920x1080
(`(min-aspect-ratio: 5/4)`). Each frame was painted once at its largest width and downscaled (Lanczos3).
Encoding: AVIF q50 effort 6 4:2:0; WebP q72 effort 6.

| Plate | palette | tall 540/828/1170 AVIF KB | mid 768/1152/1536 | wide 1280/1920/2560 | WebP largest t/m/w | gold t/m/w | veil t/m/w |
|---|---|---|---|---|---|---|---|
| opening | ivory | 9/20/35 | 9/18/28 | 13/27/41 | 75/64/91 | 19/17/19 | 35/43/46 |
| invitation | blush | 5/10/20 | 5/10/16 | 7/13/22 | 52/45/57 | 10/7/8 | 31/35/28 |
| mehndi | sage | 15/30/51 | 15/27/41 | 19/36/54 | 102/87/112 | 8/6/7 | 31/47/24 |
| engagement | rose | 13/26/45 | 13/24/37 | 17/33/52 | 90/76/107 | 8/6/8 | 25/23/45 |
| haldi | turmeric | 10/21/37 | 11/20/31 | 13/26/41 | 81/74/95 | 8/7/7 | 33/41/37 |
| wedding | vermilion | 11/23/40 | 11/20/31 | 15/29/44 | 85/69/96 | 18/16/22 | 32/45/51 |
| reception | teal-evening | 7/16/30 | 8/16/24 | 10/21/33 | 66/56/76 | 8/6/6 | 27/29/36 |
| cultures | ivory | 8/15/28 | 7/14/23 | 10/19/31 | 64/56/75 | 11/7/10 | 32/32/30 |
| closing | ivory | 9/20/35 | 9/18/28 | 14/27/42 | 75/64/94 | 16/18/18 | 31/45/48 |

Budgets (SPEC 6.5): base `tall-1170.avif` <= 160 KB (max 51), `wide-1920.avif` <= 200 KB (max 36), `wide-2560.avif`
<= 300 KB (max 54), gold <= 40 KB (max 22), veil <= 60 KB (max 51): all met. The SPEC's "WebP <= 1.45x AVIF" is not
met (WebP is about 2.1-2.6x AVIF at q72); WebP is only the fallback for browsers without AVIF (Safari < 16), so it was
left at a quality that does not band. Lower `WEBP.quality` in `export.mjs` if that matters.

`plates.json` per plate: `palette`, `paper`, `groundMid` (the reveal's starting ground, SPEC 3.5), `deep`, `focal`
(`object-position`), and per frame:

- `avif` / `webp`: `{ width: file }`; `W`, `H` (logical frame; the height of a width `w` file is `round(w * H / W)`).
- `lqip`: a 16 px wide WebP as a data URL (about 200-400 B): the frame's `background-image` until the plate decodes.
- `gold`: transparent gold-leaf flecks and gilded lines on the same pixel grid (tall 1170, mid 1152, wide 1920 wide),
  already erased inside every calm zone. Lay it over the base with the same `object-fit` / `object-position`.
- `veil`: transparent, half resolution (585 / 768 / 1280 wide): 14-20 low-contrast strokes on the plate's own flow
  field, outside calm zones. It drifts against the base (SPEC 3.6, `full` tier only).
- `strokes`: the live-stroke atlas (SPEC 3.6) for 3 slots. `items[i]`: `atlas` `[x, y, w, h]` px in the atlas,
  `frame` `[x, y, w, h]` as fractions of the frame (position it over the plate with the same cover math), `from` / `to`
  the brush direction in sprite fractions (sweep the reveal mask from `from` to `to`).
- `glow` (`{x, y, r, k}`, x/y fractions, r a fraction of `min(W, H)`: the glow-pulse position), `couple` (`[x, y]`
  where the recipe expects the couple), `floor` (y fraction of the painted ground line).

Calm zones (where text and the couple sit) follow SPEC 1.3; `plates.meta.json` lists them per frame. Event wide
frames: couple left for Mehndi, Haldi, Reception; right for Engagement, Wedding.

## 2. Couples (SPEC 2.3.4)

The owner's chosen art (`WeddingInvite2/assets/couples_original/*.png`; the Reception reuses `wedding.png`), painted
in like card.js `rasterSkin`: ragged noise-feathered alpha edge, paper grain 0.06, an 8% glaze of the section's paper,
plus the contact shadow (`darks[0]` 0.24 -> 0.7 -> 0.2 -> 0, rx = min(0.46 w, 0.43 h), ry = 0.032 h) baked below the
feet; the Reception also has the aripan floor ring (rice-paste rings, lotus scallops, rice + gold dots, card.js
geometry scaled to the figure). Trimmed to the alpha box.

| Event | width at 480/720/960 h | AVIF KB 480/720/960 | WebP KB | `figure` (fractions) | `heightScale` |
|---|---|---|---|---|---|
| mehndi | 395/592/790 | 21/35/48 | 33/58/85 | cx .5, crown .061, feet .968 | 0.975 (raised hands) |
| engagement | 287/431/575 | 18/31/45 | 26/48/72 | cx .5, crown .004, feet .966 | 1 |
| haldi | 228/342/440 | 24/39/48 | 33/60/76 | cx .5, crown .004, feet .966 | 1 |
| wedding | 293/440/567 | 27/46/59 | 37/67/87 | cx .5, crown .004, feet .966 | 1 |
| reception | 317/476/633 | 34/57/70 | 45/83/108 | cx .5, crown .004, feet .935 | 0.97 |

Haldi's source is 927 px tall after padding, so its "960h" file is 927 px (never upscaled; `width` in the manifest
gives the real size). Layout rule: for a target couple height `Hc` (crown to feet), draw the sprite at height
`Hc * heightScale / (feet - crown)` and put `feet` on the painted floor. Each entry also has a 12 px `lqip`.
Budget: 960h AVIF <= 220 KB (max 70). No photo of the real couple is used anywhere.

## 3. Painted motif sprites (SPEC 1.7) and textures

WebP with alpha, rasterised from `WeddingInvite2/assets/motifs/*_paint.svg` with the section tints (card.js
`MOTIF_VARS`, theme `--m-*`). `sprites.json` `motifs[id]`: `webp {size: file}`, `axis` (`width` or `height`: what
the size measures), `aspect` (w/h), `viewBox`.

| id | sizes (KB) | notes |
|---|---|---|
| opening-ganesh | 320w 26.5, 560w 53.1 | ivory ink `#a07a34`, soft gold halo included; overlay `motifs/ganesh.svg` at 45% for the draw-on |
| invitation-kalash | 240h 8.0 | |
| wedding-kalash | 520h 20.3 | front left of the couple |
| wedding-shankha | 400w 11.6 | front right |
| mehndi-marigold | 440h 9.6, 760h 11.2 | card's soft filter baked (`saturate(.68) brightness(1.1) contrast(.82) sepia(.12)`); rotate about the top to sway |
| engagement-toran | 960w 39.7, 1700w 40.1 | across the top |
| haldi-banana | 520h 12.6, 880h 15.7 | rotate -9 deg about its foot |
| closing-diya, -flame, -glow | 480w 9.0 / 4.3 / 16.1 | three layers on the same box: stack glow, diya, flame; animate the flame (`scaleY`, `rotate` about its base) and the glow (`opacity`) with CSS transforms, no SVG filters at runtime |
| ghost-alpana | 640w 40.1, 1100w 80.3 | **alpha mask** (flat black RGB) |
| ghost-aripan | 640w 24.9 | **alpha mask** |
| reception-bamboo-left / -right | 450x1353 44.8, 450x1218 31.1 | gold Madhubani bamboo + lotus buds; `box` in card units (page 1080 x 1532.4, ground 1142): left x 0-300, right x 780-1080, both down to y 1282 |

Ghosts are masks so one file serves every palette: `background: var(--ink); mask: url(ghost) center / contain
no-repeat; opacity: .09` (`-webkit-mask` too).

Particle dabs (`sprites/dabs-<id>.webp`, one row of 6 cells, `cell` px): opening-spark 64 (5.1 KB), mehndi-leaf 96
(8.8), engagement-petal 96 (6.8), haldi-marigold 96 (7.2), wedding-spark 64 (4.9), closing-dust 64 (3.9).

Textures (`textures/`): `paper-512` (512 tile, greyscale, soft-light at .18 over paper bands, 39 KB), `gold-leaf-256`
(the `.gold-leaf` multiply texture, 3 KB), `brush-stamps` (6 x 128 px white bristle dabs, the paint-reveal stamps,
15 KB), `brush-edge` (1024 x 96 repeat-x ragged dry-brush edge, 13 KB), `brush-wipe` (1024 x 128 hand-title mask,
opaque left, bristly leading edge, 11 KB). All <= 40 KB.

## 4. Line art for draw-on (SPEC 3.4)

`motifs/<name>.svg` for ganesh, shehnai, aripan, alpana, paag, topor, lotus_open, shankha: the `_line.svg` files
through svgo (`tools/motifs/optimize.mjs`). Kept: every id (motif-prefixed), the `.m-draw` centreline mask paths, the
`.m-stroke` ribbons, the `.m-ink` group (fill `var(--m-ink, ...)`) and its brush filter. Dropped: title, width/height,
`data-i`; alpana and aripan (viewBox at 0,0) also lose the redundant per-mask x/y/width/height. The optimiser fails if
any mask, draw path or ribbon count changes; a render check (`tools/qa/lines.html`) drew all eight at p = 1 and 0.5 with
`Motifs.draw` (vendored `motifs.js`) correctly.

| name | raw -> out KB | gzip KB | strokes |
|---|---|---|---|
| ganesh | 16.7 -> 13.3 | 3.8 | 21 |
| shehnai | 14.3 -> 11.5 | 2.9 | 21 |
| aripan | 80.3 -> 59.3 | 15.0 | 103 |
| alpana | 138.8 -> 78.3 | 14.9 | 202 |
| paag | 20.4 -> 16.5 | 4.0 | 32 |
| topor | 51.9 -> 41.9 | 6.7 | 92 |
| lotus_open | 21.0 -> 17.5 | 4.4 | 31 |
| shankha | 11.6 -> 9.2 | 3.0 | 12 |

Over budget: alpana is 78 KB raw (SPEC says <= 60 KB raw); it is 15 KB on the wire with gzip/brotli. Getting under 60
raw would mean dropping strokes. To inline the same file twice, prefix ids (`Motifs.prefix`). Ink: set `--m-ink` per
section (Mithila half `#7a2e22`, Bengal half `#7a3326`, lotus seam `#a07a34`, SPEC 1.7).

## 5. Fonts (SPEC 1.5, 6.5)

`fonts/fonts.<lang>.css`: link only the current language's file (`<link rel="stylesheet">` or import it in the
language chunk); its `url('./files/...')` are resolved and hashed by Vite. Every face has its exact `unicode-range`
(from the file's cmap) and `font-display: swap`. Each family also has a `'<Family> Fallback'` local face with
`ascent-override` / `descent-override` / `line-gap-override` from the web font, so the swap does not move line boxes;
use it second in the stack, e.g. `font-family: 'Cormorant Garamond', 'Cormorant Garamond Fallback', serif`.
`size-adjust` is **not** set: the visitors' local fallbacks differ by platform and none was measured.

| lang | faces | KB if every face loads | preload (hand + text face) |
|---|---|---|---|
| en | Pinyon Script, Marcellus, Cormorant Garamond 500 / 600 / 500 italic (Latin); endonyms हिन्दी मैथिली (Sahitya, 4.4 KB) and বাংলা (Tiro Bangla, 1.2 KB); Cultures "বাংলা" (Atma, 1.2 KB) | 111.1 | pinyon-latin + marcellus-latin, 41.4 KB |
| hi, mai | Amita, Sahitya 400 / 700 (Devanagari + Latin + punctuation, 1.5 KB each), Noto Serif Devanagari 500 / 600, Pinyon "AS" (1.2 KB), Cormorant italic "&" (1.0 KB); endonyms English (Marcellus, 1.3 KB) and বাংলা; Cultures "বাংলা" | 218.1 | amita-deva + sahitya-700-deva, 64.1 KB |
| bn | Atma 500, Tiro Bangla (Bengali + Latin + punctuation), Noto Serif Bengali 500, Pinyon "AS", Cormorant italic "&"; endonyms English and हिन्दी मैथिली | 210.5 | atma-500-beng + tiro-bangla-beng, 104.0 KB |

Measured 2026-11-02 in Chromium (fonts a page actually requests at load, 390 px): en 111 KB, hi/mai 186 KB, bn 173 KB
(before the punctuation subsets: hi 211 KB, bn 185 KB; a comma or "·" pulled the 16-20 KB Latin file). The build's
font figure is an upper bound: it cannot tell families apart, so any Latin letter on an Indic page counts the Latin
files too.

How they were made: the Indic script faces are the engine's Google per-script files kept whole (30-55 KB each), so
copy edits after native review can never hit a missing conjunct. Cormorant is subset to Google's Latin range. Noto
Serif Devanagari / Bengali (venue and address only) are subset to every character of the event strings of that
language plus digits and punctuation (the facts are fixed, SPEC 0.2); if a venue or address string ever changes, rerun
the fonts tool. On Indic pages the Latin files leave spaces and the punctuation (`, . · ( ) “ ” – …`, own ~1.5 KB
subsets) to other faces, so they load only for real Latin letters or digits (the closed calendar menu's
"Apple · Outlook (.ics)"). Words of another script that every page shows (the language switch endonyms, the Cultures
"বাংলা") have subsets of exactly their characters, so they are never set in the visitor's system font; the build
fails when a page shows a character none of its faces cover (`check-budget.mjs`).
`font-coverage.json` lists each face's code points and each language's faces and preloads, for the build's coverage
check. Licences: `fonts/OFL.md` (one open check there: Reserved Font Names).

## 6. Glyphs (SPEC 2.3.5)

- `glyphs/tirhuta-mithila.svg` (2.6 KB, <= 4 KB budget): "मिथिला" in Mithilakshar (U+114A7 U+114B1 U+1149F U+114B1
  U+114AA U+114B0) shaped by HarfBuzz (harfbuzzjs) from Noto Sans Tirhuta; the two pre-base i matras are reordered
  (glyph order 59, 49, 59, 41, 52, 58). Paths only, `fill="currentColor"` (set `color: var(--gold-ink)`),
  `aria-hidden`; the caption carries the meaning. **Needs a native Maithili check** (SPEC 4.8).
- `glyphs/monogram-AS.svg`, `monogram-SA.svg` (3 KB each): Pinyon Script outlines, `fill="currentColor"`.

## 7. Link previews and icons (`public/`)

- `public/og/og-{en,hi,mai,bn}.jpg`: 1200 x 630, 75 / 71 / 71 / 71 KB (<= 250 KB). The wide opening plate + gold, the
  hairline frame with diamonds, Ganesh (paint + line), the heading in gold leaf, the gold rule with its bindu, the pair
  with the gold joiner, the dateline: the default variant G (groom-first, five events), text from
  `content/content.json`. Rendered by `tools/og/og.html` with the fonts above.
- `public/favicon.svg` (3.4 KB, vector: ivory disc, gold ring with gap and bindu, "AS"), `public/apple-touch-icon.png`
  (180, 20 KB), `public/icon-512.png` (87 KB): painted medallion.
- Not made here: `site.webmanifest`, `robots.txt` (chrome / hosting owners).

## Regenerating (dev desktop only, never on the Mac)

The tools have their own `tools/package.json` (playwright-core, sharp, svgo, harfbuzzjs), so the site's install stays
light. On the dev desktop, with the repo at `~/wedding_site/repo` and the invitation project copied to
`~/wedding_site/work/invite` (assets/couples_original, assets/motifs/*.svg, assets/copy/content.json, engine/fonts):

```sh
wsa() { docker run --rm --init -u "$(id -u):$(id -g)" -e HOME=/tmp/home -e npm_config_cache=/cache/npm \
  -e PLAYWRIGHT_BROWSERS_PATH=/cache/ms-playwright -e WEDDING_INVITE_SRC=/invite \
  -v ~/wedding_site/repo:/app -v ~/wedding_site/cache:/cache -v ~/wedding_site/work:/work \
  -v ~/wedding_site/work/invite:/invite:ro -w /app/tools wedding-site-pw "$@"; }
# image: FROM node:20-bookworm; apt python3-fonttools python3-brotli; npx playwright@1.48.2 install-deps chromium
wsa npm ci && wsa npx playwright-core install chromium        # once
wsa node motifs/optimize.mjs                                    # line art
wsa node ../scripts/subset-fonts.mjs                            # fonts (fontTools)
wsa node glyphs/tirhuta.mjs                                     # Tirhuta + monograms (harfbuzzjs)
wsa node plates/export.mjs plates --jobs 6                      # 27 plates, about 2 min; or: plates mehndi,haldi --frames wide
wsa node plates/export.mjs textures && wsa node plates/export.mjs sprites
wsa node og/og.mjs                                              # needs everything above
wsa node plates/report.mjs                                      # inventory + budgets
wsa node qa/sheet.mjs /work/sheet.png tall 540 --gold           # QA contact sheet (not shipped)
```

Then pull only the outputs to the Mac (tar over ssh): `src/assets`, `public/og`, `public/favicon.svg`,
`public/apple-touch-icon.png`, `public/icon-512.png`. `KEEP_PNG=/work/png` keeps the lossless renders on the dev
desktop (never in the repo). Nothing in these tools opens a socket: pages are served through Playwright request
interception and every other origin is blocked.

## Budget summary (`tools/plates/report.mjs`, 2026-11-02)

107 of 108 checks within limits; the one over is alpana.svg raw size (above). Group totals:

| Group | Files | KB |
|---|---|---|
| plates: base AVIF | 81 | 1815.5 |
| plates: base WebP | 81 | 3922.1 |
| plates: gold | 27 | 300.8 |
| plates: veil | 27 | 962.6 |
| plates: live strokes | 27 | 391.6 |
| plates.json / plates.meta.json | 2 | 27.2 / 71.0 |
| couples AVIF / WebP | 15 / 15 | 601.8 / 917.6 |
| motif sprites | 19 | 499.0 |
| particle dabs | 6 | 36.6 |
| textures | 5 | 81.1 |
| sprites.json | 1 | 9.1 |
| line art (motifs/) | 9 | 248.3 |
| fonts | 25 | 542.9 |
| glyphs | 4 | 8.9 |
| public (OG, icons) | 7 | 389.0 |
| **total** | **351** | **10825.1** |

Rough first screen on a phone (tall frame, 828 or 1170 AVIF): opening plate 20-35 KB + gold 19 KB + LQIP inline +
Ganesh 26.5 KB + preloaded fonts 41-104 KB, so the art and fonts above the fold stay well under 250 KB.
