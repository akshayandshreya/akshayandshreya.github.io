#!/usr/bin/env node
// G-PERF-1 (spec 6.7, 8.0): transfer totals on a phone (390x844 @3x, the tall frame) for the initial load (until
// load + 2 s idle, no scroll) and for a full scroll to the end, per resource type, against the budgets; plus the
// performance timeline (LCP, CLS, long tasks during the scroll with 4x CPU throttling). Lighthouse mobile runs when the
// `lighthouse` package is installed (--lighthouse). Prints a Markdown table for docs/QA.md and writes perf.json.
//   node tools/shots/perf.mjs [--langs en,bn] [--base URL] [--lighthouse]
import fs from 'node:fs';
import path from 'node:path';
import { args, baseUrl, launchChromium, outDir } from './lib.mjs';

const a = args();
const langs = a.langs && a.langs !== true ? String(a.langs).split(',') : ['en', 'bn'];
const out = outDir(a, 'perf');
const KB = 1024;
const BUDGET = { initial: 1.5 * KB * KB, initialTarget: 700 * KB, full: 6 * KB * KB, fullTarget: 4 * KB * KB, lcp: 2500, cls: 0.05 };

const kind = (url, type) => {
  if (/\.woff2(\?|$)/.test(url)) return 'font';
  if (/\.(avif|webp|png|jpe?g|svg)(\?|$)/.test(url) || type === 'Image') return 'image';
  if (/\.m?js(\?|$)/.test(url) || type === 'Script') return 'js';
  if (/\.css(\?|$)/.test(url) || type === 'Stylesheet') return 'css';
  if (type === 'Document') return 'html';
  return 'other';
};

async function measure(browser, base, lang) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const reqs = new Map();
  let phase = 'initial';
  cdp.on('Network.responseReceived', (e) => reqs.set(e.requestId, { url: e.response.url, type: e.type, phase, bytes: 0 }));
  cdp.on('Network.loadingFinished', (e) => {
    const r = reqs.get(e.requestId);
    if (r) r.bytes = e.encodedDataLength;
  });
  await page.addInitScript(() => {
    const w = window;
    w.__perf = { lcp: 0, cls: 0, long: [] };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) w.__perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__perf.long.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
  });
  await page.goto(`${base}/${lang}/`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const early = await page.evaluate(() => ({ ...window.__perf, long: [...window.__perf.long] }));
  phase = 'scroll';
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 300) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(1500);
  const late = await page.evaluate(() => ({ ...window.__perf }));
  await ctx.close();
  const sum = (filter) => [...reqs.values()].filter(filter).reduce((s, r) => s + r.bytes, 0);
  const byKind = {};
  for (const r of reqs.values()) {
    const k = kind(r.url, r.type);
    byKind[k] ??= { initial: 0, full: 0 };
    byKind[k].full += r.bytes;
    if (r.phase === 'initial') byKind[k].initial += r.bytes;
  }
  const foreign = [...reqs.values()].filter((r) => !r.url.startsWith(base) && !/^(data|blob):/.test(r.url)).map((r) => r.url);
  return {
    lang,
    initial: sum((r) => r.phase === 'initial'),
    full: sum(() => true),
    requests: reqs.size,
    byKind,
    lcp: Math.round(early.lcp),
    cls: Number(late.cls.toFixed(4)),
    longTasksLoad: early.long,
    longTasksScroll: late.long.slice(early.long.length),
    foreign,
  };
}

const { base, stop } = await baseUrl(a);
const { browser } = await launchChromium();
const rows = [];
try {
  for (const lang of langs) rows.push(await measure(browser, base, lang));
} finally {
  await browser.close();
}
let lighthouse = null;
if (a.lighthouse) {
  try {
    const { default: lh } = await import('lighthouse');
    const { launch } = await import('chrome-launcher');
    lighthouse = [];
    for (const lang of langs) {
      const chrome = await launch({ chromeFlags: ['--headless=new', '--no-sandbox'] });
      const r = await lh(`${base}/${lang}/`, { port: chrome.port, output: 'json', onlyCategories: ['performance', 'accessibility'], formFactor: 'mobile' });
      lighthouse.push({ lang, perf: r.lhr.categories.performance.score, a11y: r.lhr.categories.accessibility.score, lcp: r.lhr.audits['largest-contentful-paint'].numericValue, tbt: r.lhr.audits['total-blocking-time'].numericValue, cls: r.lhr.audits['cumulative-layout-shift'].numericValue });
      await chrome.kill();
    }
  } catch (e) {
    lighthouse = `not run: ${e.message} (install lighthouse + chrome-launcher in the Docker copy)`;
  }
}
stop();
fs.writeFileSync(path.join(out, 'perf.json'), JSON.stringify({ base, date: new Date().toISOString(), rows, lighthouse }, null, 1));
const k = (n) => `${(n / KB).toFixed(0)} KB`;
const ok = (v, lim) => (v <= lim ? 'ok' : 'OVER');
console.log('| lang | initial transfer | full scroll | JS | CSS | fonts | images | LCP (4x CPU) | CLS | long tasks (scroll) | 3rd-party |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const b = (x) => r.byKind[x] ?? { initial: 0, full: 0 };
  console.log(
    `| ${r.lang} | ${k(r.initial)} (${ok(r.initial, BUDGET.initial)}; target ${ok(r.initial, BUDGET.initialTarget)}) | ${k(r.full)} (${ok(r.full, BUDGET.full)}) | ${k(b('js').initial)} | ${k(b('css').initial)} | ${k(b('font').initial)} | ${k(b('image').initial)} / ${k(b('image').full)} | ${r.lcp} ms (${ok(r.lcp, BUDGET.lcp)}) | ${r.cls} (${ok(r.cls, BUDGET.cls)}) | ${r.longTasksScroll.filter((t) => t > 50).length} > 50 ms | ${r.foreign.length} |`,
  );
}
if (lighthouse) console.log('\nLighthouse:', typeof lighthouse === 'string' ? lighthouse : JSON.stringify(lighthouse));
console.log(`\nperf.json in ${out}`);
const over = rows.some((r) => r.initial > BUDGET.initial || r.full > BUDGET.full || r.cls > BUDGET.cls || r.foreign.length);
if (over) process.exitCode = 1;
