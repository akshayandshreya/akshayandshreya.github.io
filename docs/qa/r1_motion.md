# QA round 1, lens "motion"

Date: 2026-11-02 (evening). Tree: `main` at `f125ab9`, clean. Reviewer: QA r1 motion pass. No code was edited.

Severity: **P1** fix before the link is shared. **P2** should fix. **P3** polish. **INFO** checked, nothing to do
(or the owner decides).

## How it was checked

- HEAD went to dvd by `git archive | ssh tar` into `~/wedding_site/qar1m`. `node_modules` was copied from a sibling
  copy with the same lockfile. `npm run build` passed in Docker (`wedding-site-qa`). `dist/` was served by
  `tests/e2e/support/static-server.mjs` on 127.0.0.1:4271 inside the container. Nothing was exposed and nothing ran
  on the Mac.
- The repo tools were run as they are:
  - `tools/shots/frames.mjs` at 390x844 (all 7 plate sections), 1280x800 (wedding, reception, closing) and 1920x1080
    (invitation, wedding).
  - `npx playwright test tests/e2e/motion.spec.ts` on chromium, webkit and firefox.
- Ad-hoc probes are kept outside the repo, in `~/wedding_site/qar1m-qa/*.mjs` on dvd (a copy is in `/tmp/qar1m-qa`
  on the Mac). Their output is in `~/wedding_site/work/qar1m/`.

  | Probe | What it does |
  |---|---|
  | `scroll.mjs` | Scrolls the whole page with real compositor gestures (`Input.synthesizeScrollGesture`) under a profile: phone 390x844 @3x mobile, 4x CPU, or desktop 1440x900, 1x. It records a Chromium trace (`PipelineReporter` frames, main-thread events), an in-page rAF sampler that does no layout reads, Long Animation Frames with script attribution, long tasks, CLS, LCP and the `data-paint` phases (MutationObserver). Paces: read (0.6 vh at 900 px/s, 1.1 s pause), flick (1.6 vh at 2600 px/s), lite (`hardwareConcurrency = 4`). |
  | `reveal.mjs` | One paint-reveal (Reception) at 4x, traced. Contributions are isolated with `--mod noentr\|nocanvas\|noidle`. |
  | `opening.mjs` | The first-load opening timeline: fonts, boot class, tier, entrance start, first visible `h1`, slow frames inside the 2.9 s entrance. Runs at 1x and 4x, with and without Fast 3G. |
  | `idle.mjs` | Main-thread work per second at rest in each section, app rAF callbacks, running animations by property. |
  | `cultscroll.mjs` | A pass through the scroll-linked line art in Cultures, with and without the line art. |
  | `demote.mjs` | Screencast across the runtime probe's full -> lite demotion. |
  | `rm.mjs` | Live reduced-motion switch full -> reduce -> full in 3 engines. |
  | `navjump*.mjs`, `cult.mjs` | Menu jumps and Cultures geometry. |
  | `engines.mjs` | Reveal phases and pacing in WebKit and Firefox (with an AVIF workaround for F9). |
  | `misc.mjs` | Parallax idle, forced layout, deep-link entrances, countdown tick. |
  | `layers.mjs` | Count of composited layers. |
  | `timeline.mjs` | The applied entrance schedule. |
  | `lcp.mjs` | LCP with and without the veil layer. |

- **Caveat on the numbers.** Headless Chromium uses software raster and compositing. The host load ranged from 4 to
  61 on 32 cores, because other lenses were running. Absolute frame rates are pessimistic: desktop 1440 headless tops
  out at about 30 fps whenever the compositor is busy. The main-thread costs (ms per frame and ms per second, from the
  trace and LoAF) are the trustworthy part. The 4x CPU profile stands in for a mid-range Android phone (spec 3.9). A
  real-device pass (one mid-range Android, one iPhone) is still needed for the GPU-bound items (R2).

## Verdict

The motion system now works end to end. Every plate section is brushed in (`pending > run > done`), with no white
flash, no stuck pending state and no leftover canvas in any engine. The staged timelines match spec 3.4 to the
millisecond, and the hand-off to the content starts at about 72% of the brush. Reduced motion is clean in all three
engines, including a live switch. At rest the page uses no rAF at all.

