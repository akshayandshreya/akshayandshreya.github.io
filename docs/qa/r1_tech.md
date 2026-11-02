# QA round 1, lens "tech"

Date: 2026-11-02 (evening). Tree: `main` at `f125ab9`, clean. Reviewer: QA r1 tech pass. No code was edited.

Severity: **P1** fix before the link is shared. **P2** should fix. **P3** polish. **INFO** checked, nothing to do
(or the owner decides).

## How it was checked

- HEAD went to dvd by `git archive | ssh tar` into `~/wedding_site/qar1t` (chmod 700). Everything ran in Docker
  (`wedding-site-qa`, node 20, Playwright 1.48.2 with chromium-1140, webkit-2083, firefox-1465), bound to 127.0.0.1.
  Nothing ran on the Mac.
- `npm ci`, then `npm run build`: passed. The budget gate reports initial JS 108.8 KB gz (limit 250) and entry CSS
  16.0 KB gz. `tsc`: 0 errors. `eslint`: 0 errors, 6 warnings (react-refresh only).
- `vitest`: 1137 passed. The only failure was `ownership.test.ts`, which tripped on a `.head` marker file I had
  dropped into the copy. It is not a site problem.
- `playwright test`, all 5 projects: 336 passed, 2 failed (WebKit desktop project, T13), 232 skipped. The skips are
  by design: the matrix specs run in full on Chromium only.
- Ad-hoc probes, kept outside the repo in `~/wedding_site/qar1t/qa_probe/*.mjs`, output in
  `~/wedding_site/work/qar1t/` on dvd:
  - `probe.mjs`: console and requests (3 engines x 4 languages x G1/B0 x 390/1440, with a full scroll, the menu, the
    calendar and the switch); responsive matrix; notch insets; keyboard walk; axe; head per variant; .ics; maps;
    images; rotation.
  - `keys2.mjs`: focus visibility, measured after the scroll settles.
  - `hold.mjs`: deep-link hold against a user scroll, plus WebKit couple geometry.
  - `lcp.mjs`: real LCP on a throttled phone.
  - `host.mjs`: naive static host and a sub-path build.
  - `forced.mjs`: forced colours.
- Lighthouse 12.8.2 (mobile and desktop) against the gzip static server. It is installed in a scratch dir
  (`~/wedding_site/qar1t-lh`), not in the repo. Note that Chrome crashes in Docker without `--shm-size=1g`.
- Extra builds in sibling copies: `VITE_SITE_URL=https://wedding.example.test/` (`qar1t-url`), and
  `VITE_BASE=/wedding/` + `VITE_SITE_URL` (`qar1t-base`).
- The host was loaded (load average 30-39 on 32 cores; other QA lenses were running). Timings are therefore pessimistic,
  and the timing-sensitive results are marked as such.

## Verdict

Technically the site is in good shape:

- No console error in any engine.
- No horizontal page scroll at any of the 20 viewports from 320x568 to 1920x1200, landscape included.
- axe finds 0 serious or critical issues at 360, 844x390 and 1920, with and without motion; Lighthouse accessibility
  scores 100.
- CLS is 0 everywhere.
- JS is far under budget.
- The .ics files are valid, and the map links are correct and safe.
- `dist/` works as plain files, at the root and under a sub path.

Two link-preview problems matter most for a wedding invitation shared on WhatsApp (T1, T2). After them come the LCP
regression introduced by the veil layer (T3), long tasks during scroll (T14), and a few phone and landscape issues
(T4-T8).

## Findings

### T1 (P1): link previews ignore `?reception=0` and `?side=bride`

