# Akshay & Shreya: wedding website

A static, four-language wedding site (English, हिन्दी, मैथिली, বাংলা) in the design of the invitation cards.
React 18 + TypeScript + Vite 5 + react-router 6, plain CSS with design tokens, no UI kit, no animation library.
The contract for everything here is [`docs/SPEC.md`](docs/SPEC.md).

Personal content (names, dates, venues) stays on our machines until the owner hosts `dist/`. Never push this repo.

## URLs

| URL                          | Shows                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `/`                          | redirects to the guest's language (stored choice, else browser languages, else English)                 |
| `/en/` `/hi/` `/mai/` `/bn/` | the page in that language (aliases `/english`, `/hindi`, `/maithili`, `/bangla`, `/bengali`, any case)  |
| `?side=bride`                | bride-first order: Sil family hosts, Shreya first, monogram SA (default `side=groom`: Jha family hosts) |
| `?reception=0`               | four events, without the 29 November Reception in Saharsa (default: five events)                        |
| `#haldi`, `#venues`, ...     | jump to a section; the language switch keeps the query and the section in view                          |

Any other path (`/xyz`, `/hi/old/page`, `/BN/`) lands on the right `/{lang}/` page (else `/en/`) with its query and
hash kept. Link previews (WhatsApp and the like) ignore query strings on a static host, so `?side=bride` and
`?reception=0` links show the default (groom-first, five-event) preview.

## Machines (binding, spec 9.1)

- **Mac** (`/Volumes/workplace/AkshayShreyaWedding`): edit and commit only. Never `npm install` or build here (the
  disk has about 1.5-2.7 GB free). The repo never holds `node_modules/` or `dist/`; git history lives only here.
- **Dev desktop** (dvd) `dev-dsk-anaaks-2b-9537f078.us-west-2.amazon.com`: install, test, build and preview, always
  in Docker (`node:20-bookworm`; there is no `node` on the host). Working copy `~/wedding_site/repo`, caches in
  `~/wedding_site/cache/{npm,ms-playwright}`, scratch in `~/wedding_site/work/`; `~/wedding_site` is `chmod 700`.
  Containers publish ports on `127.0.0.1` only; reach them through an SSH tunnel. Nothing listens on a public
  interface.

## Dev loop

```sh
scripts/sync.sh push              # Mac -> dvd (tar over ssh; no node_modules, dist, .git or macOS ._* files)
scripts/dvd.sh npm ci             # install (first time, and after package.json changes)
scripts/dvd.sh npm run typecheck
scripts/dvd.sh npm run lint
scripts/dvd.sh npm test           # vitest + check-content
scripts/dvd.sh npm run build      # gen:i18n -> check:content -> vite build -> SSR build -> prerender -> budget
scripts/sync.sh pull-generated    # dvd -> Mac: src/i18n/*.json, src/generated/*, package-lock.json (commit them)
scripts/sync.sh status            # free space on both sides, size of the dvd copy, running site containers
```

`scripts/sync.sh push --clean` first empties the dvd copy except `node_modules` (and so drops generated files that
were not pulled yet): use it only after deleting files on the Mac. `pull-generated` and `pull-assets` measure the
download first and refuse it when the Mac would keep less than 500 MB free. `DVD_HOST` overrides the host.

**A parallel working copy** (one per agent or task, spec 11.2): `DVD_DIR` (inside `~/wedding_site/`) is read by
`sync.sh`, `dvd.sh` and `serve-dist.sh` alike, and each copy takes its own ports so two copies never collide:

```sh
export DVD_DIR='~/wedding_site/s9'
scripts/sync.sh push && scripts/dvd.sh npm ci && scripts/dvd.sh npm run build
PORT=4191 scripts/serve-dist.sh && TUNNEL_PORTS=4191 scripts/sync.sh tunnel   # http://127.0.0.1:4191/
DVD_PORTS=5191 scripts/dvd.sh npx vite --host 0.0.0.0 --port 5191              # its own dev server
```

**Dev server with hot reload** (edit on the Mac, push, Vite picks the change up):

```sh
DVD_PORTS=1 scripts/dvd.sh npm run dev     # terminal 1: Vite on the dvd's 127.0.0.1:5173
scripts/sync.sh tunnel                     # terminal 2: forwards 5173 and 4173; open http://127.0.0.1:5173/en/
```

