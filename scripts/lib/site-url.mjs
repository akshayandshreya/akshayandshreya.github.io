// The site's absolute URL (spec 6.2, O10; QA r1 T2), shared by vite.config.ts (the client and SSR builds),
// scripts/prerender.mjs and scripts/check-budget.mjs, so every step of `npm run build` agrees.
//   1. VITE_SITE_URL (origin + base, for example https://example.com/ or https://example.com/wedding/)
//   2. else the hosting platform's own variable, plus VITE_BASE:
//        Netlify             URL (production) or DEPLOY_PRIME_URL (deploy and branch previews)
//        Vercel              VERCEL_PROJECT_PRODUCTION_URL (production) or VERCEL_URL (previews), https:// prefixed
//        Cloudflare Pages    CF_PAGES_URL
//   3. else none: no canonical, hreflang, og:url or og:image, so WhatsApp shows a text-only card. A build in CI fails
//      then (set VITE_SITE_URL), unless ALLOW_NO_SITE_URL=1 says that is meant (local and QA builds:
//      scripts/dvd.sh sets it).

/** "/wedding/" style base from VITE_BASE. */
export function normalizeBase(b = '/') {
  const lead = b.startsWith('/') ? b : `/${b}`;
  return lead.endsWith('/') ? lead : `${lead}/`;
}

function withScheme(u) {
  const v = String(u).trim();
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/** { url: 'https://host/base/' | null, source: string | null, platform: string | null } */
export function resolveSiteUrl(env = process.env) {
  const base = normalizeBase(env.VITE_BASE ?? '/');
  const platform = env.NETLIFY === 'true' ? 'netlify' : env.VERCEL ? 'vercel' : env.CF_PAGES ? 'cloudflare' : null;
  if (env.VITE_SITE_URL) return { url: withScheme(env.VITE_SITE_URL).replace(/\/*$/, '/'), source: 'VITE_SITE_URL', platform };
  const pick = (name) => (env[name] ? { name, value: env[name] } : null);
  let hit = null;
  if (platform === 'netlify')
    hit = env.CONTEXT && env.CONTEXT !== 'production' ? (pick('DEPLOY_PRIME_URL') ?? pick('URL')) : pick('URL');
  else if (platform === 'vercel')
    hit = env.VERCEL_ENV === 'production' ? (pick('VERCEL_PROJECT_PRODUCTION_URL') ?? pick('VERCEL_URL')) : pick('VERCEL_URL');
  else if (platform === 'cloudflare') hit = pick('CF_PAGES_URL');
  if (!hit) return { url: null, source: null, platform };
  const origin = withScheme(hit.value).replace(/\/+$/, '');
  return { url: `${origin}${base}`, source: hit.name, platform };
}

/** Throws when a CI build would ship without link-preview images (see above). */
export function requireSiteUrl(env = process.env) {
  const r = resolveSiteUrl(env);
  if (r.url) return r;
  if ((env.CI || r.platform) && env.ALLOW_NO_SITE_URL !== '1') {
    throw new Error(
      'VITE_SITE_URL is not set and no hosting platform URL was found: the pages would have no og:image, og:url, ' +
        'canonical or hreflang (WhatsApp shows a text-only card). Set VITE_SITE_URL=https://your.domain/ for this ' +
        'build (or ALLOW_NO_SITE_URL=1 when that is meant).',
    );
  }
  return r;
}
