#!/usr/bin/env node
// Scroll-performance probe for one section (default #cultures) in a production build: a steady compositor scroll
// gesture through it (CDP Input.synthesizeScrollGesture) under CPU throttling, recorded three ways at once:
//   - main-thread frames: rAF deltas in the page (p50/p95/max, frames over 20 / 33 / 50 ms)
//   - a Chromium trace: main-thread time per kind (script, style, layout, paint, prepaint/layerize/commit, GC, parse),
//     raster time on the raster threads, compositor frames (DrawFrame), long tasks (RunTask > 50 ms)
//   - counters in the page: React commits, IntersectionObserver callbacks, style mutations in the section, the
//     section's element / SVG node / mask / filter count, and which properties change (attribute + style diff)
// Prints one JSON summary (and writes it with the trace to --out).
//   node tools/shots/cultures-perf.mjs [--section cultures] [--vp 1440x900] [--dpr 2] [--throttle 4] [--speed 700]
//                                       [--label before] [--base URL | --dist dist] [--trace] [--mutations] [--gpu]
//                                       [--css 'selector { a/b experiment }']
import fs from 'node:fs';
import path from 'node:path';
import { args, baseUrl, loadPlaywright, outDir, viewport } from './lib.mjs';

const a = args();
const section = a.section && a.section !== true ? String(a.section) : 'cultures';
const vp = viewport(a.vp && a.vp !== true ? a.vp : '1440x900');
const dpr = Number(a.dpr ?? 2);
const throttle = Number(a.throttle ?? 4);
const speed = Number(a.speed ?? 700);
const label = a.label && a.label !== true ? String(a.label) : 'run';
const lang = a.lang && a.lang !== true ? String(a.lang) : 'en';
const out = outDir(a, 'perf-cultures');

const MAIN_KINDS = {
  script: ['FunctionCall', 'EvaluateScript', 'v8.compile', 'v8.compileModule', 'TimerFire', 'FireAnimationFrame', 'EventDispatch', 'RunMicrotasks', 'V8.Execute', 'FireIdleCallback'],
  style: ['UpdateLayoutTree', 'RecalculateStyles', 'ScheduleStyleRecalculation'],
  layout: ['Layout'],
  paint: ['Paint'],
  prePaint: ['PrePaint'],
  layerize: ['Layerize', 'UpdateLayer', 'UpdateLayerTree'],
  commit: ['Commit'],
  parseHTML: ['ParseHTML'],
  gc: ['MajorGC', 'MinorGC', 'V8.GCScavenger', 'V8.GCFinalizeMC', 'V8.GC_MC_BACKGROUND_MARKING', 'BlinkGC.AtomicPhase', 'V8.GCIncrementalMarking'],
  hitTest: ['HitTest'],
  image: ['Decode Image', 'ImageDecodeTask', 'Decode LazyPixelRef'],
};

