// Spec 9: hosting configs, the README's CloudFront Function and nginx/Apache snippets, the sync script and
// .gitignore. The header set has one source, scripts/prerender.mjs (csp(), SECURITY_HEADERS, headersFile()), which
// writes dist/_headers for Netlify and Cloudflare Pages; vercel.json and the README snippets repeat it by hand, and
// these tests keep every copy equal to it and to the URL contract of src/lib/langs.ts.
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { normalizeLang } from '../../src/lib/langs';
import { csp, headersFile, rewriteRedirects, SECURITY_HEADERS } from '../../scripts/prerender.mjs';
import redirectsTxt from '../../public/_redirects?raw';
import netlifyToml from '../../netlify.toml?raw';
import vercelRaw from '../../vercel.json?raw';
import readme from '../../README.md?raw';
import langsSrc from '../../src/lib/langs.ts?raw';
import syncSh from '../../scripts/sync.sh?raw';
import dvdSh from '../../scripts/dvd.sh?raw';
import serveSh from '../../scripts/serve-dist.sh?raw';
import gitignore from '../../.gitignore?raw';

const SYNC = `${process.cwd()}/scripts/sync.sh`; // vitest runs from the repo root
const LANG_CODES = ['en', 'hi', 'mai', 'bn'];
const IMMUTABLE = 'public, max-age=31536000, immutable';

/** The header set every host must send while config.seo.indexable is false. */
const SECURITY: Record<string, string> = {
  'Content-Security-Policy': csp({ header: true }),
  ...(SECURITY_HEADERS as Record<string, string>),
  'X-Robots-Tag': 'noindex, nofollow',
};

type Rule = { from: string; to: string; status: number };
const parseRedirects = (text: string): Rule[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [from = '', to = '', status = ''] = l.split(/\s+/);
      return { from, to, status: Number(status) };
    });
const rules = parseRedirects(redirectsTxt);

type VercelHeaders = { source: string; headers: { key: string; value: string }[] };
const vercel = JSON.parse(vercelRaw) as {
  outputDirectory: string;
  buildCommand: string;
  trailingSlash: boolean;
  redirects: { source: string; destination: string; permanent: boolean }[];
  headers: VercelHeaders[];
};
const vercelFor = (source: string) =>
  Object.fromEntries(vercel.headers.find((h) => h.source === source)?.headers.map((h) => [h.key, h.value]) ?? []);

/** The alias words of src/lib/langs.ts that are not a language code themselves ("english", "bangla", ...). */
const aliasWords = (() => {
  const block = /const ALIASES[^{]*\{([^}]*)\}/.exec(langsSrc)?.[1] ?? '';
  return [...block.matchAll(/(\w+):\s*'(\w+)'/g)].filter((m) => m[1] !== m[2]).map((m) => m[1] as string);
})();

const fenced = (lang: string) => new RegExp('```' + lang + '\\n([\\s\\S]*?)```').exec(readme)?.[1] ?? '';

describe('the header source (scripts/prerender.mjs)', () => {
  it('is the strict same-origin policy of spec 6.3', () => {
    expect(SECURITY['Content-Security-Policy']).toMatch(
      /^default-src 'self'; .*script-src 'self'.*frame-ancestors 'none'$/,
    );
    expect(csp()).not.toContain('frame-ancestors'); // the <meta> version cannot carry it
    for (const v of Object.values(SECURITY)) expect(v).not.toMatch(/https?:/); // no third-party origin (0.2 rule 5)
  });

  it('writes a dist/_headers that Netlify and Cloudflare read: headers on every path, hashed assets immutable', () => {
    const file = headersFile({ base: '/', indexable: false, langs: LANG_CODES }) as string;
    const blocks = Object.fromEntries(
      file
        .split(/\n(?=\/)/)
        .filter((b) => b.startsWith('/'))
        .map((b) => {
          const [path = '', ...lines] = b.trim().split('\n');
          return [
            path,
            Object.fromEntries(
              lines.map((l) =>
                l
                  .trim()
                  .split(/:\s(.*)/s)
                  .slice(0, 2),
              ),
            ),
          ];
        }),
    );
    expect(blocks['/*']).toEqual(SECURITY);
    expect(blocks['/assets/*']).toEqual({ 'Cache-Control': IMMUTABLE });
    for (const p of ['/', '/404.html', ...LANG_CODES.map((l) => `/${l}/*`)]) {
      expect(blocks[p], p).toEqual({ 'Cache-Control': 'no-cache' });
    }
  });
});