- **Where:** `scripts/prerender.mjs` (one head per language); `dist/{lang}/index.html`; `dist/og/og-{lang}.jpg`.
- **What:**
  - Link-preview crawlers (WhatsApp, iMessage, Telegram, Slack) do not run JS. They read the pre-rendered head, and
    that head is the same for all four variants of a language.
  - So a link like `/en/?reception=0` shows the preview "Shubh Vivah · 25, 26 & 29 November · Kolkata · Saharsa".
    The OG image also prints "25, 26 & 29 NOVEMBER / KOLKATA · SAHARSA". The preview therefore announces the
    Reception to exactly the guests the variant is meant to leave out.
  - In the same way, the bride's family's link (`?side=bride`) previews as "Akshay & Shreya".
  - The client head is correct (probe `head`: title and description switch per variant). Only the crawler view is
    wrong.
- **How to fix (pick one):**
  - **Path variants (best):** pre-render the 3 non-default variants of each language as their own shells, for example
    `/en/b/`, `/en/k/` and `/en/bk/`, or folders named by the variant key. Each shell carries its own title,
    description, `og:url` and `og:image` (render `og-{lang}-{G1,G0,B1,B0}.jpg` with `tools/og/og.mjs`). The router
    treats the path segment like the query, and the share links use the paths. `?side`/`?reception` keep working.
  - **Minimum:** make every preview variant-neutral. Use the reception-less dateline that already exists in the copy
    ("25–26 November · Kolkata") in `og:description` and in the OG image, and keep the order question for a later
    round. This invents no content and hides nothing that the page itself does not show.

### T2 (P1): no preview image on the documented hosts unless `VITE_SITE_URL` is set by hand

- **Where:** `scripts/prerender.mjs:295`; `netlify.toml` and `vercel.json` (`npm run build`); README "Build output".
- **What:**
  - Without `VITE_SITE_URL` the build only warns, and it ships without `og:image`, `og:url`, canonical or hreflang,
    with `twitter:card=summary`. A Netlify, Vercel or Cloudflare Pages build from the repo config gets exactly that,
    so WhatsApp shows a text-only card.
  - With the variable set, the head is complete: absolute `og:image` 1200x630 (75-81 KB JPEG, under WhatsApp's
    ~300 KB), `og:image:alt`, `summary_large_image`, canonical and 5 hreflang alternates. That was checked on the
    `qar1t-url` build.
- **How to fix:** fall back to each host's own variable: Netlify `URL` (or `DEPLOY_PRIME_URL` on previews), Vercel
  `VERCEL_PROJECT_PRODUCTION_URL` (prefix `https://`), Cloudflare Pages `CF_PAGES_URL`. When none is set and
  `CI` is true, fail the build instead of warning. Add one line per host to the README hosting table.

### T3 (P2): LCP is now the lazily loaded veil layer, 3.7-4.0 s on a slow-4G phone

- **Where:**
  - `src/components/paint/Veil.tsx` -> `PlateLayer` (`src/components/paint/Plate.tsx:44-60`): `<img loading="lazy">`,
    no `fetchpriority`, no `width`/`height`. It is mounted for the full tier only.
  - Commit `8866ef8` ("lazy layer art").
- **What:**
  - `lcp.mjs` (390x844 @3, CPU 4x, 150 ms RTT, 1.6 Mbps, cold cache) records two LCP candidates. The first is the
    Ganesh sprite at 1.3-1.5 s. The final LCP is `tall-veil-*.webp` at 3679 ms (en), 3958 (hi), 3880 (mai) and
    4012 (bn). At 1440x900 it is `wide-veil-*.webp` at 4066 ms.
  - Lighthouse mobile (simulated) gives LCP 4.4-4.9 s and Performance 76-81 (en 81, bn 80, mai 77, hi 76). Its LCP
    breakdown: load delay 2.5-3.3 s ("not discoverable in the initial document, lazy, no fetchpriority") and render
    delay 1.1-1.5 s. Desktop: LCP 0.9 s, Performance 99.
  - With reduced motion there is no veil, and LCP is the `h1` at 1.28-1.55 s. QA F4 is therefore still open in a new
    form: the opening plate is never the LCP element.
  - The plate preload itself is right. The `<picture>` picks the preloaded `tall-1170` AVIF at 3x, and no plate is
    fetched twice.
  - The initial load also pulls the Invitation's plate, gold, veil and strokes (lazy-load distance), which compete
    with the opening on slow links.
