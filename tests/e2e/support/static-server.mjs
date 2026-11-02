#!/usr/bin/env node
// A plain static host for the e2e tests (spec 9.5, G-ROUTE-1): serves dist/ like S3+CloudFront, nginx or GitHub Pages
// do, with no SPA rewrites: "/dir/" -> dir/index.html, "/dir" -> 301 "/dir/" (query kept), files as files, anything
// else -> 404.html with status 404. Bound to 127.0.0.1 only.
//   node tests/e2e/support/static-server.mjs [dist] [port]
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { createGzip } from 'node:zlib';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? process.env.PORT ?? 4183);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8',
  '.mp3': 'audio/mpeg',
};

// gzip text types when the client accepts it, as every real host does (so perf.mjs measures realistic transfer)
const COMPRESS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest', '.txt', '.ics']);
let current = null;
const send = (res, status, file) => {
  const gzip = COMPRESS.has(extname(file)) && /\bgzip\b/.test(current?.headers['accept-encoding'] ?? '');
  res.writeHead(status, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
    ...(gzip ? { 'content-encoding': 'gzip', vary: 'accept-encoding' } : {}),
  });
  const stream = createReadStream(file);
  (gzip ? stream.pipe(createGzip({ level: 6 })) : stream).pipe(res);
};

createServer((req, res) => {
  current = req;
  const url = new URL(req.url ?? '/', 'http://localhost');
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    path = url.pathname;
  }
  const file = normalize(join(root, path));
  if (!file.startsWith(root)) return send(res, 404, join(root, '404.html'));
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!path.endsWith('/')) {
      res.writeHead(301, { location: `${url.pathname}/${url.search}` });
      return res.end();
    }
    const index = join(file, 'index.html');
    return existsSync(index) ? send(res, 200, index) : send(res, 404, join(root, '404.html'));
  }
  if (existsSync(file)) return send(res, 200, file);
  return send(res, 404, join(root, '404.html'));
}).listen(port, '127.0.0.1', () => console.log(`static: ${root} on http://127.0.0.1:${port}`));