function summarizeTrace(trace) {
  const events = trace.traceEvents ?? trace;
  const threads = new Map(); // `${pid}:${tid}` -> name
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') threads.set(`${e.pid}:${e.tid}`, e.args?.name ?? '');
  // the renderer main thread(s) with the most RunTask time is the page's
  const runTask = new Map();
  for (const e of events) {
    if (e.ph !== 'X' || e.name !== 'RunTask') continue;
    const k = `${e.pid}:${e.tid}`;
    if (threads.get(k) !== 'CrRendererMain') continue;
    runTask.set(k, (runTask.get(k) ?? 0) + (e.dur ?? 0));
  }
  const main = [...runTask.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  const mainPid = main?.split(':')[0];
  const byKind = Object.fromEntries(Object.keys(MAIN_KINDS).map((k) => [k, 0]));
  const kindOf = new Map();
  for (const [k, names] of Object.entries(MAIN_KINDS)) for (const n of names) kindOf.set(n, k);
  // count only the outermost event per kind (nested FunctionCall inside TimerFire etc. would double count)
  const stack = [];
  const mainEvents = events.filter((e) => e.ph === 'X' && `${e.pid}:${e.tid}` === main).sort((x, y) => x.ts - y.ts || (y.dur ?? 0) - (x.dur ?? 0));
  let longTasks = [];
  let busy = 0;
  for (const e of mainEvents) {
    while (stack.length && stack[stack.length - 1].end <= e.ts) stack.pop();
    if (e.name === 'RunTask') {
      busy += e.dur ?? 0;
      if ((e.dur ?? 0) > 50000) longTasks.push(Math.round(e.dur / 1000));
    }
    const k = kindOf.get(e.name);
    if (k && !stack.some((s) => s.kind === k)) byKind[k] += e.dur ?? 0;
    stack.push({ end: e.ts + (e.dur ?? 0), kind: k });
  }
  let raster = 0;
  let rasterMax = 0;
  let rasterTasks = 0;
  let gpuTime = 0;
  let drawFrames = 0;
  for (const e of events) {
    const tn = threads.get(`${e.pid}:${e.tid}`) ?? '';
    if (e.ph === 'X' && e.name === 'RasterTask' && String(e.pid) === mainPid) {
      raster += e.dur ?? 0;
      rasterMax = Math.max(rasterMax, e.dur ?? 0);
      rasterTasks++;
    }
    if (e.ph === 'X' && /^(CrGpuMain|VizCompositorThread)$/.test(tn) && e.name === 'RunTask') gpuTime += e.dur ?? 0;
    if (e.name === 'DrawFrame' && String(e.pid) === mainPid) drawFrames++;
  }
  const ms = (us) => Math.round(us / 100) / 10;
  return {
    mainBusyMs: ms(busy),
    mainByKindMs: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, ms(v)])),
    longTasksMs: longTasks,
    rasterMs: ms(raster),
    rasterMaxTaskMs: ms(rasterMax),
    rasterTasks,
    gpuVizBusyMs: ms(gpuTime),
    drawFrames,
  };
}

const pct = (xs, p) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

const { base, stop } = await baseUrl(a);
const pw = await loadPlaywright();
// --gpu: the GPU pipeline a laptop has (accelerated canvas, GPU raster and compositing), emulated by SwiftShader in
// Docker: the main thread then does what it does on real hardware, the GPU process (slow here) does the rest
const extraArgs = a.gpu
  ? ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-accelerated-2d-canvas']
  : [];
