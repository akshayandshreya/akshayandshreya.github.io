// Shared helpers for the QA tools (spec 8.10): find a Playwright, start the plain static host on dist/, parse
// arguments, and make contact sheets in the browser (no image library needed).
//   Docker on the dev desktop: the repo's node_modules (@playwright/test -> playwright-core) and /cache/ms-playwright.
//   The Mac: the npx-cached playwright-core and ~/Library/Caches/ms-playwright (spec 9.1), against the SSH tunnel.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SHOTS = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(SHOTS, '..', '..');

/** playwright-core from the first place that has it. */
export async function loadPlaywright() {
  // the copy that @playwright/test uses first (its browsers are the ones installed), then any other
  const candidates = [
    path.join(REPO, 'node_modules', 'playwright'),
    path.join(REPO, 'node_modules', '@playwright', 'test'),
    REPO,
    path.join(REPO, 'tools'),
    process.env.PLAYWRIGHT_CORE_DIR && path.dirname(process.env.PLAYWRIGHT_CORE_DIR),
    path.join(os.homedir(), '.npm', '_npx', '9833c18b2d85bc59'),
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      const req = createRequire(path.join(dir, 'package.json'));
      const entry = req.resolve('playwright-core');
      const mod = await import(pathToFileURL(entry).href);
      return mod.chromium ? mod : mod.default;
    } catch {
      /* next */
    }
  }
  // any npx cache entry
  const npx = path.join(os.homedir(), '.npm', '_npx');
  for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) {
    const p = path.join(npx, d, 'node_modules', 'playwright-core', 'index.mjs');
    if (fs.existsSync(p)) {
      const mod = await import(pathToFileURL(p).href);
      return mod.chromium ? mod : mod.default;
    }
  }
  throw new Error('playwright-core not found (npm ci on the dev desktop, or the npx cache on the Mac; spec 9.1)');
}

export async function launchChromium() {
  const pw = await loadPlaywright();
  const opts = { headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars', '--font-render-hinting=none'] };
  if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
  return { pw, browser: await pw.chromium.launch(opts) };
}

/** --key value / --flag arguments. */
export function args(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) out[k] = true;
    else {
      out[k] = v;
      i++;
    }
  }
  return out;
}

export const VIEWPORTS = {
  '360x640': { width: 360, height: 640 },
  '390x844': { width: 390, height: 844 },
  '768x1024': { width: 768, height: 1024 },
  '1024x768': { width: 1024, height: 768 },
  '1440x900': { width: 1440, height: 900 },
  '1920x1080': { width: 1920, height: 1080 },
  '844x390': { width: 844, height: 390 },
};
export const viewport = (s) => VIEWPORTS[s] ?? (() => {
  const [w, h] = String(s).split('x').map(Number);
  if (!w || !h) throw new Error(`bad viewport ${s}`);
  return { width: w, height: h };
})();