- **How to fix:**
  - Keep the veil out of LCP. Draw it into a `<canvas>`, which is not an LCP candidate. Or render it as an eager
    image that is preloaded with `fetchpriority="high"`, at about 35 KB.
  - Starting the veil at opacity 0 may also keep it out, but how Chrome treats an element that fades in later is not
    verified. Measure it with `lcp.mjs` before relying on it.
  - Give the layers of the second section `fetchpriority="low"`, or mount them on first scroll.
  - Target: LCP <= 2.5 s on `lcp.mjs`, and make the LCP element the opening plate.

### T4 (P2): keyboard focus can sit inside the hidden top bar on phones

- **Where:** `src/components/chrome/TopBar.tsx` (hide logic, `data-hidden`); `TopBar.module.css:39`.
- **What:**
  - At widths up to 767 px the bar slides away on scroll down. Tabbing back into it does not bring it back. In
    `keys2.mjs` (Chromium and WebKit, 390x844) the focused home link "Akshay & Shreya" sits at top -56 / bottom -12
    and cannot be seen. The language links and the menu button follow it.
  - This fails WCAG 2.4.7 and 2.4.11 for keyboard and switch users on phones and tablets.
- **How to fix:**
  - Add `.bar:focus-within { transform: none; }`, or a `focusin` listener on the header that calls
    `setHidden(false)`.
  - Add an e2e check next to A-BAR-1: hide the bar, `Shift+Tab` until focus is in the header, and expect the bar's
    `bottom > 40`.
- **Checked as OK:** after the scroll settles, every other stop (35 per page) is visible, not covered by the bar, and
  has a ring, in Chromium, WebKit and Firefox at 390x844, 844x390 and 1440x900, with and without motion. The
  earlier "off-screen" readings were smooth scroll still in flight.

### T5 (P2): short landscape phones: text runs across the gold frame

- **Where:** sticky frame (`src/styles/layout.css:30` and `:138-168`); opening and closing at
  `(orientation: landscape) and (max-height: ~430px)`.
- **What:**
  - The frame is the height of the viewport, but the content is taller. Opening height against viewport height:
    442/320 at 568x320, 392/360 at 640x360, 422/390 at 844x390, 440/430 at 932x430.
  - The text therefore crosses the frame's hairlines and corner diamonds. At 852x393 (notch case) "& Shreya" runs
    over the bottom frame line. At 568x320 the closing's "JHA FAMILY" sits on the frame line and "&" is cut by it. At
    844x390 "SIL FAMILY" falls outside the frame.
  - Screens: `work/qar1t/resp-en-568x320-top.jpg`, `resp-en-844x390-top.jpg` and
    `safe-iphone15pro-landscape-left-en-top.jpg`.
- **How to fix:** in short landscape, either fit the card (type and spacing on `min(vw, vh)`/`svh` clamps, Ganesh
  smaller), or let the frame wrap the content (frame on the section box instead of a sticky 100svh layer). Hiding
  the hairlines there is a last resort.

### T6 (P2): WebKit loses the reading place on rotation

- **Where:** no resize handling. Chromium is saved by CSS scroll anchoring, which Safari does not have.
- **What:**
  - In `probe.mjs orient`, WebKit `/en/#venues` at 390x844 is rotated to 844x390. Venues ends up at top -1495, and
    after rotating back it is at top 2840: the guest lands in another section.
  - Haldi and Wedding stayed in place. Chromium keeps all three.
  - This was seen in Playwright WebKit only. Confirm it on the owner's iPhone (manual check 3).
- **How to fix:** on a `resize` that changes the width, remember the active section (the scroll spy knows it) and the
  offset into it. After two rAFs, restore the scroll unless the user has scrolled since.

### T7 (P3): Celebrations chips in landscape: hidden overflow and a Safari fallback

