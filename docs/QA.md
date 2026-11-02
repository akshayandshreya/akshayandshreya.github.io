# QA: acceptance criteria, how they are checked, latest results

Spec section 8 is the contract; this file records **how** each criterion is checked, **who** runs it, and the **latest
result**. Ids are the spec's. Tests cite the id in their title, so `npx vitest run -t A-CD-3` or
`npx playwright test -g G-I18N-1` runs one criterion.

## How to run (dev desktop, Docker; never on the Mac)

| What | Command (inside the Docker image, repo root) | Notes |
|---|---|---|
| Unit + component (vitest, jsdom) | `npx vitest run` (or `npm test`, which adds `check:content`) | tests/unit, about 10 s |
| E2E (Playwright) | `npm run build && npx playwright test` | serves `dist/` with `tests/e2e/support/static-server.mjs` (directory indexes, 404.html, gzip, no SPA rewrites) on 127.0.0.1:4183; projects `chromium`, `webkit`, `firefox` (1440x900) and `phone-chromium`, `phone-webkit` (only `@phone` tests). Matrix specs (axe, layout, variants) run their full matrix on Chromium and a slice elsewhere. `E2E_BASE_URL=http://127.0.0.1:4173 npx playwright test` tests another server (for example `vite preview`). |
| Screenshot matrix | `node tools/shots/shots.mjs` | default = 8.10 matrix (every language x G1 x all 7 viewports, B0 at 390/1440, reduced motion at 390). Subsets: `--langs en,bn --viewports 390x844,1440x900 --variants G1 --sections haldi`. Output `/work/shots/<date>` (= `~/wedding_site/work/shots` on dvd) or `/tmp/wedsite_shots/<date>` on the Mac, one PNG per section plus a JPEG contact sheet per language x viewport. Never committed. Each shot waits (up to `--settle`, default 6 s) until the viewport is at rest: no finite animation running, no `data-paint` phase and no `data-reveal` in view in a triggered section (25% visible, spec 3.4; the scroll-linked Cultures captions excepted). "No animation runs" alone is not rest: entrances wait on the section clock, so the old check shot half-revealed couples. A shot that is still moving is logged as `not at rest: <tag> #<id>`. |
| Motion frames (A-INV-5, A-EV-7, A-CLO-2, G-MOT-1) | `node tools/shots/frames.mjs` | default en G1 390x844, the invitation, every event and the closing. Wheels each section in from below the fold (`--step 0.22` of the viewport per frame = a phone flick, `0.05` = a slow read), waits for each smooth scroll to land, films `--frames` JPEGs `--every` ms apart plus a resting frame, and writes a filmstrip per section and `frames.json` (per frame: time, section top, `data-paint` phase, `data-reveal` pending/in counts, running finite animations, share of pixels changed > 24/255, white-flash share). The log line names the reveal phases seen, the hand-over step (last frame with the reveal canvas -> first without), jank (a still section whose change is > 4x the running median) and flashes. Output `/work/frames/<date>` or `/tmp/wedsite_frames/<date>`. |
| Pixel contrast (G-A11Y-2) | `node tools/shots/contrast.mjs` | all 16 variants x 390/1440 by default; exit 1 on any failure; `contrast.json` lists every block |
| Transfer and timing (G-PERF-1) | `node tools/shots/perf.mjs [--lighthouse]` | phone 390x844 @3x, 4x CPU; Markdown table for the record below; Lighthouse only when `lighthouse` and `chrome-launcher` are installed |
| On the Mac | `node tools/shots/shots.mjs --base http://127.0.0.1:4173` through `ssh -N -L 4173:127.0.0.1:4173 dvd` | uses the npx-cached playwright-core (spec 9.1) |

Browsers in Docker: `@playwright/test` 1.48.2 with `chromium-1140`, `webkit-2083`, `firefox-1465` in
`/cache/ms-playwright`. The derived image needs the WebKit/Firefox OS libraries: `FROM wedding-site-pw` +
`npx -y playwright@1.48.2 install-deps chromium webkit firefox` (built on dvd as `wedding-site-qa`, 2026-11-02).

