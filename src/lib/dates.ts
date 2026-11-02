// Date formatting for UI strings (content dates already carry native digits and are never reformatted, spec 4.5).
// Intl does the calendar words; our digit table guarantees native digits, and mai falls back to hi month names when
// the browser has no Maithili data. Always in the venue's time zone (Asia/Kolkata), whatever the device's zone.
import type { Lang } from '../i18n/types';
import { NUMERALS_OF, toNativeDigits } from './numerals';

export const VENUE_TIME_ZONE = 'Asia/Kolkata';

const LOCALE: Record<Lang, string[]> = {
  en: ['en-IN'],
  hi: ['hi-IN'],
  mai: ['mai-IN', 'hi-IN'],
  bn: ['bn-IN'],
};

function pickLocale(lang: Lang): string {
  for (const loc of LOCALE[lang]) {
    try {
      const resolved = new Intl.DateTimeFormat(loc).resolvedOptions().locale;
      if (resolved.split('-')[0] === loc.split('-')[0]) return loc;
    } catch {
      /* try the next */
    }
  }
  return LOCALE[lang][LOCALE[lang].length - 1] ?? 'en-IN';
}

/** Format a date (ISO string, epoch ms or Date) for `lang` in IST with native digits. */
export function formatDate(
  value: string | number | Date,
  lang: Lang,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' },
): string {
  const date = value instanceof Date ? value : new Date(value);
  const fmt = new Intl.DateTimeFormat(`${pickLocale(lang)}-u-nu-latn`, { timeZone: VENUE_TIME_ZONE, ...options });
  return toNativeDigits(fmt.format(date), NUMERALS_OF[lang]);
}