- **Where:** `src/styles/layout.css:496-509` (`@media (max-height: 520px) and (orientation: landscape)`).
- **What:**
  - The chip row scrolls sideways with its scrollbar hidden. At 568x320 the Wedding and Reception chips start at
    x 514 and 654 on a 568 viewport, and nothing hints that the row scrolls. The same happens to Reception at 640 and
    740, and with the longer hi and bn titles.
  - `justify-content: safe center` needs Safari 17.6+ (from memory of MDN, not re-verified here). On older iOS the
    declaration is dropped and the base `center` applies. A centred row that overflows its scroll container cuts the
    first chip (Mehndi) off on the left, where it cannot be scrolled to.
- **How to fix:**
  - Use `justify-content: flex-start` with `li:first-child { margin-inline-start: auto }` and
    `li:last-child { margin-inline-end: auto }`. This centres when the row fits and scrolls fully when it does not,
    in every engine.
  - Add an edge fade (mask-image) as the affordance. Add `scroll-padding-inline` and safe-area insets (see T8).

### T8 (P3): notch insets in landscape: the menu sheet and the chip row

- **Where:** `SectionNav.module.css` `.sheet` (>= 768 px: the side panel); `.chips` scroller.
- **What:**
  - The insets were simulated by rewriting `env(safe-area-inset-*)` in the CSS (iPhone 15 Pro: 59 px left and
    right, 21 px bottom).
  - In portrait (393x852) nothing enters an inset band in either language.
  - In landscape (852x393) the side sheet's link rows run to x 801, 8 px into the right inset, because its padding
    has no `env(safe-area-inset-right)`. The Celebrations chip row runs to x 834.
  - On iPhone SE landscape (667x375) the bottom sheet (88svh) holds about 13 rows, so most rows are below the fold
    and need an inner scroll. It works, but the list is cramped.
- **How to fix:**
  - `.sheet { padding-inline-end: calc(var(--pad-x) + env(safe-area-inset-right)); }`. For the chip scroller, use
    `padding-inline: max(var(--s-1), env(safe-area-inset-left)) max(var(--s-1), env(safe-area-inset-right))`.
  - Consider the side-panel layout for `(orientation: landscape) and (max-height: 520px)`.

### T9 (P3): accessible names

- **Where:**
  - `VenueCard.tsx` and `EventActions.tsx` (the links and buttons).
  - `LanguageSwitch.tsx:18` (the `nav` label is the same in the bar and the footer).
  - `TopBar.tsx:79`.
- **What:**
  - **Duplicate link names:** 8 links are all named "Open in Maps (opens in a new tab)" but point to 3 places, and
    6 buttons are named "Add to calendar". A screen reader's links list cannot tell them apart. This is a best
    practice / WCAG 2.4.9 AAA issue; 2.4.4 passes by context.
  - **Duplicate landmarks:** axe `landmark-unique` (moderate, 1-2 per page in every language): the bar's and the
    footer's language `nav` share a name.
  - **Label in name:** Lighthouse flags `label-content-name-mismatch` (an axe experimental rule) on the monogram home
    link (visible "AS", name "Akshay & Shreya") and on the current language link. For the language links it is
    mostly a false positive: the visible short and full forms are both in the text, and "EN" is a prefix of
    "English".
- **How to fix:**
  - Add `aria-describedby` pointing at the event's `h3` or the venue name. This needs no new copy and keeps G-FACT-1
    green.
  - Give the footer switch a distinct label (an existing UI string), or drop its `nav` role.
  - Label-in-name: no action needed. Optionally put the monogram letters in the name ("AS, Akshay & Shreya") only if
    voice-control users matter.

### T10 (P3): images and CSS hygiene

- **Where:** `Plate.tsx` `PlateLayer`; `src/components/motifs/LineArt.tsx:80`; `src/styles/motion.css:899-905`;
  sprite srcsets.