export function variantQuery(key) {
  const q = new URLSearchParams();
  if (key[0] === 'B') q.set('side', 'bride');
  if (key[1] === '0') q.set('reception', '0');
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** A base URL: --base as given, or a static host on --dist (default dist/) on a free port. */
export async function baseUrl(a) {
  if (a.base) return { base: String(a.base).replace(/\/$/, ''), stop: () => undefined };
  const dist = path.resolve(REPO, a.dist === true || !a.dist ? 'dist' : a.dist);
  if (!fs.existsSync(path.join(dist, 'en', 'index.html'))) throw new Error(`no build at ${dist} (npm run build, or pass --base)`);
  const port = Number(a.port ?? 4190 + Math.floor(Math.random() * 400));
  const child = spawn(process.execPath, [path.join(REPO, 'tests', 'e2e', 'support', 'static-server.mjs'), dist, String(port)], { stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${base}/en/`);
      if (r.ok) break;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { base, stop: () => child.kill() };
}

export const today = () => new Date().toISOString().slice(0, 10);
export function outDir(a, name) {
  const root = a.out ? path.resolve(String(a.out)) : fs.existsSync('/work') ? `/work/${name}/${today()}` : `/tmp/wedsite_${name}/${today()}`;
  fs.mkdirSync(root, { recursive: true });
  return root;
}

/**
 * In-page probe: what still keeps the viewport from its resting state. A finite animation running, a paint-reveal
 * phase on a section (`data-paint`), or an element in the viewport whose entrance has not finished (`data-reveal`
 * pending/in, the QA.md contract). Entrances are held by the section clock (they start at 70% of the reveal or on an
 * IntersectionObserver), so "no animation runs" alone is not "at rest": a screenshot taken then shows half a couple.
 */
export const busyProbe = () => {
  const finite = document
    .getAnimations()
    .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity).length;
  const vh = innerHeight;
  const inView = (e) => {
    const r = e.getBoundingClientRect();
    return r.bottom > 0 && r.top < vh && r.width > 0;
  };
  // only sections whose content timeline has been triggered (25% of the section visible, spec 3.4): the next
  // section's title peeking in at the bottom stays pending until the guest scrolls, which is its resting state here.
  // The Cultures captions follow the scroll-linked drawing (A-CUL-1), so they are at rest wherever the scroll is.
  const triggered = (e) => {
    const s = e.closest('main > section, footer');
    if (!s) return true;
    const r = s.getBoundingClientRect();
    const seen = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    return r.height > 0 && seen / r.height >= Math.min(0.25, (0.99 * vh) / r.height);
  };
  const paint = Array.from(document.querySelectorAll('[data-paint]')).filter(inView).length;
  const reveal = Array.from(document.querySelectorAll('[data-reveal]'))
    .filter((e) => inView(e) && triggered(e) && !e.closest('#cultures figcaption')).length;
  return { finite, paint, reveal, busy: finite + paint + reveal > 0 };
};

/** Wait until the page is at rest in the viewport (see busyProbe), at most `ms`; returns the last probe. */
export async function settle(page, ms = 3200) {
  const end = Date.now() + ms;
  await page.waitForTimeout(120);
  let last = await page.evaluate(busyProbe);
  while (last.busy && Date.now() < end) {
    await page.waitForTimeout(100);
    last = await page.evaluate(busyProbe);
  }
  return last;
}

export async function openPage(page, url, at = '2026-11-02T10:00:00Z') {
  if (page.clock) await page.clock.setFixedTime(new Date(at));
  await page.goto(url, { waitUntil: 'load' });
  for (let i = 0; i < 100; i++) {
    if (await page.evaluate(() => /\bmotion-(full|lite|none)\b/.test(document.documentElement.className))) break;
    await page.waitForTimeout(50);
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/**
 * A contact sheet of PNG files (labelled tiles), drawn on a canvas in a blank page and saved as JPEG.
 * tiles: [{ file, label }]; cols; tile width in px.
 */
export async function contactSheet(browser, tiles, outFile, { cols = 4, width = 360, title = '' } = {}) {
  const page = await browser.newPage();
  const mime = (f) => (/\.jpe?g$/i.test(f) ? 'image/jpeg' : 'image/png');
  const data = tiles.map((t) => ({ label: t.label, src: `data:${mime(t.file)};base64,${fs.readFileSync(t.file).toString('base64')}` }));
  const jpeg = await page.evaluate(
    async ({ data, cols, width, title }) => {
      const imgs = await Promise.all(
        data.map(
          (d) =>
            new Promise((res) => {
              const im = new Image();
              im.onload = () => res(im);
              im.src = d.src;
            }),
        ),
      );
      const scale = (im) => width / im.naturalWidth;
      const rows = Math.ceil(imgs.length / cols);
      const rowH = [];
      for (let r = 0; r < rows; r++) rowH.push(Math.max(...imgs.slice(r * cols, r * cols + cols).map((im) => im.naturalHeight * scale(im))));
      const pad = 14;
      const label = 22;
      const head = title ? 40 : 0;
      const c = document.createElement('canvas');
      c.width = cols * (width + pad) + pad;
      c.height = head + rowH.reduce((a, b) => a + b + label + pad, pad);
      const g = c.getContext('2d');
      g.fillStyle = '#2b2622';
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#f2e8d8';
      g.font = '600 20px sans-serif';
      if (title) g.fillText(title, pad, 28);
      let y = head + pad;
      imgs.forEach((im, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        if (col === 0 && row > 0) y += rowH[row - 1] + label + pad;
        const x = pad + col * (width + pad);
        g.font = '13px sans-serif';
        g.fillStyle = '#e8d5ae';
        g.fillText(data[i].label, x, y + 15);
        g.drawImage(im, x, y + label, width, im.naturalHeight * scale(im));
      });
      return c.toDataURL('image/jpeg', 0.82);
    },
    { data, cols, width, title },
  );
  fs.writeFileSync(outFile, Buffer.from(jpeg.split(',')[1], 'base64'));
  await page.close();
  return outFile;
}