What still costs smoothness is concentrated in five places:

1. A large commit that freezes the first ~0.5 s of the opening on a mid-range phone.
2. A layout growth in Cultures that sends menu jumps to the wrong section.
3. Overlapping brushes on a fast flick.
4. The scroll-linked line art in Cultures.
5. Main-thread idle animations (masks and background positions) that keep a phone's main thread 11-26% busy at rest.

## Findings

### M1 (P1): the opening entrance stalls ~0.5 s on a mid-range phone, right at its start

**Where.** The first load, `MotionProvider` (tier `none` -> `full`) and `FrameLayers` (`Veil`, `LiveStrokes`,
`LightSweep`, `GlowPulse`, `Particles`, `EveningLights` in every plate section).

**What.** SSR and the first client render use tier `none`. The effect then sets `full`, and that re-render mounts the
motion layers of all ~9 plate sections in one React commit. That is the same commit whose effects start the opening
clock: in `en` the fonts are already ready, so the entrance starts in that commit. The frame holding that commit is
then presented late, so the first 200-230 ms of the Ganesh line draw, the kicker and the paint are skipped, and the
timeline jumps.

| Profile | Entrance starts | Frame that holds it | React in that frame | `h1` visible (opacity > .5) |
|---|---|---|---|---|
| phone, 4x CPU (3 runs) | 1.34-1.42 s | 517-567 ms, beginning 205-229 ms into the entrance | 302-326 ms | 2.81-2.87 s |
| phone, 1x (low host load) | 0.34-0.45 s | 100-167 ms, 32 ms in | 56-128 ms | 1.54-1.66 s |
| desktop, 1x | 0.28-0.39 s | 100 ms, 28-36 ms in | 56-57 ms | 1.53-1.69 s |
| phone 4x + Fast 3G, `en` | 3.19-3.24 s | 483-533 ms, 185-201 ms in | 293-308 ms | 4.65-4.69 s |
| phone 4x + Fast 3G, `bn` | 3.52 s (after the fonts, after the commit) | max 67 ms | none in the window | 4.76 s |

The `bn` row shows the cure. When the clock starts after that commit has painted, the opening runs smoothly.

**How to fix (pick 1 or more).**

- (a) Start the opening clock only after the tier commit has been presented. In `useSectionTriggers`, wait two rAFs
  after `decided && tier !== 'none'` before `clock.trigger(1)`, in addition to fonts or 1200 ms.
- (b) Do not mount the motion layers of off-screen sections at the tier switch. Mount them when a section comes
  within about one viewport (an IntersectionObserver with `rootMargin: 100% 0px`). Mount the opening's own veil,
  strokes and particles after its entrance ends (about 2.9 s), or in `requestIdleCallback`.
- (c) Wrap the tier `setTier` in `startTransition`, so the render phase yields. This does not shrink the commit
  itself, so (a) and (b) matter more.

Re-check with `opening.mjs --cpu 4`: no frame above 50 ms inside the entrance window.

### M2 (P1): menu jumps to Venues or Closing land about 1000 px short, inside Cultures

**Where.** `src/components/motifs/LineArt.tsx`: the placeholder `<img className="line-art__img" loading="lazy">`
has no `width`/`height`. It is 0 px tall until the lazy SVG chunk replaces it.

**What.** Before Cultures has loaded, its six line-art boxes are 0 px tall: Cultures is 929 px at 390x844 and 900 px
at 1440. Once loaded it is 1923 px and 1267 px. A menu jump from the top computes its target first, then Cultures
grows by 994 px (390) or 367 px (1440). Results:

- **Chromium and WebKit, 390x844, menu > Venues:** final `#venues` top = **994 px**, below the 844 px viewport. The
  guest sees the middle of Cultures, with and without reduced motion.
- **Firefox:** lands exactly under reduced motion (one correction 270 ms later), but 700 px short when scrolling
  smoothly.

Deep links on load are fine in all engines (`/en/#venues` and `#closing` stay at 0-1 px from 0.3 s to 3 s): the load
hold (F11) does not cover in-page anchors. Safari has no scroll anchoring, so reserving the space is the only fix that
works there.

**How to fix.**