- **What:**
  - **Missing sizes:** 25 of 52 `<img>` have no `width`/`height`: the gold, veil and strokes layers, and the line-art
    images. CLS is still 0 because they are absolutely positioned.
  - **Empty `src`:** the line-art images carry `src=""` until JS sets them. That is an HTML validity error and fires
    `error` events.
  - **Deprecation warning:** Chrome logs "overflow: visible on img" (Lighthouse `deprecations`) because of the
    `.line-art__img, .line-art__svg > svg { overflow: visible }` rule.
  - **Oversized sprites at 1920 @1x** (natural / needed): invitation kalash 2.5x, wedding kalash 3.0x, shankha 3.0x,
    reception bamboo 2.2x, diya glow 2.8x. Lighthouse estimates 89-190 KB of image savings per load.
- **How to fix:**
  - Pass the layer's pixel size into `PlateLayer` as `width`/`height`.
  - Render the line-art `<img>` only once its URL is known.
  - Scope `overflow: visible` to `.line-art__svg > svg`.
  - Add a 1x candidate (about half width) to those sprite srcsets.

### T11 (P3): render-blocking and unused JS (measured, small)

- **What:**
  - Lighthouse lists `motion-boot.js` (860 B, sync) and the entry CSS (16 KB gz) as render-blocking, with an
    estimated 40-150 ms on slow 4G.
  - About 24 KB of the 108 KB entry chunk is unused on first load.
  - The DOM has about 1330 elements.
- **How to fix (optional):** inline `motion-boot.js` with a CSP `sha256-` hash in both the meta and the header CSP,
  which saves one round trip. Nothing else is needed; all of this is inside budget.

### T12 (P3): .ics file names ignore the side

- **What:** the bride-side variant downloads `akshay-shreya-*.ics`. The SUMMARY inside does read
  "শ্রেয়া ও অক্ষয়" correctly.
- **How to fix:** take the slug from the variant's pair (`icsFileName(events, pair)`).

### T13 (P3, tests): the two e2e failures are environment and timing, not the site

- **A-EV-2 WebKit ("wedding 390: couple inside its section"), QA F7:**
  - In `hold.mjs` every WebKit couple image has `naturalWidth = 0`. Playwright's Linux WebKit advertises AVIF but
    cannot decode it (QA F9), so the `<picture>` never falls back to WebP.
  - The broken-image box (338 px wide at x 92-432 on a 390 viewport) then overflows.
  - Real Safari 16+ decodes AVIF. Skip the check when `naturalWidth === 0`, as `nojs.spec` already does. F7 can then
    close after the iPhone check.
- **A-BAR-1 @phone, desktop WebKit project only:**
  - `data-hidden` is set, but at 500 ms the bar's bottom still read 56 / 45 / 23 px over three runs: the 260 ms
    transform transition had not finished on a loaded host.
  - The deep-link hold does not fight the scroll (`hold.mjs`: every scroll step lands, in all engines).
  - Phone-webkit passes. Assert on `data-hidden`, or wait for `transitionend`.

### INFO (checked, fine)

- **Responsive:**
  - Checked at 20 viewports x en/hi/bn: 320x568, 360x640, 360x780, 390x844, 412x915, 430x932, 768x1024, 820x1180,
    1024x768, 1280x800, 1366x768, 1440x900, 1920x1080, 1920x1200, and landscape 568x320, 640x360, 740x360,
    844x390, 932x430, 1180x820.
  - At every one: page `scrollWidth` equals the viewport, there is no text outside the viewport (except the
    intentional chip scroller, T7), no phone target is under 44 px, and no text is under 12 px.
  - 320 px reflow (WCAG 1.4.10) passes.
  - The opening fits the viewport in portrait. In landscape it is 1.03-1.38 viewports tall (T5).
- **Notch, portrait:** the bar, sheet, skip link and frame all use `env(safe-area-inset-*)`, and `viewport-fit=cover`
  is set. Clean.