## Test matrix (spec 8.10)

| Layer | Runs | Where | Files |
|---|---|---|---|
| Unit | ics (+ independent RFC 5545 reader), Google link, maps, numerals, plurals, merge, hygiene, routes, countdown math and view (3 time zones, minute boundary, hidden tab, server render), generator validations, the DOM acceptance matrix of all 16 variants, config switches | vitest in Docker | `tests/unit/*.test.ts(x)`, `tests/unit/support/{ics,render}` |
| E2E | G-ROUTE, G-I18N, G-REC, G-ORDER, G-FACT, G-A11Y-1/3, G-MOT, G-NOJS, G-PRIV, G-RESP and the functional A-* checks | Playwright in Docker, Chromium + WebKit + Firefox + phone emulation | `tests/e2e/*.spec.ts`, `playwright.config.ts` |
| Screenshots | resting state of every section per language/viewport/variant, contact sheets | `tools/shots/shots.mjs` | reviewed by eye (fish, motif list 1.7, couple placement, beauty) |
| Pixel contrast | G-A11Y-2 | `tools/shots/contrast.mjs` | |
| Perf | G-PERF-1 transfer, LCP, CLS, long tasks; Lighthouse when installed | `tools/shots/perf.mjs` | |
| Manual (owner) | .ics import into Apple/Google Calendar, Google link opens at 18:00 IST, real iPhone Safari, native review | owner | list below |

## Criteria: method and latest result

Latest run: 2026-11-02 afternoon (dvd, Docker) on the working tree of that afternoon (sections, motion and
assets in progress by their owners; HEAD `e954729` plus uncommitted work), so a red line is a finding for the owner
named in "Findings", not a broken test. Status: PASS / FAIL / PART (some browsers) / PENDING (feature not built:
the test skips itself and turns on when it lands) / MANUAL.

