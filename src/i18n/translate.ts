// t(): UI string lookup with plural forms and {placeholder} interpolation. Number values are written with the
// language's native digits. Pure, so it is shared by the React context, the prerender and the tests.
import type { Lang, UiKey, UiStrings } from './types';
import { NUMERALS_OF, pluralForm, toNativeDigits } from '../lib/numerals';

export type TVars = Record<string, string | number>;

/** Bengali genitive suffix (spec 4.7): "র" after a final vowel or vowel sign (মেহেন্দির); after a final consonant
 *  "এর", which joins the word as the vowel sign "ের" (বাগদানের, গায়ে হলুদের, শুভ বিবাহের, প্রীতিভোজের). */
export function bengaliGenitive(word: string): string {
  const last = word.replace(/[\s\u2060]+$/u, '').slice(-1);
  if (!last) return '';
  const code = last.codePointAt(0) ?? 0;
  // vowel signs া-ৌ, ৗ, ৢ ৣ; independent vowels অ-ঔ, ৠ ৡ. Anything else (a consonant, ং, ৎ, য়) takes ের.
  const vowelSign = (code >= 0x09be && code <= 0x09cc) || code === 0x09d7 || code === 0x09e2 || code === 0x09e3;
  const vowel = (code >= 0x0985 && code <= 0x0994) || code === 0x09e0 || code === 0x09e1;
  return vowelSign || vowel ? 'র' : '\u09c7র';
}

/**
 * A UI string by key. Placeholders:
 * - `{name}`: `vars.name`; numbers are written in the language's digits;
 * - `{name:unitKey}`: the plural form of the UI string `unitKey` for the count `vars.name` ("{h} {h:countdown.hours}"
 *   gives "1 hour" / "3 hours", "१ घंटा" / "३ घंटे"), so a sentence agrees with each of its numbers;
 * - `{gen}`: the Bengali genitive suffix for `vars.event` (empty in the other languages).
 * `count` picks the form of a `{ one, other }` value itself (default `vars.n`, else 1). A missing key returns the key.
 */
export function translate(ui: UiStrings, lang: Lang, key: UiKey, vars?: TVars, count?: number): string {
  const value = ui[key];
  if (value === undefined) return key;
  const text = pluralForm(value, lang, count ?? (typeof vars?.n === 'number' ? vars.n : 1));
  if (!vars && !text.includes('{gen}')) return text;
  const system = NUMERALS_OF[lang];
  return text.replace(/\{(\w+)(?::([\w.]+))?\}/g, (whole, name: string, unit: string | undefined) => {
    if (name === 'gen') return lang === 'bn' && vars?.event != null ? bengaliGenitive(String(vars.event)) : '';
    const v = vars?.[name];
    if (v === undefined) return whole;
    if (unit) {
      const form = ui[unit as UiKey];
      if (form === undefined) return whole;
      return pluralForm(form, lang, typeof v === 'number' ? v : Number(v));
    }
    return typeof v === 'number' ? toNativeDigits(v, system) : v;
  });
}

/** The placeholders of a UI string: `{d}` -> "d", `{h:countdown.hours}` -> "h" (with its unit key). */
export function placeholders(text: string): { name: string; unit: string | null }[] {
  return [...text.matchAll(/\{(\w+)(?::([\w.]+))?\}/g)].map((m) => ({ name: m[1]!, unit: m[2] ?? null }));
}