- **Accessibility:**
  - axe (wcag2a/aa, 21a/aa, 22aa, best-practice) on 4 languages x 360x640 / 844x390 / 1920x1080 x motion
    full/reduced: 0 serious or critical; only `landmark-unique` (T9). `color-contrast` is "incomplete" over images,
    which `contrast.mjs` covers.
  - The suite's G-A11Y-1 (32 runs) passes. Lighthouse accessibility scores 100 in all 5 runs.
  - Forced colours (Chromium `forcedColors: active`) stays legible: text gets backplates and the buttons keep their
    borders.
  - The skip link is the first stop; the menu traps focus and Esc works (suite).
- **Head and SEO:**
  - `<html lang>` (`en`/`hi`/`mai`/`bn`) and `dir` are correct, both in the pre-rendered HTML and after the client
    switches.
  - The title, description, `og:title` and `og:description` switch per variant on the client.
  - There is exactly one `h1` and the heading levels never skip. `format-detection telephone=no` and `color-scheme`
    are set. The manifests are per language.
  - `noindex, nofollow` (meta and `X-Robots-Tag`) with `robots.txt` allowing fetches is intentional for a private
    invitation. Lighthouse SEO scores 66 for that reason alone.
- **.ics:**
  - `probe ics`, Chromium and WebKit, 4 languages x G1 and B0: 7 disclosures in G1, 6 in B0. The independent check
    found 0 errors in every file: CRLF, folding at <= 75 octets with no split UTF-8 sequence, BEGIN/END balanced,
    VERSION/PRODID present, UID/DTSTAMP/DTSTART/SUMMARY present, unique UIDs.
  - The times are UTC and match IST: Mehndi 05:30Z = 11:00, Engagement 12:30Z = 18:00, Haldi 04:30Z = 10:00,
    Wedding 12:30Z = 18:00.
  - "Add all" holds 5 events, or 4 without the Reception. The UIDs are the same in every language, so re-importing
    updates the events instead of duplicating them.
  - No DTEND/DURATION, so each event has zero length (open item O3). Adding `durationMinutes` is the owner's call; do
    not invent end times. An optional `VALARM` (for example -P1D) would add a reminder without inventing content.
- **Maps:**
  - G1 has 8 links (6 without the Reception): `https://www.google.com/maps/search/?api=1&query=<English address>`,
    `target=_blank`, `rel="noopener noreferrer"`, and an aria-label that says it opens a new tab (localised).
  - Owner check: tap each once. The query `Roy Bari Events (Gate No. 2), 192B & C, …` may geocode loosely. The
    `query_place_id=<Place ID>` parameter would pin each venue exactly. This could not be verified offline.
- **Console:**
  - 48 runs (3 engines x 4 languages x G1/B0 x 390/1440, full scroll, menu, calendar, language switch on desktop):
    0 errors, 0 failed requests, 0 HTTP >= 400.
  - WebKit only logs "preloaded AVIF not used", which is the same Linux-WebKit AVIF artefact (F9).
- **Static hosting:**
  - A plain `python3 -m http.server` (no rewrites, no 404 page) serves `/`, `/en`, `/en/`, `/bn/`,
    `/?side=bride` -> `/en/?side=bride`, `/mai/?side=bride&reception=0#haldi`, the `bn-IN` browser language -> `/bn/`,
    and JS-off root -> `/en/`.
  - `/EN/`, `/hindi` and `/bn/deep/path` only resolve on hosts that serve `404.html`, as the README says; all the
    hosts it lists do.
  - The `VITE_BASE=/wedding/` build served under `/wedding/` works for every route with 0 asset 404s.
  - The MIME types for avif, woff2 and webmanifest are standard. `_headers` and `vercel.json` carry the CSP,
    `frame-ancestors`, nosniff, COOP and immutable assets.
- **Budgets:**
  - First-load JS 108.8 KB gz (<= 250). Initial transfer on a phone: 611 (en), 689 (hi/mai) and 675 KB (bn), all
    <= 1.5 MB. CLS 0 (Lighthouse and `lcp.mjs`).
  - Fonts for hi/mai/bn are over the 160 KB target (218/218/210 KB), which is only a note.
  - LCP fails its target (T3).