| Id | How | Files | Status |
|---|---|---|---|
| G-FACT-1 | every visible text node, `aria-label`, `alt`, `title` must be a string (or part) of the variant's generated copy, a UI string, an endonym or a brand; every event fact present (16 variants, jsdom); same facts in the browser | `unit/acceptance`, `e2e/variants` | PASS |
| G-FACT-2 | `textViolations` (forbidden words, phone-like runs) on the rendered text, labels and title of all 16 variants; again in the browser | `unit/acceptance`, `e2e/variants`; fish by eye on the sheets | PASS |
| G-ORDER-1 | person roles, host line, monograms, closing families, opening/footer pair, `<title>`, .ics SUMMARY per side | `unit/acceptance`, `unit/ics`, `e2e/variants` | PASS |
| G-REC-1 | no `#reception`, no `a[href="#reception"]`, one venue card, no 29 in any numeral, the four-event dateline literals of 8.0, no Reception VEVENT | `unit/acceptance`, `unit/ics`, `e2e/variants`, `e2e/calendar` | PASS |
| G-ROUTE-1 | the 2.1 table on the static host incl. `/EN/`, aliases, `/bn/deep/path`, unknown paths (404.html + redirect.js), browser language (bn-IN, mai over hi), stored choice, no-JS root page | `e2e/routes`, `unit/routes` | PASS |
| G-I18N-1 | `/hi/?side=bride&reception=0#haldi` -> bn: URL, Haldi top within 10% vh, no pending/running reveal in Haldi, Back returns to hi; switch hrefs follow the section in view | `e2e/lang-switch` | PART: the Haldi case passes in all engines; from `#venues` the links point at `#cultures` (F3) |
| G-I18N-2 | pre-rendered head per language (no JS); client head for all 16 variants; no Latin digit outside `lang="en"`; countdown digits native | `e2e/lang-switch`, `unit/acceptance` | PASS |
| G-A11Y-1 | axe-core (`wcag2a/aa`, `21a/aa`, `22aa`), serious + critical = 0, 4 languages x G1/B1 x 390/1440 x motion none/full, after a full scroll | `e2e/a11y` (Chromium) | PASS (32/32) |
| G-A11Y-2 | `tools/shots/contrast.mjs` | | FAIL: 11 of 716 blocks (F5) |
| G-A11Y-3 | Tab order with a visible ring on every stop, skip link first; sheet: focus trap, Esc, focus returns; calendar disclosure: Esc and outside click close, focus returns; 44 px targets on phones | `e2e/a11y`, `unit/routes` | PASS |
| G-MOT-1 | text positions (relative to their section), transforms and opacity unchanged across 10 s idle after the entrance (opening, haldi, closing) | `e2e/motion` | PASS (Chromium) |
| G-MOT-2 | continuous motions in view, grouped by `[data-motion]` (shimmer = one), plate drift excluded (`[data-drift]`, `.frame` outside a group), <= 3 at every viewport step | `e2e/motion` | PASS (Chromium) |
| G-MOT-3 | reduced motion: `getAnimations().length === 0` 1 s after load and after a full scroll, no rAF callback in 2 s idle, nothing hidden, `html.motion-none` | `e2e/motion` | PASS |
| G-PERF-1 | build gate (`check-budget.mjs`) + `perf.mjs` record below | | PASS (bn initial 768 KB is over the 700 KB target, under the 1.5 MB limit) |
| G-RESP-1 | 7 viewports x 4 languages x G1/B0: no horizontal scroll; every text line inside the viewport; no text-on-text overlap between blocks (glyph cores); no text on the couple; hygiene-joined words (NBSP/U+2060) on one line | `e2e/layout` (Chromium; bn at 390/1440 on WebKit and Firefox) | PASS (56/56 Chromium) |
| G-NOJS-1 | JS off: every section > 40 px tall, no text hidden, all facts, anchors resolve, plates decode | `e2e/nojs` | PASS (WebKit decode check skipped, see F9) |
| G-PRIV-1 | every request of a full scroll + menu + switch hover is same-origin; no audio; no CSP violation event | `e2e/privacy`, `perf.mjs` (3rd-party column) | PASS |
| G-BROWSER-1 | the e2e projects; real iPhone by the owner | | PART (F6-F8 on WebKit/Firefox); MANUAL iOS |
| A-OPEN-1 | no white `html`/`body` at DOMContentLoaded; last LCP entry is an opening `IMG` (avif/webp) | `e2e/sections` | FAIL: LCP is the `h1` (F4); no white flash PASS |
| A-OPEN-2 | card order and centring at 360x640, fits without scrolling (4 languages x G/B) | `e2e/layout`, `unit/acceptance` | PASS |
| A-OPEN-3 | kicker lines equal the data; bn_B Prajapati only; bn_G + "শ্রী গণেশায় নমঃ" | `unit/acceptance`, `unit/i18n` | PASS |
| A-OPEN-4 | finite animations in `#opening` finish within 2.9 s (+0.3 s probe slack) of fonts-ready; any infinite shimmer period >= 5 s | `e2e/motion` | PASS |
| A-OPEN-5 | each dateline span renders on one line, two spans | `e2e/layout` | PASS |
| A-INV-1 | shloka spans | `unit/acceptance` | PASS |
| A-INV-2 | host line 2 lines at >= 390 px, <= 3 at 360; names one line | `e2e/layout` | PASS |
| A-INV-3 | honorific strings per language/role, before the name in the DOM, above it on screen and centred | `unit/acceptance`, `e2e/layout` | PASS |
| A-INV-4 | "&" (lang en) / "ও", gold leaf, Cormorant / Atma loaded | `unit/acceptance`, `e2e/sections` | PASS |
| A-INV-5 | reveal hand-over <= 1 px | `tools/shots/frames.mjs` (hand-over step vs the running median; filmstrip) | FAIL: no paint-reveal runs at all, `data-paint` never appears (F13) |
| A-CD-1 | 24 d 02 h 30 min at 2026-11-02T10:00Z in UTC, Asia/Kolkata, America/Los_Angeles; three units | `unit/countdown-view`, `unit/countdown` | PASS |
| A-CD-2 | native digits and unit forms (hi घंटा/घंटे, en day/days/minute) | `unit/countdown-view`, `unit/acceptance` | PASS |
| A-CD-3 | one timeout, tick exactly on the minute, none while hidden, catch-up on show; row width constant over 12 minutes | `unit/countdown-view`, `e2e/countdown` | FAIL: the row shifts 1-2 px (F1) |
| A-CD-4 | gone at 12:30Z (also live), no nav item, `#countdown` -> celebrations | `unit/countdown-view`, `e2e/countdown` | PART: unit PASS; in the browser `/en/#countdown` after the start lands 660 px from Celebrations (F10) |
| A-CD-5 | server render: title, wedding line, "—" | `unit/countdown-view`, `e2e/nojs` | PASS |
| A-EV-1 | order, chips, h3/tagline/date/venue/2-line address/actions; Reception couple source | `unit/acceptance`, `e2e/sections` | PASS |
| A-EV-2 | the couple image inside its section; >= 16 px below the tagline when stacked | `e2e/layout` | PART: WebKit 360/390 couple box outside its section (Engagement, Haldi; F7); see also F2 |
| A-EV-3 | wide: couple left/right alternating; stacked: centred | `e2e/calendar` | PASS |
| A-EV-4 | five Maps URLs, new tab, noopener | `unit/maps`, `unit/acceptance`, `e2e/calendar` | PASS |
| A-EV-5 | the independent validator (CRLF, <= 75 octets, no split UTF-8 sequence, escaping, UTC, required props) on `buildIcs` for 16 variants and on the downloaded files (one event + "add all", G1/B0, 4 languages); DTEND only with a duration | `unit/ics`, `e2e/calendar` | PASS; Apple/Google import MANUAL |
| A-EV-6 | TEMPLATE, `start/start`, `ctz=Asia/Kolkata`, text, location | `unit/ics`, `e2e/calendar` | PASS; opening in Google MANUAL |
| A-EV-7 | reveal styles per section | `tools/shots/frames.mjs` filmstrips | FAIL: no paint-reveal (F13); event timeline incomplete (F14) |
| A-EV-8 | motifs per 1.7, never over text/couple | `e2e/layout` (`[data-obstacle]`), sheets | PART (motifs tagged `data-obstacle` are checked; review by eye) |
| A-CUL-1 | ivory, title + captions only (jsdom); per-motif draw fraction rises with scroll, >= 0.98 at p = 1, falls when scrolling back | `unit/acceptance`, `e2e/sections` | PART: Chromium/Firefox PASS, WebKit stays at 0 (F8) |
| A-CUL-2 | flourish is SVG paths, aria-hidden, no Tirhuta font or text; the lotus seam lies between the flourish and "বাংলা" at 390/1024/1440 | `e2e/sections`, `e2e/layout`, `unit/acceptance` | PASS (spelling: native review) |
| A-CUL-3 | `sections.cultures = false`: no section, no nav item, venues follows the last event | `unit/config-modules` | PASS |
| A-VEN-1/2 | cards per city with days, lines, venue, address, Maps; wide side by side, tall stacked, one centred card | `unit/acceptance`, `e2e/layout` | PASS |
| A-CLO-1 | order (jsdom); flame animates under full, still under none | `unit/acceptance`, `e2e/motion` | PASS |
| A-CLO-2 | bloom never flashes white | `tools/shots/frames.mjs` (`flash` share per frame) | PENDING: no flash in any frame, but the bloom reveal is not mounted (F13) |
| A-FOOT-1 | footer text is exactly monogram, pair, endonyms, "back to top" | `unit/acceptance`, `e2e/chrome` | PASS |
| A-BAR-1 | heading below the bar after every anchor jump and `scroll-margin-top` = bar + 8; tone light/deep per section; hides on scroll down on phones, returns on scroll up; deep links land and stay | `e2e/chrome` | FAIL: `#invitation` has `scroll-margin-top: 0` (F12); deep links settle late in WebKit/Firefox (F11); WebKit tone stays "deep" (F6) |
| A-LANG-1 | both switches: endonyms, `lang`/`hreflang`, `aria-current`; compact labels < 480 px with full `aria-label` | `unit/acceptance`, `e2e/lang-switch` | PASS |
| A-NAV-1 | sheet hrefs in page order with the variant events (16 variants); from the right on wide, the bottom on tall | `unit/acceptance`, `e2e/chrome` | PASS |
| A-OPT-1 | no RSVP, gallery, audio or music button; no audio request | `unit/acceptance`, `e2e/privacy` | PASS |
| A-OPT-2 | music rules | `unit/config-modules` | PENDING (no `MusicToggle` yet; the test switches on by itself) |
| A-OPT-3 | `rsvp.url`: one gilt link, new tab, `rsvp.cta` in 4 languages, no form | `unit/config-modules` | PASS |