const browser = await pw.chromium.launch({ headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars', '--font-render-hinting=none', ...extraArgs] });
let result;
try {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const w = window;
    w.__pp = { long: [], commits: 0, io: 0, frames: [], rec: false, cls: 0, shifts: 0 };
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          if (!w.__pp.rec || e.hadRecentInput) continue;
          w.__pp.cls += e.value;
          w.__pp.shifts++;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      /* no layout-shift */
    }
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) w.__pp.long.push({ t: Math.round(e.startTime), d: Math.round(e.duration) });
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      /* no longtask */
    }
    // React commits: a minimal devtools hook (react-dom calls onCommitFiberRoot after every commit)
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      isDisabled: false,
      renderers: new Map(),
      inject() {
        return 1;
      },
      onScheduleFiberRoot() {},
      onCommitFiberRoot() {
        if (w.__pp.rec) w.__pp.commits++;
      },
      onCommitFiberUnmount() {},
      onPostCommitFiberRoot() {},
      checkDCE() {},
    };
    const IO = w.IntersectionObserver;
    if (IO) {
      w.IntersectionObserver = class extends IO {
        constructor(cb, o) {
          super((entries, obs) => {
            if (w.__pp.rec) w.__pp.io += entries.length;
            cb(entries, obs);
          }, o);
        }
      };
    }
  });
  // --css: a style sheet added to the page (A/B experiments: what does a property cost?)
  if (a.css && a.css !== true)
    await page.addInitScript((css) => {
      document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.textContent = css;
        document.head.appendChild(s);
      });
    }, String(a.css));
  // --init: a script run before the page's own (A/B experiments through a page global)
  if (a.init && a.init !== true) await page.addInitScript(String(a.init));
  const cdp = await ctx.newCDPSession(page);
  await page.goto(`${base}/${lang}/`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const geo = await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top + window.scrollY, height: r.height, vh: window.innerHeight };
  }, section);
  if (!geo) throw new Error(`no #${section}`);
  // start 2.6 viewports above the section (the line art loads 1.5 viewports ahead), end with its bottom at mid-screen
  const y0 = Math.max(0, Math.round(geo.top - 2.6 * geo.vh));
  const y1 = Math.round(geo.top + geo.height - 0.5 * geo.vh);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y0);
  await page.waitForTimeout(2500);
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await cdp.send('Performance.enable');
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  if (a.trace)
    await browser.startTracing(page, {
      categories: [
        'devtools.timeline',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.frame',
        'toplevel',
        'blink',
        'cc',
        'v8',
        'v8.execute',
        'blink.user_timing',
        'loading',
        'latencyInfo',
        'disabled-by-default-devtools.timeline.invalidationTracking',
      ].filter((c) => a.invalidations || !c.includes('invalidationTracking')),
    });
  await page.evaluate(
    ({ id, mutations }) => {
      const w = window;
      w.__pp.rec = true;
      w.__pp.frames = [];
      w.__pp.longFrom = performance.now();
      w.__pp.ys = [];
      const loop = (t) => {
        if (!w.__pp.rec) return;
        w.__pp.frames.push(t);
        w.__pp.ys.push(window.scrollY);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      if (mutations) {
        const el = document.getElementById(id);
        w.__pp.mut = { attrs: {}, styleProps: {}, nodes: 0, perFrame: new Map() };
        const mo = new MutationObserver((list) => {
          for (const m of list) {
            if (m.type === 'childList') w.__pp.mut.nodes += m.addedNodes.length;
            if (m.type !== 'attributes') continue;
            const n = m.attributeName;
            w.__pp.mut.attrs[n] = (w.__pp.mut.attrs[n] ?? 0) + 1;
            if (n === 'style') {
              const prev = m.oldValue ?? '';
              const cur = m.target.getAttribute('style') ?? '';
              const props = (s) => Object.fromEntries(s.split(';').map((x) => x.split(':').map((y) => y.trim())).filter((x) => x[0]));
              const p0 = props(prev);
              const p1 = props(cur);
              for (const k of new Set([...Object.keys(p0), ...Object.keys(p1)])) if (p0[k] !== p1[k]) w.__pp.mut.styleProps[k] = (w.__pp.mut.styleProps[k] ?? 0) + 1;
            }
          }
        });
        mo.observe(el, { subtree: true, attributes: true, attributeOldValue: true, childList: true });
        w.__pp.mo = mo;
      }
    },
    { id: section, mutations: !!a.mutations },
  );
  const t0 = Date.now();
  await cdp.send('Input.synthesizeScrollGesture', {
    x: Math.round(vp.width / 2),
    y: Math.round(vp.height / 2),
    yDistance: -(y1 - y0),
    speed,
    gestureSourceType: 'mouse',
    preventFling: true,
  });
  const gestureMs = Date.now() - t0;
  await page.waitForTimeout(400);
  const inPage = await page.evaluate((id) => {
    const w = window;
    w.__pp.rec = false;
    w.__pp.mo?.disconnect();
    const f = w.__pp.frames;
    const d = [];
    for (let i = 1; i < f.length; i++) d.push(f[i] - f[i - 1]);
    const el = document.getElementById(id);
    // the frames while the section is on screen (its top above the viewport bottom)
    const top = el ? el.getBoundingClientRect().top + window.scrollY : 0;
    const dIn = [];
    for (let i = 1; i < f.length; i++) if (w.__pp.ys[i] > top - window.innerHeight) dIn.push(f[i] - f[i - 1]);
    const svgNodes = el ? el.querySelectorAll('svg *').length : 0;
    return {
      deltas: d,
      deltasIn: dIn,
      long: w.__pp.long.filter((x) => x.t >= w.__pp.longFrom).map((x) => x.d),
      commits: w.__pp.commits,
      ioEntries: w.__pp.io,
      cls: Math.round(w.__pp.cls * 10000) / 10000,
      shifts: w.__pp.shifts,
      drawn: [...(el?.querySelectorAll('.line-art') ?? [])].map((h) => (typeof h.lineArtDrawn === 'function' ? Math.round(h.lineArtDrawn() * 100) / 100 : null)),
      scrollY: window.scrollY,
      elements: el ? el.querySelectorAll('*').length : 0,
      svgNodes,
      masks: el ? el.querySelectorAll('mask').length : 0,
      maskedEls: el ? el.querySelectorAll('[mask]').length : 0,
      filters: el ? el.querySelectorAll('filter').length : 0,
      filteredEls: el ? el.querySelectorAll('[filter]').length : 0,
      canvases: el ? el.querySelectorAll('canvas').length : 0,
      willChange: el ? [...el.querySelectorAll('*')].filter((n) => getComputedStyle(n).willChange !== 'auto').length : 0,
      mut: w.__pp.mut ? { ...w.__pp.mut, perFrame: undefined } : undefined,
    };
  }, section);
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  let trace = null;
  if (a.trace) {
    const buf = await browser.stopTracing();
    const file = path.join(out, `trace-${label}.json`);
    fs.writeFileSync(file, buf);
    trace = summarizeTrace(JSON.parse(buf.toString('utf8')));
    trace.file = file;
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const d = inPage.deltas;
  const stats = (xs) => ({
    count: xs.length,
    p50: Math.round(pct(xs, 50) * 10) / 10,
    p95: Math.round(pct(xs, 95) * 10) / 10,
    max: Math.round(Math.max(0, ...xs) * 10) / 10,
    over20: xs.filter((x) => x > 20).length,
    over33: xs.filter((x) => x > 33.4).length,
    fps: xs.length ? Math.round((1000 * xs.length) / xs.reduce((s, x) => s + x, 0)) : 0,
  });
  const metric = (k) => Math.round((m1[k] - m0[k]) * 10000) / 10;
  result = {
    label,
    section,
    viewport: `${vp.width}x${vp.height}@${dpr}`,
    throttle,
    speedPxPerS: speed,
    scrolled: [y0, y1],
    gestureMs,
    frames: {
      count: d.length,
      p50: Math.round(pct(d, 50) * 10) / 10,
      p95: Math.round(pct(d, 95) * 10) / 10,
      p99: Math.round(pct(d, 99) * 10) / 10,
      max: Math.round(Math.max(0, ...d) * 10) / 10,
      over20: d.filter((x) => x > 20).length,
      over33: d.filter((x) => x > 33.4).length,
      over50: d.filter((x) => x > 50).length,
      fps: d.length ? Math.round((1000 * d.length) / d.reduce((s, x) => s + x, 0)) : 0,
    },
    framesWhileOnScreen: stats(inPage.deltasIn),
    longTasksMs: inPage.long,
    cdpMetricsMs: {
      task: metric('TaskDuration'),
      script: metric('ScriptDuration'),
      style: metric('RecalcStyleDuration'),
      layout: metric('LayoutDuration'),
    },
    trace,
    layoutShifts: { count: inPage.shifts, cls: inPage.cls },
    canvasDrawnAtEnd: inPage.drawn,
    counters: {
      reactCommits: inPage.commits,
      ioEntries: inPage.ioEntries,
      elements: inPage.elements,
      svgNodes: inPage.svgNodes,
      masks: inPage.masks,
      maskedEls: inPage.maskedEls,
      filters: inPage.filters,
      filteredEls: inPage.filteredEls,
      canvases: inPage.canvases,
      willChange: inPage.willChange,
    },
    mutations: inPage.mut,
  };
  await ctx.close();
} finally {
  await browser.close();
  stop();
}
fs.writeFileSync(path.join(out, `cultures-perf-${label}.json`), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
