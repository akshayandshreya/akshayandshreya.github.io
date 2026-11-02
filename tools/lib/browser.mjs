// Shared Node helpers for the asset tools: paths, a headless Chromium (playwright-core) and an offline page server.
// The page is served at http://assets.local/ through request interception (no sockets, nothing listens):
//   /tools/...  -> this repo's tools/          /src/...  -> the invitation project (WeddingInvite2) root
// Every other origin is blocked, so painting never touches the network.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(TOOLS, '..');
export const ASSETS = path.join(REPO, 'src', 'assets');
export const PUBLIC = path.join(REPO, 'public');
/** the invitation project (read-only source of art, copy and fonts) */
export const INVITE = path.resolve(process.env.WEDDING_INVITE_SRC || path.join(REPO, '..', 'WeddingInvite2'));
export const ORIGIN = 'http://assets.local';

export function requireInvite() {
  if (!fs.existsSync(path.join(INVITE, 'assets', 'couples_user'))) {
    throw new Error(`invitation project not found at ${INVITE} (set WEDDING_INVITE_SRC=/path/to/WeddingInvite2)`);
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2' };

export async function launch() {
  const { chromium } = await import('playwright-core');
  const opts = { headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars', '--font-render-hinting=none', '--disable-lcd-text', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] };
  if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
  return chromium.launch(opts);
}

/** extra: { '/prefix/': '/abs/dir' } more mounts */
/** Site-owned replacements for invitation files (tools/motifs/src: the aripan with lotus buds, QA r1 D1), served at
 *  the invitation path so every painter that reads /src/assets/motifs/<name>_paint.svg picks them up. */
function siteOverrides() {
  const dir = path.join(TOOLS, 'motifs', 'src');
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).map((f) => [`/src/assets/motifs/${f}`, path.join(dir, f)]));
}

export async function serve(context, extra = {}) {
  const files = siteOverrides();
  const mounts = Object.assign({ '/tools/': TOOLS, '/src/': INVITE, '/assets/': ASSETS }, extra);
  await context.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== ORIGIN) return route.abort('blockedbyclient');
    const p = decodeURIComponent(u.pathname);
    if (files[p]) return route.fulfill({ status: 200, path: files[p], headers: { 'content-type': MIME['.svg'] } });
    const pre = Object.keys(mounts).find((m) => p.startsWith(m));
    if (!pre) return route.fulfill({ status: 404, body: 'no mount ' + p });
    const root = mounts[pre];
    const file = path.normalize(path.join(root, p.slice(pre.length)));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'not found ' + p });
    return route.fulfill({ status: 200, path: file, headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
  });
}

export async function openPage(browser, rel, { width = 1200, height = 800, scale = 1 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  await serve(context);
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
  await page.goto(ORIGIN + rel);
  await page.waitForFunction(() => window.__READY === true, null, { timeout: 60000 });
  return { page, context, logs };
}

export const dataUrlToBuffer = (d) => Buffer.from(d.slice(d.indexOf(',') + 1), 'base64');
export const mkdirp = (d) => fs.mkdirSync(d, { recursive: true });
export const rel = (f) => path.relative(ASSETS, f).split(path.sep).join('/');
export const kb = (n) => (n / 1024).toFixed(1) + ' KB';
export { os };