## Findings (2026-11-02, for the owners)

- **F1 (A-CD-3, countdown)**: the units row changes width by 1 px (Chromium) / 2 px (WebKit, Firefox) when the digits
  change (bn and others). Give each number a fixed inline size (for example `inline-size: 2ch` per digit pair with
  `font-variant-numeric: tabular-nums` and a font whose native digits are tabular, or measure the widest digit).
  Also: the first render floors the minutes (10:00:59 shows "29") while later ticks land exactly on the minute (the value
  then reads as rounded up for the rest of the minute); computing `Math.ceil` of the remaining minutes everywhere gives
  one rule.
- **F2 (wedding, reception at 1440x900, full motion)**: in the screenshot after a 3.6 s settle the couple is cut
  horizontally (Reception: only the feet and the aripan ring show; Wedding: no couple visible).
  `/tmp/wedsite_shots/qa8-1/en-G1-1440x900-reception.png`. Looks like a couple entrance/reveal mask that does not finish
  when the section is reached by scrolling (A-EV-2 passes geometrically because the image box is in place).
- **F3 (G-I18N-1, scrollspy)**: deep link `/mai/?reception=0#venues` at 1440x900: the switch links (and so the language
  switch) carry `#cultures` instead of `#venues` (Chromium and Firefox). The 40% line is inside Venues; the overlapping
  sticky Cultures frame probably still reports as intersecting.
