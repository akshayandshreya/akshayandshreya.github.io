#!/usr/bin/env node
// Before/after scroll-smoothness check of two production builds (an independent cross-check of cultures-perf.mjs).
// Each run: a fresh Chromium page, a steady synthetic scroll gesture (wheel-driven, also on the phone viewport)
// through one section (or the whole page), CPU throttled. Recorded in the page: every rAF frame with its
// scrollY, long tasks (PerformanceObserver), layout shifts. Reported per run, for the frames while the section is on
// screen: frame time p50/p95/max, dropped frames (missed vsyncs: sum of round(delta / 16.7) - 1), frames over 33 ms,
// long tasks. Runs are interleaved before/after so host load hits both alike; the summary is the median per cell.
//   node tools/shots/perf-verify.mjs --before /work/verify/dist-before --after /work/verify/dist-after
//        [--reps 3] [--configs desktop-1x,desktop-4x,mobile-1x,mobile-4x] [--section cultures | --page] [--out DIR]
//   node tools/shots/perf-verify.mjs --before ... --after ... --shots DIR   (3 scroll points, side-by-side jpgs)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { args, loadPlaywright, REPO, settle } from './lib.mjs';

const a = args();
const reps = Number(a.reps ?? 3);
const speed = Number(a.speed ?? 700);
const out = path.resolve(String(a.out ?? '/work/verify/out'));
fs.mkdirSync(out, { recursive: true });

const CONFIGS = {
  'desktop-1x': { vp: { width: 1440, height: 900 }, dpr: 2, throttle: 1, touch: false },
  'desktop-4x': { vp: { width: 1440, height: 900 }, dpr: 2, throttle: 4, touch: false },
  'mobile-1x': { vp: { width: 390, height: 844 }, dpr: 3, throttle: 1, touch: true },
  'mobile-4x': { vp: { width: 390, height: 844 }, dpr: 3, throttle: 4, touch: true },
};
const configs = String(a.configs ?? Object.keys(CONFIGS).join(',')).split(',');

