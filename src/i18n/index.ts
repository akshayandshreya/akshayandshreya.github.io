// Language files: one lazy chunk per language (about 4 KB gzip each). The cache lets the previous language stay on
// screen until the next one resolves (spec 4.3) and lets the prerender/hydration path render synchronously.
import type { Lang, LangFile } from './types';

const loaders: Record<Lang, () => Promise<{ default: unknown }>> = {
  en: () => import('./en.json'),
  hi: () => import('./hi.json'),
  mai: () => import('./mai.json'),
  bn: () => import('./bn.json'),
};

const cache = new Map<Lang, LangFile>();
const pending = new Map<Lang, Promise<LangFile>>();

/** The language file if it is already loaded. */
export function getLoadedLang(lang: Lang): LangFile | undefined {
  return cache.get(lang);
}

/** Put a language file into the cache (prerender, tests). */
export function primeLang(file: LangFile): void {
  cache.set(file.lang, file);
}

/** Load (once) and cache a language file. */
export function loadLang(lang: Lang): Promise<LangFile> {
  const hit = cache.get(lang);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(lang);
  if (!p) {
    p = loaders[lang]().then((m) => {
      const file = m.default as LangFile;
      cache.set(lang, file);
      pending.delete(lang);
      return file;
    });
    pending.set(lang, p);
  }
  return p;
}

/** Warm a language chunk (pointerenter / focus on its switch link). Errors are ignored: the click loads it again. */
export function prefetchLang(lang: Lang): void {
  loadLang(lang).catch(() => undefined);
}

export type * from './types';