describe('public/_redirects (Netlify, Cloudflare Pages)', () => {
  it('holds exact alias rules only: no splats (Cloudflare applies rules even over existing files)', () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(r.from).not.toMatch(/[*:]/);
      expect(r.to).toMatch(/^\/(en|hi|mai|bn)\/$/);
      expect(r.status).toBe(301);
    }
  });

  it('never redirects a path that is a file in dist/', () => {
    const files = ['/', '/en/', '/hi/', '/mai/', '/bn/', '/404.html', '/index.html', '/redirect.js', '/robots.txt'];
    for (const r of rules) {
      expect(files).not.toContain(r.from);
      expect(r.from.startsWith('/assets/')).toBe(false);
    }
  });

  it('sends every alias of the URL contract, with and without a trailing slash, to its language', () => {
    expect([...aliasWords].sort()).toEqual(['bangla', 'bengali', 'english', 'hindi', 'maithili']);
    for (const w of aliasWords) {
      for (const from of [`/${w}`, `/${w}/`]) {
        expect(rules.find((r) => r.from === from)?.to, from).toBe(`/${normalizeLang(w)}/`);
      }
    }
    expect(rules).toHaveLength(aliasWords.length * 2);
  });

  it('survives the VITE_BASE prefixing of prerender.mjs', () => {
    const prefixed = parseRedirects(rewriteRedirects(redirectsTxt, '/wedding/') as string);
    expect(prefixed).toEqual(rules.map((r) => ({ ...r, from: `/wedding${r.from}`, to: `/wedding${r.to}` })));
    expect(rewriteRedirects(redirectsTxt, '/')).toBe(redirectsTxt);
  });
});

describe('vercel.json', () => {
  it('builds dist/ with trailing slashes', () => {
    expect(vercel.buildCommand).toBe('npm run build');
    expect(vercel.outputDirectory).toBe('dist');
    expect(vercel.trailingSlash).toBe(true);
  });

  it('has exactly the _redirects aliases, permanent', () => {
    const v = vercel.redirects.map((r) => `${r.source} ${r.destination} ${r.permanent ? 301 : 302}`);
    expect(v.sort()).toEqual(rules.map((r) => `${r.from} ${r.to} ${r.status}`).sort());
  });

  it('sends the prerender header set on every path', () => {
    expect(vercelFor('/(.*)')).toEqual(SECURITY);
  });

  it('caches hashed assets for a year and revalidates pages, as dist/_headers does', () => {
    expect(vercelFor('/assets/(.*)')).toEqual({ 'Cache-Control': IMMUTABLE });
    for (const s of ['/', '/index.html', '/404.html', '/(en|hi|mai|bn)/(.*)']) {
      expect(vercelFor(s), s).toEqual({ 'Cache-Control': 'no-cache' });
    }
    for (const h of vercel.headers) {
      if (h.headers.some((x) => x.value.includes('immutable'))) expect(h.source).toBe('/assets/(.*)');
    }
  });
});

describe('netlify.toml', () => {
  it('builds with Node 20 into dist/', () => {
    expect(netlifyToml).toMatch(/^\s*command = "npm run build"$/m);
    expect(netlifyToml).toMatch(/^\s*publish = "dist"$/m);
    expect(netlifyToml).toMatch(/^\s*NODE_VERSION = "20"$/m);
  });

  it('defines no headers (dist/_headers is the one source) and no redirects (404.html keeps /BN/ in Bengali)', () => {
    expect(netlifyToml).not.toMatch(/^\s*\[\[headers\]\]/m);
    expect(netlifyToml).not.toMatch(/^\s*\[\[redirects\]\]/m);
  });
});

