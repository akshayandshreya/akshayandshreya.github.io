import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error: a plain .mjs helper shared with the build scripts (no types)
import { normalizeBase, requireSiteUrl, resolveSiteUrl } from './scripts/lib/site-url.mjs';

// VITE_BASE lets the site live under a sub-path (for example /wedding/). It must start and end with "/".
const base: string = normalizeBase(process.env.VITE_BASE ?? '/');

export default defineConfig(({ command }) => {
  // the absolute site URL (VITE_SITE_URL, else the host's own: Netlify, Vercel, Cloudflare Pages; QA r1 T2) for
  // canonical, hreflang, og:url and og:image; a CI build without one fails (scripts/lib/site-url.mjs)
  const site: { url: string | null } = command === 'build' ? requireSiteUrl() : resolveSiteUrl();
  return {
    base,
    plugins: [react()],
    define: { 'import.meta.env.VITE_SITE_URL': JSON.stringify(site.url ?? '') },
    build: {
      target: 'es2020',
      manifest: true,
      cssCodeSplit: true,
      sourcemap: false,
      assetsInlineLimit: 0,
    },
    server: { strictPort: true },
    preview: { strictPort: true },
  };
});
