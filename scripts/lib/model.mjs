// Maps one content.json variant to the site schema (spec 4.2, src/i18n/types.ts). Pure: no I/O.
import { resolveReception } from './merge.mjs';
import { hygiene, joinHyphens, splitAddress, splitFirst } from './hygiene.mjs';

export const LANGS = /** @type {const} */ (['en', 'hi', 'mai', 'bn']);
export const ORDERS = /** @type {const} */ (['G', 'B']);
export const VARIANT_KEYS = /** @type {const} */ (['G1', 'G0', 'B1', 'B0']);
export const EVENT_KEYS = /** @type {const} */ (['mehndi', 'engagement', 'haldi', 'wedding', 'reception']);

export const LANG_META = {
  en: { bcp47: 'en-IN', script: 'Latn', numerals: 'latin', endonym: 'English', short: 'EN', ogLocale: 'en_IN' },
  hi: { bcp47: 'hi-IN', script: 'Deva', numerals: 'devanagari', endonym: 'हिन्दी', short: 'हि', ogLocale: 'hi_IN' },
  mai: { bcp47: 'mai-IN', script: 'Deva', numerals: 'devanagari', endonym: 'मैथिली', short: 'मै', ogLocale: 'mai_IN' },
  bn: { bcp47: 'bn-IN', script: 'Beng', numerals: 'bengali', endonym: 'বাংলা', short: 'বা', ogLocale: 'bn_IN' },
};

/** The two-line closing request (storyboard 4.1 table). The generator asserts that the parts joined by a space equal
 *  the content string. */
export const CLOSING_SPLIT = {
  en: ['We look forward', 'to your presence'],
  hi: ['आपकी शुभ उपस्थिति', 'की प्रतीक्षा रहेगी'],
  mai: ['अपनेक बाट', 'जोहि रहल छी'],
  bn: ['আপনার উপস্থিতি', 'একান্ত কাম্য'],
};

/** Venue key -> city index in `cities` (Kolkata 0, Saharsa 1). */
export const CITY_OF_VENUE = { agora: 0, roybari: 0, devresort: 1 };

/** IST date + time to a UTC ISO string without milliseconds ("2026-11-26T12:30:00Z"). */
export function istToUtc(dateIso, time24) {
  const [y, mo, d] = dateIso.split('-').map(Number);
  const [h, mi] = time24.split(':').map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi) - (5 * 60 + 30) * 60 * 1000;
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

/** Facts per event from content.json facts.events. */
export function eventFacts(facts) {
  const out = {};
  for (const key of EVENT_KEYS) {
    const f = facts.events[key];
    if (!f) throw new Error(`facts.events.${key} missing`);
    const city = CITY_OF_VENUE[f.venue_key];
    if (city === undefined) throw new Error(`facts.events.${key}: unknown venue_key ${f.venue_key}`);
    out[key] = {
      dateIso: f.date_iso,
      time24: f.time_24h,
      startUtc: istToUtc(f.date_iso, f.time_24h),
      venueKey: f.venue_key,
      city,
    };
  }
  return out;
}

/**
 * Build one SiteCopy from content.json `variants[lang][order]`.
 * @param {Record<string, any>} raw the stored variant (with its without_reception overlay)
 * @param {'en'|'hi'|'mai'|'bn'} lang
 * @param {boolean} reception
 * @param {ReturnType<typeof eventFacts>} facts
 */