- **F4 (A-OPEN-1)**: the LCP element is the `h1` (its gold-leaf background), not the opening plate, in Chromium and
  Firefox. If the plate starts at opacity 0 or behind a mask, Chrome does not count it; the spec wants the plate shown at
  once as the LCP element.
- **F5 (G-A11Y-2)**: below the line: the wedding tagline at 1440 (1.25:1, 27 px: text sits on the light glow or the
  sweep; needs the glaze), the countdown "·" separators (2.3:1; decorative: mark them `aria-hidden` and let the checker
  skip them, or darken), the bar's "বাংলা" (4.1-4.49 at 13-15 px), en Cultures "Paag" at 390 (4.34).
- **F6 (A-BAR-1, WebKit)**: after jumping Wedding -> Reception -> Venues the bar keeps `data-tone="deep"` at Venues.
- **F7 (A-EV-2, WebKit 390x844)**: the Engagement couple image box extends outside its section.
- **F8 (A-CUL-1, WebKit)**: the Cultures line art stays undrawn (dash fraction 0) at p = 1. Check `pathLength` /
  `stroke-dashoffset` handling in Safari on a real device.
- **F10 (A-CD-4, deep link after the start)**: the first render (clock still `null`) keeps the countdown, so
  `LangLayout` scrolls to `#countdown`; the next render removes it and the page is left 660 px away from
  `#celebrations`. Resolve the initial hash after the clock is known (or compute `countdownLive` from `Date.now()` on the
  client's first render).
- **F11 (2.1 deep links, WebKit and Firefox)**: `/en/#venues` is still 366 px from its target 0.7 s after load (content
  above grows after the jump: lazy images without reserved height, fonts). Re-apply the hash scroll once after
  `document.fonts.ready` and the plate decodes, or reserve the heights.
- **F12 (A-BAR-1)**: in the latest tree `#invitation` lost its `scroll-margin-top` (0 instead of bar height + 8 px), in
  all engines.
- **F13 (A-INV-5, A-EV-7, A-CLO-2, motion owner + sections owner)**: `<PaintReveal>` is built
  (`src/components/paint/PaintReveal.tsx`) but no section mounts it. Only `BrushEdge.tsx` and `revealPlan.ts` reference
  it. So no section ever gets `data-paint`, the brush, crossfade and bloom never run, and `frames.mjs` logs `phases -` in
  every section, language and viewport (en/hi/bn, 390x844 and 1280x800/1920x1080, at flick and slow-read speeds).
  Mount it as the last layer of each `PlateSection` frame (spec 3.5), then rerun `frames.mjs` for the hand-over check.
- **F14 (3.4 event timeline, sections owner)**: an event has only two entrances, the tagline and the facts
  (`<Reveal>` in `EventSection.tsx`, both at offset 0). The title, couple (feather-in), actions and near motifs have
  none. Each section's content is in place 0.4-0.7 s after its trigger (frames at 40 ms: wedding `in` from 1728 to
  2087 ms at 390x844, one frame at 1920x1080). Spec 3.4 asks for the staged 1.8 s timeline (title 0-900, couple
  300-1500, ..., actions 1250-1800). No jank and no pop in any filmstrip. The entrances that do run are smooth.