- Give each line-art box its final size before the SVG arrives: `width`/`height` attributes from the motif's viewBox
  on the `<img>`, or `aspect-ratio` on `.line-art` from the same data.
- As a belt-and-braces measure, re-apply the hash once after `hashchange` when the target moved more than 8 px (the
  same hold as deep links).

Re-check: `navjump.mjs`, where the final target top must be within 2 px in 3 engines x both motion settings.
`G-I18N-1`/`A-BAR-1` should gain an in-page menu-jump case.

### M3 (P2): on a fast flick, up to 3 paint-reveals run at once, and the flick janks

**Where.** `PaintReveal.tsx`. Each section starts its own brush when its top crosses 75%. The `away` observer only
finishes a reveal when its section has completely left the viewport.

**What.** On the phone with a flick (1.6 vh per gesture), sections are 882 px and stay partly in view. Overlaps
observed: mehndi + engagement; haldi + wedding + reception at the same time; reception + cultures. This breaks spec
3.5, "at most one reveal canvas exists at a time (iOS canvas memory)", and every brush adds its per-frame cost:

| Profile | Frames during reveals | Long animation frames |
|---|---|---|
| 4x flick | p50 50 ms, p95 217 ms, max 483 ms, 54 of 106 frames > 34 ms | 31 over 100 ms |
| 4x read (no overlap) | p50 16.8 ms | none over 162 ms |

**How to fix.**

- Keep one reveal slot globally: starting a new brush calls `finish(true)` on the running one.
- Also skip the brush when the section's top reaches 0 within about 500 ms of crossing the line (a flick): set
  `finish(true)` at the IntersectionObserver callback when the scroll velocity is high. Measure the velocity from two
  scroll samples in the scroll registry, not inside the rAF.

Re-check: `scroll.mjs --pace flick --cpu 4`, where `phasesRaw` must never show two `run` phases open at once, and the
run frames p95 < 50 ms.

### M4 (P2): the runtime probe runs on every reveal, not only the first; demotion is abrupt and blinds automated QA

**Where.** `PaintReveal.tsx` `brush()`: `new FrameProbe()` per reveal, so any slow reveal demotes. Also
`MotionProvider` `demote()`.

**What.** Spec 3.3 says "median frame time > 22 ms over the first 60 frames of the first paint-reveal". The code
probes every reveal until one demotes. In this environment it demoted:

- desktop 1440 at 1x after the invitation's brush, 3 of 3 runs;
- the 4x phone after the invitation in 1 of 3 runs;
- the idle walk after the wedding's brush.

Every later section then got the 500 ms crossfade. So the automated full-tier checks (frames, G-MOT-*) exercise the
brush for the first section only, unless they run on a quiet host. That is a QA blind spot: on this host the
repo's `frames.mjs` avoids it only because it reloads per section.

At the demotion (screencast `demote-desktop/`):

- a 167 ms React re-render at 4x;
- the just-revealed invitation loses its veil, live strokes and sweep in one frame (no fade);
- its running entrances are re-armed with lite timing.

The visual pop was small on the invitation (0.44% of the pixels changed by more than 24/255). It will be larger on
deep palettes, where the veil is more visible.

**How to fix.**

- Probe the first reveal only (a module-level `probed` flag).
- Ignore its first 5 frames, which carry the decode, the canvas allocation and the entrance start.
- Judge by the share of frames that miss two vsyncs or more, rather than by a median of a 60/120 Hz-quantised series.
- On demotion, let the section in view keep its full layers until it leaves the viewport, or fade them out over
  600 ms.
- For QA runs, add a `?motion=full` debug switch or a `config.motion.tier` override, so the tools can pin the tier.

### M5 (P2): the Cultures line art drops a mid-range phone to ~21 fps while it draws

**Where.** The scroll-linked line art in `#cultures` (`useLineDraw` with `scroll`, `strokeDashoffset` writes; the
alpana has 202 strokes).

**What.** A 700 px/s pass through Cultures, 4x phone:

| | Frames | p50 | Main-thread work | Layerize |
|---|---|---|---|---|
| with the line art | 86 frames in 4.1 s (21 fps) | 50 ms, 48 frames > 34 ms | about 29 ms/frame | 9.7 ms/frame |
| line art hidden | 142 frames in 4.1 s (35 fps) | 33 ms | about 19.5 ms/frame | 3.7 ms/frame |