async function serve(dist, port) {
  const child = spawn(process.execPath, [path.join(REPO, 'tests', 'e2e', 'support', 'static-server.mjs'), dist, String(port)], { stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${base}/en/`)).ok) break;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { base, stop: () => child.kill() };
}

const pct = (xs, p) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const median = (xs) => pct(xs, 50);
const r1 = (x) => Math.round(x * 10) / 10;

function frameStats(d) {
  return {
    frames: d.length,
    p50: r1(pct(d, 50)),
    p95: r1(pct(d, 95)),
    max: r1(Math.max(0, ...d)),
    dropped: d.reduce((s, x) => s + Math.max(0, Math.round(x / 16.667) - 1), 0),
    over33: d.filter((x) => x > 33.4).length,
    fps: d.length ? Math.round((1000 * d.length) / d.reduce((s, x) => s + x, 0)) : 0,
  };
}

const INIT = () => {
  const w = window;
  w.__pv = { rec: false, t: [], y: [], long: [], shifts: 0 };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (w.__pv.rec) w.__pv.long.push({ t: e.startTime, d: Math.round(e.duration) });
  }).observe({ type: 'longtask' });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (w.__pv.rec && !e.hadRecentInput) w.__pv.shifts++;
  }).observe({ type: 'layout-shift' });
};

async function run(browser, base, cfg, { section, page: wholePage }) {
  const ctx = await browser.newContext({ viewport: cfg.vp, deviceScaleFactor: cfg.dpr, isMobile: cfg.touch, hasTouch: cfg.touch });
  const page = await ctx.newPage();
  await page.addInitScript(INIT);
  const cdp = await ctx.newCDPSession(page);
  await page.goto(`${base}/en/`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const geo = await page.evaluate(() => {
    const vh = innerHeight;
    const secs = [...document.querySelectorAll('main > section[id], footer')].map((s) => {
      const r = s.getBoundingClientRect();
      return { id: s.id || s.tagName.toLowerCase(), top: r.top + scrollY, h: r.height };
    });
    return { vh, secs, max: document.documentElement.scrollHeight - vh };
  });
  let y0;
  let y1;
  if (wholePage) {
    y0 = 0;
    y1 = geo.max;
  } else {
    const s = geo.secs.find((x) => x.id === section);
    if (!s) throw new Error(`no #${section}`);
    y0 = Math.max(0, Math.round(s.top - 2 * geo.vh));
    y1 = Math.min(geo.max, Math.round(s.top + s.h));
  }
  await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), y0);
  await page.waitForTimeout(2000);
  if (cfg.throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cfg.throttle });
  await page.evaluate(() => {
    const w = window;
    w.__pv.rec = true;
    const loop = (t) => {
      if (!w.__pv.rec) return;
      w.__pv.t.push(t);
      w.__pv.y.push(scrollY);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  // a wheel-driven gesture on the phone viewport too: synthetic touch gestures do not scroll in headless Chromium
  // (dispatched touch events do, but CDP round trips then set the pace); the frames cost the same to render
  await cdp.send('Input.synthesizeScrollGesture', {
    x: Math.round(cfg.vp.width / 2),
    y: Math.round(cfg.vp.height / 2),
    yDistance: -(y1 - y0),
    speed,
    gestureSourceType: 'mouse',
    preventFling: true,
  });
  await page.waitForTimeout(300);
  const rec = await page.evaluate(() => {
    const w = window;
    w.__pv.rec = false;
    return { t: w.__pv.t, y: w.__pv.y, long: w.__pv.long, shifts: w.__pv.shifts, endY: scrollY };
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => undefined);
  await ctx.close();
  // a frame belongs to the section(s) on screen at its scrollY; for the whole page, to the section at mid-screen
  const per = {};
  const add = (k, d) => (per[k] ??= []).push(d);
  for (let i = 1; i < rec.t.length; i++) {
    const d = rec.t[i] - rec.t[i - 1];
    const y = rec.y[i];
    if (wholePage) {
      const mid = y + geo.vh / 2;
      const s = geo.secs.find((x) => mid >= x.top && mid < x.top + x.h);
      add(s?.id ?? 'other', d);
      add('_all', d);
    } else {
      const s = geo.secs.find((x) => x.id === section);
      if (y + geo.vh > s.top && y < s.top + s.h) add(section, d);
    }
  }
  const t0 = rec.t[0] ?? 0;
  const longIn = rec.long.filter((l) => l.t >= t0);
  return {
    stats: Object.fromEntries(Object.entries(per).map(([k, d]) => [k, frameStats(d)])),
    longTasks: longIn.map((l) => l.d),
    // where each long task happened: the section at mid-screen at its start
    longAt: longIn.map((l) => {
      const i = Math.max(0, rec.t.findIndex((t) => t >= l.t) - 1);
      const mid = (rec.y[i] ?? 0) + geo.vh / 2;
      return { d: l.d, at: geo.secs.find((x) => mid >= x.top && mid < x.top + x.h)?.id ?? 'other', y: rec.y[i] };
    }),
    shifts: rec.shifts,
    scrolled: [y0, y1, rec.endY],
  };
}

async function shots(browser, bases, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const views = [
    { name: 'desktop', vp: { width: 1440, height: 900 }, dpr: 1, touch: false },
    { name: 'mobile', vp: { width: 390, height: 844 }, dpr: 2, touch: true },
  ];
  const report = [];
  for (const v of views) {
    for (const [i, frac] of [0.25, 0.55, 0.9].entries()) {
      const png = {};
      const rects = {};
      for (const [label, base] of Object.entries(bases)) {
        const ctx = await browser.newContext({ viewport: v.vp, deviceScaleFactor: v.dpr, isMobile: v.touch, hasTouch: v.touch });
        const page = await ctx.newPage();
        await page.clock.setFixedTime(new Date('2026-11-02T10:00:00Z'));
        await page.goto(`${base}/en/`, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const y = await page.evaluate((f) => {
          const s = document.getElementById('cultures');
          const r = s.getBoundingClientRect();
          const top = r.top + scrollY;
          // from the section's top entering the bottom of the screen to its bottom leaving the top
          return Math.round(top - innerHeight + f * (r.height + innerHeight));
        }, frac);
        // walk there (lazy art loads ahead of the viewport), then rest
        for (let yy = Math.max(0, y - 3 * v.vp.height); yy < y; yy += Math.round(v.vp.height / 3)) {
          await page.evaluate((t) => scrollTo({ top: t, behavior: 'instant' }), yy);
          await page.waitForTimeout(120);
        }
        await page.evaluate((t) => scrollTo({ top: t, behavior: 'instant' }), y);
        // at rest: no finite animation, paint-in or entrance still running in view (lib.mjs busyProbe)
        await page.waitForTimeout(1500);
        await settle(page, 10000);
        await page.waitForTimeout(500);
        png[label] = await page.screenshot();
        rects[label] = await page.evaluate(() =>
          [...document.querySelectorAll('#cultures .line-art')]
            .map((e) => e.getBoundingClientRect())
            .filter((r) => r.bottom > 0 && r.top < innerHeight && r.width > 0)
            .map((r) => [r.left, Math.max(0, r.top), r.right, Math.min(innerHeight, r.bottom)]),
        );
        await ctx.close();
      }
      // side by side + a pixel diff in a blank page
      const page = await browser.newPage();
      const res = await page.evaluate(
        async ({ b, aft, w, boxes, dpr }) => {
          const load = (src) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = src; });
          const [ib, ia] = await Promise.all([load(b), load(aft)]);
          const W = ib.naturalWidth;
          const H = ib.naturalHeight;
          const cv = (im) => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(im, 0, 0); return c.getContext('2d').getImageData(0, 0, W, H).data; };
          const pb = cv(ib);
          const pa = cv(ia);
          let sum = 0;
          let over = 0;
          // the motifs only (their boxes in the after page: the layout is the same), padded by 4 px
          let n = 0;
          let msum = 0;
          let mover = 0;
          const inBox = (x, y) => boxes.some((r) => x >= (r[0] - 4) * dpr && x < (r[2] + 4) * dpr && y >= (r[1] - 4) * dpr && y < (r[3] + 4) * dpr);
          for (let k = 0; k < pb.length; k += 4) {
            const d = (Math.abs(pb[k] - pa[k]) + Math.abs(pb[k + 1] - pa[k + 1]) + Math.abs(pb[k + 2] - pa[k + 2])) / 3;
            sum += d;
            if (d > 24) over++;
            const px = (k / 4) % W;
            const py = Math.floor(k / 4 / W);
            if (inBox(px, py)) {
              n++;
              msum += d;
              if (d > 24) mover++;
            }
          }
          const scale = w / W;
          const gap = 16;
          const top = 26;
          const c = document.createElement('canvas');
          c.width = Math.round(2 * W * scale + gap);
          c.height = Math.round(H * scale + top);
          const g = c.getContext('2d');
          g.fillStyle = '#fff';
          g.fillRect(0, 0, c.width, c.height);
          g.fillStyle = '#000';
          g.font = '15px sans-serif';
          g.fillText('before (8ffc913)', 4, 18);
          g.fillText('after (9122d64)', W * scale + gap + 4, 18);
          g.drawImage(ib, 0, top, W * scale, H * scale);
          g.drawImage(ia, W * scale + gap, top, W * scale, H * scale);
          return {
            jpg: c.toDataURL('image/jpeg', 0.72),
            meanAbs: sum / (W * H),
            pctOver24: (100 * over) / (W * H),
            motifPx: n,
            motifMeanAbs: n ? msum / n : 0,
            motifPctOver24: n ? (100 * mover) / n : 0,
          };
        },
        { b: `data:image/png;base64,${png.before.toString('base64')}`, aft: `data:image/png;base64,${png.after.toString('base64')}`, w: v.name === 'desktop' ? 720 : 300, boxes: rects.after, dpr: v.dpr },
      );
      await page.close();
      const file = path.join(dir, `cultures-${v.name}-${i + 1}-${Math.round(frac * 100)}.jpg`);
      fs.writeFileSync(file, Buffer.from(res.jpg.split(',')[1], 'base64'));
      report.push({
        file: path.basename(file),
        meanAbsDiff: Math.round(res.meanAbs * 1000) / 1000,
        pctPixelsOver24: Math.round(res.pctOver24 * 1000) / 1000,
        motifs: rects.after.length,
        motifPx: res.motifPx,
        motifMeanAbsDiff: Math.round(res.motifMeanAbs * 1000) / 1000,
        motifPctOver24: Math.round(res.motifPctOver24 * 1000) / 1000,
      });
    }
  }
  return report;
}

const pw = await loadPlaywright();
const browser = await pw.chromium.launch({ headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars', '--font-render-hinting=none'] });
const servers = { before: await serve(path.resolve(String(a.before)), 4610), after: await serve(path.resolve(String(a.after)), 4611) };
const bases = { before: servers.before.base, after: servers.after.base };
try {
  if (a.shots) {
    const rep = await shots(browser, bases, path.resolve(String(a.shots)));
    console.log(JSON.stringify(rep, null, 1));
  } else {
    const opts = { section: String(a.section && a.section !== true ? a.section : 'cultures'), page: !!a.page };
    const all = [];
    for (const c of configs) {
      for (let r = 0; r < reps; r++) {
        for (const label of r % 2 ? ['after', 'before'] : ['before', 'after']) {
          const res = await run(browser, bases[label], CONFIGS[c], opts);
          all.push({ config: c, label, rep: r, ...res });
          const k = opts.page ? '_all' : opts.section;
          console.error(c, label, r, JSON.stringify(res.stats[k]), 'long', JSON.stringify(res.longAt));
        }
      }
    }
    fs.writeFileSync(path.join(out, `runs-${opts.page ? 'page' : opts.section}.json`), JSON.stringify(all, null, 1));
    // medians per config x label x key
    const summary = {};
    for (const run of all) {
      for (const [k, s] of Object.entries(run.stats)) {
        const cell = ((summary[run.config] ??= {})[k] ??= {})[run.label] ??= { runs: [] };
        cell.runs.push({ ...s, long: run.longTasks.length, longMax: Math.max(0, ...run.longTasks), shifts: run.shifts });
      }
    }
    for (const byKey of Object.values(summary))
      for (const byLabel of Object.values(byKey))
        for (const cell of Object.values(byLabel)) {
          for (const f of ['p50', 'p95', 'max', 'dropped', 'over33', 'fps', 'frames', 'long', 'longMax', 'shifts']) cell[f] = median(cell.runs.map((x) => x[f]));
          cell.longAll = cell.runs.map((x) => x.long);
          delete cell.runs;
        }
    fs.writeFileSync(path.join(out, `summary-${opts.page ? 'page' : opts.section}.json`), JSON.stringify(summary, null, 1));
    console.log(JSON.stringify(summary, null, 1));
  }
} finally {
  await browser.close();
  servers.before.stop();
  servers.after.stop();
}
