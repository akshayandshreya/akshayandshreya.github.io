// CopyProvider: the current LangFile (lazy chunk) + the URL variant -> SiteCopy, and the i18n helpers (spec 4.3).
// Changing language keeps the previous file on screen until the new chunk resolves (no empty flash); changing a query
// parameter swaps the variant synchronously.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Lang, LangFile, LangMeta, SiteCopy, UiKey } from './types';
import { getLoadedLang, loadLang } from './index';
import { translate, type TVars } from './translate';
import { useVariant, type Variant } from '../state/variant';
import { NUMERALS_OF, padNative, toNativeDigits } from '../lib/numerals';
import { formatDate as formatDateFor } from '../lib/dates';

export interface I18n {
  /** The language whose copy is on screen (may lag the URL for one chunk load). */
  lang: Lang;
  /** The language the URL asks for. */
  requestedLang: Lang;
  file: LangFile;
  meta: LangMeta;
  copy: SiteCopy;
  variant: Variant;
  t: (key: UiKey, vars?: TVars, count?: number) => string;
  /** A number in the language's digits; `pad` zero-pads with the native zero. */
  num: (n: number, pad?: number) => string;
  formatDate: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function CopyProvider({
  lang,
  children,
  fallback = null,
}: {
  lang: Lang;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [file, setFile] = useState<LangFile | undefined>(() => getLoadedLang(lang));
  const cached = getLoadedLang(lang);
  // already loaded (prefetched, or the SSR/hydration path): switch in this render
  if (cached && cached !== file) setFile(cached);

  useEffect(() => {
    if (file?.lang === lang) return;
    let live = true;
    loadLang(lang).then(
      (f) => live && setFile(f),
      (err: unknown) => console.error(`language ${lang} failed to load`, err),
    );
    return () => {
      live = false;
    };
  }, [lang, file]);

  const variant = useVariant();
  const value = useMemo<I18n | null>(() => {
    if (!file) return null;
    const shown = file.lang;
    const system = NUMERALS_OF[shown];
    return {
      lang: shown,
      requestedLang: lang,
      file,
      meta: file.meta,
      copy: file.variants[variant.key],
      variant,
      t: (key, vars, count) => translate(file.ui, shown, key, vars, count),
      num: (n, pad) => (pad ? padNative(n, pad, system) : toNativeDigits(n, system)),
      formatDate: (v, options) => formatDateFor(v, shown, options),
    };
  }, [file, lang, variant]);

  if (!value) return <>{fallback}</>;
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside <CopyProvider>');
  return ctx;
}

/** The resolved copy of the current language and variant. */
export function useCopy(): SiteCopy {
  return useI18n().copy;
}

/** t() of the current language. */
export function useT(): I18n['t'] {
  return useI18n().t;
}