Script is small, about 3.5 ms/frame, within the spec's 4 ms. The cost is rendering: repaint and re-layerize of the
SVG on every stroke write. In the full-page read scroll at 4x, Cultures had the most slow frames of any section (35
of 295 > 34 ms). At 1x desktop: p95 83 ms, max 117 ms.

**How to fix.**

- Isolate the SVG in its own layer while it draws (`will-change: transform; contain: layout paint` on
  `.line-art[data-inline]` while the section is `in-view`). That keeps the re-layerize local.
- Quantise the progress to about 60 steps per motif, so most frames write nothing.
- Write at most about 30 strokes per frame. In lite, consider a single mask or clip reveal per motif instead of
  per-stroke dashes.

Re-check: `cultscroll.mjs --profile phone --cpu 4`, target ≥ 30 fps and Layerize < 5 ms/frame.

### M6 (P2): full-tier idle motion keeps the main thread busy at rest (phones: 11-26%)

**Where.** `motion.css`:

- `ls-draw`: live strokes, 3 per section, animating `mask-position`;
- `gold-shimmer`: `background-position` on the hero, monograms, joiners and titles, 1-4 per screen.

Everything else at rest is compositor-only (translate, rotate, scale, opacity).

**What.** At rest, after the entrance, on the 4x phone, measured per second over 4 s:

| Section | Paint | Style | Layerize | Main-thread animations |
|---|---|---|---|---|
| opening | 50 ms/s | 184 ms/s | 50 ms/s | 3 `ls-draw` + 3 shimmers |
| invitation | 63 ms/s | 95 ms/s | 52 ms/s | 3 `ls-draw` + 4 shimmers |
| haldi | 37 ms/s | 118 ms/s | 50 ms/s | 3 `ls-draw` |
| wedding | 21 ms/s | 136 ms/s | 23 ms/s | 3 `ls-draw` |
| reception | 51 ms/s | 119 ms/s | 45 ms/s | 3 `ls-draw` |
| cultures | 65 ms/s | 68 ms/s | 47 ms/s | 3 `ls-draw` |
| closing | 88 ms/s | 131 ms/s | 38 ms/s | 3 `ls-draw` + 4 shimmers |

Lite (no live strokes or shimmer), wedding to closing: Paint 0 ms/s, Style 3-23 ms/s. Desktop at 1x: 25-40 ms/s in
total (fine). On a phone that is battery and heat while the guest reads. It also competes with the rAF-driven
effects (plate shift, line art, brush).

**How to fix.**

- **Shimmer:** move the glint into a separate overlay element animated by `transform` only. For example, a
  `::after` with the glint gradient, `background-clip: text` with a fixed background and `mix-blend-mode`, or the
  text duplicated as a masked layer. Alternatively, play it a limited number of times (2-3 passes) after the
  entrance, then stop.
- **Live strokes:** reveal by translating a feathered gradient element under a static `mask-image` (compositor), or
  fade a pre-cut half-drawn sprite (opacity only). Run them only in `in-focus` sections, as the sweep already does.

Re-check: `idle.mjs --profile phone --cpu 4`, target Paint < 10 ms/s and Style < 30 ms/s at rest.

### M7 (P2, needs a device check): ~100-220 composited layers at rest, 184 paused animations kept alive off-screen

**Where.** Off-screen sections keep their drift, veil and particle animations at `animation-play-state: paused`.
Paused animations still promote their elements to composited layers.

**What.** Measured with the LayerTree domain, phone, at rest:

| Section | Layers | Drawing | Larger than 300k CSS px |
|---|---|---|---|
| opening | 162 | 68 | 34 |
| wedding | 216 | 129 | 59 |
| reception | 221 | 119 | 57 |

The page holds 184 paused and 38 running animations. `UpdateLayer` runs about 95 times per frame during a reveal.
Layerize plus Commit is about 6 ms/frame at 4x, and it halves with the idle animations off (`reveal.mjs --mod
noidle`). Chromium rasterises only near the viewport, so memory is lower than the layer area suggests. iOS Safari's
compositing memory is the real risk (a tab reload on older iPhones).