export function buildSiteCopy(raw, lang, reception, facts) {
  const v = resolveReception(raw, reception);
  const n = v.names;
  const names = [
    { name: n.first, honorific: n.first_honorific },
    { name: n.second, honorific: n.second_honorific },
  ];
  const k = (s) => (s == null ? s : hygiene(s, lang, names));
  const addr = (s) => splitAddress(s).map(k);

  const joiner = v.joiner_symbol;
  const pairParts = n.pair_short.split(` ${joiner} `);
  if (pairParts.length !== 2)
    throw new Error(`${v.variant_id}: pair_short "${n.pair_short}" does not split around "${joiner}"`);

  const [dates, cities] = splitFirst(v.save_the_date.line, ' · ');

  let shloka = null;
  if (v.shloka) {
    const i = v.shloka.indexOf('।');
    if (i === -1) throw new Error(`${v.variant_id}: shloka without "।"`);
    shloka = [v.shloka.slice(0, i + 1).trim(), v.shloka.slice(i + 1).trim()];
  }

  const events = v.events_order.map((key) => {
    const e = v.events[key];
    if (!e) throw new Error(`${v.variant_id}: events_order lists ${key} but events has none`);
    const f = facts[key];
    return {
      key,
      title: k(e.title),
      tagline: k(e.tagline),
      date: k(e.date),
      time: k(e.time),
      dateTime: k(e.date_time),
      venue: k(e.venue_name_full),
      address: addr(e.venue_address),
      mapQuery: e.map_line_en,
      startUtc: f.startUtc,
      dateIso: e.date_iso,
      venueKey: f.venueKey,
      city: f.city,
    };
  });

  const days = v.single_page.days.map((d) => {
    const first = d.events[0];
    if (!first) throw new Error(`${v.variant_id}: a day without events (${d.heading})`);
    return {
      heading: k(d.heading),
      dateIso: d.date_iso,
      venue: k(d.venue_name_full),
      address: addr(d.venue_address),
      mapQuery: d.map_line_en,
      lines: d.events.map((x) => ({ key: x.key, text: k(x.line) })),
      city: facts[first.key].city,
    };
  });

  const split = CLOSING_SPLIT[lang];
  const fam = v.regards_families_lines;

  return {
    invocation: k(v.invocation),
    invocationSecondary: v.invocation_secondary ? k(v.invocation_secondary) : null,
    shloka,
    heading: k(v.heading),
    dateline: { dates: k(dates), cities: cities == null ? null : k(cities) },
    pair: { first: pairParts[0], joiner, second: pairParts[1], text: n.pair_short },
    pairFull: k(n.pair_full),
    monogram: v.monogram.latin,
    blessing: k(v.blessing_line),
    host: joinHyphens(k(v.host_line)),
    names: {
      first: { text: k(n.first), honorific: n.first_honorific ?? null, role: n.first_role },
      second: { text: k(n.second), honorific: n.second_honorific ?? null, role: n.second_role },
      joiner,
    },
    eventsHeading: k(v.single_page.events_heading),
    labels: { date: v.labels.date, time: v.labels.time, venue: v.labels.venue, map: v.labels.map_label },
    events,
    cities: v.city.split(' · ').map(k),
    days,
    closing: {
      big: k(v.closing_big),
      bigLines: [k(split[0]), k(split[1])],
      small: k(v.closing_small),
      regards: k(v.regards),
      families: [k(fam[0]), fam[1], k(fam[2])],
    },
    head: {
      title: `${n.pair_short} · ${v.heading}`,
      description: `${v.heading} · ${v.save_the_date.line}`,
      ogAlt: `${v.heading} · ${v.save_the_date.line}`,
    },
  };
}

/** UI strings of one language: { key: string | { one, other } }, with the same line-break hygiene as the content
 *  (so "कैलेंडर में जोड़ें" never wraps before "में" on a narrow button). */
export function uiFor(ui, lang) {
  const out = {};
  for (const [key, byLang] of Object.entries(ui.strings)) {
    const x = byLang[lang];
    out[key] =
      typeof x === 'string'
        ? hygiene(x, lang)
        : x && typeof x === 'object'
          ? { one: hygiene(x.one, lang), other: hygiene(x.other, lang) }
          : x;
  }
  return out;
}

/** The whole LangFile for one language (without the `source` block). */
export function buildLangFile(content, ui, lang) {
  const facts = eventFacts(content.facts);
  const variants = {};
  for (const order of ORDERS) {
    const raw = content.variants[lang]?.[order];
    if (!raw) throw new Error(`content.json variants.${lang}.${order} missing`);
    variants[`${order}1`] = buildSiteCopy(raw, lang, true, facts);
    variants[`${order}0`] = buildSiteCopy(raw, lang, false, facts);
  }
  return { lang, meta: LANG_META[lang], ui: uiFor(ui, lang), variants };
}
