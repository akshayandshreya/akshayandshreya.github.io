# Akshay & Shreya: wedding website, specification

Version 1, 2026-11-02. Repo: `/Volumes/workplace/AkshayShreyaWedding` (git, branch `main`, no remote, never pushed).
This document is the contract for every agent that builds the site. Where it gives a number, the number is the requirement.
Where it says "measured", the measurement was taken on 2026-11-02 and is listed in section 6.4 or 10.

---------------------------------------------------------------------------------------------------------------------

## 0. Ground rules and decisions at a glance

### 0.1 Sources (read-only; never edit them from this repo)

| What | Path | Use |
|---|---|---|
| Owner's chosen card (design reference) | `~/Downloads/Akshay_Shreya_Invitations/v2_final/without_reception/cards/multi_page/Akshay_Shreya_Invite_v2_Bengali_BrideFirst_OriginalCouple_NoReception.pdf` (7 pages, A5) and the with-Reception set in `v2_final/cards/` (8 pages) | layout, palettes, type, frame, motifs. Rendered pages: `/tmp/wedsite_card/*.png` |
| Brief and owner feedback | `/Volumes/workplace/WeddingInvite2/BRIEF.md`, `STORYBOARD.md` | facts, direction, binding owner feedback |
| All copy, 4 languages x 2 orders | `/Volumes/workplace/WeddingInvite2/assets/copy/content.json` (+ `NOTES.md`, the native reviews) | every visible fact string |
| Couple artwork (owner's choice) | `/Volumes/workplace/WeddingInvite2/assets/couples_original/{mehndi,engagement,haldi,wedding}.png` (829x977, 632x1015, 456x916, 583x917, RGBA) | the couple per event; the Reception reuses `wedding.png` |
| Motifs | `/Volumes/workplace/WeddingInvite2/assets/motifs/*_{line,paint}.svg`, `INDEX.md`, `motifs.js` | painted sprites and draw-on line art |
| Paint library | `/Volumes/workplace/WeddingInvite2/engine/lib/paint/paint.js` (126 KB, 40 KB gz) on `engine/lib/engine.js` (37 KB, 13 KB gz) | build-time painting of the plates (section 6.4) |
| Card recipes | `/Volumes/workplace/WeddingInvite2/engine/cards/card.js`, `card.css` | seeds, styles, densities, couple integration, print inks |
| Video theme | `/Volumes/workplace/WeddingInvite2/engine/scenes/_theme.css` | phone inks, type roles per script, motif tints |
| Fonts | `/Volumes/workplace/WeddingInvite2/engine/fonts/*.woff2` (88 files, 3.0 MB, SIL OFL 1.1) | self-hosted, subset per language |

The repo keeps a snapshot of the copy at `content/content.json` with `content/SOURCE.md` (source path, sha256, date). The
generator (4.1) reads only the snapshot. Refreshing it is a deliberate commit (steps in `content/SOURCE.md`).
Re-verified 2026-11-02: the snapshot is byte-identical to the source (same sha256); the page counts, artwork sizes and
paint library sizes in the table above match the files.

### 0.2 Binding rules

1. **Facts are fixed.** Names, dates, times, venues and addresses come only from `content.json`. Nothing is invented: no
   love story, no parents' names, no phone numbers, no hashtags, no tithi, no RSVP (unless the owner sets one, 2.4), no
   photos of the real couple (content.json `facts.do_not_invent`). New UI words (buttons, labels, captions) are allowed
   and are listed for native review (4.7). A fact must also survive the paint: what the eye reads equals the copy.
   No decoration (text-clipped gold, masks, `overflow`, `clip-path`, a tight line box) may hide part of a fact string or
   of the monogram, such as an anusvara, a matra, a nukta or a script swash.
2. **No fish anywhere**: no matsya motif, shape or word in any language (content.json `facts.do_not_use`). The content
   checker greps for it (4.1) in English, Hindi, Maithili and Bengali (`fish`, `matsya`, मछली, मत्स्य, माछ, মাছ, মৎস্য).
3. **Order rule.** `side=groom` (default) = variant `G`: the Jha family hosts, Akshay first, monogram `AS`, "Jha Family &
   Sil Family". `side=bride` = variant `B`: the Sil family hosts, Shreya first, monogram `SA`, "Sil Family & Jha Family".
   The monogram has to read `AS` or `SA` in the painted pixels, as it does on the card's page 1. Having the right letters
   in the DOM is not enough.
4. **Reception rule.** Default shows five events. `reception=0` applies `variants[lang][order].without_reception` exactly as
   `card.js withoutReception()` does (objects merge key by key, arrays and strings replace, `null` deletes), giving the
   reviewed four-event copy.
5. **Privacy.** The site is static and makes no third-party request: no CDN fonts, no analytics, no map embeds, no
   trackers. Outbound links (Maps, Google Calendar) open only on click. Default `robots: noindex` (6.2).
6. **Machines.** The Mac's disk is nearly full. Its volumes share one APFS container, so the free space moves with
   other work: it was between 0.6 and 2.7 GB on 2026-11-02. Never `npm install` or build on the Mac. Install, build,
   test and preview run on the dev desktop `dev-dsk-anaaks-2b-9537f078.us-west-2.amazon.com` in Docker (section 9).
   The Mac repo never holds `node_modules/` or `dist/`. Pull only small review images (JPEG, contact sheets) and stop
   pulling below 500 MB free (`scripts/sync.sh` refuses below that). Agents working in parallel use their own copy on
   dvd (`~/wedding_site/<name>/`) so one agent's sync never overwrites another's working tree.
7. **Inclusive language** in code and docs: primary/replica, allowlist/denylist and the like.

### 0.3 The facts (from content.json `facts` and the en variant; the year 2026 is inferred, see `facts.year_note`)

| Event | Date (IST) | Time | Venue | Address (en) | Start, UTC |
|---|---|---|---|---|---|
| Mehndi | 2026-11-25 | 11:00 | Agora Banquets | 67, Nalini Ranjan Ave, Block H, New Alipore, Kolkata | 2026-11-25T05:30:00Z |
| Engagement | 2026-11-25 | 18:00 | Agora Banquets | (same) | 2026-11-25T12:30:00Z |
| Haldi | 2026-11-26 | 10:00 | Roy Bari Events, Gate No.2 | 192B & C, Netaji Subhas Chandra Bose Rd, Regent Park, Kolkata | 2026-11-26T04:30:00Z |
| Wedding | 2026-11-26 | 18:00 | Roy Bari Events, Gate No.2 | (same) | 2026-11-26T12:30:00Z |
| Reception (`reception=1` only) | 2026-11-29 | 19:00 | Dev Resort | Gangjala Chowk Dhala, near the bus stand, Sant Nagar, Saharsa, Bihar 852201 | 2026-11-29T13:30:00Z |

No end times exist. Nothing on the site states one (2.3.4, open question O3).
The table is machine-checked: `tests/unit/ground-rules.test.tsx` parses it and compares every cell with content.json and
`src/generated/facts.ts`, so editing a fact here without a content refresh fails the tests.

### 0.4 Decisions at a glance

| Topic | Decision | Why (details in) |
|---|---|---|
| Stack | React 18.3 + TypeScript 5 + Vite 5 + react-router-dom 6.28 (pinned: 18.3.1, 5.9.3, 5.4.21, 6.28.2), plain CSS with tokens + CSS modules; runtime dependencies are exactly `react`, `react-dom`, `react-router-dom` | brief; smallest well-known stack (7) |
| Animation | no animation library; CSS keyframes/transitions, WAAPI, one tiny rAF scheduler | framer-motion adds 15-50 KB gz for what CSS does (3.9) |
| Painted backgrounds | **pre-rendered plates** made at build time by the engine's own paint library, exported as AVIF + WebP in 3 sizes for 3 frame shapes; only cheap layers move live | measured 1.0-1.25 s main-thread per painting on an M3 Pro; 27-33 MB of canvas per painting (6.4) |
| Page shape | one long page, native scrolling, no scroll hijacking; each painted section has a sticky full-viewport frame that the next section brushes over | smooth on phones, readable, deep-linkable (3.5, 5) |
| Rendering | static pre-render of `/{en,hi,mai,bn}/index.html` (SSR at build), hydrate on the client | per-language `<title>`/OG for link previews, fast LCP, works without JS (6.2) |
| i18n | `scripts/gen-i18n.mjs` turns the content snapshot + `content/ui.json` into `src/i18n/<lang>.json` with all four variants pre-resolved (`G1 G0 B1 B0`) | runtime stays trivial; the build validates every fact (4) |
| Fonts | the engine's woff2, subset per language to the glyphs actually used (fonttools, layout features kept), `font-display: swap` with metric-matched fallbacks | measured 2026-11-02: every face a language references is 104 KB (en), 201 KB (bn), 211 KB (hi, mai), instead of the engine's 3.0 MB set; budget in 6.7 (6.5) |
| Tirhuta | the Mithilakshar flourish is an SVG outline made at build (HarfBuzz shaping), not live text | Safari's Tirhuta shaping is not guaranteed; no 29 KB font at runtime (2.3.5) |
| Optional modules | RSVP, music, gallery: off unless set in `src/config.ts` | content.json says no RSVP; music licensing (2.4) |

### 0.5 How section 0 is enforced

Every rule above has an automatic check that runs with `npm test` on dvd. A rule without a check is a bug in this table.

| Rule | Check |
|---|---|
| 0.1 snapshot | `ground-rules.test.tsx`: sha256 of `content/content.json` = `SOURCE.md` = `CONTENT_SHA256` in `src/generated/facts.ts` |
| 0.2.1 facts fixed | `scripts/lib/validate.mjs` (every generated string against content.json); `ground-rules.test.tsx` renders all 16 pages (4 languages x `G1 G0 B1 B0`) and finds each event's title, time, venue and address lines in its section |
| 0.2.1 + 0.2.3 painted ink (P5) | `tests/e2e/ink.spec.ts` (row 8). For every `.gold-leaf` and `[data-fact]` element in the 16 pages at 360 and 1280 px, render it once as is and once with the gold swapped for a solid colour and no clipping. Crop both to the element's box plus 0.6em on every side and compare the ink. A mark that shows only in the plain render fails the check. |
| 0.2.1 nothing invented | validator: no phone-like digit runs; rendered pages: no 10-digit runs in any numeral system, no hashtags, no "RSVP" while RSVP is off |
| 0.2.2 no fish | validator (generated copy and `ui.json`); rendered pages; every shipped file and asset name under `src/` and `public/` |
| 0.2.3 order | validator; rendered pages: monogram `AS`/`SA`, the pair in order, the hosting family first in the closing |
| 0.2.4 reception | validator; rendered pages: `reception=0` has no `#reception`, no Dev Resort, no Saharsa; default has five events |
| 0.2.5 privacy | rendered pages: every absolute URL is an `<a href>` to Google Maps/Calendar with `rel=noopener`; shipped files: no other origin, no CDN `@import`, no analytics; `config.seo.indexable` is false |
| 0.2.6 machines | `.gitignore` lists `node_modules/`, `dist/`, `dist-ssr/` |
| 0.2.7 inclusive language | code, tests, tools, docs, content and README contain none of the listed terms |
| 0.3 facts table | parsed from this file and compared with content.json and the computed IST to UTC starts |
| 0.4 decisions | `package.json` dependencies and versions, no animation library or UI kit, plates are images and `src/` never imports the paint library, prerender in `build`, four variants per language, woff2 only and no Tirhuta font, the Tirhuta glyph is `<path>` outlines without `<text>`, RSVP/music/gallery off |

#### 0.5.1 Rendered check, 2026-11-02

Method: a build of `b2a93c5` plus the working tree in `node:20-bookworm` on dvd, then Chromium at 360, 390, 768,
1280 and 1920 px in en, hi and bn. Variants `G1` and `B0` were rendered: 30 pages, one screenshot per section, and
filmed frames of the opening and the Wedding entrance.

Passed on every page:
- the `<html lang>` and the per-language title;
- the hosting family first in the closing (Jha for `G`, Sil for `B`);
- the five events by default, with no Dev Resort or Saharsa under `reception=0`;
- no fish, RSVP, hashtag or 10-digit run;
- no request to another origin;
- the only outbound links go to `www.google.com` (Maps) and `calendar.google.com`, each with `noopener noreferrer`;
- no horizontal scroll and no console error.

`ground-rules.test.tsx`: 39/39 green.

Failed the painted-ink rule (owners asked in their reports; not fixed in section 0, whose files are this section and
the snapshot):
- **G1** (row 1, `src/styles/typography.css` `.gold-leaf`; the monogram rules) Every gold monogram reads "AJ" instead
  of `AS`, in the top bar, the opening ring, the closing ring and the footer, at every width. `background-clip: text`
  paints only inside the element's box. Pinyon Script's `S` swings far past its advance width and above its 1.0 line
  box, so its upper bowl is cut away. A test that adds `padding: .4em .6em; margin: -.4em -.6em` to `.gold-leaf` still
  clips the `S`, because the overhang is about 1em. The same change also shifts the opening hero, so a blanket bleed
  is not the fix. Draw the monogram from the shaped outlines already in `src/assets/glyphs/monogram-{AS,SA}.svg`,
  filled with the gold gradient in SVG. If it stays live text, give `.monogram__text` its own inline bleed of at
  least 1.1em, offset by an equal negative margin.
- **G2** (rows 1 and 5, `.closing__joiner` in `src/styles/layout.css`) The hi closing joiner "एवं" shows as "एव". The
  anusvara sits above the `line-height: 1` box and is clipped by the same text-clip. A 0.4em bleed on `.joiner`
  restores it (padding plus an equal negative margin, tested on dvd).

The section 10 second check (F5-F9) does not list G1 or G2. It found nothing clipped because it measured the DOM
boxes, not the painted ink. That gap is why 0.5 has a painted-ink row.

---------------------------------------------------------------------------------------------------------------------

## 1. Visual system (from the card), as design tokens

### 1.1 What the card does (observed on every rendered page)

- **One canvas = one colour family.** Each page is a single oil-and-gouache painting: long swirling brush strokes in close
  values of one hue, dry-brush streaks, a few watercolour blooms, paper grain, a soft vignette in the palette's deep tone,
  sparse gold-leaf flecks and one or two gilded swirl lines. The middle of the page (behind text and couple) is calm.
- **The fine gold frame.** Two hairlines inset from the trim (outer 4.9 mm, inner 6.4 mm on 148 mm, i.e. 3.3% and 4.35%
  of the width), outer 0.32 mm and inner 0.14 mm, with a small gold diamond at each corner between them.
- **Composition.** Centred, symmetrical, generous air. Event pages: hand title at the top (y ~15%), italic tagline, the
  couple standing on a painted floor (~45% of the page height, contact shadow under the feet), then date/time in spaced
  caps, venue in semibold, address in two lines broken after a comma. Cover: Ganesh in a gold halo, invocation in spaced
  caps, the heading in gold script, a short gold rule with a bindu, a gold brush ring holding the monogram, the pair's
  names in script, dates and city in spaced caps. Invitation: kalash, (hi/mai shloka), blessing in italic, host line, each
  name in large script with the honorific above it, a gold joiner, a faint alpana ghost behind the names, a shehnai in gold
  line under them. Closing: monogram ring, request in large script, a line in italic, a gold rule, regards, both families
  in caps with the gold joiner, a lit diya at the foot.
- **Motifs are sparse and painted**: one or two per page (marigold strands, toran, banana leaf, kalash + shankha, gold
  Madhubani bamboo + lotus buds + an aripan floor ring, kalash, shehnai, alpana ghost, diya).
- **Deep pages** (Wedding vermilion, Reception teal) invert: cream ink, gold accents.

### 1.2 Palettes (one class per section; values from `paint.js PALETTES`, `card.js BLUSH/TEAL` and `_theme.css`)

Web inks are the video's phone inks. Small gold-toned text uses an AA-safe `--gold-ink` (computed, 1.2.1), a step deeper
than the video's, because the web sets kickers at 13-16 px.

| Class | Sections | `--paper` | `--ground` (light, mid, deep) | `--ink` | `--ink-soft` | `--gold-ink` | `--sep` | mood |
|---|---|---|---|---|---|---|---|---|
| `pal-ivory` | opening, cultures, closing, paper bands | #f2e8d8 | #f7f0e4 #ebdcc3 #d9c3a0 | #6f4f22 | #785d33 | #7e5a22 | #bf9644 | light |
| `pal-blush` | invitation, venues band | #f3e6dc | #f8eee6 #eedbd0 #dcc0ae | #5e2a24 | #6e3d33 | #7e5a22 | #bf9644 | light |
| `pal-sage` | mehndi | #e3e7d4 | #eef0e1 #cdd6b8 #a7b78c | #3f5233 | #495c3c | #715623 | #b9984a | light |
| `pal-rose` | engagement | #eee0df | #f6ecea #e3c8cc #c9a8b9 | #5a3553 | #6a4563 | #6e542a | #bd9a57 | light |
| `pal-turmeric` | haldi | #f2deaa | #f8ebc6 #eccb78 #d9a547 | #8a2c18 | #7d3a1e | #724e19 | #a3341f | light |
| `pal-vermilion` | wedding | #a02024 | #b8352c #9a1e23 #741320 | #f7ead0 | #f0dcc0 | #f0d88e | #e2b15a | deep |
| `pal-teal` | reception | #21484a | #2e5a59 #21484a #153537 | #f3e7c6 | #e6dbbc | #e8cf8a | #d8b468 | deep |

Each class also sets: `--halo` / `--halo2` (text-shadow veil: light palettes = paper at .80/.55, vermilion
`rgba(104,14,24,.55)/rgba(84,12,23,.35)`, teal `rgba(12,36,38,.62)/rgba(12,36,38,.42)`), `--rule` (frame hairline = `--sep`),
`--gold-0..3` (palette `gold` array: ivory `#8c6526 #bf9644 #e6cb86 #fff3d1`, sage `#86662a #b9984a #e1cc8c #fbf1cf`, rose
`#8a6a35 #bd9a57 #e5cf98 #fff4dc`, turmeric `#8f6220 #c4952f #ecd07e #fff3c9`, vermilion `#9a6a24 #d1a24a #f0d88e #fff6d6`,
teal `#8f6c2f #c9a457 #ecd593 #fff6d8`), `--deep` (ground deep, for vignettes and bar tone), `--bar-ink` (top bar ink on that
section) and the motif tints `--m-*` (1.7).

#### 1.2.1 Contrast (computed 2026-11-02 from the hex values, WCAG 2.x formula)

- `--ink` on `--paper`: ivory 6.1, blush 9.4, sage 6.8, rose 7.9, turmeric 6.4, vermilion (cream on #a02024) 6.5, teal 8.2.
- `--ink` on the **deep ground** of a light plate drops to 3.8-4.7 (sage 4.0, turmeric 3.8, ivory 4.4); on vermilion's
  lightest strokes (#d05a3e) cream is 3.4; on teal's lights (#4a7a76) 3.9. Therefore text never sits on raw strokes: the
  plate's calm zones (1.3) keep strokes light behind text, every text block gets the CSS glaze (1.6) and `--halo` shadow,
  and QA measures real pixels (8.0, G-A11Y-2).
- The video's gold inks fail AA as small text on light paper (ivory #8c6526 = 4.3 on paper, 3.9 on the mid ground; rose
  #8a6a35 = 3.9). The `--gold-ink` values above reach >= 4.5 on both paper and the mid ground (ivory #7e5a22 = 5.1 / 4.6,
  sage #715623 = 5.4 / 4.6, rose #6e542a = 5.5 / 4.5, turmeric #724e19 = 5.6 / 4.8).
- Gold-leaf **display** text (>= 32 px) needs 3:1: its gradient body stays in `#7e5a22 -> #8c6526 -> #9a7232` (5.1 / 4.3 /
  3.6 on ivory paper) on light palettes; only the moving glint band (12% of the width) reaches `#c9a457`. Deep palettes use
  `--gold-1..3` (vermilion #f0d88e = 5.5 on #a02024, teal #ecd593 = 6.9 on #21484a).

### 1.3 Paper, brush and grain: the plate recipes

A **plate** is one finished painting for one section, made by `P.paint()` (paint.js) at build time (6.4). Recipes reuse the
card's seeds and settings so the site paints the same family as the card. Coordinates below are fractions of the frame
(x of width, y of height). Frames: `tall` 1080x2340 logical (phones, aspect <= 3/5), `mid` 1080x1350 (tablet portrait,
3/5-5/4), `wide` 1920x1080 (>= 5/4). `calm` = quiet zones (fewer, lighter strokes), `glow` = luminous area, `floor` = the
painted ground line.

| Plate | palette | style | seed | density | contrast | gold / goldLines / flecks | extra | calm, tall (wide) |
|---|---|---|---|---|---|---|---|---|
| `opening` | ivory | halo | 3611 | 1 | 1 | 1 / 2 / 40 | vortex at Ganesh `{x .5, y .24, r .55, s 1.2}` | Ganesh `.5,.24 r.28` k.82; column `.5,.60 rx.44 ry.30` k.80 (Ganesh `.5,.26`, column `.5,.66 rx.30 ry.30`) |
| `invitation` | blush (`card.js BLUSH`) | veil | 3621 | 0.8 | 0.66 | 0.7 / 0 / 30 | hue clamp `['#ead2c6', 0.55]` | names `.5,.52 rx.48 ry.34` k.88 (`.5,.52 rx.34 ry.40`) |
| `mehndi` | sage | swirl | 3631 | 0.75 | 0.75 | 0.5 / 0 / 26 | `floor` .74 (wide .86) | title `.5,.13 rx.44 ry.07` k.80; couple `.5,.47 rx.36 ry.20` k.74; facts `.5,.82 rx.46 ry.10` k.88 (couple left: `.30,.55 rx.18 ry.35` k.70; text right: `.70,.50 rx.25 ry.38` k.88) |
| `engagement` | rose | swirl | 3641 | 0.7 | 0.55 | 0.5 / 0 / 26 | floor as mehndi | as mehndi (couple right, text left: mirrored) |
| `haldi` | turmeric | veil | 3651 | 0.85 | 0.85 | 0.5 / 0 / 30 | sun glows (card `under`: soft-light #eea23a at `.72,.17`, screen #ffe7ad at `.78,.13`) | as mehndi (couple left) |
| `wedding` | vermilion | swirl | 3661 | 0.8 | 0.75 | 0.5 / 2 / 40 | glow #fbdcc4 .26 behind the couple | as mehndi (couple right) |
| `reception` | teal evening (`card.js TEAL`: strokes 30% toward ground mid, darks #1b3a38 #173533, lights 30% toward #5d7f6f) | veil | 3761 | 0.66 | 0.44 | 0.5 / 0 / 26 | soft-light #f0d29a .34 and #d9b77e .10 behind the couple | as mehndi (couple left) |
| `cultures` | ivory | halo | 3791 | 0.6 | 0.5 | 0.6 / 1 / 20 | glow `.5,.5 r.7 k.5` | two halves `.28,.5` and `.72,.5 rx.22 ry.36` k.85 (tall: `.5,.3` and `.5,.72`) |
| `closing` | ivory | halo | 3681 | 1 | 1 | 1 / 1 / 50 | glow at the diya `.5,.86 r.5 k.7` | text `.5,.42 rx.46 ry.30` k.92; diya `.5,.86 rx.24 ry.08` k.70 |

Every plate also gets, at build: `clearGold` feathered erasure inside all calm zones (no gold fleck beside a date: card
rule), the card's grain (`P.grain('paper')`, soft-light, alpha 0.20) and vignette (multiply in `ground[2]`, alpha 0.14
light / 0.22 deep), all baked into the base image. Plates contain **no position-critical art** (no couple, shadow or prop):
those are sprites placed by the layout, so text reflow never misaligns the painting.

Each plate exports three layers per frame: `base` (opaque: ground, washes, underpainting, textured strokes, grain,
vignette), `gold` (transparent: flecks + gilded lines, same pixel grid as `base`) and `veil` (transparent, 14-20 sparse
low-contrast strokes traced on the same flow field, at half resolution; it drifts against the base, 3.6).

Paper bands (countdown, celebrations header, venues, RSVP, gallery, footer) have no plate: `--paper` + the tileable grain
`textures/paper-512.webp` (soft-light, 0.18) + two CSS radial washes in `--ground` light/mid. They read as the card's paper.

### 1.4 Gold

- **Gold leaf (text).** `.gold-leaf`: `background-image: linear-gradient(100deg, var(--gl-0) 0%, var(--gl-1) 34%,
  var(--gl-2) 46%, var(--gl-glint) 50%, var(--gl-2) 54%, var(--gl-1) 66%, var(--gl-0) 100%), url(textures/gold-leaf-256.webp)`;
  `background-size: 300% 100%, 256px 256px`; `background-blend-mode: multiply`; `-webkit-background-clip: text;
  background-clip: text; color: transparent`. Light palettes: `--gl-0 #7e5a22, --gl-1 #8c6526, --gl-2 #9a7232, --gl-glint
  #c9a457`; deep palettes: `--gold-1..3`. Fallback (`@supports not (background-clip: text)`): `color: var(--gold-ink)`.
  Used only for: the opening heading, both monograms, the "&"/"ও" joiners, the closing monogram.
- **Gold hairlines** (frame, rules, card borders): `--rule` at 1 px; inner frame line at 60% opacity.
- **Gold brush strokes** (rule, ring): SVG paths with a `linearGradient` through `--gold-0..3` and a slight width taper
  (two paths per stroke, as `goldRule` / `goldRing` in card.js: rule = two gentle strokes meeting at a 4 px bindu; ring =
  two arcs from the bottom to a 14 degree gap at the top holding a bindu).
- **Bindu**: radial gradient `--gold-3 -> --gold-2 (45%) -> --gold-1 (85%) -> transparent`.
- **Leaf texture**: `textures/gold-leaf-256.webp` from `P.goldTexture()` (leaf squares, seams, crackle), exported once.

### 1.5 Typography per script

Fonts (all OFL, from the engine): Latin `Pinyon Script` (hand), `Marcellus` (spaced caps), `Cormorant Garamond` 500, 500
italic, 600 (text). Devanagari (hi, mai): `Amita` 400 (hand), `Sahitya` 400/700 (classic text), `Noto Serif Devanagari`
500/600 (venue, address). Bengali: `Atma` 500 (hand; the video replaced Galada with it, QA r2 R2E-5), `Tiro Bangla` 400
(text), `Noto Serif Bengali` 500 (address). Every language also loads tiny Latin subsets of Pinyon (`AS`, `SA`) and
Cormorant italic (`&`).

Rules: Indic scripts are never letter-spaced, uppercased or italicised; `font-synthesis: none` everywhere; the Latin "&"
is Cormorant italic 500 in gold in every language (Pinyon's reads as "4"); bn joins with "ও" in Atma; addresses use
`font-variant-numeric: lining-nums` in en (Cormorant's old-style "1" made 852201 look broken, video QA r1 text #3);
headings use `text-wrap: balance`; body `text-wrap: pretty`.

Role table (CSS px; `clamp(min, fluid, max)`; the fluid term is `min(Avw, Bsvh)` so short landscape screens do not
blow titles up). `--fs-*` tokens are defined per `:root[lang]`.

| Role | en | hi / mai | bn | line height en / Indic | Where |
|---|---|---|---|---|---|
| `hero` | Pinyon 400, clamp(64, min(15vw,11svh), 132), gold leaf | Amita, clamp(52, min(12.5vw,9.5svh), 112) | Atma 500, clamp(56, min(13.5vw,10svh), 120) | 1.15 / 1.38 | opening heading |
| `names` | Pinyon, clamp(44, min(11.5vw,8svh), 96) | Amita, clamp(38, min(9.6vw,7svh), 80) | Atma, clamp(40, min(10.2vw,7.3svh), 84) | 1.15 / 1.38 | invitation names |
| `pair` | Pinyon, clamp(30, 7vw, 52) | Amita, clamp(26, 6vw, 44) | Atma, clamp(27, 6.3vw, 46) | 1.2 / 1.4 | opening pair, footer |
| `title` | Pinyon, clamp(56, min(14vw,10svh), 120) | Amita, clamp(46, min(11.5vw,8.3svh), 100) | Atma, clamp(48, min(12vw,8.6svh), 104) | 1.15 / 1.38 | event titles, section headings |
| `close` | Pinyon, clamp(40, 9.5vw, 84) | Amita, clamp(32, 8vw, 68) | Atma, clamp(34, 8.6vw, 72) | 1.15 / 1.45 | closing request (2 lines) |
| `mono` | Pinyon, clamp(44, 11vw, 84), gold leaf, letter-spacing -0.06em | same (Latin) | same | 1 | monogram in the ring |
| `kicker` | Marcellus caps +0.22em, clamp(12.5, 3vw, 16), `--gold-ink` | Sahitya 700, clamp(17, 4.2vw, 22) | Tiro Bangla, clamp(16, 4vw, 21) | 1.3 / 1.5 | invocations, small heads |
| `dateline` | Marcellus caps +0.16em, clamp(13, 3vw, 17) | Sahitya 700, clamp(16, 3.8vw, 20) | Tiro Bangla, clamp(16, 3.8vw, 20) | 1.35 / 1.5 | opening dates / cities |
| `blessing` | Cormorant italic 500, clamp(18, 4.3vw, 26) | Sahitya, clamp(16, 3.8vw, 22) | Tiro Bangla, clamp(16, 3.8vw, 22) | 1.35 / 1.6 | blessing line, shloka (gold-ink) |
| `host` | Cormorant 500, clamp(17, 3.9vw, 24) | Sahitya, clamp(16, 3.6vw, 21) | Tiro Bangla, clamp(16, 3.6vw, 21) | 1.35 / 1.6 | host line (2 balanced lines) |
| `honor` | (none in en) | Sahitya 700, clamp(14, 3.2vw, 18), `--gold-ink` | Tiro Bangla, clamp(14, 3.2vw, 18) | 1.4 | honorific above each name |
| `tagline` | Cormorant italic 500, clamp(18, 4.4vw, 27), `--ink-soft` | Sahitya, clamp(16, 3.9vw, 22) | Tiro Bangla, clamp(16, 3.9vw, 22) | 1.3 / 1.5 | event tagline |
| `when` | Marcellus caps +0.13em, clamp(14, 3.3vw, 19) | Sahitya 700, clamp(17, 4.1vw, 23) | Tiro Bangla, clamp(18, 4.3vw, 24) | 1.3 / 1.4 | date · time |
| `venue` | Cormorant 600, clamp(19, 4.5vw, 27) | Noto Serif Devanagari 600, clamp(17, 4.1vw, 23) | Tiro Bangla, clamp(17, 4.1vw, 23) | 1.2 / 1.4 | venue name |
| `addr` | Cormorant 600, clamp(16, 3.5vw, 20), lining nums | Noto Serif Devanagari 500, clamp(15, 3.2vw, 18) | Noto Serif Bengali 500, clamp(15, 3.2vw, 18) | 1.28 / 1.5 | address (2 lines) |
| `closeline` / `regards` | Cormorant italic 500, clamp(17, 4vw, 24) | Sahitya, clamp(16, 3.6vw, 21) | Tiro Bangla, clamp(16, 3.6vw, 21) | 1.35 / 1.6 | closing line, regards |
| `family` | Marcellus caps +0.12em, clamp(15, 3.5vw, 20) | Sahitya 700, clamp(18, 4.2vw, 24) | Tiro Bangla, clamp(18, 4.2vw, 24) | 1.3 / 1.5 | family names |
| `ui` | Marcellus caps +0.14em, 14 (buttons), 13 (nav) | Sahitya 700, 16 / 15 | Tiro Bangla, 16 / 15 | 1.2 / 1.4 | buttons, nav, labels |
| `digits` | Cormorant 500 lining tabular, clamp(40, 11vw, 72) | Sahitya, clamp(38, 10vw, 68) | Tiro Bangla, clamp(38, 10vw, 68) | 1 | countdown numerals |

Minimum rendered sizes on a 360 px screen: running text >= 16 px Latin / 15 px Indic; facts (`when`, `venue`, `addr`) at
the sizes above (the owner asked for larger, readable facts, BRIEF 2026-11-01 23:48).

### 1.6 Spacing, frame, surfaces

- Spacing scale (px): `--s-1 4, --s-2 8, --s-3 12, --s-4 16, --s-5 24, --s-6 32, --s-7 48, --s-8 64, --s-9 96, --s-10 128`.
  Section padding `--pad-y: clamp(72px, 12svh, 160px)`, `--pad-x: clamp(20px, 6vw, 96px)`.
- Columns: text column `--col: min(88vw, 620px)`; wide layout text column `clamp(420px, 38vw, 600px)`; content max width
  `--max: 1280px`.
- **Hairline frame** (every plate section, in the sticky layer): outer inset `--frame-in: clamp(10px, 3.3vw, 32px)`, inner
  inset `calc(var(--frame-in) + clamp(6px, 1.05vw, 13px))`, 1 px `--rule` (inner at 60% opacity), 4 diamonds `clamp(6px,
  0.9vw, 9px)` rotated 45 degrees centred between the lines. Insets add `env(safe-area-inset-*)`.
- **Glaze** behind every text block on a plate (the card's `glazeText`, in CSS): `::before` ellipse `inset: -34px -60px`,
  `radial-gradient(closest-side, var(--glaze) 0%, var(--glaze-75) 62%, transparent 100%)`; light palettes `--glaze` =
  `lights[1]` at .42 alpha, deep = `ground[2]` darkened 35% at .34. Plus `text-shadow: 0 0 16px var(--halo), 0 0 4px
  var(--halo2)`.
- **Buttons** ("gilt pill"): height >= 44 px, padding 0 20 px, `border-radius: 999px`, 1 px `--gold-ink` border, ink text,
  background `color-mix(in srgb, var(--paper) 72%, transparent)` with `backdrop-filter: blur(6px)` (fallback paper .9).
  Deep palettes: cream border/text on `rgba(ground-deep, .45)`. Hover: background to 90%, border to `--gold-1`. Focus: 6.1.
- **Cards on paper bands** (countdown, venue cards): the card frame in miniature (two hairlines 8 px apart, diamond
  corners), radius 2 px, shadow `0 14px 40px -26px rgba(60,40,20,.35)`.
- Radii: 0 for frames, 2 px for cards, pill for buttons. No other shadows.

### 1.7 Motifs per section

Painted sprites are exported once (6.5) from `assets/motifs/*_paint.svg` with the section's `--m-*` tints (values from
card.js `MOTIF_VARS` and `_theme.css` section 4) and placed by the layout. Line art (`*_line.svg`) is inlined for draw-on.

| Section | Edge motifs (sticky frame, sides only) | Near motifs (with the couple / text) | Particles (3.6) |
|---|---|---|---|
| opening | none | Ganesh paint + line (`--m-ink #a07a34`), gold rule, monogram ring | sparks x6 |
| invitation | none | kalash paint (small, top), shehnai line (gold ink), alpana ghost sprite at 9% behind the names | none |
| mehndi | marigold strands top-left (h 470/1532 of frame) and top-right (300), filter `saturate(.68) brightness(1.1) contrast(.82) sepia(.12)` | none | leaf dabs x4 |
| engagement | toran across the top (w 76% of frame) | none | petals x4 |
| haldi | banana leaf, left, rotated -9 degrees from its foot | none | marigold petals x4 |
| wedding | none | kalash (front left of the couple), shankha (front right) | sparks x4 |
| reception | gold Madhubani bamboo both sides (3 stalks, card.js `bamboo()` geometry), lotus buds at their feet, 4 soft evening lights in the upper teal | aripan floor ring (rice-paste line + sindoor dots) baked under the couple sprite | none (lights breathe) |
| cultures | none | aripan line, paag line (Mithila half); alpana line, topor line, shankha line (Bengal half); lotus open line at the seam; Tirhuta flourish | none |
| venues | none | alpana ghost corner on the Kolkata card, aripan ghost corner on the Saharsa card (8% alpha) | none |
| closing | none | monogram ring, diya paint (flame flicker, glow) | dust x5 |

Tints (`--m-*`), per INDEX.md "event suggestions" and the theme: mehndi `--m-ink #4f5b3c`, marigold #d39a4f/#e9c27f/#a46a35,
leaf #8b9a6b/#b9c398/#5d6b47, thread #9a5a40; engagement ink #5e3a4a, petal #c9a2b4, leaf #9ba68c/#c4cab2/#6f7a64, toran
flowers #cf9d92/#ead0c7/#a3716c, thread #9b6a7e; haldi ink #7a4a1c, gold #c99a3a, leaf #b0a465/#d8cc98/#867845; wedding ink
#6e231e, gold #d1a24a/#f0d88e/#9a6a24, leaf #7f8c5b/#a9b382/#56603c, thread #e2b15a, red #c0473a; reception petal
#dfbca4/#ecd6c2/#ad8572, leaf #6f8f80/#93ab9c/#4a675d, gold line #d8b468 (hi #e8cf8a, sh #b8964f), rice #efe6d2; ivory
sections `--m-ink #a07a34`; cultures line ink: Mithila half `#7a2e22` (sienna, aripan default), Bengal half `#7a3326`
(alpana default), lotus seam `#a07a34` (gold).

### 1.8 Token files

- `src/styles/tokens.css`: spacing, columns, frame, radii, z-index scale (`--z-plate 0, --z-edge 10, --z-reveal 15 (inside the frame, under the content),
  --z-content 20, --z-bar 50, --z-sheet 60, --z-skip 100`), motion tokens (3.2), breakpoints as custom media
  (`@custom-media` is not native: breakpoints are repeated as literal media queries; the values live in a comment table
  and in `src/lib/breakpoints.ts`).
- `src/styles/palettes.css`: the seven `.pal-*` classes (1.2) with every variable listed there.
- `src/styles/typography.css`: role classes `.t-hero ... .t-digits` and the `:root[lang]` font-size tokens (1.5).
- `src/styles/fonts.<lang>.css`: generated `@font-face` per language (6.5); only the current language's file is linked.

---------------------------------------------------------------------------------------------------------------------

## 2. Site map, routes and sections

### 2.1 URL contract

| URL | Result |
|---|---|
| `/{lang}/` with `lang` in `en`, `hi`, `mai`, `bn` (also `/{lang}` without the slash) | the page in that language. Canonical form has the trailing slash (static directory). |
| `/` | language detection (2.1.1), then `replace` to `/{lang}/` keeping `?query` and `#hash` |
| `/{lang}/anything` | `replace` to `/{lang}/` (query and hash kept) |
| `/EN/`, `/english`, `/hindi`, `/maithili`, `/bangla`, `/bengali` (case-insensitive) | `replace` to the canonical language path |
| anything else | `replace` to `/en/` (query and hash kept) |
| `?side=groom` (default) or `?side=bride` | variant G or B (0.2 rule 3). Also accepted: `g`/`b`, the engine's `order=G|B`. Invalid values: default. |
| `?reception=1` (default) or `?reception=0` | five or four events (0.2 rule 4). Also accepted: `true/false`, `yes/no`, `on/off`. |
| `#<section-id>` | scroll to that section (2.2). A hidden section's id maps to its nearest visible parent: `#reception` (with `reception=0`) and every event id map to `#celebrations` if absent; `#countdown` after the wedding start maps to `#celebrations`; disabled `#rsvp`/`#gallery` map to `#closing`. |

Unknown query parameters are ignored and preserved. A `VITE_BASE` sub-path (for example `/wedding/`) prefixes every route
(`<BrowserRouter basename>`, `vite.config.ts base`).

#### 2.1.1 Default language

`public/redirect.js` (external file, so a strict CSP needs no inline hash; shared by `/index.html` and `/404.html`):
1. `localStorage['asw.lang']` if the guest chose a language before (set by the switch, 4.6);
2. else the first of `navigator.languages` whose primary subtag is `mai`, `bn`, `hi` or `en` (`mai` before `hi`, because a
   Maithili browser often lists `hi` second);
3. else `en`.
It then calls `location.replace(base + lang + '/' + location.search + location.hash)`. `<noscript>`: a meta refresh to
`en/` and four plain links. React's `<RootRedirect/>` repeats the same logic for client-side navigations to `/`.

#### 2.1.2 Language switch keeps the place

- The switch renders real links (`<a href="/{lang}/?{query}#{activeSection}" hreflang lang>`), so it works without JS.
- With JS, a click calls `navigate()` (push; Back returns to the previous language) after recording `{ id, ratio }` of the
  section in view (`ratio` = how far the viewport top is into that section). After the new copy renders
  (`useLayoutEffect`), the page scrolls to `sectionTop + ratio * sectionHeight` instantly (never smooth). Paint reveals
  that already ran do not replay; plates do not reload (they are language-independent).
- The new language's copy chunk and fonts are prefetched on `pointerenter`/`focus` of its link.
- `activeSection` comes from the scrollspy (`src/lib/scrollspy.ts`: IntersectionObserver, the section covering the
  viewport's 40% line). With `config.syncHashOnScroll` (default true), the hash follows the scroll through
  `history.replaceState` (at most once per 400 ms, only on change; `#opening` is written as no hash).

### 2.2 Page order and anchors

| # | Section | id | Background | Shown when | Nav label (4.7) |
|---|---|---|---|---|---|
| 1 | Opening | `opening` | plate `opening` (ivory) | always | (monogram in the bar) |
| 2 | Invitation | `invitation` | plate `invitation` (blush) | always | `nav.invitation` |
| 3 | Countdown | `countdown` | paper band (ivory) | `config.sections.countdown` and now < wedding start | `nav.countdown` |
| 4 | Celebrations header | `celebrations` | paper band (ivory) | always | content `single_page.events_heading` |
| 4a-e | Mehndi, Engagement, Haldi, Wedding, Reception | `mehndi`, `engagement`, `haldi`, `wedding`, `reception` | plates (sage, rose, turmeric, vermilion, teal) | Reception only with `reception=1` | sub-items: `events[e].title` |
| 5 | Two cultures | `cultures` | plate `cultures` (ivory) | `config.sections.cultures` (default true, see O1) | `nav.cultures` |
| 6 | Venues | `venues` | paper band (blush) | always | `nav.venues` |
| 7 | RSVP | `rsvp` | paper band (ivory) | `config.rsvp.url` set | `rsvp.cta` |
| 8 | Gallery | `gallery` | paper band (ivory) | `config.gallery.length > 0` | `gallery.title` |
| 9 | Closing | `closing` | plate `closing` (ivory) | always | none |
| - | Footer | `footer` | paper (ivory) | always | none |

Section ids are English and identical in every language, so a hash survives a language switch.

### 2.3 Sections

Content keys are paths inside the resolved variant `V = variants[lang][side+reception]` produced by the generator (4.2);
their content.json origin is given in brackets.

#### 2.3.1 Opening (`Opening.tsx`)

- **Content**: `V.invocation` [`invocation`], `V.invocationSecondary` [`invocation_secondary`, only when present, e.g. en_B
  "Sri Sri Prajapataye Namah", bn_G "শ্রী গণেশায় নমঃ"], `V.heading` [`heading`], `V.monogram` [`monogram.latin`],
  `V.pair` [`names.pair_short` split around `joiner_symbol`], `V.dateline.dates` / `V.dateline.cities` [`save_the_date.line`
  split at its first " · ", as card.js `cover()`: "25, 26 & 29 November" / "Kolkata · Saharsa"; `reception=0`:
  "25–26 November" / "Kolkata"].
- **Layout** (centred column, card cover order): Ganesh (painted sprite with the line SVG on top at 45% opacity; width
  `clamp(150px, min(34vw, 22svh), 260px)`), invocation kicker, secondary kicker, the heading in gold leaf (`h1`), gold rule
  with bindu, the monogram in its gold ring (ring diameter `clamp(120px, 30vw, 200px)`), the pair in `pair` role with the
  gold joiner, dates and cities in `dateline` role on two lines. A scroll cue (a short brush-drawn chevron in `--gold-ink`,
  `aria-label` `a11y.scrollCue`, links to `#invitation`) sits 4 svh above the frame bottom.
- **Notes**: no paint-reveal here (the plate is the LCP element and shows at once, 6.6). The first frame is a finished
  ivory painting with a faint gold Ganesh, like the video's thumbnail.

#### 2.3.2 Invitation (`Invitation.tsx`)

- **Content**: `V.shloka` [hi/mai `shloka`, split after "।" into two lines, gold-ink, `blessing` role], `V.blessing`
  [`blessing_line`], `V.host` [`host_line`, hyphens joined with U+2060 as card.js], `V.names.first|second` `{ text,
  honorific }` [`names.first`, `names.first_honorific`, ...], `V.joiner` [`joiner_symbol`: "&" or "ও"].
- **Layout** (card page 2): painted kalash (height `clamp(70px, 9svh, 110px)`), shloka, blessing (italic), host line
  (exactly 2 balanced lines on >= 390 px; may take 3 on 360 px), honorific (small, gold-ink) above name 1 (`names` role,
  never broken inside a name), the gold joiner, honorific + name 2, the shehnai in gold line (width `clamp(180px, 40vw,
  300px)`). The alpana ghost (9% alpha sprite, width 1.1x the names block) sits centred behind the names.
- A visually hidden `h2` (`nav.invitation`) labels the section.

#### 2.3.3 Countdown (`Countdown.tsx`)

- **Target**: the wedding start (0.3: 2026-11-26T12:30:00Z, computed by the generator from `facts.events.wedding`
  `date_iso` + `time_24h` at +05:30). The section and its nav item disappear at that instant (no invented "after" text).
- **Content**: heading `ui.countdown.title` (`title` role, smaller: 0.6x), units days · hours · minutes
  (`config.countdown.showSeconds`, default false: calmer), labels `ui.countdown.*` with plural forms, numerals in the
  language's digits (4.5), then `V.events.wedding.title` · `V.events.wedding.dateTime` and `venue` as a small line, and the
  wedding's "Add to calendar" (2.3.4).
- **Layout**: a framed paper card (1.6) centred on an ivory band, units in a row (gap `clamp(16px, 5vw, 48px)`), gold
  rule above and below. Each number has `min-width: 2ch` and tabular figures so the row never jitters.
- **Rendering**: the pre-rendered HTML holds "—" placeholders and a static sentence with the wedding date; the client fills
  the numbers after mount (no hydration mismatch) and updates on each minute boundary (`setTimeout` to the next minute, not
  an interval; paused when the tab is hidden). Changed digits crossfade over 400 ms (none under reduced motion).
  An `sr-only` sentence (`ui.countdown.sr`) is updated with `aria-live="off"` (read on demand, never announced each minute).

#### 2.3.4 Celebrations (`Celebrations.tsx`, `EventSection.tsx`, `EventActions.tsx`)

- **Header band** (`#celebrations`): heading [`single_page.events_heading`: "Celebrations", "मांगलिक कार्यक्रम",
  "मांगलिक कार्यक्रम", "অনুষ্ঠানসূচি"] in `title` role; a row of chips, one per event (`events[e].title` + `events[e].date`),
  each an anchor to its section; "Add all to calendar" (`cal.addAll`).
- **Event section** (one per `V.events[]`, in `events_order`): `h3` title [`title`] in `title` role, tagline [`tagline`],
  the couple sprite (`figure`, alt `alt.couple` with the event title, 4.7), facts as a `dl` (visually hidden `dt` from
  content `labels.date` + `labels.time` and `labels.venue`): `dateTime` [`date_time`, with " · " in `--sep`], `venue`
  [`venue_name_full`], `address` [`venue_address`, two lines broken after a comma, 4.4], then the actions row.
- **Actions** (`EventActions`): "Add to calendar" (`cal.add`) opens a small disclosure (`button aria-expanded`, Esc and
  outside click close it, focus returns) with two items: "Apple · Outlook (.ics)" (`cal.ics`) and "Google Calendar"
  (`cal.google`). "Open in Maps" (`maps.open`): `https://www.google.com/maps/search/?api=1&query=` +
  `encodeURIComponent(mapQuery)` where `mapQuery` = the English `map_line_en` of that event (identical in all 8 variants,
  verified 2026-11-02), `target="_blank" rel="noopener noreferrer"` with the `a11y.newTab` hint.
- **.ics** (`src/lib/ics.ts`, client-side Blob, file `akshay-shreya-<event>.ics` or `akshay-shreya-celebrations.ics`):
  `BEGIN:VCALENDAR`, `VERSION:2.0`, `PRODID:-//Akshay & Shreya//Wedding//EN`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`; per
  event `BEGIN:VEVENT`, `UID:<event>-<yyyymmdd>@akshay-shreya.wedding`, `DTSTAMP` (now, UTC), `DTSTART:<UTC start>Z`,
  `DTEND` **only if** `config.calendar.durationMinutes` is set (default `null`: a point-in-time event, RFC 5545 3.6.1; O3),
  `SUMMARY:<events[e].title> · <pair_short>` (page language), `LOCATION:<map_line_en>`, `DESCRIPTION:<venue_name_full>,
  <venue_address>` (page language) + `\n` + the site URL when `config.siteUrl` is set, `URL` likewise. Text escaped
  (`\\`, `\;`, `\,`, `\n`), CRLF line ends, lines folded at 75 octets on UTF-8 boundaries (Devanagari and Bengali are 3
  bytes per code unit: never split a sequence).
- **Google Calendar link**: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=..&dates=<start>/<end>&details=..&location=..&ctz=Asia/Kolkata`
  with `<end>` = start + `durationMinutes`, or `<start>/<start>` when unset (verify in QA that Google accepts it; else O3).
- **Layouts**: 5.2 (tall: stacked like the card; wide: couple on one side, text panel on the other, alternating:
  Mehndi left, Engagement right, Haldi left, Wedding right, Reception left).
- **Couple sprites**: `couples_original/<event>.png` (Reception: `wedding.png`) integrated at build like card.js
  `rasterSkin`: alpha edge feathered with a ragged paper-noise contour, paper grain 0.06, an 8% glaze of the section's
  paper (`source-atop`), the contact shadow (ellipse `rx = min(0.46 x figure width, 0.43 x figure height)`, `ry = 0.032 x
  figure height`, radial `darks[0]` at 0.24 -> 0.7 -> 0.2 -> 0, as card.js `couple()`) baked below the feet; Mehndi drawn 2.5% smaller (raised hands), Reception 3% smaller with the aripan
  floor ring and rice + sindoor dots baked under the feet (card.js reception `back()` geometry, scaled to the sprite).

#### 2.3.5 Two cultures (`Cultures.tsx`)

- **Intent**: an artsy, quiet interlude between the events and the practical venues: Mithila and Bengal side by side as
  line art drawing itself as you scroll. It must not repeat the video's removed indigo "Milan" scene (owner, 2026-11-01
  23:48: "completely unnecessary"): no night palette, no "শুভ বিবাহ" inscription pair, no extra copy. One config switch
  removes it (`config.sections.cultures`, open question O1).
- **Content**: `h2` `cultures.title` ("Mithila & Bengal"); captions `cultures.aripan`, `cultures.paag`, `cultures.lotus`,
  `cultures.alpana`, `cultures.topor`, `cultures.shankha`; the Tirhuta flourish with caption `cultures.tirhuta`; the word
  "বাংলা" in Atma with caption `cultures.bangla`. Nothing else.
- **Layout**: wide: two halves either side of a central lotus seam. Left (Mithila): Tirhuta flourish above, aripan (width
  `min(30vw, 420px)`), paag line below it; right (Bengal): "বাংলা" above, alpana (same width), topor + shankha below.
  Tall: stacked Mithila block, the lotus as a divider, Bengal block. The Tirhuta and the Bengali word are never adjacent
  (video QA: Tirhuta next to Bengali reads as a misspelt Bengali word to Bengali readers).
- **Tirhuta flourish**: "मिथिला" in Mithilakshar = U+114A7 MA, U+114B1 VOWEL SIGN I, U+1149F THA, U+114B1 VOWEL SIGN I,
  U+114AA LA, U+114B0 VOWEL SIGN AA (names checked with Python `unicodedata`, Unicode 15.0). Shaped with HarfBuzz from
  `NotoSansTirhuta-n400-tirhuta.woff2` at build (`tools/glyphs/tirhuta.mjs`, harfbuzzjs) and stored as
  `src/generated/tirhuta-mithila.svg` (paths only, `--gold-ink` fill, `aria-hidden`; the caption carries the meaning).
  Native Maithili check required (4.8).

#### 2.3.6 Venues (`Venues.tsx`, `VenueCard.tsx`)

- **Content**: `h2` `nav.venues`; one card per city. Cities come from `V.cities` [`city` split at " · ": "Kolkata ·
  Saharsa", or "Kolkata" with `reception=0`]. Each day of `V.days` [`single_page.days`] is assigned to a city by the
  generator through `facts.events[key].venue_key` (`agora`, `roybari` -> city 0; `devresort` -> city 1). Per day: the day
  heading [`heading`], the event lines [`events[].line`, e.g. "Mehndi · 11:00 AM"], the venue [`venue_name_full`], the
  address [`venue_address`], "Open in Maps" [`map_line_en`].
- **Layout**: wide: the cards side by side (Kolkata first), tall: stacked. Each card uses the miniature frame (1.6); the
  city name in `title` role at 0.55x; a ghost corner ornament (Kolkata: alpana, Saharsa: aripan, 8% alpha).
- With `reception=0` only the Kolkata card shows, centred.

#### 2.3.7 Closing (`Closing.tsx`)

- **Content**: `V.monogram`, `V.closing.bigLines` [`closing_big`, split as the storyboard 4.1 table: en "We look forward /
  to your presence", hi "आपकी शुभ उपस्थिति / की प्रतीक्षा रहेगी", mai "अपनेक बाट / जोहि रहल छी", bn "আপনার উপস্থিতি /
  একান্ত কাম্য" (the generator asserts that the two parts joined by a space equal the content string)], `V.closing.small`
  [`closing_small`], `V.closing.regards` [`regards`], `V.closing.families` [`regards_families_lines`, 3 parts: family,
  joiner, family, in variant order].
- **Layout** (card closing page): monogram ring, the request (`close` role, 2 lines; on < 360 px wide it may rebalance),
  the line (italic), a gold rule, regards, family 1, the joiner (gold), family 2, and the painted diya at the foot (width
  `clamp(130px, 28vw, 220px)`) with its glow. `h2` = the request.

#### 2.3.8 Chrome (`TopBar.tsx`, `LanguageSwitch.tsx`, `SectionNav.tsx`, `Footer.tsx`, `SkipLink.tsx`)

- **Top bar**: height 56 px (phones) / 64 px (>= 1024 px) + `env(safe-area-inset-top)`; content sits inside the inner
  frame inset. Left: the small monogram in a tiny gold ring (link to `#opening`). Right: the language switch and the menu
  button. Transparent over the opening; after the opening it gets a paper glass background (`--paper` at 82% +
  `backdrop-filter: blur(10px)`, a 1 px `--rule` bottom line). Its ink follows the section in view (`data-tone` from the
  scrollspy: cream over Wedding/Reception). On phones it hides on scroll down after the invitation and returns on scroll up
  (transform only, 260 ms).
- **Language switch**: four endonyms, never translated: "English", "हिन्दी", "मैथिली", "বাংলা" (each link carries `lang`
  and `hreflang`); compact labels on < 480 px: "EN", "हि", "मै", "বা" with the full endonym as `aria-label`. The current one
  has `aria-current="true"` and a short gold brush underline (an SVG stroke that draws in over 300 ms on change).
- **Section nav** (menu sheet): a full-height paper sheet from the right (wide) or bottom (tall), focus trapped, Esc
  closes, focus returns to the button; links in page order (2.2), event sub-items indented with their dates.
- **Footer**: small monogram, `V.pair`, the language switch (full endonyms), "Back to top" (`nav.top`), and the music
  credit when the music module is on. No other credits.
- **Skip link**: first focusable element, "Skip to the invitation" (`a11y.skip`), target `#invitation`.
- **`theme-color`** meta follows the section in view (`--paper`, or `--ground` mid on deep sections), throttled.

### 2.4 Optional modules (`src/config.ts`)

```ts
export const config = {
  siteUrl: import.meta.env.VITE_SITE_URL ?? null,      // absolute origin + base; needed for canonical, hreflang, og:image
  seo: { indexable: false },                           // robots noindex,nofollow unless true (6.2, O6)
  sections: { countdown: true, cultures: true },       // venues, celebrations, invitation, opening, closing are always on
  countdown: { showSeconds: false },
  calendar: { durationMinutes: null as number | null, google: true },  // O3
  rsvp: { url: null as string | null },                // content.json says "no RSVP": hidden until the owner sets a URL (O5)
  music: { src: null as string | null, credit: null as Record<Lang, string> | null, startAt: 0 }, // O4; never autoplay
  gallery: [] as GalleryItem[],                        // empty: section hidden. The owner adds images he has rights to.
  motion: { tier: 'auto' as 'auto' | 'full' | 'lite' | 'none', parallax: true },
  syncHashOnScroll: true,
  prerender: { sideShells: false },                    // O7: also emit /{lang}/bride/ shells with bride-first previews
};
```

- **RSVP**: a paper band with one gilt button linking to `config.rsvp.url` (`rsvp.cta`, new tab). Nothing else: no form,
  no data collection on this site.
- **Music**: a round 44 px button, bottom right above the safe area, icon only with `aria-label` `music.play` /
  `music.pause`, `aria-pressed`. `<audio preload="none">`. Play only on explicit press; fade in over 1.2 s and out over
  0.6 s with a Web Audio `GainNode` (iOS ignores `audio.volume`); pause on `visibilitychange` hidden; never resume by
  itself. The track is not in the repo: the owner supplies a file or URL he is licensed to publish (README, O4).
- **Gallery**: `GalleryItem = { src, w, h, alt: Record<Lang, string> }`, a calm masonry of up to 12 images with
  `loading="lazy"`, no lightbox library (a native `<dialog>` viewer). Empty by default; we never add photos.

### 2.5 Variant behaviour

- The four variants per language (`G1`, `G0`, `B1`, `B0`) are pre-resolved by the generator. `useVariant()` reads the
  query once per navigation and picks `V`.
- `side` changes: name order, honorifics' owners, host line, monogram (AS/SA), family order, invocation lines (B adds
  "Sri Sri Prajapataye Namah" in en/hi/mai; bn_G adds "শ্রী গণেশায় নমঃ"), titles and OG text (6.2).
- `reception=0` changes: the event list (4), the opening dateline, the Venues cities (Kolkata only), the "Add all"
  calendar file, the nav, and the `<meta description>`; `#reception` maps per 2.1.
- Pre-rendered HTML is the default variant (`G1`). If the query asks for another variant, `main.tsx` uses `createRoot`
  (replacing the markup) instead of `hydrateRoot`, so there is never a hydration mismatch.

---------------------------------------------------------------------------------------------------------------------

## 3. Motion design

### 3.1 Principles (the video's motion vocabulary, STORYBOARD 2.2, adapted to scrolling)

- **The paint is alive; almost nothing else moves.** Plates breathe and drift, light passes now and then, a hidden painter
  adds a stroke. A flame flickers, a few petals fall, leaves sway. Everything slower than a calm breath.
- **Text never moves while it can be read.** Text enters once (opacity + blur + a soft left-to-right wipe), then is still:
  no drift, scale or parallax on text, ever.
- **At most three continuous motions** compete with text in one viewport (for example petals + strand sway + light sweep),
  besides the plate drift.
- **Forbidden**: bounce, spin, zoom, flash, bursts, confetti, sparkle showers, typewriter effects, scroll hijacking,
  smooth-scroll libraries, anything moving fast, any shape that could read as a fish.
- **The page scrolls natively.** Effects follow scroll; they never take it over.

### 3.2 Motion tokens (`src/styles/tokens.css`, mirrored in `src/lib/motion.ts`)

| Token | Value | Origin |
|---|---|---|
| `--beat` | 627 ms | the video's beat ladder (Kesariya, e.g. 51.818 -> 52.445 s) |
| `--phrase` | 10.031 s (16 beats) | light sweep period |
| `--half-phrase` | 5.016 s | glow pulse, shimmer, breathing, lights |
| `--ease-silk` | `cubic-bezier(0.22, 1, 0.36, 1)` | engine `E.ease.silk` (soft decelerate, default) |
| `--ease-swift` | `cubic-bezier(0.65, 0, 0.35, 1)` | engine `E.ease.swift` |
| `--ease-sine` | `cubic-bezier(0.37, 0, 0.63, 1)` | in-out sine (reveals, sweeps) |
| `--t-text` | 560 ms | `S.textIn` 0.55-0.6 s |
| `--t-reveal` | 1254 ms (2 beats) | paint-reveal |
| `--t-title` | 900 ms | hand title brush-wipe on the web (the video's 2 beats felt slow when scrolling) |

### 3.3 Motion tiers (`MotionProvider`, `src/lib/motion.ts`)

| Tier | When | What runs |
|---|---|---|
| `full` | default | everything in 3.4-3.7 |
| `lite` | `navigator.connection.saveData`, or `deviceMemory <= 2`, or `hardwareConcurrency <= 4`, or the runtime probe: median frame time > 22 ms over the first 60 frames of the first paint-reveal (then for the rest of the session) | entrances (shorter), a 500 ms plate crossfade instead of the canvas paint-reveal, diya flame, at most 3 petals, plate drift; no veil, no light sweep, no blend modes, no live strokes, no parallax |
| `none` | `prefers-reduced-motion: reduce` (live: the media query listener switches without reload), or `config.motion.tier = 'none'` | nothing animates. Everything is present at once. Smooth anchor scrolling is off. The countdown digits change without a crossfade. The diya shows a still flame. |

The tier is a class on `<html>` (`motion-full|lite|none`) so CSS and JS agree. Every CSS animation lives under
`.motion-full`/`.motion-lite` selectors; the base styles are the still state.

### 3.4 Entrances and scroll-linked reveals

- **Trigger**: a section's content timeline starts when 25% of it is visible (IntersectionObserver, `threshold` 0.25),
  once per page load. A section already in view at load (deep link) runs a compressed 600 ms version. Sections jumped
  past by the nav (`scrollIntoView`) show at once (no replay lag).
- **Text entrance** (`<Reveal>`): opacity 0 -> 1, `filter: blur(6px) -> 0`, and a feathered wipe `mask-image:
  linear-gradient(90deg, #000 40%, transparent 60%)` with `mask-size: 250% 100%` moving `mask-position` from 100% to 0%,
  over `--t-text`, `--ease-silk`. The blur and mask are removed when it ends (no permanent filters).
- **Hand titles** (`<HandTitle>`): a brush-wipe: `mask-image: url(textures/brush-wipe.webp)` (a horizontal dry-brush
  gradient with bristle streaks at its leading edge, 1024x128 alpha) sliding across the title over `--t-title`, plus
  opacity. Gold-leaf titles then shimmer (3.6).
- **Event timeline** (offsets from the trigger, after the paint-reveal if one runs): title 0-900 ms; couple 300-1500 ms
  (feathered soft-up mask from the feet to above the crown + opacity, no movement; the head is never inside the feather
  band, video QA R2-L6); tagline 500-1060; date/time 800-1360; venue 950-1510; address 1100-1660; actions 1250-1800;
  near motifs 600-1600 (feathered reveal); particles fade in over 1.8 s. All content is in place 1.8 s after the trigger.
- **Opening** (at load, after fonts or 1200 ms, whichever first): Ganesh line draws on 300-1550 ms (length-weighted, the
  `Motifs.draw` algorithm ported to TS, overlap 0.2), Ganesh paint 0.30 -> 1 over 600-1850; kicker(s) 800-1360; heading
  1000-1900 + first shimmer; rule draws 1600-2000; ring draws 1750-2350, monogram 1950-2350; pair 2100-2660; dateline
  2250-2810. The plate is visible from the first paint (it is the LCP).
- **Invitation**: kalash 0-560; shloka 150-710; blessing 250-810; host 400-960; name 1 600-1500; joiner 1300-1700; name 2
  1450-2350; shehnai draws 1700-2400.
- **Closing**: monogram ring 0-600; request 200-1100; line 700-1260; rule 900-1300; regards 1000-1560; families 1150-1900
  (line 1, joiner +150, line 2 +300); diya 300-860, flame lights at 860 ms (scaleY 0 -> 1 over 400 ms) with its glow.
- **Scroll-linked**: (a) Cultures line art draws with scroll: progress `p = clamp((vh - top) / (0.8 * vh))` per motif,
  mapped through the length-weighted stroke schedule, so scrolling back un-draws it; captions enter (3.4 text entrance)
  when their motif passes `p = 0.85`. (b) Plates move by `translateY((progress - 0.5) * 3%)` of the frame height while their
  section passes (inside the sticky layer; text does not move). Everything scroll-linked is computed in one rAF from cached
  geometry (3.9). Transform ownership, so effects never overwrite each other: `.plate-scroll` wrapper = scroll shift
  (`transform`), `.plate-pointer` wrapper = parallax (`transform` from `--px`/`--py`), the images inside = idle drift (the
  individual `translate`/`scale`/`rotate` properties in keyframes).

### 3.5 Paint-reveal between sections (`PaintReveal.tsx`)

Each plate section (except the opening) is brushed in over the previous painting, like the video's `P.paintReveal`.

- **Stage**: the incoming section's sticky frame first shows the previous section's `--ground` mid + paper grain (so the
  boundary reads as one canvas), and the section's top edge carries a ragged dry-brush edge (`textures/brush-edge.webp`,
  repeat-x alpha strip, 6-10 svh) while it is entering; the edge mask is removed once the frame pins (`is-pinned`, set by a
  sentinel observer), so a pinned frame never shows an edge.
- **Trigger**: when the section's top crosses 70% of the viewport height, scrolling down, first time only. Duration
  `--t-reveal` (1254 ms), `--ease-sine`. The content timeline (3.4) starts at 70% of the reveal.
- **Technique** (cheap enough for phones): one `<canvas>` over the frame at `min(devicePixelRatio, 1.5)` and at most 1600 px
  on the long side. A mask canvas accumulates brush **stamps** (6 bristle dab sprites in `textures/brush-stamps.webp`, white
  on transparent, exported from `P.prepStroke/drawStroke` at build) along 5-9 deterministic stroke paths per style; each
  frame draws only the new stamps (about 20-40 `drawImage` calls), then composites `plate (cover rect) destination-in mask`.
  The plate drawn is `img.currentSrc` of the section's `<picture>` after `decode()`; the cover rect math is the same as CSS
  `object-fit: cover` + `object-position` so the hand-over to the static `<picture>` at p = 1 does not shift (<= 1 px).
  The canvas is then released (`width = height = 0`): at most one reveal canvas exists at a time (iOS canvas memory).
- **Styles per section** (the video's choices): invitation `sweep` (horizontal bands, alternating, top to bottom, seed
  2622); mehndi `diagonal` (seed 2633); engagement `swirl` (arcs around the title, seed 2643); haldi `rise` (bottom to top,
  seed 2653); wedding `diagonal`, tilt -0.3 (seed 2663); reception `diagonal`, tilt +0.3, a deep-teal lead `#24403f` ahead
  of the brush (seed 2763); cultures `sweep` (seed 2672); closing `bloom` (an irregular light growing from the diya,
  feathered, bristly edge, eased `0.45p + 0.55 inOutSine(p)`, seed 2702).
- **Not loaded yet**: the reveal waits for the plate decode up to 1.5 s (the frame shows the blurred LQIP meanwhile), then
  falls back to a 400 ms opacity fade. Fast scrolling: a section that leaves the viewport mid-reveal completes at once.
- **Fallbacks**: `lite` = a 500 ms opacity crossfade of the plate over the previous ground (compositor-only; a full-frame
  mask animation would repaint every frame); `none` = the plate is simply there. No JS = the plate is there (the pending state is only set by JS).

### 3.6 Idle micro-motion

All periodic motion is CSS keyframes on transforms/opacity (compositor-only), with `animation-play-state: paused` unless
the section is in view (class `in-view`), and all of it paused when `document.hidden`.

| Element | Motion | Limits | Tier |
|---|---|---|---|
| Plate `base` (backdrop drift, paint.js `backdrop.tf`) | translate x 3.2 px over 17 s, y 2.6 px over 13 s, scale 1 +- 0.0022 over 11 s, rotate +- 0.035 deg over 19 s (separate keyframe tracks via `translate`/`scale`/`rotate` properties) | the frame image is 4% oversized (`inset: -2%`) so edges never show | full, lite |
| Plate `veil` | x 7.5 px / 14.5 s, y 5.5 px / 16.5 s, scale +- 0.0042 / 12.2 s, rotate +- 0.06 deg / 21 s; opacity 0.85 | half-resolution layer | full |
| Plate `gold` | moves with `base` | - | full, lite |
| Live strokes | 3 slots per plate: a pre-painted stroke sprite (from the plate's own flow field and colours, `sprites/strokes-<plate>.webp`) is revealed along its length over 2.6-4.4 s by a moving mask, rests, then sinks back over 3.5 s; each slot repeats every 10-15 s (seeded phases) | outside calm zones only; low contrast (alpha .55) | full |
| Light sweep | a soft band (gradient div) crosses the frame at 62 degrees once per `--phrase` (10.031 s), 3.2 s long, first after 2.2 s; light palettes `#fffaf3` .20 `screen`, deep `#ffd9a8` .42 `soft-light` | only the section in view | full |
| Glow pulse | radial pool at the plate's glow point, opacity 1 +- 0.06, period 5.016 s | | full |
| Gold shimmer | the glint band of `.gold-leaf` crosses once (2.2 s) every 5.016 s (`background-position` on the hero, monograms and joiners only) | small elements only | full |
| Couple breathing | `scale 1 +- 0.004` about the feet, x drift +- 3 px, period 10.031 s | never during its entrance | full |
| Edge motifs | marigold strand and toran: rotate +- 1.5 deg about their top, phase-offset, 5.016 s; banana leaf: +- 0.8 deg about its foot, 6.2 s; bamboo: still | | full, lite |
| Diya | `diya-flame` scaleY 1 +- 0.04 and rotate +- 1.5 deg about its base on two non-harmonic keyframe tracks (1.13 s and 0.83 s, alternate) that read as noise; `diya-glow` opacity 0.85-1 | the only flame on the site | full, lite |
| Evening lights (reception) | 4 soft gold bokeh discs, opacity 0.72-1 on 5.016 s with seeded phases, drift 6-12 px over 15-20 s; never off | | full |
| Particles | painted dabs from `sprites/dabs-<palette>.webp`: opening sparks x6 rising slowly in the halo; mehndi leaves x4, engagement petals x4, haldi marigold petals x4 falling 14-22 s with a slow sway; wedding sparks x4; closing dust x5 rising from the lamp | <= 6 per section (lite: 3) | full, lite |
| Countdown | digit crossfade 400 ms on change | | full, lite |

Section budgets (continuous motions besides the plate drift): opening = sparks + shimmer + glow; mehndi = leaves + strand
sway + sweep; engagement = petals + toran sway + sweep; haldi = petals + leaf breathing + sweep; wedding = sparks + couple
breathing + sweep; reception = lights + couple breathing + sweep; cultures = sweep only; closing = flame + dust + glow.

### 3.7 Cursor and touch parallax (`src/lib/parallax.ts`)

- Only the section in view, only in `full` tier, only when `config.motion.parallax`.
- Depths (offset at the edge of the screen): plate base 2 px, veil 5 px, edge motifs 7 px, couple and near motifs 9 px
  (desktop pointer); touch: half of that. Text: 0.
- Input: mouse `pointermove` (normalised -1..1 from the viewport centre); touch: the finger position while a touch is down
  (`pointerType: touch`), easing back to 0 over 600 ms on release. No device-orientation API (iOS permission prompt).
- Smoothing: critically damped spring, about 120 ms. Written as a CSS variable per layer (`--px`, `--py`) in one rAF.

### 3.8 Reduced motion and robustness

- Under `none`: no reveals, entrances, drift, sweep, shimmer, parallax, particles or flicker; smooth scrolling off; the menu
  sheet appears without sliding. Acceptance: `document.getAnimations().length === 0` and no rAF loop running after load
  (8.0, G-MOT-3).
- Content never depends on an animation finishing: every element's resting state is in the base CSS, and JS only adds the
  pre-entrance state when it knows it will run the entrance (so a JS error never leaves text invisible: a 3 s safety timer
  clears any pending state).

### 3.9 Engineering rules for motion

- One scheduler (`src/lib/motion.ts`): a single rAF loop that runs only while some animator is active (paint-reveal,
  scroll-linked draw, parallax spring); idle = no rAF.
- Geometry is read in IntersectionObserver/ResizeObserver callbacks and cached; per-frame code only writes
  (`transform`, `opacity`, CSS variables, `strokeDashoffset`). No layout reads inside rAF.
- `will-change` only on the active section's moving layers, removed when it leaves.
- Line art writes only the strokes whose progress changed by > 0.002 (alpana has 202 strokes).
- Budgets: <= 4 ms of script per frame during a reveal on a mid-range phone (Chrome 4x CPU throttle as the proxy), no long
  task > 50 ms during scrolling.

---------------------------------------------------------------------------------------------------------------------

## 4. Internationalisation

### 4.1 Pipeline (`scripts/gen-i18n.mjs`, run by `npm run gen:i18n`, first step of `npm run build`)

Inputs: `content/content.json` (snapshot, 0.1) and `content/ui.json` (UI strings, 4.7). Outputs: `src/i18n/en.json`,
`hi.json`, `mai.json`, `bn.json` (committed, so reviewers can read them) and `src/generated/facts.ts` (UTC starts, venue
keys, city map). The app imports the current language's JSON with a dynamic `import()` (one chunk per language,
about 4 KB gz each); the prerender imports all four.

Steps:
1. For each `lang` in `en, hi, mai, bn` and `order` in `G, B`: take `variants[lang][order]`; build the `reception=0`
   variant with the exact deep-merge of card.js `withoutReception()` (ported to `scripts/lib/merge.mjs`, unit-tested).
2. Map each of the 4 variants to the site schema (4.2), applying the text hygiene rules (4.4).
3. Compute from `facts.events`: `startUtc` = `date_iso` + `time_24h` at +05:30 to UTC; `venueKey`; city index.
4. Validate (the build fails on any error):
   - every field of 4.2 is present and non-empty in every variant; every `ui.json` key has all 4 languages;
   - G: `names.first` is the groom (`first_role` = groom), monogram `AS`, `regards_families_lines[0]` is the Jha family in
     that language; B: the bride first, `SA`, the Sil family first;
   - events and their order equal `events_order`; `date_iso`/`time_24h` equal `facts.events`; the `*0` variants have no
     `reception` event, no Saharsa city and a dateline without the 29th in any numeral system (29, २९, ২৯);
   - `map_line_en` per event is identical across all 8 variants;
   - the closing split table joins back to `closing_big`;
   - **forbidden words**: no `fish`, `matsya`, `मछली`, `मत्स्य`, `माछ`, `মাছ`, `মৎস্য` in any generated string (content
     and UI); no phone-like digit run (10 or more consecutive digits in any numeral system; the only allowed 6-digit run is
     the PIN 852201 / ८५२२०१ / ৮৫২২০১);
   - Latin digits only in `en` (allowed elsewhere only inside `.ics`, `AS`/`SA`, URLs).
5. Write the files with a `source` block `{ contentSha256, uiSha256, generatedAt }` and print a summary.

`scripts/check-content.mjs` re-runs step 4 on the committed outputs (used by CI and by `npm test`).

### 4.2 Generated schema (`src/i18n/types.ts`)

```ts
type Lang = 'en' | 'hi' | 'mai' | 'bn';
type EventKey = 'mehndi' | 'engagement' | 'haldi' | 'wedding' | 'reception';
type VariantKey = 'G1' | 'G0' | 'B1' | 'B0';            // side (G groom-first, B bride-first) x reception (1 shown, 0 hidden)
interface LangFile { lang: Lang; meta: LangMeta; ui: UiStrings; variants: Record<VariantKey, SiteCopy>; source: SourceInfo }
interface LangMeta { bcp47: string; script: 'Latn' | 'Deva' | 'Beng'; numerals: 'latin' | 'devanagari' | 'bengali';
  endonym: string; short: string; ogLocale: string | null }
interface Person { text: string; honorific: string | null; role: 'groom' | 'bride' }
interface EventCopy { key: EventKey; title: string; tagline: string; date: string; time: string; dateTime: string;
  venue: string; address: [string, string]; mapQuery: string; startUtc: string; dateIso: string; venueKey: string; city: number }
interface DayCopy { heading: string; dateIso: string; venue: string; address: [string, string]; mapQuery: string;
  lines: { key: EventKey; text: string }[]; city: number }
interface SiteCopy {
  invocation: string; invocationSecondary: string | null; shloka: [string, string] | null; heading: string;
  dateline: { dates: string; cities: string | null }; pair: { first: string; joiner: string; second: string; text: string };
  pairFull: string; monogram: 'AS' | 'SA';
  blessing: string; host: string; names: { first: Person; second: Person; joiner: string };
  eventsHeading: string; labels: { date: string; time: string; venue: string; map: string };
  events: EventCopy[]; cities: string[]; days: DayCopy[];
  closing: { big: string; bigLines: [string, string]; small: string; regards: string; families: [string, string, string] };
  head: { title: string; description: string; ogAlt: string };
}
```

`head.title` = `pair_short` + " · " + `heading` (e.g. "Akshay & Shreya · Shubh Vivah", "অক্ষয় ও শ্রেয়া · শুভ বিবাহ");
`head.description` = `heading` + " · " + `save_the_date.line`; `head.ogAlt` = the same as the description. All three are
joins of reviewed strings.

### 4.3 Variant selection at runtime

`useCopy()` returns `LangFile.variants[side + reception]`. Changing language swaps the file (the previous file stays on
screen until the new chunk resolves: no empty flash); changing a query parameter swaps the variant synchronously.

### 4.4 Text hygiene (applied by the generator, ported from card.js `keep()` and the video's `S.facts`)

- Non-breaking spaces so that a Devanagari postposition never starts a line (`पर का के की में से को ने क मे सँ पास
  समीप`), "शुभ"/"শুভ" stays with its noun, "नं."/"নং" with its number, "बस स्टैंड", "Block H,", "Gate No.2", "bus stand",
  "Bose Rd," stay whole, and every full name (with its honorific) never breaks.
- Addresses: split into two lines after the comma that minimises the longer line (character-width estimate per script at
  build; the client never measures). Each part may still wrap on very narrow screens (`text-wrap: balance` inside it).
- The host line's hyphens get U+2060 on both sides (card.js), so "गुरुजन-परिजनक" never breaks at the hyphen.
- A conjunction (en "&", "and"; hi "और", "एवं", "व"; mai "आ", "आओर", "एवं", "और"; bn "ও", "এবং") never ends a line: it
  starts the next one with its word ("Mithila / & Bengal", "मिथिला / और बंगाल"). After a number it also stays with that
  number, so a date list ("26 & 29 November", "२६ एवं २९ नवंबर") and a house number ("192B & C,") never break.
- Strings are otherwise copied byte for byte; the generator never rewrites copy.

### 4.5 Numerals and plurals (`src/lib/numerals.ts`)

- Digits by `meta.numerals`: `latin` 0-9, `devanagari` ०१२३४५६७८९, `bengali` ০১২৩৪৫৬৭৮৯, via a fixed mapping table (not
  `Intl`, whose `mai` support differs between browsers). Countdown values are zero-padded to 2 digits for hours/minutes
  with the native zero.
- Plurals: en uses `Intl.PluralRules('en')` (`one`/`other`); hi uses `one` for 1 (घंटा) and `other` (घंटे) for the hour
  unit only; mai and bn have one form. `ui.json` stores `{ one, other }` where forms differ.
- Content strings already carry native digits (for example "२५ नवंबर · सुबह ११ बजे"); nothing reformats them.

### 4.6 Language behaviour

- `<html lang>` = `en`, `hi`, `mai`, `bn`; `dir="ltr"`. Inline spans in another script get their own `lang`: the
  monogram and "&" (`lang="en"`), the Tirhuta flourish (`lang="mai-Tirh"`, aria-hidden), "বাংলা" in Cultures (`lang="bn"`).
- Choosing a language stores `localStorage['asw.lang']` (used only by the root redirect).
- `<HeadManager>` updates `document.title`, `meta[name=description]`, `og:*`, `link[rel=canonical]`, `theme-color` on
  language or variant change (the pre-rendered head is right for `G1`).
- Fonts: each language links only its own `fonts.<lang>.css`; switching injects the new one (the old stays cached).

### 4.7 UI strings (`content/ui.json`): drafted 2026-11-02, every non-English string needs native review

Reused reviewed content strings (no review needed): `maps.open` in hi = `labels.map_label` "मैप पर देखें", in bn =
"ম্যাপে খুঁজুন"; `single_page.events_heading` for the Celebrations heading and nav; `labels.date|time|venue` for screen-reader
labels; event titles, dates and families everywhere. Brand names: "Apple", "Outlook", ".ics" stay Latin in every language.

| Key | en | hi (draft) | mai (draft) | bn (draft) |
|---|---|---|---|---|
| `nav.menu` | Menu | मेनू | मेनू | মেনু |
| `nav.close` | Close | बंद करें | बंद करू | বন্ধ করুন |
| `nav.invitation` | Invitation | निमंत्रण | निमंत्रण | আমন্ত্রণ |
| `nav.countdown` | Countdown | उलटी गिनती | बाँकी दिन | ক্ষণগণনা |
| `nav.cultures` / `cultures.title` | Mithila & Bengal | मिथिला और बंगाल | मिथिला आ बंगाल | মিথিলা ও বাংলা |
| `nav.venues` | Venues | आयोजन स्थल | आयोजन स्थल | অনুষ্ঠানস্থল |
| `nav.top` | Back to top | ऊपर जाएँ | ऊपर जाउ | উপরে যান |
| `a11y.skip` | Skip to the invitation | सीधे निमंत्रण पर जाएँ | सोझे निमंत्रण पर जाउ | সরাসরি আমন্ত্রণে যান |
| `a11y.newTab` | (opens in a new tab) | (नए टैब में खुलेगा) | (नव टैबमे खुजत) | (নতুন ট্যাবে খুলবে) |
| `a11y.scrollCue` | Scroll to open the invitation | निमंत्रण देखने के लिए नीचे स्क्रॉल करें | निमंत्रण देखबाक लेल नीचाँ स्क्रॉल करू | আমন্ত্রণ দেখতে নিচে স্ক্রোল করুন |
| `lang.label` | Language | भाषा | भाषा | ভাষা |
| `countdown.title` | Until the wedding | शुभ विवाह में शेष | शुभ विवाहमे बाँकी | শুভ বিবাহের আর বাকি |
| `countdown.days` | day / days | दिन | दिन | দিন |
| `countdown.hours` | hour / hours | घंटा / घंटे | घंटा | ঘণ্টা |
| `countdown.minutes` | minute / minutes | मिनट | मिनट | মিনিট |
| `countdown.seconds` | second / seconds | सेकंड | सेकेंड | সেকেন্ড |
| `countdown.sr` | {d} days, {h} hours and {m} minutes until the wedding | शुभ विवाह में {d} दिन, {h} घंटे और {m} मिनट शेष | शुभ विवाहमे {d} दिन, {h} घंटा आ {m} मिनट बाँकी | শুভ বিবাহের আর {d} দিন, {h} ঘণ্টা ও {m} মিনিট বাকি |
| `cal.add` | Add to calendar | कैलेंडर में जोड़ें | कैलेंडरमे जोड़ू | ক্যালেন্ডারে যোগ করুন |
| `cal.addAll` | Add all to calendar | सभी कार्यक्रम कैलेंडर में जोड़ें | सभ कार्यक्रम कैलेंडरमे जोड़ू | সব অনুষ্ঠান ক্যালেন্ডারে যোগ করুন |
| `cal.ics` | Apple · Outlook (.ics) | Apple · Outlook (.ics) | Apple · Outlook (.ics) | Apple · Outlook (.ics) |
| `cal.google` | Google Calendar | गूगल कैलेंडर | गूगल कैलेंडर | গুগল ক্যালেন্ডার |
| `maps.open` | Open in Maps | मैप पर देखें (reviewed) | मैपमे देखू | ম্যাপে খুঁজুন (reviewed) |
| `cultures.aripan` | Aripan · Mithila | अरिपन · मिथिला | अरिपन · मिथिला | অরিপন · মিথিলা |
| `cultures.paag` | Paag | पाग | पाग | পাগ |
| `cultures.lotus` | Lotus | कमल | कमल | পদ্ম |
| `cultures.alpana` | Alpana · Bengal | अल्पना · बंगाल | अल्पना · बंगाल | আলপনা · বাংলা |
| `cultures.topor` | Topor | टोपर | टोपर | টোপর |
| `cultures.shankha` | Shankha | शंख | शंख | শঙ্খ |
| `cultures.tirhuta` | "Mithila" in Mithilakshar (Tirhuta) | मिथिलाक्षर (तिरहुता) में "मिथिला" | मिथिलाक्षर (तिरहुता)मे "मिथिला" | মিথিলাক্ষরে (তিরহুতা) "মিথিলা" |
| `cultures.bangla` | "Bangla" in Bengali script | बांग्ला लिपि में "बांग्ला" | बांग्ला लिपिमे "बांग्ला" | বাংলা লিপিতে "বাংলা" |
| `alt.couple` | Illustrated bride and groom dressed for the {event} | {event} के परिधान में वर-वधू का चित्र | {event}क परिधानमे वर-कनियाँक चित्र | {event}{gen} সাজে বর-কনের ছবি |
| `music.play` | Play music | संगीत चलाएँ | संगीत बजाउ | গান চালান |
| `music.pause` | Pause music | संगीत रोकें | संगीत रोकू | গান থামান |
| `rsvp.cta` | RSVP | उपस्थिति की सूचना दें | अपन उपस्थितिक सूचना दिअ | উপস্থিতি জানান |
| `gallery.title` | Gallery | गैलरी | गैलरी | গ্যালারি |

`{gen}` (bn only) is the genitive suffix added by the generator: "র" after a final vowel sign or vowel (মেহেন্দির),
"এর" after a final consonant (বাগদানের, গায়ে হলুদের, শুভ বিবাহের, প্রীতিভোজের). In mai `{event}क` gives मेंहदीक, सगाईक,
हरदिक, शुभ विवाहक, बहुभोजक.

### 4.8 Native review list (`docs/NATIVE_REVIEW.md`, created with the first build)

1. Every draft string in 4.7 (hi, mai, bn), in context (screenshots per language at 390x844 and 1440x900), with special
   attention to: the Maithili polite imperatives (करू, जोड़ू, देखू, जाउ, बजाउ, रोकू, दिअ), "बाँकी दिन" as the Maithili nav
   label for the countdown, "ক্ষণগণনা", the hi plural घंटा/घंटे, the bn genitive rule, "उलटी गिनती".
2. The Tirhuta flourish (2.3.5): spelling, glyph shapes, and whether it sits well with Bengali-reading guests.
3. Carried from content (`NOTES.md`, still open): सील vs शील (hi/mai), mai बहुभोज, bn প্রীতিভোজ, en "&" vs "with".
4. Workflow: reviewers mark rows `ok` / replacement text in `NATIVE_REVIEW.md`; an agent applies them to `content/ui.json`
   and re-runs `gen:i18n`. Content strings are changed only in WeddingInvite2's `content.json`, then re-snapshotted.

---------------------------------------------------------------------------------------------------------------------

## 5. Responsive layouts (360-1920 px)

### 5.1 Frames and breakpoints

| Name | Media | Plate frame | Typical devices |
|---|---|---|---|
| `tall` | `(max-aspect-ratio: 3/5)` | `tall` 1080x2340 | phones in portrait (360x640 to 430x932) |
| `mid` | `(min-aspect-ratio: 3/5) and (max-aspect-ratio: 5/4)` | `mid` 1080x1350 | tablets in portrait, small square windows |
| `wide` | `(min-aspect-ratio: 5/4)` | `wide` 1920x1080 | laptops, desktops, tablets in landscape |
| `short` | `(max-height: 520px) and (orientation: landscape)` | `wide` | phones in landscape |

Width steps inside a frame: `xs` < 480, `sm` 480-767, `md` 768-1023, `lg` 1024-1439, `xl` >= 1440. The event two-column
layout needs `wide` and `min-width: 900px`; a `wide` window narrower than 900 px uses the stacked layout on the wide plate.

### 5.2 Layout per section

| Section | tall / mid (stacked, centred) | wide (>= 900 px) | short (landscape phone) |
|---|---|---|---|
| Opening | column as 2.3.1; Ganesh `min(34vw, 22svh)`; everything fits 100svh on 360x640 (minus the browser bar, ~560 px) by scaling with `svh` | same column, max width 640; Ganesh `min(18vw, 24svh)` | two columns: Ganesh + kicker left, heading + ring + names + dates right |
| Invitation | column; names `names` role; kalash small | column, max 720 | column, section taller than the viewport (allowed) |
| Countdown | units row; card width `min(92vw, 560px)` | card 640 px | same as wide |
| Celebrations header | chips wrap in rows of 2-3 | one row of 4-5 chips | one row, scrolls horizontally if needed (`overflow-x: auto`, snap) |
| Event | title (top 12-14svh), tagline, couple height `clamp(220px, 40svh, 460px)` (mid: `44svh`), facts, actions row (wraps to 2 rows < 380 px) | grid `[couple 45%] [text 40%]` with the gutter between, alternating sides (2.3.4); couple height `min(68svh, 640px)`; text column vertically centred | grid as wide; couple `80svh`; section may exceed the viewport |
| Cultures | Mithila block, lotus divider, Bengal block; motifs `min(70vw, 360px)` | two halves + lotus seam; motifs `min(30vw, 420px)` | as wide, motifs `min(28vw, 70svh)` |
| Venues | cards stacked, `min(92vw, 560px)` | cards side by side (2 x 520 max), one card centred with `reception=0` | as wide |
| Closing | column, diya at the foot (bottom 6svh) | same, max 720 | column; diya after the families |
| Top bar | 56 px; switch shows short labels < 480 px | 64 px; full endonyms >= 1024 px | 48 px |

Rules: no content clipping, ever. A section is `min-height: 100svh`; if its content is taller it grows, and the sticky
frame stays pinned while it scrolls. The couple's CSS height is capped at 640 px because the source PNGs are 916-1015 px
tall: on 2x screens that is already a 1.3-2x upscale (painterly art tolerates it; no AI upscaling, which could invent
detail). At 3x phones the tall layout shows the couple at about native resolution.

### 5.3 Sticky frame structure (every plate section)

```html
<section id="mehndi" class="plate-section pal-sage" aria-labelledby="mehndi-title">
  <div class="frame">                 <!-- position: sticky; top: 0; height: 100lvh (fallback 100vh); overflow: hidden -->
    <picture class="plate">...</picture>  <img class="gold"> <img class="veil"> <div class="sweep"> <div class="glow">
    <div class="edge-motifs">...</div>    <div class="live-strokes">...</div>   <canvas class="reveal">  <div class="hairlines">
  </div>
  <div class="content">               <!-- position: relative; margin-top: -100lvh; min-height: 100svh; padding: safe areas -->
    ...title, couple, facts, actions...
  </div>
</section>
```

`lvh` for the frame (the painting extends under a collapsing browser bar), `svh` for content minimums. `object-fit: cover`
with a per-plate `object-position` focal point (opening `50% 30%`, events `50% 45%`, closing `50% 70%`).

### 5.4 Safe areas

`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`. The bar, the hairline frame,
the music button and section padding add `env(safe-area-inset-*)`. Nothing interactive within 12 px of a screen edge.
Landscape notches: the content columns add `safe-area-inset-left/right`.

### 5.5 Responsive images

`<picture>` per plate (generated by `src/lib/plates.ts` from `src/generated/plates.json`):

```html
<source type="image/avif" media="(max-aspect-ratio: 3/5)" srcset="/plates/mehndi/tall-540.avif 540w, ...-828.avif 828w, ...-1170.avif 1170w"
        sizes="(max-aspect-ratio: 18/39) 46.15lvh, 100vw">
<source type="image/webp" media="(max-aspect-ratio: 3/5)" ...>
<source type="image/avif" media="(max-aspect-ratio: 5/4)" srcset="...mid-768.avif 768w, ...mid-1152.avif 1152w, ...mid-1536.avif 1536w"
        sizes="(max-aspect-ratio: 4/5) 80lvh, 100vw">
<source type="image/webp" media="(max-aspect-ratio: 5/4)" ...>
<source type="image/avif" srcset="...wide-1280.avif 1280w, ...wide-1920.avif 1920w, ...wide-2560.avif 2560w" sizes="(max-aspect-ratio: 16/9) 177.78lvh, 100vw">
<source type="image/webp" srcset="...">
<img src="/plates/mehndi/wide-1920.webp" alt="" width="1920" height="1080" decoding="async" loading="lazy">
```

(`sizes` makes the browser fetch by the covered width, not just the viewport width.) The opening plate uses
`loading="eager" fetchpriority="high"` and is preloaded in the head with matching `media` per frame (6.6).

---------------------------------------------------------------------------------------------------------------------

## 6. Accessibility, SEO/OG, privacy and performance

### 6.1 Accessibility (target WCAG 2.2 AA)

- **Landmarks and headings**: `header` (bar), `nav` (language switch: `aria-label` `lang.label`; section nav), `main`,
  `footer`. One `h1` (the opening heading; the pair and dates are in the same `header` group). `h2` per section (visible:
  Celebrations, Cultures, Venues, Closing request; visually hidden: Invitation, Countdown). Events are `h3`. Venue cities
  `h3`, days `h4`.
- **Contrast**: tokens per 1.2.1. Runtime check in QA (G-A11Y-2): for every text block, the real plate pixels behind it
  (text hidden) give >= 4.5:1 for text < 24 px (or < 18.66 px bold) and >= 3:1 for larger text.
- **Focus**: `:focus-visible { outline: 2px solid var(--gold-ink); outline-offset: 3px; box-shadow: 0 0 0 5px
  color-mix(in srgb, var(--paper) 80%, transparent) }` (deep sections: cream outline). Never removed. Focus order = DOM
  order = visual order (the wide layout's alternating sides use `order` only inside the visual grid, not for focus).
- **Keyboard**: everything reachable with Tab; menu sheet and calendar disclosure close with Esc and return focus; the sheet
  traps focus; skip link first.
- **Images**: couple sprites have `alt.couple`; plates, motifs, particles, the Tirhuta SVG and ornaments are decorative
  (`alt=""` / `aria-hidden="true"`). Ganesh is decorative (the invocation text carries the meaning).
- **Motion**: 3.3 and 3.8. Nothing flashes more than 3 times per second.
- **Zoom and text spacing**: works at 200% zoom and with WCAG 1.4.12 text spacing, no clipping (no fixed heights on text).
- **Targets**: >= 44x44 px (bar buttons, switch items, actions, chips).
- **Links that open a new tab** say so (`a11y.newTab`, visually hidden).
- **Language**: 4.6. Screen readers get the right voice per `lang`.
- **Countdown**: not a live region (2.3.3).

### 6.2 SEO, head and link previews

- Pre-rendered `dist/{lang}/index.html` contain, for `G1`: `<html lang>`, `<title>` (`head.title`),
  `<meta name="description">`, `<meta name="robots" content="noindex, nofollow">` unless `config.seo.indexable` (default:
  a private wedding page stays out of search engines; link previews still work), `og:type website`, `og:title`,
  `og:description`, `og:image` + `og:image:width 1200` / `height 630` / `og:image:alt`, `og:locale` (`en_IN`, `hi_IN`,
  `bn_IN`; `mai_IN` for Maithili), `twitter:card summary_large_image`, `theme-color #f2e8d8`, icons, and, only when
  `VITE_SITE_URL` is set: `link rel=canonical`, `og:url`, `link rel=alternate hreflang` for `en`, `hi`, `mai`, `bn` and
  `x-default` (= `/en/`). `og:image` must be absolute; without `VITE_SITE_URL` the build warns and omits it.
- **OG images**: `public/og/og-<lang>.jpg`, 1200x630, <= 250 KB, made by `tools/og/` from the `wide` opening plate with
  Ganesh, the heading in gold leaf, the pair and the dateline in that language (`G1`). With `prerender.sideShells` also
  `og-<lang>-bride.jpg` and `/{lang}/bride/index.html` shells (O7). Link previews ignore query strings on a static host, so
  `?side=bride` and `?reception=0` links show the default preview: documented in the README.
- No JSON-LD (it would publish structured addresses for no gain while the page is `noindex`).
- `public/robots.txt` allows everything (`User-agent: *` with an empty `Disallow:`). Do **not** disallow crawling: link
  preview fetchers (Twitterbot and others) honour robots.txt and would drop the preview, and a crawler that may not fetch
  the page never sees its `noindex`. Hosts with header control also send `X-Robots-Tag: noindex, nofollow` while not
  indexable. `sitemap.xml` only when indexable.

### 6.3 Privacy and security

- No third-party requests (fonts, images, scripts all same-origin). Outbound navigation only on click.
- Recommended response headers (README per host): `Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:;
  style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; media-src 'self' <music origin if any>; connect-src
  'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. The same CSP (minus
  `frame-ancestors`) as a `<meta http-equiv>` for hosts without header control. No inline scripts (the redirect is a file).
- The site contains what the cards contain (names, dates, venues, addresses) and nothing more.

### 6.4 Performance plan: pre-rendered plates (chosen) vs live canvas (rejected)

Measured 2026-11-02 in the cached Chromium on this Mac (Apple M3 Pro), `P.paint()` from `engine/lib/paint/paint.js`, one
painting, main thread, timed from Node around `page.evaluate`:

| Painting | CPU canvas | GPU canvas |
|---|---|---|
| portrait 1080x1920, sage swirl | 1047 ms | 1012 ms |
| landscape 1920x1080, vermilion swirl | 1190 ms | 1246 ms |
| portrait at res 0.5 | 563 ms | 568 ms |
| flattened 1080x1920 as WebP q80 (size) | 97-114 KB | |

Live painting in the browser would cost about 1 s of blocked main thread per plate on a fast laptop (phones are slower;
not measured, a 4-8x factor is an estimate) for 9 plates, plus paint.js + engine.js (53 KB gz) and about 27 MB of canvas
memory per painting (three `(W+72) x (H+72) x 4` byte layers: 27 MB at 1080x1920, 33 MB at 1080x2340), which risks iOS
Safari's canvas memory limit.
A pre-rendered 1170 px AVIF of the same painting is about 100-160 KB (budget below), decodes off the main thread, is the
LCP element without any script, works without JS and is pixel-identical on every device (the engine is seeded and its
CPU path is bit-exact, engine README). So: **plates are pre-rendered at build**, and only cheap layers move live
(transform/opacity of `base`, `veil`, `gold`, small sprites; a light sweep; a stamp-based reveal canvas during
transitions). A Worker/OffscreenCanvas port was considered and rejected: paint.js needs `window.E` and the DOM, and it
would still spend seconds of CPU and battery to produce what a 100 KB file delivers.

### 6.5 Asset pipeline (`tools/`, runs on the dev desktop in Docker, outputs committed)

`npm run build` never needs Chromium, Python or sharp: every generated asset is committed. The asset tools run only when
art or copy changes.

| Tool | Command | Inputs | Outputs | Budget |
|---|---|---|---|---|
| Plates | `npm run assets:plates` (`tools/plates/export.mjs`) | `tools/plates/vendor/{engine,paint,motifs}.js` (copies, `SOURCE.md` with sha256), `tools/plates/recipes.js` (1.3) | `public/plates/<id>/{tall,mid,wide}-<w>.{avif,webp}` (base, opaque), `...-<w>-gold.webp`, `<frame>-veil.webp`, `src/generated/plates.json` (sizes, bytes, focal point, 16 px LQIP as base64 WebP, palette) | base `tall-1170.avif` <= 160 KB, `wide-1920.avif` <= 200 KB, `wide-2560.avif` <= 300 KB; WebP <= 1.45x AVIF; gold <= 40 KB; veil <= 60 KB |
| Sprites | `npm run assets:sprites` (same Chromium page) | couple PNGs, motif SVGs + tints, `P.dabSprites`, `P.goldTexture`, `P.grain`, stroke stamps, live strokes, bamboo | `public/sprites/couple/<event>-{480,720,960}h.{avif,webp}`, `public/sprites/motifs/<section>-<motif>-<w>.webp`, `sprites/dabs-<palette>.webp` + `.json`, `sprites/strokes-<plate>.webp` + `.json`, `textures/{paper-512,gold-leaf-256,brush-stamps,brush-edge,brush-wipe}.webp`, `src/generated/sprites.json` | couple 960h <= 220 KB AVIF; each texture <= 40 KB |
| Line art | `npm run assets:motifs` (svgo, precision 1, keeps `.m-draw` masks and ids) | `ganesh, shehnai, aripan, alpana, paag, topor, lotus_open, shankha` `_line.svg` | `public/motifs/*.svg` | each <= 60 KB raw (alpana is 142 KB today) |
| Fonts | `npm run assets:fonts` (`scripts/subset-fonts.mjs`, `pyftsubset` in `python:3.11-slim`, `--layout-features='*' --flavor=woff2`) | engine woff2 files + every string of `src/i18n/<lang>.json` + digits + punctuation | `public/fonts/<lang>/<family>-<w>.<hash>.woff2`, `src/styles/fonts.<lang>.css` (with `unicode-range` and metric-matched fallback faces: `size-adjust`, `ascent-override`), `src/generated/font-coverage.json`; on Indic pages a ~1.5 KB punctuation subset per text face (so a comma never pulls a Latin file), and on every page subsets of the other scripts' words it shows (switch endonyms, the Cultures "বাংলা"), checked by the build (no character in a system font) | <= 180 KB per language for the initial set |
| Tirhuta | `npm run assets:glyphs` (`tools/glyphs/tirhuta.mjs`, harfbuzzjs) | `NotoSansTirhuta-n400-tirhuta.woff2`, the 6 code points | `src/generated/tirhuta-mithila.svg` | <= 4 KB |
| OG | `npm run assets:og` (`tools/og/og.mjs`) | wide opening plate, fonts, `src/i18n/*` | `public/og/og-<lang>.jpg` | <= 250 KB each |
| Icons | part of `assets:og` | monogram ring | `public/favicon.svg`, `apple-touch-icon.png` (180), `icon-512.png`, `site.webmanifest` | |

Names above (and in 5.5) are logical: every file under `plates/`, `sprites/`, `textures/` and `fonts/` is written with an
8-character content hash before its extension (`tall-1170.3fa9c2d1.avif`), and the manifests map logical names to hashed
files, so hosts can cache them as immutable.
Encoding: sharp (libvips) in Docker: AVIF quality 50, effort 6, 4:2:0; WebP quality 72 (alpha quality 85), effort 6;
downscaling Lanczos3 from the largest render. Plates render with `paintcpu=1` (bit-exact). Lossless PNG renders stay on
the dev desktop (`~/wedding_site/work/plates-png/`), never in the repo or on the Mac.

`npm run build` checks (no tools needed): `font-coverage.json` covers every character of the current `src/i18n/*.json`
(else: "run assets:fonts"); `plates.json` and `sprites.json` list files that exist.

### 6.6 Loading strategy

- HTML (pre-rendered, about 20-30 KB per language): critical CSS inlined (`tokens`, `palettes`, `typography`, layout of the
  opening; <= 14 KB), the rest as one CSS file.
- Head preloads: the opening plate per frame (`<link rel=preload as=image imagesrcset imagesizes media="(max-aspect-ratio:
  3/5)">` and the two other frames), the current language's two display/text fonts (hand + text face), `redirect.js` only
  on the root.
- The opening shows the LQIP as `background-image` on the frame and `--paper` as `background-color` until the plate
  decodes; it never waits for JS.
- JS: one entry chunk (React, router, app shell, opening/invitation code) + the language chunk; later sections' heavy
  bits (`PaintReveal`, line-art loader, music) are lazy chunks fetched on idle (`requestIdleCallback`, fallback 1.5 s).
- Plates of later sections: native `loading="lazy"`; the reveal code warms the next two plates when the current section
  is 50% through (`img.decode()` on a detached `Image`).
- Couple sprites: lazy, `decoding="async"`, `sizes` from `sprites.json` (height-based layout converted to width).
- Line-art SVGs: fetched when their section is within 1.5 viewports, inlined (they are our own files), cached in memory.

### 6.7 Budgets and gates (`scripts/check-budget.mjs`, fails the build)

| Metric | Hard limit | Target |
|---|---|---|
| Initial JS (entry + language chunk), gzip | 250 KB | <= 130 KB (React + react-dom ~45, router ~20, app ~35, copy ~4) |
| Initial CSS, gzip | 40 KB | <= 25 KB |
| Initial fonts per language | 220 KB | <= 160 KB |
| Initial transfer on a phone (390x844 @3x, `tall`, until `load` + 2 s idle, no scroll) | 1.5 MB | <= 700 KB |
| Full scroll to the end, all assets (phone) | 6 MB | <= 4 MB |
| LCP (Lighthouse mobile: Slow 4G, 4x CPU) | 2.5 s | <= 1.8 s |
| CLS | 0.05 | <= 0.02 |
| TBT | 200 ms | <= 100 ms |
| INP (interactions: switch, menu, calendar) | 200 ms | <= 100 ms |
| Lighthouse Accessibility | 95 | 100 |
| Long tasks during scroll (4x CPU) | none > 50 ms | |

`check-budget.mjs` measures gzip sizes from `dist/` and the Vite manifest; the transfer and Lighthouse numbers come from
`tools/shots/perf.mjs` (Playwright HAR + Lighthouse in Docker on the dev desktop), recorded in `docs/QA.md`.

---------------------------------------------------------------------------------------------------------------------

## 7. Component tree and file layout

### 7.1 Repository

```
AkshayShreyaWedding/
  README.md                     run, build, hosting (9.5), music licensing, privacy, how to change copy
  package.json  package-lock.json  tsconfig.json  tsconfig.node.json  vite.config.ts  vitest.config.ts  playwright.config.ts
  index.html                    template: <!--head--> <!--app-html--> placeholders, viewport-fit=cover
  .gitignore                    node_modules, dist, dist-ssr, .vite, coverage, playwright-report, test-results, *.log
  vercel.json  netlify.toml     static hosting configs (9.5)
  content/
    content.json  SOURCE.md     snapshot of WeddingInvite2/assets/copy/content.json (+ sha256, date)
    ui.json                     UI strings, 4 languages (4.7)
  scripts/
    gen-i18n.mjs  check-content.mjs  lib/merge.mjs  lib/hygiene.mjs   (4.1-4.4)
    prerender.mjs               writes dist/{en,hi,mai,bn}/index.html, dist/index.html (redirect), dist/404.html
    subset-fonts.mjs            (6.5)
    check-budget.mjs            (6.7)
    sync.sh                     Mac <-> dev desktop tar sync (9.3)
  tools/                        dev-desktop-only asset tools (never run by npm run build)
    plates/  vendor/{engine.js,paint.js,motifs.js,SOURCE.md}  plates.html  recipes.js  sprites.js  export.mjs
    glyphs/tirhuta.mjs
    og/  og.html  og.mjs
    shots/  shots.mjs  perf.mjs  contrast.mjs        (QA: screenshots, HAR/Lighthouse, pixel contrast)
  public/
    redirect.js  robots.txt  favicon.svg  apple-touch-icon.png  icon-512.png  site.webmanifest  _redirects
    plates/<id>/...   sprites/...   textures/...   motifs/*.svg   fonts/<lang>/*.woff2   og/og-<lang>.jpg
  src/
    main.tsx                    client entry: hydrateRoot for the default variant, createRoot otherwise (2.5)
    entry-server.tsx            render(url) -> { html, head } with StaticRouter (prerender)
    App.tsx                     routes (2.1)
    config.ts                   (2.4)
    routes/ RootRedirect.tsx  LangLayout.tsx  NotFound.tsx
    state/ variant.ts (useVariant)  scrollspy.ts (useActiveSection)
    i18n/ en.json hi.json mai.json bn.json (generated)  types.ts  index.ts (useCopy, loadLang, prefetchLang)
    lib/ ics.ts  maps.ts  google-calendar.ts  numerals.ts  countdown.ts  motion.ts  parallax.ts  plates.ts  sprites.ts
         breakpoints.ts  head.ts  linedraw.ts (Motifs.draw port)  dom.ts
    components/
      chrome/   TopBar  LanguageSwitch  SectionNav  SkipLink  Footer  MusicToggle  HeadManager
      paint/    PlateSection  Plate  GoldLayer  Veil  LightSweep  GlowPulse  LiveStrokes  PaintReveal  BrushEdge  Hairlines  PaperBand
      text/     Reveal  HandTitle  GoldLeaf  Facts  Dateline  NamesBlock  Monogram  GoldRule
      motifs/   Sprite  LineArt  Ganesh  Diya  Particles  EdgeMotifs  EveningLights  TirhutaFlourish  Ghost
      actions/  AddToCalendar  OpenInMaps  Disclosure
      motion/   MotionProvider
    sections/   Opening  Invitation  Countdown  Celebrations  EventSection  EventActions  Cultures  Venues  VenueCard  Rsvp  Gallery  Closing
    styles/     tokens.css  palettes.css  typography.css  base.css  layout.css  motion.css  fonts.<lang>.css (generated)
                + one *.module.css per component
    generated/  plates.json  sprites.json  facts.ts  font-coverage.json  tirhuta-mithila.svg
  tests/
    unit/       ics.test.ts  maps.test.ts  numerals.test.ts  merge.test.ts  i18n.test.ts  routes.test.tsx  countdown.test.ts  hygiene.test.ts
    e2e/        routes.spec.ts  lang-switch.spec.ts  variants.spec.ts  motion.spec.ts  a11y.spec.ts  calendar.spec.ts  layout.spec.ts
  docs/         SPEC.md  NATIVE_REVIEW.md  QA.md
```

### 7.2 Component tree

```
<App>                                            BrowserRouter (client) | StaticRouter (prerender), basename = BASE_URL
  <Routes>
    "/"          <RootRedirect/>
    "/:lang/*"   <LangLayout>                    invalid lang or extra path -> <Navigate replace> (2.1)
                   <CopyProvider lang>           LangFile (lazy chunk) + useVariant() -> SiteCopy
                     <MotionProvider>            tier (3.3), scheduler, in-view registry
                       <HeadManager/>            html lang, title, meta, og, canonical, theme-color
                       <SkipLink/>
                       <TopBar> <Monogram size="s"/> <LanguageSwitch/> <MenuButton/> </TopBar>
                       <SectionNav/>             sheet
                       <main id="main">
                         <Opening/>       PlateSection(opening) > Ganesh, Reveal(kicker), GoldLeaf(h1), GoldRule, Monogram, NamesBlock(pair), Dateline, ScrollCue
                         <Invitation/>    PlateSection(invitation, reveal=sweep) > Sprite(kalash), Reveal(shloka|blessing|host), NamesBlock(full), Ghost(alpana), LineArt(shehnai)
                         <Countdown/>     PaperBand > card > HandTitle, digits, units, AddToCalendar(wedding)
                         <Celebrations>   PaperBand(header) > HandTitle, chips, AddToCalendar(all)
                           <EventSection key=.../> x4-5   PlateSection(event, reveal=style) > EdgeMotifs, Particles, HandTitle(h3), Reveal(tagline), figure > Sprite(couple) + near motifs, Facts, EventActions
                         </Celebrations>
                         <Cultures/>      PlateSection(cultures, reveal=sweep) > TirhutaFlourish, LineArt x6 (scroll), captions
                         <Venues/>        PaperBand > VenueCard x1-2 > days > OpenInMaps
                         <Rsvp/>?         <Gallery/>?
                         <Closing/>       PlateSection(closing, reveal=bloom) > Monogram, HandTitle(close), Reveal(lines), GoldRule, families, Diya, Particles(dust)
                       </main>
                       <Footer/>  <MusicToggle/>?
    "*"          <NotFound/>                     -> /en/ (query + hash kept)
```

`PlateSection` props: `id`, `plate` (plates.json id), `palette`, `reveal?: { style, seed, tilt?, origin? }`, `edge?`,
`particles?`, `liveStrokes?`, `prevGround` (the previous section's `--ground` mid, 3.5). It owns the sticky frame (5.3) and
registers with the scrollspy and the motion scheduler.

### 7.3 npm scripts

| Script | Does | Where |
|---|---|---|
| `dev` | `vite --host 0.0.0.0 --port 5173` | Docker on the dev desktop, published on host 127.0.0.1 only |
| `build` | `gen:i18n` -> `check:content` -> `vite build` -> `vite build --ssr src/entry-server.tsx --outDir dist-ssr` -> `node scripts/prerender.mjs` -> `node scripts/check-budget.mjs` | anywhere with Node 20 (owner's CI too) |
| `preview` | `vite preview --host 0.0.0.0 --port 4173` (serves `dist/`) | Docker, 127.0.0.1 |
| `test` | `vitest run` + `check:content` | Docker |
| `e2e` | `playwright test` against `preview` | Docker (Chromium, WebKit, Firefox projects) |
| `assets:*` | 6.5 | Docker on the dev desktop only |
| `shots` | `node tools/shots/shots.mjs` (screenshot matrix, 8.10) | Mac (cached Chromium, via the SSH tunnel) or Docker |

Dependencies (pin exact versions in `package.json`): runtime `react`, `react-dom` (18.3.x), `react-router-dom` (6.28.x);
dev `vite` 5, `@vitejs/plugin-react`, `typescript` 5, `vitest`, `@testing-library/react`, `jsdom`, `@playwright/test`,
`@axe-core/playwright`, `sharp`, `svgo`, `harfbuzzjs`. No UI kit, no CSS framework, no animation library, no i18n
library (the copy is pre-resolved JSON).

---------------------------------------------------------------------------------------------------------------------

## 8. Acceptance criteria

Each criterion has an id; tests or QA notes cite it. "All variants" = 4 languages x `side` groom/bride x `reception` 1/0
(16). "All viewports" = 360x640, 390x844, 768x1024, 1024x768, 1440x900, 1920x1080 (+ 844x390 for `short`).

### 8.0 Global

- **G-FACT-1** Every visible name, date, time, venue and address string equals the generated copy, which equals
  content.json (unit test on the JSON, e2e text checks per variant). No string on the page is outside `src/i18n/*.json`
  except brand names, `.ics` and the endonyms.
- **G-FACT-2** The forbidden-word and phone-number checks of 4.1 pass on the generated JSON and on the rendered DOM text of
  all variants. No fish shape: the motif list is exactly 1.7 (reviewed by eye on the screenshot matrix).
- **G-ORDER-1** G: Akshay first, Jha family host line, `AS`, "Jha ... & Sil ..."; B: Shreya first, Sil host line, `SA`, Sil
  family first, in all 4 languages, in the invitation, opening pair, closing, footer, `<title>`, `.ics` SUMMARY.
- **G-REC-1** `reception=0`: no Reception section, nav item, chip, venue card, `.ics` event or 29th in any numeral; the
  opening dateline and description show the four-event copy ("25–26 November · Kolkata", "२५–२६ नवंबर · कोलकाता",
  "२५–२६ नवम्बर · कोलकाता", "২৫ ও ২৬শে নভেম্বর · কলকাতা").
- **G-ROUTE-1** 2.1 table holds on the static `dist/` (via `vite preview` and a plain static server with the 404 fallback).
- **G-I18N-1** The language switch keeps query and section: from `/hi/?side=bride&reception=0#haldi` switching to bn lands
  on `/bn/?side=bride&reception=0#haldi` with the Haldi section in view (its top within +-10% of the viewport height of
  where it was), without replaying its reveal.
- **G-I18N-2** `<html lang>`, `<title>`, description and OG tags match the language and variant (pre-rendered for `G1`,
  updated client-side for others). Hindi/Maithili/Bengali pages show native numerals everywhere, including the countdown.
- **G-A11Y-1** axe-core (`@axe-core/playwright`): zero serious or critical violations in all 4 languages x both sides at
  390x844 and 1440x900, motion `none` and `full`.
- **G-A11Y-2** Pixel contrast (`tools/shots/contrast.mjs`): every text block >= 4.5:1 (small) / 3:1 (large) against the
  actual pixels behind it, all variants at 390x844 and 1440x900.
- **G-A11Y-3** Keyboard: every action reachable and operable; visible focus on every focusable; Esc closes the sheet and the
  calendar disclosure and returns focus.
- **G-MOT-1** No text moves after its entrance (sampled transforms of text elements are constant across 10 s of idle).
- **G-MOT-2** <= 3 continuous motions per viewport besides the plate drift (3.6 budgets).
- **G-MOT-3** With `prefers-reduced-motion: reduce`: `document.getAnimations().length === 0` 1 s after load and after
  scrolling to the end; no rAF callback runs while idle; all content visible at once.
- **G-PERF-1** Budgets of 6.7 pass (build gate + `perf.mjs` record in `docs/QA.md`).
- **G-RESP-1** No horizontal scroll, clipping or overlap of text with text, motifs or the couple at all viewports in all
  variants (bounding-box intersection test in `layout.spec.ts` + screenshot review).
- **G-NOJS-1** With JavaScript disabled, `/en/` (and each language) shows all sections with the plates and every fact;
  links work; no blank or hidden content.
- **G-PRIV-1** A HAR of a full scroll contains requests to the site's own origin only.
- **G-BROWSER-1** Latest Chrome (Android, desktop), Safari (iOS 16+, macOS), Firefox, Samsung Internet: no functional
  defects; WebKit runs in the e2e projects; iOS checked on a real device by the owner before sharing (O-list).

### 8.1 Opening

- **A-OPEN-1** At first paint the plate (or its LQIP) and `--paper` show; no white flash; the plate is the LCP element.
- **A-OPEN-2** Ganesh, invocation(s), heading (h1, gold leaf), rule, monogram ring with AS/SA, pair, dates and cities in
  that order, centred; all inside the inner frame and the safe areas at 360x640 without scrolling (the scroll cue may sit
  at the fold).
- **A-OPEN-3** bn_B shows only the Prajapati invocation; en_B and hi/mai_B show both lines; bn_G shows the Prajapati line
  and "শ্রী গণেশায় নমঃ" (data-driven, as content.json).
- **A-OPEN-4** The whole entrance completes within 2.9 s of fonts-ready; the heading shimmers at most once per 5 s.
- **A-OPEN-5** The dateline never shrinks below its role minimum; it is two lines (dates / cities).

### 8.2 Invitation

- **A-INV-1** hi/mai show the shloka on 2 lines; en/bn have none.
- **A-INV-2** The host line is 2 balanced lines at >= 390 px width (3 allowed at 360 px), never breaking a name, an
  honorific from its name, or a hyphenated word.
- **A-INV-3** Each honorific sits directly above its own person (hi: चि. above Akshay, सौ. कां. above Shreya; mai: चि०,
  आयु०; bn: শ্রীমান, কল্যাণীয়া), in both orders.
- **A-INV-4** The joiner is the gold Cormorant "&" (en, hi, mai) or the gold Atma "ও" (bn).
- **A-INV-5** The paint-reveal (sweep) runs once, only when scrolling down into the section, and hands over to the static
  plate with no visible jump (<= 1 px, checked by screenshot diff of the last reveal frame vs the static frame).

### 8.3 Countdown

- **A-CD-1** Shows days, hours, minutes to 2026-11-26T12:30:00Z, correct for any device time zone (unit test with mocked
  clocks in UTC, IST, America/Los_Angeles); seconds only with `showSeconds`.
- **A-CD-2** Native digits in hi/mai/bn; correct unit forms (en day/days, hi घंटा/घंटे).
- **A-CD-3** The row never shifts width when digits change; it updates on minute boundaries and pauses when hidden.
- **A-CD-4** At and after the wedding start the section and its nav item are absent and `#countdown` maps per 2.1.
- **A-CD-5** No JS: the section shows the heading and the wedding date line, without numbers.

### 8.4 Celebrations and events

- **A-EV-1** Events appear in `events_order` (5 or 4), each with title, tagline, couple, date · time, venue, two-line
  address and both actions; the Reception uses the wedding couple sprite at 97% scale with the aripan floor ring.
- **A-EV-2** Couple feet sit on the painted floor zone of the plate (the contact shadow is under the feet, the figure is
  never cut by the frame, its top clears the tagline by >= 16 px) at all viewports.
- **A-EV-3** The wide layout alternates sides (Mehndi left, Engagement right, Haldi left, Wedding right, Reception left);
  the stacked layout centres everything.
- **A-EV-4** "Open in Maps" opens `https://www.google.com/maps/search/?api=1&query=<encoded map_line_en>` in a new tab;
  the five URLs equal the expected strings (unit test).
- **A-EV-5** Each `.ics` validates (RFC 5545 line folding <= 75 octets, CRLF, escaping; parsed back by a test parser);
  DTSTART equals the UTC start of 0.3; no DTEND unless configured; SUMMARY/DESCRIPTION in the page language; LOCATION in
  English. The "all" file has 5 (or 4) VEVENTs. It imports into Apple Calendar (macOS) and Google Calendar (manual check
  recorded in `docs/QA.md`).
- **A-EV-6** The Google Calendar link opens a prefilled event at the right IST time (manual check; O3 if `start/start`
  is rejected).
- **A-EV-7** Each event's paint-reveal uses its style (3.5), runs once, and degrades per tier.
- **A-EV-8** Motifs per 1.7 only; edge motifs never overlap the text column or the couple.

### 8.5 Two cultures

- **A-CUL-1** Ivory palette (no night/indigo); title and captions only (4.7 keys); the line art draws with scroll and
  un-draws when scrolling back; complete at `p = 1`.
- **A-CUL-2** The Tirhuta flourish renders identically in Chrome, Safari and Firefox (it is an SVG), spells मिथिला
  (6 code points of 2.3.5, verified by the build from the shaping input), and is never adjacent to the Bengali word.
- **A-CUL-3** `config.sections.cultures = false` removes the section and its nav item with no layout gap.

### 8.6 Venues

- **A-VEN-1** `reception=1`: two cards, Kolkata (25 and 26 November, Agora Banquets and Roy Bari Events, Gate No.2) then
  Saharsa (29 November, Dev Resort); `reception=0`: one Kolkata card, centred.
- **A-VEN-2** Day headings, event lines, venues and addresses equal `single_page.days`; each venue has "Open in Maps".

### 8.7 Closing and footer

- **A-CLO-1** Monogram, the two-line request (split table), the line, the rule, regards, family 1, joiner, family 2 in
  variant order, and the diya; the flame flickers (full/lite) and is still under `none`.
- **A-CLO-2** The bloom reveal grows from the diya and never flashes white on the transition from teal or vermilion.
- **A-FOOT-1** Footer shows monogram, pair, language switch, back to top; nothing else (plus the music credit if on).

### 8.8 Chrome

- **A-BAR-1** The bar never covers a heading on anchor jumps (`scroll-margin-top` = bar height + 8 px); it reads on every
  section (tone switch); it hides on scroll down and returns on scroll up on phones.
- **A-LANG-1** The four endonyms are real links with `hreflang`/`lang`; the current one has `aria-current`; compact labels
  below 480 px keep full `aria-label`s.
- **A-NAV-1** The sheet lists sections in page order with the variant's events; hidden sections are absent.

### 8.9 Optional modules

- **A-OPT-1** With the default config: no RSVP, music button or gallery in the DOM, no audio request.
- **A-OPT-2** With `music.src`: nothing plays until the button is pressed; it fades; it pauses when the tab is hidden; it
  never resumes by itself.
- **A-OPT-3** With `rsvp.url`: one gilt button, new tab, label `rsvp.cta` in the page language.

### 8.10 Test matrix (who runs what)

- Unit (vitest, Docker): ics, maps, Google link, numerals, plurals, merge (`reception=0` equals the four-event copy for all
  8 variants), hygiene (NBSP rules, address splits), route resolution, countdown math, generator validations.
- E2E (Playwright, Docker; Chromium + WebKit + Firefox): G-ROUTE, G-I18N, G-REC, G-ORDER, G-A11Y-1/3, G-MOT-3, G-NOJS,
  G-PRIV, A-* functional checks.
- Screenshots (`tools/shots/shots.mjs`): every language x `G1` at all viewports at each section's resting state + `B0` at
  390x844 and 1440x900; plus reduced motion at 390x844. Output `~/wedding_site/work/shots/<date>/` (dev desktop) or
  `/tmp/wedsite_shots/` (Mac), contact sheets for review. Never committed.
- Perf (`tools/shots/perf.mjs`, Docker): HAR transfer totals, Lighthouse mobile for `/en/` and `/bn/`.

---------------------------------------------------------------------------------------------------------------------

## 9. Build, dev loop and hosting

### 9.1 Machines (binding)

- **Mac** (`/Volumes/workplace/AkshayShreyaWedding`): edit and commit only. No `npm install`, no build, no `node_modules/`,
  no `dist/`. About 2.7 GB free (2026-11-02). Screenshots may run here with the cached Chromium
  (`~/Library/Caches/ms-playwright/chromium-1234`, `chromium_headless_shell-1234`) and the npx-cached playwright-core
  (`~/.npm/_npx/9833c18b2d85bc59/node_modules/playwright-core`, 1.64.0-alpha), as the invitation engine's `lib/browser.mjs`
  does (proven 2026-11-02 by the paint timing probe).
- **Dev desktop** `dev-dsk-anaaks-2b-9537f078.us-west-2.amazon.com` (dvd): everything else, in Docker. Checked 2026-11-02:
  Docker present, `python:3.11-slim` cached, **no `node:20-bookworm` image yet** (first run pulls it), no host `node`,
  214 GB free, `~/.cache/ms-playwright/chromium_headless_shell-1248` present, 32 cores. Working copy:
  `~/wedding_site/repo` (directory `~/wedding_site` is `chmod 700`), caches in `~/wedding_site/cache/{npm,ms-playwright}`,
  scratch in `~/wedding_site/work/`.

### 9.2 Docker on the dev desktop

```sh
# one shell function on dvd (documented in README); every command runs as the host user, ports bound to 127.0.0.1 only
wsrun() { docker run --rm -it --init -u "$(id -u):$(id -g)" -e HOME=/tmp/home -e npm_config_cache=/cache/npm \
  -e PLAYWRIGHT_BROWSERS_PATH=/cache/ms-playwright -v ~/wedding_site/repo:/app -v ~/wedding_site/cache:/cache \
  -v ~/wedding_site/work:/work -w /app -p 127.0.0.1:5173:5173 -p 127.0.0.1:4173:4173 node:20-bookworm "$@"; }
wsrun npm ci
wsrun npm run dev            # Vite listens on 0.0.0.0 inside the container; the host publishes it on 127.0.0.1 only
wsrun npm run build && wsrun npm run preview
wsrun npx playwright install chromium   # browsers into /cache; OS deps: a derived image `wedding-site-pw` built once
                                        # FROM node:20-bookworm with `npx playwright install-deps chromium webkit firefox`
```

Network for `npm ci` and the Playwright download from inside the container is assumed and must be confirmed in phase 0
(R3). The asset tools use the derived image (Chromium deps) and `python:3.11-slim` (fonttools).

### 9.3 Sync (tar over SSH; no scp/rsync, which are unreliable from this Mac)

`scripts/sync.sh push` (Mac -> dvd):
`tar -C /Volumes/workplace/AkshayShreyaWedding --exclude=node_modules --exclude=dist --exclude=dist-ssr --exclude=.git -cf - . | ssh dvd 'mkdir -p ~/wedding_site/repo && chmod 700 ~/wedding_site && tar -C ~/wedding_site/repo -xf -'`.
`scripts/sync.sh pull-assets` (dvd -> Mac, generated files only):
`ssh dvd 'tar -C ~/wedding_site/repo -cf - public/plates public/sprites public/textures public/motifs public/fonts public/og src/generated src/i18n src/styles/fonts.*.css' | tar -C /Volumes/workplace/AkshayShreyaWedding -xf -`.
Check the Mac's free space before pulling (generated assets are expected around 20-30 MB). Git history lives only on the
Mac; the dvd copy is a working tree.

### 9.4 Preview from the Mac

`ssh -N -L 5173:127.0.0.1:5173 -L 4173:127.0.0.1:4173 dvd`, then `http://127.0.0.1:5173/en/` (dev) or `:4173` (built).
Nothing listens on a public interface (builder-security exposure rule: localhost binding + SSH tunnel only).
Screenshots: `node tools/shots/shots.mjs --base http://127.0.0.1:4173` on the Mac (cached Chromium) or inside the derived
image on dvd.

### 9.5 Hosting (the owner hosts `dist/`)

`dist/` layout: `index.html` (root redirect page), `404.html` (same page, unknown-path mode), `redirect.js`,
`en/index.html`, `hi/index.html`, `mai/index.html`, `bn/index.html`, `assets/*` (hashed JS/CSS), `plates/`, `sprites/`,
`textures/`, `motifs/`, `fonts/`, `og/`, icons, `robots.txt`, `_redirects`. Any static host that serves `dir/index.html`
for `/dir/` works without rewrites; the 404 page sends unknown paths to `/en/` (or `/{lang}/`) with query and hash.

- **Netlify / Cloudflare Pages**: `public/_redirects` (copied to `dist/`). Rules without `!` apply only when no file
  matches, so the four language pages and the root are served as files and only unknown paths redirect (the query string
  passes through; browsers keep the `#hash` across a redirect without a fragment):
  ```
  /english   /en/   301
  /hindi     /hi/   301
  /maithili  /mai/  301
  /bangla    /bn/   301
  /bengali   /bn/   301
  /en/*      /en/   302
  /hi/*      /hi/   302
  /mai/*     /mai/  302
  /bn/*      /bn/   302
  /*         /en/   302
  ```
  (prefix every line with `VITE_BASE` when it is not `/`; `prerender.mjs` writes the file). `netlify.toml` sets headers
  (6.3) and long caching for `/assets/*`, `/plates/*`, `/sprites/*`, `/fonts/*` (`Cache-Control: public,
  max-age=31536000, immutable`; those file names carry a content hash) and `no-cache` for `*.html`. The `404.html` page is
  the fallback for hosts that ignore `_redirects`.
- **Vercel**: `vercel.json` `{ "trailingSlash": true, "cleanUrls": false, "redirects": [<the same alias rules>],
  "headers": [...] }`; Vercel serves `404.html` (client redirect to `/{lang}/` or `/en/`) for other unknown paths.
- **GitHub Pages**: works with `404.html`; for a project page build with `VITE_BASE=/<repo>/`.
- **S3 + CloudFront**: S3 REST origin (private bucket, OAC). CloudFront does not map `/en/` to `/en/index.html` by itself:
  attach a viewer-request CloudFront Function:
  ```js
  function handler(e) { var r = e.request, u = r.uri;
    if (u.endsWith('/')) r.uri = u + 'index.html';
    else if (!u.split('/').pop().includes('.')) return { statusCode: 301, statusDescription: 'Moved',
      headers: { location: { value: u + '/' + (r.querystring && Object.keys(r.querystring).length ? '?' +
      Object.keys(r.querystring).map(function (k) { return k + '=' + r.querystring[k].value; }).join('&') : '') } } };
    return r; }
  ```
  and custom error responses 403 and 404 -> `/404.html` with HTTP 404. Headers via a response headers policy (6.3).
- **Apache/nginx**: `ErrorDocument 404 /404.html` / `error_page 404 /404.html;` and normal directory indexes.
- Set `VITE_SITE_URL` (for example `https://example.com/`) at build time so OG images, canonical and hreflang are absolute.

---------------------------------------------------------------------------------------------------------------------

## 10. Risks and open owner questions

Each question below has a default, and the site ships with that default. The owner answers by ID, and each answer
changes one line, normally in `src/config.ts`. "Status" lines were checked against the repo and the dev desktop on
2026-11-02 (commits up to `9deed7c` plus the working tree). Section 10.3 lists the gaps that check found; each one
goes to the owner of the files involved (11.1).

### 10.1 Owner questions (defaults in brackets; nothing blocks the build)

- **O1 Two cultures section.** The owner cut the Maithil x Bengali scene from the video as "completely unnecessary"
  (WeddingInvite2 `BRIEF.md`; `engine/scenes/_retired/07-milan.js`). The site brief asks for both cultures, so the
  section stays light and sparse, with a different palette and different content from the cut scene.
  [on; `config.sections.cultures = false` removes it]
  Status: the switch works (`Page.tsx` renders `<Cultures />` only when it is on).
- **O2 The year.** The card shows no year. 2026 is inferred from the brief's date (content.json `facts.year_note`).
  The countdown, the `.ics` files and the Google links all depend on it. [2026]
- **O3 End times.** The card gives no end times. [the `.ics` has no DTEND, so each event is a point in time; the Google
  link uses `dates=<start>/<start>`. If Google rejects that, or the owner wants time blocks, set
  `config.calendar.durationMinutes` (one length for every event).]
  Status: both paths are built (`src/lib/ics.ts`, `src/lib/google-calendar.ts`) and the `durationMinutes` branch is
  implemented. Nobody has yet opened a no-end Google link on a phone.
- **O4 Music.** The owner's track (Kesariya) is a commercial recording, and publishing it on a public website needs a
  licence. [off; the README explains why; the owner supplies a file or URL he is allowed to publish, set as
  `config.music.src`]
  Status: the config key exists but the music button (2.4) is not built yet, because it is phase 4 work. Setting
  `music.src` today does nothing (10.3 F2).
- **O5 RSVP.** content.json `do_not_invent` says "no RSVP". [hidden until `config.rsvp.url` is set; the `rsvp.cta` label
  needs native review]
  Status: `Rsvp.tsx` returns nothing while the URL is null. When set, it shows one gilt link that opens in a new tab,
  and the site collects no data.
- **O6 Search indexing.** [`noindex, nofollow` (`config.seo.indexable = false`)]
  Status: `head.ts` writes the meta tag. `public/robots.txt` deliberately disallows nothing, so link-preview bots can
  still fetch the page and crawlers can see the `noindex`.
- **O7 Link previews for variants.** On a static host, a link with `?side=bride` or `?reception=0` gets the default
  preview (groom first, five events), because a query string cannot pick a different HTML file. [accepted;
  `config.prerender.sideShells` would add `/{lang}/bride/` pages with bride-first previews]
  Status: the flag exists but `scripts/prerender.mjs` does not read it yet, so switching it on has no effect (10.3 F1).
- **O8 Native review.** The Tirhuta flourish and every drafted UI string need review by a native speaker (4.8).
  [ship the drafts; each is listed in `docs/NATIVE_REVIEW.md`, Tirhuta in its section 7]
- **O9 Copy choices carried over from the cards:** सील vs शील (hi/mai), mai बहुभोज, bn প্রীতিভোজ, en "&" vs "with".
  [as content.json; the checks accept either spelling of सील/शील]
- **O10 Domain.** The site URL goes in `VITE_SITE_URL` at build time. [unset; the build still succeeds]
  Status: without it, `prerender.mjs` warns and leaves out canonical, hreflang, `og:url` and `og:image`, so previews
  show text with no picture. Set the URL before sharing the link (9.5).

### 10.2 Risks

- **R1 Safari.** Feature gaps: `svh`/`lvh` need iOS 15.4+; AVIF needs Safari 16+ (WebP fallback in every `<picture>`);
  `background-clip: text` needs `-webkit-`; `backdrop-filter` needs `-webkit-` before Safari 18 (fallback: opaque
  paper).
  Status: the prefixes and the `@supports not (...)` fallbacks are in `typography.css`, `base.css` and
  `TopBar.module.css`. `layout.css` puts a `vh` line before each `lvh`/`svh` line. One gap: the fluid type tokens
  (`--fs-hero`, `--fs-names`, `--fs-title` in `typography.css`) use `svh` inside custom properties. A `vh` line placed
  before them cannot help, because a `var()` that resolves to an unknown unit is only invalid at computed-value time.
  On iOS < 15.4 those titles would fall back to the inherited size (10.3 F4). There is no `playwright.config.ts` and no
  WebKit e2e project yet (10.3 F3). The WebKit browser is already cached on dvd (R3). The owner still checks on a real
  iPhone.
- **R2 Low-end Android.** Blend modes and full-screen layers can drop frames.
  Mitigation: the `lite` tier (3.3). `src/lib/motion.ts` already demotes on `saveData` and `deviceMemory <= 2`. The
  runtime probe (median frame time over the first 60 frames of the first paint-reveal, remembered for the session
  under `LITE_KEY`) is in the phase 3 work and not committed yet. No real low-end phone has been measured.
- **R3 Docker network on dvd.** Resolved 2026-11-02. `npm ci`, the typecheck, the unit tests and the build ran in
  `node:20-bookworm` on dvd, and the npm cache is `~/wedding_site/cache/npm` (818 MB). Playwright's
  `webkit-2083` is in `~/wedding_site/cache/ms-playwright`; Chromium for Docker e2e is not there yet (fetched on first
  use). If a download is ever blocked, installing on the Mac is still forbidden; ask the owner for proxy settings or an
  internal npm mirror.
- **R4 Mac disk.** Measured 1.3 GB free on 2026-11-02 (down from 2.7 GB when the spec was written). Generated assets are
  pulled back selectively. Screenshots go to `/tmp` and are deleted after review. Lossless renders, `node_modules/`
  and `dist/` stay on dvd only. Below 1 GB, stop pulling assets and tell the owner.
- **R5 Couple art resolution.** The four source PNGs are 916-1015 px tall (engagement 1015, mehndi 977, wedding 917,
  haldi 916; the Reception reuses `wedding.png`). That caps how large the couple can be shown on desktop (5.2). The
  largest sprites are labelled "960h", but none is upscaled: Haldi's is 927 px (`src/assets/README.md`). A sharper
  desktop couple needs higher-resolution art from the owner; it must not be invented or upscaled with AI.
- **R6 Hydration mismatches.** `main.tsx` hydrates only when the page was prerendered for that language and the URL
  asks for the default variant (G1). Any other variant renders from scratch with `createRoot`, which replaces the
  markup in one commit without a blank frame. The countdown renders "—" placeholders on the server and on the first
  client render. Rule: anything that depends on time, the viewport or `localStorage` renders a placeholder first.
- **R7 Content drift.** The snapshot can fall behind WeddingInvite2's `content.json`. On 2026-11-02 the two were
  byte-identical (sha256 `bcd39fd66ed2…`, `content/SOURCE.md`). `check-content.mjs` prints both hashes whenever the
  source path is reachable. To check without installing anything:
  `shasum -a 256 content/content.json /Volumes/workplace/WeddingInvite2/assets/copy/content.json`.

### 10.3 Follow-ups found by the 2026-11-02 check (each for the owner of the files in 11.1)

- **F1** (section 6, `scripts/prerender.mjs`) Read `config.prerender.sideShells`, or delete the key until it is
  implemented, so that O7 is not a silent no-op.
- **F2** (section 2, `src/sections/Music.tsx`, phase 4) Build the music button from 2.4, or have the build warn when
  `music.src` is set and no button exists.
- **F3** (section 8, `playwright.config.ts`, `tests/e2e/*`) Add the Chromium + WebKit projects that R1 and 8.10 rely
  on. The WebKit build is already cached on dvd.
- **F4** (section 1, `src/styles/typography.css`) Add an `@supports not (height: 1svh)` block that redefines the fluid
  tokens with `vh`, for iOS < 15.4.

Second check, 2026-11-02 (after `b2a93c5` plus the working tree): a build in `node:20-bookworm` on dvd, then Chromium
screenshots at 360, 390, 768, 1280 and 1920 px in en, hi and bn (full page and one viewport per section), and frames
filmed during the opening and the Wedding entrance. No horizontal scroll, no console errors, CLS 0, and no clipped
text at any of the 15 sizes. F1, F2 and F4 are still open. F3 is partly done: `playwright.config.ts` now has Chromium,
WebKit and Firefox projects, but it is not committed yet.

- **F5** (section 5, `src/styles/layout.css`) Every plate leaves a bare strip down its right edge: 7 px at 360, 15 px at
  768, 38 px at 1920. `.plate`/`.gold` are `<picture>` elements set to `inset: -2%` (4% oversize, 3.6), but
  `base.css` sets `picture { max-width: 100% }`, so the box keeps its -2% left offset and loses its right bleed.
  Fix (tested on dvd: the box goes from 1920 to 1997 px at 1920): add `max-width: none;` to the
  `.plate-section .plate, .plate-section .gold` rule.
- **F6** (section 3, `src/components/motion/**`, `src/sections/Opening.tsx`) The opening timeline of 3.4 does not run.
  From 100 ms after load to 2.6 s, every opening element has opacity 1 and no `data-enter`, at 390 bn and 1280 hi. The
  Ganesh line drawing, the kicker, the heading and the ring all appear at once. Event entrances do run: the Wedding
  text blurs in and is in place about 600 ms after the section's trigger.
- **F7** (section 2, `src/sections/Countdown.tsx`) At 360 and 390 the countdown's event line wraps after its first
  separator, so a line ends in a lone "·" ("WEDDING ·", "শুভ বিবাহ ·"). Put the event name on its own line with no
  separator, or wrap each "name · date · time" segment in a `nowrap` span with the separator at the start of the next
  segment.
- **F8** (section 6, `src/assets/sprites`; R5) The closing diya sprites (`closing-diya{,-glow,-flame}-480`) are
  480x392 but are shown up to 1734 px wide: 2.7x at 768 px (DPR 2) and 3.6x at 1920 px. Nothing else is upscaled.
  Export the diya at 1440 px or larger from the engine (it is engine-drawn art, not the couple), or cap its width
  in `src/sections/**/*.module.css` (section 5) at about `min(80vw, 520px)`.
- **F9** (section 3, R2) Main-thread long tasks at load: 366-488 ms at 1280 hi and up to 822 ms at 390 bn with 4x CPU
  throttling, against the 50 ms rule of 6.7. Headless Chromium in Docker renders in software, so the scroll frame
  times (p50 16.7 ms up to 1280 px, 33 ms at 1920 px) are only a lower bound. The load tasks are main-thread work,
  so they still count. Profile them before phase 5.
- **R4 update.** On 2026-11-02 the Mac's data volume (`/tmp`, caches) had 631 MB free, and `/Volumes/workplace`
  (the repo) had 2.7 GB. The data volume is below the 1 GB stop line: pull only small JPEG review images to `/tmp`,
  and delete them after use.

---------------------------------------------------------------------------------------------------------------------

## 11. Ownership map and phases

### 11.1 Who owns what (spec section -> files)

Every file in the repo has exactly one owner: the spec section whose agent writes it. Anyone else who needs a change
asks for it in their report and does not edit the file. Paths are repo-relative and match the disk, which differs from
7.1 in one agreed way: generated art lives in `src/assets/` (plates, sprites, textures, motifs, fonts, glyphs and their
manifests; see `src/assets/README.md`), not in `public/{plates,sprites,textures,motifs,fonts}/` and `src/generated/`.

How to read the table:
- `*` matches any name inside one directory, `**` matches any depth, and `{a,b}` means either a or b.
- When several patterns match a file, the most specific wins. An exact path beats every pattern. Between two patterns,
  the one with more literal characters wins. Example: `src/sections/**/*.module.css` (row 5) beats `src/sections/**`
  (row 2).
- The broad patterns (`src/**`, `tests/**`, `tools/**`, `public/**`, `scripts/*`, `content/**`, `docs/**`) are each
  area's default owner, so a new file inside an area always has an owner. Moving a file to a different owner means
  adding its exact path to that owner's row. The repo root has no default: every root file is named, so a stray file
  at the root (for example a tar extracted in the wrong directory) fails the check until it is moved or named.
- A path followed by (P*n*) is planned and not built yet; phase *n* of 11.2 builds it. Remove the tag once the file
  exists.
- The Tests column belongs to the same owner. The tests named there check that section of the spec.

| § | Section | Owns | Tests |
|---|---|---|---|
| 0 | Ground rules | (no source files: section 0 is enforced by the checks listed in 0.5) | `tests/unit/ground-rules.test.tsx` |
| 1 | Visual system | `src/styles/{tokens,palettes,typography,base}.css`, `src/lib/palettes.ts`, `src/components/text/{GoldLeaf,GoldRule,Joiner}.tsx`, `src/components/paint/Hairlines.tsx`, `tools/plates/recipes.js`, `src/assets/textures/**` | `tests/unit/visual-tokens.test.ts`, `tests/unit/plate-recipes.test.ts`, `tests/unit/gold-leaf.test.tsx` |
| 2 | Site map, routes, sections | `src/App.tsx`, `src/config.ts`, `src/routes/**`, `src/state/**`, `src/lib/{langs,sections,dates,countdown,ics,maps,google-calendar}.ts`, `src/sections/**`, `src/components/chrome/**`, `src/components/chrome/MusicToggle.tsx` (P4), `src/components/actions/**`, `public/redirect.js` | `tests/unit/{routes,actions,config-modules,countdown-view,sections-render}.test.tsx`, `tests/unit/{langs,variant,sections,countdown,ics,maps}.test.ts` |
| 3 | Motion | `src/styles/motion.css`, `src/lib/{motion,parallax,linedraw}.ts`, `src/components/motion/**`, `src/components/paint/{PaintReveal,LiveStrokes,LightSweep,GlowPulse,Veil,BrushEdge}.tsx`, `src/components/text/{Reveal,HandTitle}.tsx`, `src/components/motifs/{LineArt,Diya,Particles,EdgeMotifs,EveningLights}.tsx` | `tests/unit/motion.test.ts`, `tests/unit/motion-components.test.tsx` (the e2e motion spec belongs to row 8) |
| 4 | Internationalisation | `content/**`, `scripts/{gen-i18n,build-i18n,check-content}.mjs`, `scripts/lib/**`, `src/i18n/**`, `src/generated/**`, `src/lib/numerals.ts`, `docs/NATIVE_REVIEW.md` | `tests/unit/{i18n,i18n-pipeline,merge,hygiene,numerals}.test.ts`, `tests/unit/i18n-context.test.tsx` |
| 5 | Responsive layouts | `src/styles/layout.css`, `src/lib/{breakpoints,plates,sprites}.ts`, `src/components/paint/PlateSection.tsx`, `src/sections/**/*.module.css` | `tests/unit/{breakpoints,plates}.test.ts`, `tests/unit/layout.test.tsx` |
| 6 | A11y, SEO/OG, privacy, performance, assets | `index.html`, `src/main.tsx`, `src/entry-server.tsx`, `src/lib/head.ts`, `src/components/chrome/HeadManager.tsx`, `scripts/{prerender,check-budget,subset-fonts}.mjs`, `src/assets/**`, `tools/**`, `public/**`, `public/site.webmanifest` (P4) | `tests/unit/{head,prerender,budget}.test.ts`, `tests/unit/head-manager.test.tsx` |
| 7 | Component tree and file layout | `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `eslint.config.js`, `.nvmrc`, `.prettierrc.json`, `.prettierignore`, `src/**` (default: `src/styles/index.css`, `src/vite-env.d.ts`, `src/lib/dom.ts`, `src/components/paint/{Plate,GoldLayer,PaperBand}.tsx`, `src/components/text/{Facts,Dateline,NamesBlock,Monogram}.tsx` with their CSS modules, `src/components/motifs/{Sprite,Ganesh,Ghost,TirhutaFlourish}.tsx` with theirs) | `tests/unit/c7-layout.test.ts`, `tests/unit/{c7-tree,c7-art,c7-text}.test.tsx` |
| 8 | Acceptance criteria | `tests/**` (default: `tests/setup.ts`, `tests/helpers.ts`, `tests/unit/support/**`, `tests/e2e/**`), `vitest.config.ts`, `playwright.config.ts`, `tools/qa/**`, `tools/shots/**`, `docs/QA.md` (P5) | `tests/unit/acceptance.test.tsx`, `tests/e2e/*.spec.ts` |
| 9 | Build, dev loop, hosting | `README.md`, `scripts/*` (default: `scripts/sync.sh`, `scripts/dvd.sh`), `Dockerfile.dev`, `.dockerignore`, `.gitignore`, `vercel.json`, `netlify.toml`, `public/_redirects` | `tests/unit/hosting.test.ts` |
| 10 | Risks and owner questions | (no files: a 10.1 answer becomes a one-line edit in a file of the row that owns it, mostly the config of row 2) | (none) |
| 11 | Ownership map and phases | `docs/SPEC.md` (the document; each owner edits only its own section, 11.1.1), `docs/**` (default) | `tests/unit/ownership.test.ts` |

Rows 2, 3 and 7 split the component folders by file. The default owner of a folder is the row with the pattern for the
whole folder (`src/components/chrome/**` is row 2, `src/**` is row 7). Exact paths in the other rows take single files
out of it.

#### 11.1.1 Shared files (edited by the integrator only)

These files tie the sections together. Their row decides what goes in them; the integrator agent makes the edit and
merges the requests of parallel agents in one change. A section agent never edits them. It writes the exact change it
needs (file, line, new text) in its report:
`src/styles/tokens.css`, `src/styles/index.css`, `src/i18n/**` (with `content/ui.json` and `src/generated/**`),
`src/App.tsx`, `src/routes/**`, `src/main.tsx`, `src/entry-server.tsx`, `src/config.ts`, `src/sections/Page.tsx`,
`src/state/page.tsx`, `src/components/chrome/**`, `package.json`, `package-lock.json`.
`docs/SPEC.md` is shared by section: each owner edits only its own numbered section and asks the owner of another
section for any change there.

### 11.2 Phases (each ends with a build on dvd, tests green, a commit on the Mac)

The six phases run in order: 0 -> 1 -> 2 -> 3 -> 4 -> 5. Phase 4 needs only phase 2, so it can run in parallel with
phase 3. Inside a phase, one agent per 11.1 row works in parallel, each in its own copy on dvd. Every phase ends with
the same gate, plus the extra checks listed under that phase's "Exit".

**Common exit gate.** On the dev desktop `dev-dsk-anaaks-2b-9537f078.us-west-2.amazon.com` (dvd), in Docker
(`node:20-bookworm`, 9.2), in the agent's own working copy `~/wedding_site/<name>/` (0.2 rule 6), pushed there with
`DVD_DIR='~/wedding_site/<name>' scripts/sync.sh push`:
1. `npm ci` (the first time only), then `npm run typecheck`, `npm test` (vitest + `check:content`), and `npm run build`
   (gen-i18n -> check-content -> client and SSR builds -> prerender -> `check-budget`). Any red step stops the phase.
2. Pull back only the generated files the build changed (`scripts/sync.sh pull-generated`, or `pull-assets` in phase
   1), and only after the free-space guard passes (R4).
3. On the Mac: `git add <explicit paths>` naming only files the agent owns (11.1) or was asked to change, never
   `git add -A` (parallel agents' untracked files stay theirs). Then `git commit` with a Conventional Commits
   message on `main`. Never push: the repo has no remote. Nothing is installed or built on the Mac.

0. **Scaffold**
   Rows: 0, 2, 4, 7, 9 (and the shell parts of 6).
   Builds: the repo skeleton, `package.json`, Vite/TS/React/router, `config.ts`, the content snapshot, `ui.json`,
   `gen-i18n` with its validations and unit tests, routes and redirects, and the prerender with plain-text sections.
   Confirm R3.
   Exit: the common gate. Also, in the cached Chromium through the tunnel (9.4), the four languages, the redirects of
   2.1, the language switch keeping query and hash, and both variants.
   Status (2026-11-02): done. `bb1c47a` (scaffold, 122 files) and `9deed7c` (the section 0 checks). On dvd: typecheck
   green, 120 unit tests green, `check-content` green, build green; 65.4 KB of JS and 7.4 KB of CSS gzip per page.
1. **Assets**
   Rows: 1 (recipes, textures), 6 (plates, sprites, line art, font subsets, Tirhuta, OG, icons).
   Builds: everything in the table of 6.5, rendered and encoded in Docker on dvd; on the Mac only the outputs
   (`scripts/sync.sh pull-assets`).
   Exit: the common gate, plus `npm run assets:report` (the budgets of 6.5). Then a review of contact sheets
   (`tools/qa/sheet.mjs`, `tools/qa/lines.mjs`) against the card renders in `/tmp/wedsite_card/`: every plate in
   every frame, the OG images, the icon, and the line art at 100% and 50% drawn.
   Status (2026-11-02): done. `4b6d3b0` (351 files, about 10.6 MB). 107 of 108 budgets pass. The one over is alpana's
   line art: 142 KB raw against the 60 KB limit of 6.5. It loads lazily (6.6); whether to simplify it or raise its
   limit is open for row 6. `site.webmanifest` was not generated; phase 4 builds it.
2. **Static sections**
   Rows: 1, 2, 5, 7 (and the a11y semantics of 6).
   Builds: every section laid out per 2.3 and 5 with the tokens, sticky frames, plates, couple sprites, motifs,
   actions (`.ics`, maps), chrome and a11y semantics, in the four languages and all four variants. No motion yet:
   every element is at rest.
   Exit: the common gate, plus `npm run e2e` for the routes, language switch, variants, calendar and a11y specs. Then
   the screenshot matrix of 8.10 at rest (`npm run shots`: every language in `G1` at all viewports of 8, plus `B0` at
   390x844 and 1440x900), reviewed against the card on a contact sheet. Also: no horizontal scroll at 360 px
   (G-RESP-1).
   Status (2026-11-02): in progress. Committed: the frames and plate sections of 5 (`0c05780`), the head and budget
   gates of 6 (`a4010a2`) and the gold-leaf fix (`9b4b77c`). The action, motif and section-style files, most section
   tests, the e2e specs and `tools/shots/` (shots, perf, contrast and their helpers) are in the working tree but not
   committed yet. Left: F3 and F7 (10.3), and V1-V3 below.
3. **Motion**
   Rows: 3 (plus the hooks it needs in the sections of 2, requested through the integrator).
   Builds: the motion tiers, entrances, paint-reveals, idle motion, parallax, scroll-linked line art, reduced motion
   and the `lite` probe of R2, all per section 3.
   Exit: the common gate, plus `npm run e2e` with `tests/e2e/motion.spec.ts`: no running animation with reduced
   motion; content visible with JS off; no long task over 50 ms while scrolling at 4x CPU throttling (6.7). Also
   screenshots mid-reveal and at rest, in en, bn and mai at 390 and 1440 px.
   Status (2026-11-02): in progress. Every file of row 3 exists, most of them not committed yet. Idle motion runs
   (gold shimmer, drifts), the line art draws with scroll, and reduced motion leaves no running animation (bn, 390
   px). Left: the opening timeline (F6: from 200 ms to 3.2 s after load the opening is already at rest, and `<html>`
   carries no tier attribute), the `lite` probe of R2, the e2e motion spec green in Chromium and WebKit (F3), and the
   screenshots above.
4. **Optional modules and hosting**
   Rows: 2 (RSVP, music, gallery behind `config.ts`), 6 (manifest, variant shells), 9 (host configs, README).
   Builds: the music button of 2.4 (F2), `public/site.webmanifest`, `config.prerender.sideShells` (F1), the host
   configs of 9.5 and the README.
   Exit: the common gate, plus `tests/unit/config-modules.test.tsx` with every switch turned on and `tests/unit/hosting.test.ts`.
   Then a `dist/` served the way a static host does: every route of 2.1 and the 404 fallback, with query and hash kept.
   Status (2026-11-02): partly built. `Rsvp.tsx` and `Gallery.tsx` (off by default), `netlify.toml`, `vercel.json` and
   `public/_redirects` exist. Left: F1, F2, the manifest.
5. **QA**
   Rows: 8 (with fixes routed to the owning rows).
   Builds: the full matrix of 8 (`tools/shots/`), the budgets, Lighthouse mobile for `/en/` and `/bn/`, the HAR
   transfer totals (`tools/shots/perf.mjs`), the pixel contrast check, and `docs/QA.md`. `docs/NATIVE_REVIEW.md` goes
   to the owner.
   Exit: the common gate, plus every criterion of 8 recorded in `docs/QA.md` with its evidence and every budget of 6.7
   met. Also F3 and F4 closed and the e2e matrix green in Chromium and WebKit.
   Status (2026-11-02): not started. Left: everything tagged (P5), F3, F4.

**Visual check of 11 (2026-11-02).** The working tree after `9b4b77c`, built on dvd (typecheck and build green;
`countdown-view.test.tsx` red in the working tree, row 2), served by `scripts/serve-dist.sh` and shot in Chromium at
360, 390, 768, 1280 and 1920 px in en, hi and bn. No horizontal scroll, no element past the viewport, no console
errors, and no long task while scrolling (no CPU throttling, so this does not close F9). F5 is fixed. New follow-ups,
each for the owner of its files:
- **V1** (row 5, `src/sections/sections.module.css` `.culWord`) In Two cultures at 1280 and 1920 px (bn, hi) the
  Bangla column sits 22 px lower than the Mithila one: the captions under the two words are at 7168 and 7190 px, the
  aripan and alpana captions at 7629 and 7651 px, paag and topor at 7922 and 7937 px (bn, 1280). The Bangla word
  outgrows the shared `min-height: 5.5em`. Give both word blocks one fixed block size, or lay the halves out as one
  grid whose rows both columns share (subgrid), so the matching rows line up as they do on the card.
- **V2** (row 5, `src/sections/sections.module.css` `.weddingKalash`) The Wedding kalash covers the groom's left foot
  at 390 px (en) and 1280 px (bn). On the card it stands clear of him on the left. Move it out (for example
  `left: -24%`) or make it smaller.
- **V3** (row 5, `src/styles/layout.css`, with row 2's `TopBar`) At 360 and 390 px the top bar's monogram and menu
  rings cross the opening frame's double line and corner diamonds. Inset the phone frame below the bar (or the bar
  inside the frame) so the gold lines run clear, as on the card.

How 11 is enforced: `tests/unit/ownership.test.ts` parses this section. It checks that 11.1 has one row per section,
that every file on disk has exactly one owner, and that a (P*n*) path is exact and lands in its own row. Two things are
reported as todo, not failed, because parallel agents commit in any order: an untagged pattern that names no file yet,
and a (P*n*) path that already exists. For 11.2 it checks that
there are six phases in this order, each with its rows, exit and status, and that the common gate uses real npm
scripts. A phase marked done may have no (P*n*) path left, and a phase that is not done must say what is left.