**How to fix.**

- Give off-screen sections `animation: none` instead of `paused`, except within one viewport of the visible ones (a
  `near-view` class from an IntersectionObserver with a 100% rootMargin). Drift restarts at phase 0 on re-entry,
  which is invisible at these amplitudes.
- Keep `will-change` on `in-focus` only.

Re-check: `layers.mjs` (target < 60 layers), and the owner's real-iPhone pass with Safari's Layers panel.

### M8 (P2): the event tagline's glaze is a hard-edged box during its entrance, then pops soft

**Where.** `EventSection.tsx`: `<Reveal as="p" className="t-tagline event__tagline glaze">`. `layout.css`
`.glaze::before` (`inset: -34px clamp(-60px, -6vw, -16px)`). `motion.css` `[data-reveal='in']` sets `mask-image`
on the same element.

**What.** The entrance mask clips the element to its border box. During the 560 ms entrance, the radial glaze that
normally bleeds 34 px around the line shows as a crisp dark rectangle. When the mask is removed at the end, it jumps
to the soft halo. This happens in every event, and is clearest on the deep palettes: wedding 1920x1080, frame 4 of
`frames-1920/en-G1-1920x1080-wedding-*`.

**How to fix.** Put the glaze on a wrapper that is not masked. Either let the `Reveal` wrap an inner `<span>`, or
give the glaze its own element with an opacity-only fade on the same slot.

### M9 (P3): switching reduced motion off again re-hides content the guest has already seen

**Where.** `useEntrance` and `useSectionTriggers` after a `none` -> `full` tier change.

**What.** Under `none` no clock starts. When the guest turns reduced motion off mid-visit, every armed section goes
back to `pending`, including the one in view. Seen 600 ms after the switch:

- **Chromium and WebKit at the Venues:** the Cultures captions and the Venues cards are hidden again.
- **Firefox at the Closing:** "We look forward …", "Warm Regards" and "Jha Family" vanish and then replay.

The opposite switch (full -> reduce) is perfect in all three engines: 0 animations, 0 pending, the canvas released,
0 rAF in 2 s.

**How to fix.** On a change away from `none`, `finishNow()` every clock whose section top is above the viewport
bottom, and `markRevealed` those sections. Only sections below the fold re-arm.

### M10 (P3): on a slow load the heading waits for the full 2.9 s opening after hydration

**What.** On Fast 3G with 4x CPU:

- the bundle hydrates at 3.2-3.3 s, which races the boot script's 3 s safety timer (twice the provider won);
- the full opening timeline then runs, so the heading is legible only at 4.6-4.8 s after navigation.

Until then the guest sees only the plate.

**How to fix.** When hydration comes more than about 1.5 s after first paint, run the opening compressed (the
existing 600 ms `fit` scale) instead of the full timeline. Also make the boot safety timer and the provider agree on
one deadline: for example, the provider checks `performance.now() > 2800` and then shows the content at once.

### M11 (INFO, with F4): the LCP is the veil that the tier commit mounts, or the `h1` entrance

**What.** The opening plate is never reported as an LCP candidate, in any profile.

- The last LCP is the full-viewport veil `tall-veil-*.webp` / `wide-veil-*.webp`, mounted by the M1 commit: 1.6 s at
  4x, 3.7 s on Fast 3G + 4x.
- With the veil blocked, or in lite, the LCP becomes the `h1` once its entrance shows it: 2.0 s at 4x in lite,
  2.8-3.5 s at 4x with the veil blocked.
- The first candidate is the Ganesh paint at 0.3 s.

So A-OPEN-1 passes only because of the veil, and the LCP time is set by motion. Fixing M1 (b) moves the veil later,
which will move the LCP later too. Decide F4 (why the plate is not a candidate) together with M1.

### M12 (INFO, tools): `frames.mjs` still captures shifted frames at 1280 and 1920

Some frames show a bare ivory band at the top with the bar drawn below it. Examples: `top184` frames 3-4 of the
1920 wedding, frame 0 of the 1280 reception. The resting frames are correct, so this is the F16 capture artifact,
not the site. Waiting for `scrollend` (or two rAFs after `scrollY` stops changing) before each capture would remove
it.