- **F2 update (root cause narrowed; motion owner)**: the cut and missing couples are not the entrance mask. The DOM is
  correct (image complete, no clip, mask or opacity on any ancestor). The same Wedding view at 1280x800, reached by the
  wheel, keeps the couple cut or absent for more than 10 s. With `.couple__pic { animation: none }` (no `breathe-s` /
  `breathe-x`) it paints in full every time. `will-change: transform` does not help: the couple vanishes entirely. The
  plates under drift (`drift-s`) show the same hard horizontal tile edges at rest: Wedding, Reception and Closing at
  768, 1280 and 1920, and the Wedding plate at 1920 has a hard step at y = 374. Repro: `frames.mjs --viewports 1280x800
  --sections wedding`, and the `wedding`/`reception`/`closing` shots at 768/1280/1920. Seen in headless Chromium
  (software raster) on a loaded host (load 59 on 32 cores). Real GPU raster may never show it, so check a low-end
  Android phone (R2). If it shows there, animate translate/rotate only on the couple and plates (drop the scale
  component), or stop the scale loop while the section enters.
- **F15 (A-CUL-2, native review)**: at 360-1280 the Tirhuta flourish is set at heading size directly under the section
  title. A Bengali reader sees "মিথিনা", a Hindi reader "मिथिना": it reads as a misspelt heading in their own script,
  not as an ornament. The caption under it explains, but only in small type. Make it read as an ornament: about 60% of
  the size, gold, lighter weight, with the caption joined to it. Ask the native readers (NATIVE_REVIEW.md) whether it
  still misreads.
- **F16 (environment and tools, fixed in the tools)**: a screenshot taken mid smooth-scroll shows a band of bare paper
  (about 180 px) above the sticky frames. At rest the frames cover the viewport: checked at the Wedding/Reception and
  Engagement/Haldi seams at 390 and 1280. `frames.mjs` now waits for each scroll to land. Before this pass,
  `shots.mjs` settled as soon as no finite animation ran. It therefore shot entrances that had not started yet, which
  is where the half couples of F2 first showed.
- **F9 (environment, not the site)**: Playwright's Linux WebKit advertises AVIF but does not decode it, so the no-JS
  decode check skips WebKit. Real Safari 16+ decodes AVIF; the owner's iPhone check covers it.

## Records

