// Native digits and plurals (spec 4.5). A fixed mapping table, not Intl (whose mai support differs between browsers).
import type { Lang, Numerals, UiValue } from '../i18n/types';

const DIGITS: Record<Numerals, string> = {
  latin: '0123456789',
  devanagari: '०१२३४५६७८९',
  bengali: '০১২৩৪৫৬৭৮৯',
};

export const NUMERALS_OF: Record<Lang, Numerals> = { en: 'latin', hi: 'devanagari', mai: 'devanagari', bn: 'bengali' };

/** Replace Latin digits with the system's digits (other characters untouched). */
export function toNativeDigits(value: number | string, system: Numerals): string {
  const s = String(value);
  if (system === 'latin') return s;
  const table = DIGITS[system];
  return s.replace(/[0-9]/g, (d) => table[Number(d)] ?? d);
}

/** Native digits back to Latin (any system). */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[०-९]/g, (c) => String(DIGITS.devanagari.indexOf(c)))
    .replace(/[০-৯]/g, (c) => String(DIGITS.bengali.indexOf(c)));
}

/** Zero-padded to `width` with the native zero. */
export function padNative(n: number, width: number, system: Numerals): string {
  return toNativeDigits(String(Math.max(0, Math.trunc(n))).padStart(width, '0'), system);
}

const enRules = typeof Intl !== 'undefined' ? new Intl.PluralRules('en') : null;

/** The plural category used for a UI value: en via Intl (one/other); hi uses one only for 1; mai and bn one form. */
export function pluralCategory(lang: Lang, n: number): 'one' | 'other' {
  if (lang === 'en') return (enRules?.select(n) ?? (n === 1 ? 'one' : 'other')) === 'one' ? 'one' : 'other';
  if (lang === 'hi') return n === 1 ? 'one' : 'other';
  return 'other';
}

/** Pick the form of a UI value for a count. */
export function pluralForm(value: UiValue, lang: Lang, n: number): string {
  if (typeof value === 'string') return value;
  return value[pluralCategory(lang, n)];
}