**Built-site preview** (what guests get): `serve-dist.sh` serves `dist/` with the [nginx snippet](#nginx) below, so
the real CSP and headers, the 301 aliases, `/en` -> `/en/` and the `404.html` fallback all apply (`vite preview`
sends no headers and has no 404 page, so it hides a CSP or fallback problem).

```sh
scripts/dvd.sh npm run build
scripts/serve-dist.sh                      # nginx:alpine on the dvd's 127.0.0.1:4173, dist/ mounted read-only
scripts/sync.sh tunnel                     # then http://127.0.0.1:4173/ ; stop with: scripts/serve-dist.sh stop
```

**Working on the dvd directly** (spec 9.2): one shell function in `~/.bashrc` there; every command runs as the host
user and ports bind to `127.0.0.1` only.

```sh
wsrun() { docker run --rm -it --init -u "$(id -u):$(id -g)" -e HOME=/tmp/home -e npm_config_cache=/cache/npm \
  -e PLAYWRIGHT_BROWSERS_PATH=/cache/ms-playwright -v ~/wedding_site/repo:/app -v ~/wedding_site/cache:/cache \
  -v ~/wedding_site/work:/work -w /app -p 127.0.0.1:5173:5173 -p 127.0.0.1:4173:4173 node:20-bookworm "$@"; }
wsrun npm ci && wsrun npm run build && wsrun npm run preview
```

**Browsers** (e2e tests, screenshots, asset tools): `Dockerfile.dev` builds the derived image with the Playwright OS
libraries once: `docker build -f Dockerfile.dev -t wedding-site-pw .` on the dvd, then
`DVD_IMAGE=wedding-site-pw scripts/dvd.sh npx playwright install chromium` (browsers go to the shared cache).
Screenshots can also run on the Mac against the tunnel with the cached Chromium
(`~/Library/Caches/ms-playwright/chromium_headless_shell-1234`) and the npx-cached `playwright-core`
(`~/.npm/_npx/9833c18b2d85bc59/node_modules/playwright-core`), located the way `tools/lib/browser.mjs` does. Write
them to `/tmp` and delete them after review; they are never committed.

## Copy and languages

- All facts come from `content/content.json`, a snapshot of the reviewed invitation copy (`content/SOURCE.md` holds
  the source path and sha256). Nothing is invented: no love story, parents' names, phone numbers or photos.
- UI words (buttons, labels) live in `content/ui.json`; every non-English string is a draft listed in
  `docs/NATIVE_REVIEW.md` for native review.
- `npm run gen:i18n` (`scripts/gen-i18n.mjs`; `scripts/build-i18n.mjs` is an alias) writes `src/i18n/<lang>.json`
  with the four variants pre-resolved (`G1 G0 B1 B0` = side x reception; `reception=0` is the card's exact
  `withoutReception` overlay), `src/generated/facts.ts` and `src/generated/ui-keys.ts`. It validates every fact,
  the order rule, the reception rule, forbidden words (no fish, in any language), phone-like digit runs and native
  numerals, and fails the build on any error. `npm run check:content` re-checks the committed files.
- To change copy: edit WeddingInvite2's `content.json` (with native review), copy it to `content/content.json`, update
  `content/SOURCE.md`, run `gen:i18n` on the dev desktop, pull the generated files, review the diff, commit.

## Build output

`npm run build` needs only Node 20 (no browser, Python or image tools: every generated asset is committed). Set two
optional variables at build time:

- `VITE_SITE_URL=https://your.domain/`: makes canonical, hreflang, `og:url` and `og:image` absolute. Without it the
  build warns and leaves them out (link previews then show no image).
- `VITE_BASE=/sub/path/`: when the site does not live at the domain root (for example a GitHub project page).
  `prerender.mjs` writes `dist/_redirects` and `dist/_headers` with that prefix.

`dist/` is a plain static site:

| Path                                   | What                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| `index.html`                           | root page: `redirect.js` picks the language (plain language links without JS)           |
| `404.html`                             | the same page in unknown-path mode: sends any other path to `/{lang}/`, query and hash  |
| `en/ hi/ mai/ bn/index.html`           | the pre-rendered pages (per-language `<title>`, description, Open Graph, `<html lang>`) |
| `assets/*`                             | every JS, CSS, image and font file, content-hashed by Vite (safe to cache for a year)   |
| `redirect.js`, `og/`, icons, manifests | fixed names                                                                             |
| `robots.txt`                           | allows crawling, so link previews work (the pages themselves say `noindex`)             |
| `_redirects`, `_headers`               | alias redirects and headers for Netlify and Cloudflare Pages (other hosts ignore them)  |

## Hosting

The owner hosts `dist/`. The site needs no server logic and no rewrites: **any static host that serves
`dir/index.html` for `/dir/` and `404.html` for missing paths runs it correctly with zero configuration**; unknown
paths and aliases in any letter case reach the right page through `404.html`. The configs below add server-side alias
redirects (one hop, no flash), security headers and caching.

| Host             | Config                                    | Aliases             | Unknown paths                  | Headers and caching      |
| ---------------- | ----------------------------------------- | ------------------- | ------------------------------ | ------------------------ |
| Netlify          | `netlify.toml` (build) + files in `dist/` | 301 (`_redirects`)  | `404.html`                     | `dist/_headers`          |
| Cloudflare Pages | files in `dist/`                          | 301 (`_redirects`)  | `404.html`                     | `dist/_headers`          |
| Vercel           | `vercel.json`                             | 301 (`vercel.json`) | `404.html`                     | `vercel.json`            |
| GitHub Pages     | none                                      | via `404.html`      | `404.html`                     | none possible (meta CSP) |
| S3 + CloudFront  | CloudFront Function (below)               | 301 (function)      | error page `404.html`          | response headers policy  |
| nginx / Apache   | snippets below                            | 301                 | `error_page` / `ErrorDocument` | snippets below           |

Verified 2026-11-02 on the dvd against a real `dist/`: Cloudflare Pages with `wrangler pages dev` (wrangler 4.86.0),
Netlify with `netlify dev --offline` (netlify-cli 26.2.0), and the nginx and Apache snippets below in `nginx:alpine`
and `httpd:2.4`. Two measured facts shaped the configs (and differ from spec 9.5's first draft): Cloudflare Pages
applies `_redirects` rules even when a file matches (a catch-all `/* /en/` there redirected every request, `/en/`
itself and every asset included), and on Netlify an unforced `/en/* /en/` never fired while a catch-all sent `/BN/`
to English. So `_redirects` holds exact aliases only, and every host leaves unknown paths to `404.html`. Vercel and
CloudFront have no offline emulator and were not run; the CloudFront Function is unit-tested
(`tests/unit/hosting.test.ts`).

### Netlify

Connect the repo and let Netlify run `npm run build` (`netlify.toml`: Node 20, publish `dist`), or build on the dvd
and run `netlify deploy --dir=dist --prod` from the repo root, or drag and drop `dist/` into the Netlify UI. All three
behave the same: aliases, headers and the 404 fallback travel inside `dist/`.

### Cloudflare Pages

Direct upload (`npx wrangler pages deploy dist`) or Git integration (build command `npm run build`, output `dist`,
environment `NODE_VERSION=20`). `dist/_redirects` and `dist/_headers` work as they are; Pages also strips `.html`
itself (`/en/index.html` -> `/en/`).

### Vercel

Run `vercel` (or `vercel --prod`) from the repo root: `vercel.json` sets the build (`npm run build`, output `dist`),
`trailingSlash: true` (`/en` -> `/en/`), the alias redirects and the headers; Vercel serves `404.html` for unknown
paths. Deploying the `dist/` folder by itself skips `vercel.json`: the site still works, without the headers and the
server-side aliases.

### GitHub Pages

Publish `dist/` with the official Pages action (or a `gh-pages` branch; then add an empty `dist/.nojekyll`). For a
project page (`https://<user>.github.io/<repo>/`) build with `VITE_BASE=/<repo>/`. Pages serves `404.html` for
unknown paths and cannot set headers; the pages carry the CSP as a `<meta>` tag.

### S3 + CloudFront

1. Private S3 bucket (Block Public Access on); a CloudFront distribution with the bucket as a REST origin and Origin
   Access Control. No static website endpoint and no default root object are needed.
2. A viewer-request CloudFront Function (runtime `cloudfront-js-2.0`) on the default behaviour. CloudFront does not
   map `/en/` to `/en/index.html` by itself; this function does that, adds the trailing slash and sends the aliases
   (`/english`, `/Bangla/`, `/EN`) to their page in one hop, keeping the query string:

<!-- cloudfront-function:start -->

```js
var ALIASES = {
  en: 'en',
  hi: 'hi',
  mai: 'mai',
  bn: 'bn',
  english: 'en',
  hindi: 'hi',
  maithili: 'mai',
  bangla: 'bn',
  bengali: 'bn',
};

function query(q) {
  var parts = [];
  for (var k in q) {
    var vals = q[k].multiValue ? q[k].multiValue : [q[k]];
    for (var i = 0; i < vals.length; i++) parts.push(k + '=' + vals[i].value);
  }
  return parts.length ? '?' + parts.join('&') : '';
}

function moved(to, q) {
  return { statusCode: 301, statusDescription: 'Moved Permanently', headers: { location: { value: to + query(q) } } };
}

function handler(event) {
  var r = event.request;
  var u = r.uri;
  var segs = u.split('/'); // "/en/" -> ["", "en", ""]
  var lang = ALIASES[(segs[1] || '').toLowerCase()];
  var single = segs.length === 2 || (segs.length === 3 && segs[2] === ''); // "/x" or "/x/"
  if (lang && single && u !== '/' + lang + '/') return moved('/' + lang + '/', r.querystring);
  if (u.charAt(u.length - 1) === '/') {
    r.uri = u + 'index.html';
    return r;
  }
  if (segs[segs.length - 1].indexOf('.') === -1) return moved(u + '/', r.querystring);
  return r;
}
```

<!-- cloudfront-function:end -->

3. Custom error responses: 403 and 404 -> `/404.html` with response code 404 (a private bucket answers 403 for a
   missing key). `404.html` then sends the guest to `/{lang}/` with the query and hash.
4. A response headers policy with the security headers below, and a cache behaviour for `/assets/*` with a long TTL.
5. Upload the hashed files first, then the pages (so no page ever points at a file that is not there yet), then
   invalidate `/*`:
   ```sh
   aws s3 sync dist/assets/ s3://BUCKET/assets/ --cache-control 'public, max-age=31536000, immutable'
   aws s3 sync dist/ s3://BUCKET/ --delete --exclude 'assets/*' --exclude '_headers' --exclude '_redirects' \
     --cache-control 'no-cache'
   ```
   Check that `.avif`, `.webp` and `.woff2` objects got `image/avif`, `image/webp` and `font/woff2` as Content-Type
   (an older CLI may store `binary/octet-stream`; re-upload those with `--content-type`).

### nginx

Verified in `nginx:alpine` (`dist/` copied to `/srv/wedding`):

```nginx
map $uri $wedding_cache {
  ~^/assets/  "public, max-age=31536000, immutable";
  default     "no-cache";
}
server {
  listen 80;
  root /srv/wedding;
  index index.html;
  absolute_redirect off;                    # /en -> /en/ keeps the guest's host and port
  error_page 404 /404.html;                 # unknown paths: redirect.js sends them to /{lang}/, query and hash kept
  location ~* ^/english/?$  { return 301 /en/$is_args$args; }
  location ~* ^/hindi/?$    { return 301 /hi/$is_args$args; }
  location ~* ^/maithili/?$ { return 301 /mai/$is_args$args; }
  location ~* ^/(bangla|bengali)/?$ { return 301 /bn/$is_args$args; }
  location / { try_files $uri $uri/ =404; }
  add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; media-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'none'; object-src 'none'; frame-ancestors 'none'" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header X-Frame-Options "DENY" always;
  add_header Cross-Origin-Opener-Policy "same-origin" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Cache-Control $wedding_cache always;
}
```

Keep every `add_header` at server level: one `add_header` inside a `location` drops all server-level ones there.

### Apache 2.4

Verified in `httpd:2.4`. In the vhost's `<Directory>` (or `dist/.htaccess` with `AllowOverride All`); needs
`mod_alias`, `mod_dir` and `mod_headers`:

```apache
DirectoryIndex index.html
DirectorySlash On
ErrorDocument 404 /404.html
RedirectMatch 301 "(?i)^/english/?$" "/en/"
RedirectMatch 301 "(?i)^/hindi/?$" "/hi/"
RedirectMatch 301 "(?i)^/maithili/?$" "/mai/"
RedirectMatch 301 "(?i)^/(bangla|bengali)/?$" "/bn/"
<IfModule mod_headers.c>
  Header always set Content-Security-Policy "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; media-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'none'; object-src 'none'; frame-ancestors 'none'"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set X-Content-Type-Options "nosniff"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
  Header always set X-Frame-Options "DENY"
  Header always set Cross-Origin-Opener-Policy "same-origin"
  Header always set X-Robots-Tag "noindex, nofollow"
  Header set Cache-Control "no-cache"
  <If "%{REQUEST_URI} =~ m#^/assets/#">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </If>
</IfModule>
```

With `VITE_BASE` other than `/`, prefix the alias patterns, their targets and the 404 path with it.

### Security headers (spec 6.3)

`scripts/prerender.mjs` (`csp()`, `SECURITY_HEADERS`) is the source; it writes `dist/_headers`, and `vercel.json`,
the snippets above and the CloudFront policy repeat the same set (`tests/unit/hosting.test.ts` keeps them equal).
The pages also carry the CSP, without `frame-ancestors`, as a `<meta>` tag for hosts without header control.

| Header                       | Value                                                                                                                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy`    | `default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; media-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'none'; object-src 'none'; frame-ancestors 'none'` |
| `Referrer-Policy`            | `strict-origin-when-cross-origin`                                                                                                                                                                                                            |
| `X-Content-Type-Options`     | `nosniff`                                                                                                                                                                                                                                    |
| `Permissions-Policy`         | `camera=(), microphone=(), geolocation=()`                                                                                                                                                                                                   |
| `X-Frame-Options`            | `DENY`                                                                                                                                                                                                                                       |
| `Cross-Origin-Opener-Policy` | `same-origin`                                                                                                                                                                                                                                |
| `X-Robots-Tag`               | `noindex, nofollow` while `config.seo.indexable` is false                                                                                                                                                                                    |
| `Cache-Control`              | `/assets/*`: `public, max-age=31536000, immutable`; pages: `no-cache`                                                                                                                                                                        |

When music plays from another origin (`config.music.src`), that origin goes into `media-src` (prerender's
`csp({ mediaOrigin })`) and into `vercel.json` and the snippets by hand. Never add a third-party origin for anything
else (spec 0.2 rule 5).

### After a deploy

```sh
SITE=https://your.domain
curl -sI $SITE/en/ | grep -iE '^(HTTP|content-security-policy|x-robots-tag|cache-control)'  # 200 + headers
curl -sI "$SITE/bangla?side=bride" | grep -iE '^(HTTP|location)'    # 301 -> /bn/?side=bride (GitHub Pages: 404 + JS)
curl -s -o /dev/null -w '%{http_code}\n' $SITE/no/such/page         # 404; in a browser it lands on /en/
curl -sI "$SITE$(curl -s $SITE/en/ | grep -o '/assets/[^"]*\.js' | head -1)" | grep -i cache-control  # immutable
```

Then open `/`, `/hi/?side=bride&reception=0#haldi` and `/BN/` on a phone and switch the language once.

## Privacy

The site makes no third-party request: fonts, images and scripts are self-hosted; no analytics, trackers or map
embeds. "Open in Maps" and calendar links leave the site only when a guest clicks them. Pages are `noindex` by
default (link previews still work).

## Optional modules (`src/config.ts`)

RSVP (a link to the owner's form; nothing is collected here), music and a gallery are off by default. Music: the
original track is a commercial recording; publishing it on a website needs a licence, so the owner supplies a file
or URL he may publish (`config.music.src`); it never autoplays. Gallery: only images the owner has rights to.

## Status

`docs/SPEC.md` 11.2 keeps the status of every phase; this README does not repeat it. The hosting configs and this
README follow spec 9 with the deviations measured above. On 2026-11-02 a `dist/` built from the working tree was
served with `scripts/serve-dist.sh` and checked in Chromium at 360-1920 px in en, hi and bn: no CSP violation, no
failed request, no horizontal scroll, `<html lang>` and `<title>` per language; `/` -> `/bn/` for a `bn-IN` browser
and `/en/` for `fr-FR`; `/BN/`, `/MAI`, `/Bangla?side=bride#venues` and `/hi/old/page?reception=0#haldi` land on
their language with query and hash; the language switch keeps both.