describe('README hosting snippets', () => {
  type CfRequest = { uri: string; querystring: Record<string, { value: string; multiValue?: { value: string }[] }> };
  type CfResponse = { statusCode: number; headers: { location: { value: string } } };
  const code = /<!-- cloudfront-function:start -->\s*```js\n([\s\S]*?)```\s*<!-- cloudfront-function:end -->/.exec(
    readme,
  )?.[1];
  const handler = new Function(`${code ?? ''}\nreturn handler;`)() as (e: {
    request: CfRequest;
  }) => CfRequest | CfResponse;
  const run = (uri: string, qs: CfRequest['querystring'] = {}) => handler({ request: { uri, querystring: qs } });
  const location = (out: CfRequest | CfResponse) => ('statusCode' in out ? out.headers.location.value : null);

  it('CloudFront Function: directory indexes for the root and the language pages', () => {
    expect(code).toBeTruthy();
    for (const uri of ['/', '/en/', '/hi/', '/mai/', '/bn/']) {
      expect(run(uri)).toMatchObject({ uri: `${uri}index.html` });
    }
  });

  it('CloudFront Function: files pass through untouched', () => {
    for (const uri of ['/assets/index-abc123.js', '/redirect.js', '/og/og-bn.jpg', '/404.html', '/favicon.svg']) {
      expect(run(uri)).toMatchObject({ uri });
    }
  });

  it('CloudFront Function: aliases and codes in any case reach their page in one hop, query kept', () => {
    const cases: [string, string][] = [
      ['/en', '/en/'],
      ['/EN', '/en/'],
      ['/EN/', '/en/'],
      ['/english', '/en/'],
      ['/Hindi/', '/hi/'],
      ['/maithili', '/mai/'],
      ['/MAI/', '/mai/'],
      ['/bangla', '/bn/'],
      ['/Bengali/', '/bn/'],
    ];
    for (const [uri, to] of cases) {
      const out = run(uri, { side: { value: 'bride' }, reception: { value: '0' } });
      expect(out, uri).toMatchObject({ statusCode: 301 });
      expect(location(out), uri).toBe(`${to}?side=bride&reception=0`);
    }
    expect(location(run('/bangla'))).toBe('/bn/');
  });

  it('CloudFront Function: other extension-less paths get a slash (then S3 403/404 -> 404.html)', () => {
    const multi = { a: { value: '1', multiValue: [{ value: '1' }, { value: '2' }] } };
    expect(location(run('/xyz', multi))).toBe('/xyz/?a=1&a=2');
    expect(location(run('/en/old'))).toBe('/en/old/');
    expect(run('/en/old/')).toMatchObject({ uri: '/en/old/index.html' });
  });

  it('nginx and Apache snippets: every alias, the 404 page, the header set, assets immutable', () => {
    const nginx = fenced('nginx');
    const apache = fenced('apache');
    for (const w of aliasWords) {
      const to = `/${normalizeLang(w)}/`;
      const line = (src: string, re: RegExp) => src.split('\n').find((l) => re.test(l) && l.includes(w)) ?? '';
      expect(line(nginx, /^\s*location ~\* \^\//), `nginx ${w}`).toContain(`return 301 ${to}$is_args$args;`);
      expect(line(apache, /^RedirectMatch 301 "\(\?i\)\^\//), `apache ${w}`).toMatch(new RegExp(`/\\?\\$" "${to}"$`));
    }
    expect(nginx).toContain('error_page 404 /404.html;');
    expect(apache).toContain('ErrorDocument 404 /404.html');
    const nginxHeaders = Object.fromEntries(
      [...nginx.matchAll(/add_header ([\w-]+) "(.*)" always;/g)].map((m) => [m[1], m[2]]),
    );
    const apacheHeaders = Object.fromEntries(
      [...apache.matchAll(/Header always set ([\w-]+) "(.*)"/g)].map((m) => [m[1], m[2]]),
    );
    expect(nginxHeaders).toEqual(SECURITY);
    expect(apacheHeaders).toEqual(SECURITY);
    expect(nginx).toContain(`~^/assets/  "${IMMUTABLE}";`);
    expect(apache).toContain(`Header set Cache-Control "${IMMUTABLE}"`);
  });

  it('the README header table lists the same values', () => {
    for (const [k, v] of Object.entries(SECURITY)) {
      if (k === 'X-Robots-Tag') continue; // the table explains when it applies
      expect(readme, k).toContain(`| \`${k}\``);
      expect(readme, k).toContain(`\`${v}\``);
    }
  });
});

describe('scripts/sync.sh', () => {
  const bash = (args: string[], env: Record<string, string> = {}) => {
    try {
      const out = execFileSync('bash', [SYNC, ...args], {
        env: { ...process.env, ...env },
        encoding: 'utf8',
        stdio: 'pipe',
      });
      return { code: 0, out };
    } catch (e) {
      const err = e as { status: number; stdout: string; stderr: string };
      return { code: err.status, out: `${err.stdout}${err.stderr}` };
    }
  };

  it('is valid bash', () => {
    expect(() => execFileSync('bash', ['-n', SYNC])).not.toThrow();
  });

  it('prints its usage and exits 2 without a command (no ssh)', () => {
    const r = bash([]);
    expect(r.code).toBe(2);
    for (const cmd of ['push', 'pull-generated', 'pull-assets', 'tunnel', 'status']) expect(r.out).toContain(cmd);
  });

  it('refuses a DVD_DIR outside ~/wedding_site/ before connecting', () => {
    for (const dir of ['/tmp/x', '~', '~/wedding_site', '~/other/repo']) {
      const r = bash(['status'], { DVD_DIR: dir, DVD_HOST: 'host.invalid' });
      expect(r.code, dir).toBe(2);
      expect(r.out).toContain('DVD_DIR must be inside ~/wedding_site/');
    }
  });

  it('never ships build output, dependencies, git or macOS metadata to the dev desktop', () => {
    const push = /\n {2}push\)([\s\S]*?);;/.exec(syncSh)?.[1] ?? '';
    for (const x of ['node_modules', 'dist', 'dist-ssr', '.git', '.DS_Store', "'._*'"]) {
      expect(push).toContain(`--exclude=${x}`);
    }
    expect(push).toContain('COPYFILE_DISABLE=1');
    expect(push).toContain('chmod 700 ~/wedding_site');
  });

  it('guards the small Mac disk before every pull and binds the tunnel to 127.0.0.1', () => {
    expect(syncSh.match(/guard_space "\$PATHS"/g)).toHaveLength(2);
    expect(syncSh).toMatch(/-L "\$p:127\.0\.0\.1:\$p"/);
  });

  it('reads TUNNEL_PORTS only through a default (bash 4+ under set -u stops on ${TUNNEL_PORTS%% *})', () => {
    expect(syncSh).not.toMatch(/\$\{TUNNEL_PORTS[^:}]/);
  });
});

describe('scripts/dvd.sh and scripts/serve-dist.sh', () => {
  const run = (script: string, args: string[], env: Record<string, string>) => {
    try {
      execFileSync('bash', [`${process.cwd()}/scripts/${script}`, ...args], {
        env: { ...process.env, ...env },
        encoding: 'utf8',
        stdio: 'pipe',
      });
      return { code: 0, out: '' };
    } catch (e) {
      const err = e as { status: number; stdout: string; stderr: string };
      return { code: err.status, out: `${err.stdout}${err.stderr}` };
    }
  };

  it('are valid bash', () => {
    for (const f of ['dvd.sh', 'serve-dist.sh']) {
      expect(() => execFileSync('bash', ['-n', `${process.cwd()}/scripts/${f}`]), f).not.toThrow();
    }
  });

  it('honour DVD_DIR like sync.sh (a parallel copy builds and serves its own tree) and refuse one outside', () => {
    expect(dvdSh).toContain('-v $REMOTE:/app');
    expect(serveSh).toContain('-v $REMOTE/dist:/srv/wedding:ro');
    for (const f of ['dvd.sh', 'serve-dist.sh']) {
      const r = run(f, ['true'], { DVD_DIR: '/tmp/x', DVD_HOST: 'host.invalid' });
      expect(r.code, f).toBe(2);
      expect(r.out).toContain('DVD_DIR must be inside ~/wedding_site/');
    }
  });

  it('publish ports on 127.0.0.1 only', () => {
    for (const src of [dvdSh, serveSh]) {
      for (const m of src.matchAll(/-p (\S*:\S*)/g)) expect(m[1]).toMatch(/^127\.0\.0\.1:/);
    }
  });

  it('serve dist/ with the README nginx block, the one nginx config', () => {
    expect(serveSh).toContain("awk '/^```nginx$/");
    expect(fenced('nginx')).toContain('listen 80;');
  });
});

describe('.gitignore', () => {
  it('ignores the build output and caches of spec 7.1 and macOS metadata', () => {
    const lines = gitignore.split('\n').map((l) => l.trim());
    const want = ['node_modules/', 'dist/', 'dist-ssr/', '.vite/', 'coverage/', 'playwright-report/', 'test-results/'];
    for (const e of [...want, '*.log', '.DS_Store', '._*']) expect(lines).toContain(e);
  });
});