Visual and motion critique (2026-11-02 evening; working tree of that evening, dvd Docker, Chromium): `shots.mjs` for
en/hi/bn x G1 x 360x640, 390x844, 768x1024, 1280x800, 1920x1080 (195 shots, 15 sheets, all at rest except the
scroll-linked Cultures captions). `frames.mjs` for en/hi/bn at 390x844, 1280x800 and 1920x1080 for the invitation,
events and closing, at flick and slow-read speeds. By eye on the sheets: no horizontal overflow, no clipped
text and no broken shaping (Devanagari conjuncts, Bengali ligatures, the Cormorant/Atma joiners). Type at 390 / 1920:
h1 64 / 119 (en), names 45 / 86, address 16 / 20, en dateline 13 / 17 (tracked caps). Card palette and frames match the
invitation card. Open: F2 (raster under the scale loops), F13 (no paint-reveal), F14 (event timeline), F15 (flourish).
No white flash in any frame.

Perf (`perf.mjs`, 390x844 @3x, 4x CPU, gzip static host, 2026-11-02):

| lang | initial transfer | full scroll | JS | CSS | fonts | images (initial / full) | LCP | CLS | long tasks during scroll | 3rd-party |
|---|---|---|---|---|---|---|---|---|---|---|
| en | 684 KB (limit 1.5 MB, target 700 KB: ok) | 1202 KB (limit 6 MB) | 153 KB | 16 KB | 105 KB | 392 / 909 KB | 403 ms | 0 | 0 | 0 |
| bn | 768 KB (target 700 KB: over) | 1285 KB | 154 KB | 16 KB | 186 KB | 392 / 909 KB | 456 ms | 0 | 0 | 0 |

Lighthouse: not run yet (needs `lighthouse` + `chrome-launcher` in the Docker copy).

Contrast (`contrast.mjs`, en/bn/mai x G1 x 390/1440, 2x pixels): 716 blocks, 11 below the line (F5).

## Manual checks (owner, before sharing)

1. Download "Add all to calendar" on a Mac and import into Apple Calendar: 5 events (4 with `?reception=0`) at 11:00,
   18:00, 10:00, 18:00 (and 19:00) IST, titles in the page language. Record the result here.
2. Same file into Google Calendar (web import); and one "Google Calendar" link: the event opens prefilled at the IST time
   (if Google rejects `start/start`, set `calendar.durationMinutes`, O3).
3. A real iPhone (iOS 16+), Safari: scroll the whole page in each language; menu, switch, calendar, Maps.
4. Native readers: `docs/NATIVE_REVIEW.md` with the contact sheets of each language.

## Contracts the tests rely on (keep them, or change the tests with them)

- Section ids of 2.2; sections are `main > section[id]`, the footer `footer#footer`; the bar is the only
  `header[data-tone]`; the menu button `header button[aria-controls="section-nav"]`, the sheet `#section-nav`.
- Global classes next to module classes: `.t-kicker .t-pair .t-dateline > span .t-host .t-names .t-honor .t-shloka
  .invitation__person[data-role] .invitation__joiner .t-family .t-closeline .gold-rule .monogram .monogram__text
  .gold-leaf .venue-card .venue-card__day .chip .event__tagline .t-addr > span .countdown__units .t-digits .t-ui
  .cultures__seam .cultures__bangla [data-slot="ganesh|tirhuta|diya"] .event__couple img`.
- Motion: continuous motions are grouped by `[data-motion]`; plate drift layers carry `[data-drift]` or live in `.frame`
  outside any group; text reveals expose `data-reveal="pending|in"` while not at rest; `html.motion-full|lite|none`.
- Layout obstacles (edge motifs, near motifs) that text must never cover: mark them `data-obstacle`.
- `src/lib/ics.ts`: `buildIcs(events, { pair, durationMinutes, url, now? })`, `icsFileName(events)`;
  `src/lib/google-calendar.ts`: `googleCalendarUrl(event, { pair, durationMinutes, url })`.
- Calendar UI: `.event__actions button[aria-expanded]` opens the disclosure with a button whose text contains ".ics" and a
  `https://calendar.google.com/` link; "Add all" lives in `#celebrations`.
