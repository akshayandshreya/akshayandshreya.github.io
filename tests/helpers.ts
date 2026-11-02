import type { Lang, LangFile } from '../src/i18n/types';
import en from '../src/i18n/en.json';
import hi from '../src/i18n/hi.json';
import mai from '../src/i18n/mai.json';
import bn from '../src/i18n/bn.json';

export const FILES: Record<Lang, LangFile> = {
  en: en as unknown as LangFile,
  hi: hi as unknown as LangFile,
  mai: mai as unknown as LangFile,
  bn: bn as unknown as LangFile,
};

/** Remove the hygiene characters (NBSP -> space, word joiners dropped) for comparisons with content.json. */
export const plainText = (s: string) => s.replace(/\u00a0/g, ' ').replace(/\u2060/g, '');