- **Deep links:** `/hi/#celebrations` and `/hi/#venues` land at the same offset in all three engines (2306/2307 and
  8995-8999), and the user's own scroll is never pulled back.

## Records

`tools/shots/perf.mjs --langs en,hi,mai,bn` (390x844 @3, CPU 4x, no network throttle, gzip static host, cold):

| lang | initial | full scroll | JS | fonts | images (initial / full) | LCP | CLS | long tasks during scroll |
|---|---|---|---|---|---|---|---|---|
| en | 890 KB (limit ok, 700 KB target over) | 1921 KB | 113 KB | 113 KB | 628 / 1609 KB | 1474 ms | 0.0003 | 38 > 50 ms |
| hi | 968 KB | 2000 KB | 114 KB | 188 KB | 628 / 1609 KB | 1606 ms | 0.0003 | 37 |
| mai | 968 KB | 2000 KB | 114 KB | 188 KB | 628 / 1609 KB | 1540 ms | 0.0003 | 34 |
| bn | 914 KB | 1985 KB | 114 KB | 175 KB | 588 / 1609 KB | 1601 ms | 0.0003 | 35 |

These numbers are higher than `lcp.mjs`'s 611-689 KB because perf.mjs waits for load plus 2 s of idle on a fast
network, so more lazy art arrives. Measured in `lcp.mjs` on throttled slow 4G, the critical transfer is 611-689 KB.

### T14 (P2): long tasks during scroll went from 0 to 34-38

- **What:**
  - The QA.md record from this afternoon had 0 long tasks during the scroll. Now there are 34-38 tasks over 50 ms.
    The longest in en are 296, 239, 221, 169, 162, 155, 152 and 134 ms.
  - On load the tasks run up to 273 ms.
  - This arrived with the paint transitions and lazy layers (`c8353f5`, `8866ef8`). The host was loaded (load average
    about 35), which inflates the numbers, but going from 0 to about 35 is still a real change.
- **How to fix:**
  - Profile one section entry (Chrome trace on `frames.mjs --sections wedding`).
  - Likely costs: the brush-reveal canvas drawing at full DPR, image decodes of the lazy layers on the main thread
    (use `decoding="async"` plus `img.decode()` before the reveal starts), and the line-art path measurement.
  - Draw the reveal at 1x and scale it with CSS, and spread the decodes over idle time. Recheck on a quiet host with
    `perf.mjs`.

Contrast (`tools/shots/contrast.mjs`, 4 languages x 4 variants x 390/1440, reduced motion): 3556 blocks, 46 below
the line (`work/qar1t/contrast/contrast.json`). This is design's area; it is recorded here for the numbers.

- **Probably false readings:** the 1.16-2.02:1 readings (venue name and opening city line in hi/mai/bn at 1440,
  wedding tagline, B-side h1) are not real. A crop of each one at 1440 is fully legible (`work/qar1t/c-*.png`), and
  the text is solid ink or the gold-leaf clip. They look like a mask artefact in the tool: the overlap of two blocks,
  or the h1's background-clip text. Check the tool's diff mask for those blocks before acting on them.
- **Real near-misses:**
  - the bar's language labels, 4.38-4.47:1 at 15 px (1440; the same as QA F5)
  - the Haldi address line in hi/mai, 4.25:1 at 18 px (1440)
  - the opening city line, 4.32:1 at 16 px (390, hi/mai/bn)
  - a Cultures caption, 4.44:1 (390)

  Each needs about 0.1-0.3 more contrast: a slightly darker ink, or the glaze behind it.

## Suggested order

1. T1 and T2 (previews). Then T3 (LCP) and T14 (scroll long tasks).
2. T4 (focus in the hidden bar), T5 (landscape frame), T6 (rotation).
3. T7-T12 polish. T13 is a test-only change.
4. Owner on a real iPhone: rotation (T6), landscape chips on iOS 16/17 (T7), couples (F7), WhatsApp preview of a
   `?reception=0` link after T1/T2.