## Checked and passing

- **Paint-reveal (F13 closed).** `frames.mjs` at 390x844, all 7 plate sections, phases `pending>run>done>-`. Also
  1280x800 (wedding, reception, closing) and 1920x1080 (invitation, wedding). Every hand-over is a small step against
  the running median, no flash in any frame, no jank flagged. By eye: brushes of the right style and ground (diagonal
  red over haldi yellow, teal lead on the Reception, rise on the Haldi), the ragged edge only once the section enters,
  the couples whole at rest. The F2 cut couples were not reproduced at 1280 or 1920.
- **Timelines (F14 closed).** Applied `--m-delay` / `--m-dur`, phone, measured from the clock start:
  - Event: title 0/900, couple 300/1200 (feather), tagline 500/560, date 800, venue 950, address 1100, actions
    1250/550, near motif 600/1000, particles 0/1800.
  - Invitation: kalash 0, blessing 250, host 400, name 1 600/900, joiner 1300/400, name 2 1450/900.
  - Closing: ring 0, request 200/900, line 700, rule 900/400, regards 1000, families 1150/750, diya 300, flame 860/400.

  The content starts 900 ms after the brush begins (72% of 1254 ms). Matches spec 3.4.
- **Single reveal cost, 4x phone (Reception).** 12 of 193 frames > 34 ms. The canvas adds about 770 ms of Paint over
  the reveal (about 10 ms/frame at 4x, about 2.5 ms at 1x). Script is about 2-3 ms/frame, inside the spec's 4 ms
  budget.
- **Full read scroll, 4x phone.**
  - rAF p50 16.7 ms, p95 33-50 ms.
  - CLS 0.0003.
  - Nothing stuck: no `data-reveal` or `data-paint` left after the scroll, no canvas left, no page error.
  - Lite tier at 4x: React work during the scroll halves (482 ms vs 944 ms), max LoAF 287 ms.
- **Reduced motion.**
  - The repo's `motion.spec.ts`: G-MOT-3 passes in chromium, webkit and firefox. G-MOT-1, G-MOT-2, A-OPEN-4 and
    A-CLO-1 pass on Chromium (Chromium-only by design).
  - Live switch full -> reduce, mid-reveal and mid-entrance: clean in all three engines.
  - Under reduce, the menu jumps instantly (`scroll-behavior: auto`) in Chromium and WebKit. Firefox jumps, then
    makes one correction (see M2).
- **Idle means no rAF.** 0 app rAF callbacks in 4 s at rest in every section and in both tiers. 0 in the 2 s after
  the pointer parallax settles. The parallax moves `.plate-pointer` (0.58 px, 0.14 px) and then stops.
- **No layout reads in rAF.** LoAF forced style and layout inside rAF callbacks is about 5 ms over a 4x scroll. The
  forced layouts are in IntersectionObserver callbacks (52 ms) and React commits, which spec 3.9 allows.
- **Deep links.** `#wedding`, `#closing` and `#invitation` run the compressed entrance (first `in` at 0.34-0.43 s, all
  in place by about 1.0 s), with no brush, and land exactly in all 3 engines (F10/F11 closed for loads).
- **Countdown (F1 looks closed).** In bn, the units row stays 237.9 px across a minute change.
- **WebKit and Firefox.** The brush runs and renders the same as in Chromium, once the plate decodes. In Playwright's
  WebKit the plate AVIF never decodes (F9), so the code falls back to the 400 ms fade there; with the AVIF sources
  hidden, the brush runs in all 8 sections. Real Safari still needs the owner's iPhone pass.

## Suggested order

1. M2: reserve the line-art boxes.
2. M1: defer the layer mount and the opening clock.
3. M3: one reveal slot, skip on a flick.
4. M4: probe the first reveal only, add a tier pin for QA.
5. M6, M7 and M5 together: idle animations and layers, then line-art isolation.
6. M8, M9, M10.

Re-run `opening.mjs`, `scroll.mjs` (read and flick, 4x), `cultscroll.mjs`, `idle.mjs`, `navjump.mjs`, `frames.mjs`
and then the real-device pass (R2).
