# Cultures section: scroll performance (2026-11-02)

Owner report, testing the production build at http://localhost:5660/en/: every section felt smooth except
Cultures, which "still feels choppy and sluggish".

Branch `perf-cultures` (worktree `/Volumes/workplace/AkshayShreyaWedding-perf`), based on `8ffc913`:

- `9122d64` perf(cultures): Draw the line art on a canvas (the fix)
- `597ab6f` test(perf): Add before/after check of the cultures fix (separate verification, screenshots here)

## Cause

The six scroll-drawn motifs (aripan, alpana, paag, topor, lotus, shankha) were inline SVGs. Each stroke had
its own `<mask>`, 472 in all, under a turbulence "brush" filter. The reveal animates a dash offset, and any dash
change made the browser re-render every mask layer and the whole filter for the motif:

- about 30 ms of raster per scroll frame (3.3 s of raster over one pass through the section, 4x CPU)
- about 470 effect nodes to layerize on each frame
- a 135 ms main-thread task while the art loaded (the id-prefixing pass over the big alpana/aripan SVGs)

## Fix (look unchanged)

- Each motif is now drawn on a canvas. The canvas paints only the part the drawing has reached: a ribbon
  around the centreline, widened by the brush spread, clipped to the drawn length and kept off undrawn
  neighbouring strokes.
- The canvas is masked by the finished ink: the same motif SVG without its per-stroke masks (at rest they
  clip nothing), which the browser rasterises once.
- A worker paints the canvas (OffscreenCanvas) where the browser supports it. Otherwise the main thread
  paints it.
- When a motif is complete or not yet started, its canvas leaves compositing.
- The mask wrapper is laid out at the device pixel ratio and scaled back, so WebKit keeps the grain sharp.
- The id prefixing (`prefixIds`) is now a single pass.

The art and the reveal idea are the same. At rest, pixel diffs are 0 or a sub-pixel offset in Chromium,
WebKit and Firefox. The screenshots and diffs are in this folder: `cultures-*-{25,55,90}.jpg` and
`cultures-desktop-motifs-90-2x-diff.jpg`.

## Numbers

These come from the separate check (`tools/shots/perf-verify.mjs`, raw data in `summary-cultures.json`). It
runs both production builds one after the other in Chromium in docker on the dev desktop, with software
compositing, and scrolls steadily at 700 px/s. It counts only the frames while Cultures is on screen. Each
figure is the median of 3 runs. A dropped frame is a missed 60 Hz refresh. Desktop is 1440x900 at 2x. Mobile is
390x844 at 3x with phone emulation.

| Cultures | p50 / p95 frame, before -> after | Dropped frames | fps | Long tasks per run |
|---|---|---|---|---|
| Desktop, 1x CPU | 33 / 100 -> 17 / 33 ms | 92 -> 41 | 24 -> 44 | 2-3 (up to 152 ms) -> 0 |
| Desktop, 4x CPU | 33 / 150 -> 17 / 33 ms | 107 -> 50 | 18 -> 41 | 0-3 (up to 344 ms) -> 0 |
| Mobile, 1x CPU | 17 / 50 -> 17 / 17 ms | 58 -> 0 | 40 -> 60 | 0 -> 0 |
| Mobile, 4x CPU | 33 / 67 -> 17 / 33 ms | 104 -> 14 | 25 -> 55 | 2-4 (up to 217 ms) -> 0 |

The worst single frame went from 233-267 ms to 50-67 ms. No run had a layout shift. The other sections did not
change beyond noise, and reception, venues and closing improved. On the fixer's own probe (desktop, 4x CPU),
raster went from 3.3 s to 0.25 s and the masks from 472 to 0.

Desktop still drops some frames under software compositing on the dev desktop, which has no GPU. On a laptop
with GPU compositing, the remaining per-frame cost (a canvas upload) is small. The owner should confirm this on
their own machine.

## Delivered for testing

The `perf-cultures` build is at `/Volumes/workplace/AkshayShreyaWedding-local/dist`, built in docker on dvd
with `npm run build`. It replaced the earlier dist. `serve.py` is unchanged and still serves 127.0.0.1:5660.
`/en/`, `/hi/`, `/mai/` and `/bn/` return 200.

## For the orchestrator

`perf-cultures` must be merged into the main repo (`/Volumes/workplace/AkshayShreyaWedding`) **after the
main site workflow finishes**. That workflow still has uncommitted edits in the main tree, so this branch did
not touch it. Expect conflicts in `src/sections/Cultures.tsx`, its CSS and the motif components if the main
workflow also edited them. Rebuild and rerun `tools/shots/perf-verify.mjs` after the merge.
