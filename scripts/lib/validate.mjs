// Validation of the generated copy (spec 4.1 step 4). Used by gen-i18n.mjs (before writing) and check-content.mjs (on
// the committed files). Returns a list of error strings; empty = valid. Every rule names the spec rule it enforces.
import { CLOSING_SPLIT, EVENT_KEYS, LANGS, LANG_META, VARIANT_KEYS, eventFacts } from './model.mjs';
import { plain } from './hygiene.mjs';
import { resolveReception } from './merge.mjs';

// ---- forbidden words (spec 0.2 rule 2: no fish anywhere, in any language) -------------------------------------------
/** Substrings, case-insensitive: English, transliterations, Hindi/Maithili, Bengali. */
export const FORBIDDEN_WORDS = [
  'fish',
  'matsya',
  'machhli',
  'machli',
  'macchli',
  'मछली',
  'मछलि',
  'मत्स्य',
  'माछ',
  'মাছ',
  'মৎস্য',
  'মৎস',
];
/** Whole words only (they are parts of unrelated words): "meen", मीन (Pisces, fish), মীন. */
export const FORBIDDEN_WHOLE_WORDS = ['meen', 'मीन', 'মীন'];
/** Fish and fishing emoji. */
const FORBIDDEN_EMOJI = /[\u{1F41F}\u{1F420}\u{1F421}\u{1F3A3}\u{1F988}]/u;

// ---- digits ---------------------------------------------------------------------------------------------------------
const DIGIT_SETS = { latin: '0123456789', devanagari: '०१२३४५६७८९', bengali: '০১২৩৪৫৬৭৮৯' };
const D = '0-9०-९০-৯';
const RUN = new RegExp(`[${D}]+`, 'g');
/** Digit groups joined by phone-style separators (space, NBSP, hyphen, dot, slash, brackets): "98765 43210". */
const GROUPED = new RegExp(`\\+?[${D}](?:[ \\u00a0\\-./()]{0,2}[${D}])+`, 'g');
/** The only allowed 6-digit run: the Saharsa PIN in any numeral system. */
const PIN = '852201';

/** Native digits -> Latin. */
export const toLatin = (s) =>
  String(s)
    .replace(/[०-९]/g, (c) => String(DIGIT_SETS.devanagari.indexOf(c)))
    .replace(/[০-৯]/g, (c) => String(DIGIT_SETS.bengali.indexOf(c)));

/** Latin digits -> the system's digits. */
const toSystem = (n, system) => String(n).replace(/[0-9]/g, (d) => DIGIT_SETS[system][Number(d)]);

/** The digit runs of a string, as Latin numbers ("२५–२६ नवंबर" -> [25, 26]). */
const numbersIn = (s) => [...String(s).matchAll(RUN)].map((m) => Number(toLatin(m[0])));

// ---- family names and cities, per language (order rule, reception rule) ---------------------------------------------
/** Family tokens per language. सील and शील are both accepted while the spelling is under review (spec 4.8 item 3). */
const FAMILY = {
  jha: { en: ['Jha'], hi: ['झा'], mai: ['झा'], bn: ['ঝা'] },
  sil: { en: ['Sil'], hi: ['सील', 'शील'], mai: ['सील', 'शील'], bn: ['শীল'] },
};
const KOLKATA = { en: 'Kolkata', hi: 'कोलकाता', mai: 'कोलकाता', bn: 'কলকাতা' };
const SAHARSA = ['Saharsa', 'सहरसा', 'সহরসা'];

// ---- keys that are data, not display copy ---------------------------------------------------------------------------
/** Keys whose values are allowed to hold Latin digits and letters (or are not display copy). */
const NON_COPY_KEYS = new Set([
  'mapQuery',
  'startUtc',
  'dateIso',
  'venueKey',
  'key',
  'role',
  'monogram',
  'source',
  'meta',
  'lang',
  'city',
]);
/** Latin text allowed in hi/mai/bn display copy: brand names, the .ics file type and {placeholders} (spec 4.7). */
const LATIN_ALLOWED = [/\{[\w.:]+\}/g, /\bApple\b/g, /\bOutlook\b/g, /\(\.ics\)/g, /\.ics\b/g];

// ---- the generated schema (spec 4.2, src/i18n/types.ts) -------------------------------------------------------------
const S = 'string';
const SN = 'string|null';
const N = 'number';
const each = (shape) => ({ $each: shape });
const nullable = (shape) => ({ $nullable: shape });
const PERSON = { text: S, honorific: SN, role: S };
const EVENT = {
  key: S,
  title: S,
  tagline: S,
  date: S,
  time: S,
  dateTime: S,
  venue: S,
  address: [S, S],
  mapQuery: S,
  startUtc: S,
  dateIso: S,
  venueKey: S,
  city: N,
};
const DAY = {
  heading: S,
  dateIso: S,
  venue: S,
  address: [S, S],
  mapQuery: S,
  lines: each({ key: S, text: S }),
  city: N,
};
export const SITE_COPY_SHAPE = {
  invocation: S,
  invocationSecondary: SN,
  shloka: nullable([S, S]),
  heading: S,
  dateline: { dates: S, cities: SN },
  pair: { first: S, joiner: S, second: S, text: S },
  pairFull: S,
  monogram: S,
  blessing: S,
  host: S,
  names: { first: PERSON, second: PERSON, joiner: S },
  eventsHeading: S,
  labels: { date: S, time: S, venue: S, map: S },
  events: each(EVENT),
  cities: each(S),
  days: each(DAY),
  closing: { big: S, bigLines: [S, S], small: S, regards: S, families: [S, S, S] },
  head: { title: S, description: S, ogAlt: S },
};
export const LANG_FILE_SHAPE = {
  lang: S,
  meta: { bcp47: S, script: S, numerals: S, endonym: S, short: S, ogLocale: SN },
  ui: '$ui',
  variants: { G1: SITE_COPY_SHAPE, G0: SITE_COPY_SHAPE, B1: SITE_COPY_SHAPE, B0: SITE_COPY_SHAPE },
  source: { contentSha256: S, uiSha256: S, generatedAt: SN },
};

const nonEmptyString = (x) => typeof x === 'string' && x.trim() !== '';

/** Strict shape check: every field present, of its type, non-empty; no unknown fields. */
export function checkShape(value, shape, where, errors = []) {
  if (shape === S) {
    if (!nonEmptyString(value)) errors.push(`${where}: must be a non-empty string`);
  } else if (shape === SN) {
    if (value !== null && !nonEmptyString(value)) errors.push(`${where}: must be a non-empty string or null`);
  } else if (shape === N) {
    if (typeof value !== 'number' || !Number.isFinite(value)) errors.push(`${where}: must be a number`);
  } else if (shape === '$ui') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) errors.push(`${where}: must be an object`);
    else
      for (const [k, x] of Object.entries(value)) {
        if (typeof x === 'string') checkShape(x, S, `${where}.${k}`, errors);
        else checkShape(x, { one: S, other: S }, `${where}.${k}`, errors);
      }
  } else if (Array.isArray(shape)) {
    if (!Array.isArray(value) || value.length !== shape.length)
      errors.push(`${where}: must be a list of ${shape.length}`);
    else shape.forEach((s, i) => checkShape(value[i], s, `${where}.${i}`, errors));
  } else if ('$each' in shape) {
    if (!Array.isArray(value) || value.length === 0) errors.push(`${where}: must be a non-empty list`);
    else value.forEach((x, i) => checkShape(x, shape.$each, `${where}.${i}`, errors));
  } else if ('$nullable' in shape) {
    if (value !== null) checkShape(value, shape.$nullable, where, errors);
  } else {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${where}: must be an object`);
      return errors;
    }
    for (const [k, s] of Object.entries(shape)) {
      if (!(k in value)) errors.push(`${where}.${k}: missing`);
      else checkShape(value[k], s, `${where}.${k}`, errors);
    }
    for (const k of Object.keys(value)) if (!(k in shape)) errors.push(`${where}.${k}: unknown field`);
  }
  return errors;
}

/** Walk every string of a JSON value: cb(path, string, isCopy). */
function walk(value, cb, path = [], isCopy = true) {
  if (typeof value === 'string') cb(path.join('.'), value, isCopy);
  else if (Array.isArray(value)) value.forEach((x, i) => walk(x, cb, [...path, String(i)], isCopy));
  else if (value && typeof value === 'object') {
    for (const [k, x] of Object.entries(value)) walk(x, cb, [...path, k], isCopy && !NON_COPY_KEYS.has(k));
  }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WHOLE = FORBIDDEN_WHOLE_WORDS.map((w) => [
  w,
  new RegExp(`(^|[^\\p{L}\\p{M}])${escapeRe(w)}($|[^\\p{L}\\p{M}])`, 'iu'),
]);

/** Forbidden words and phone-like digit runs in any string (content and UI), spec 4.1 step 4. */
export function textViolations(value, where) {
  const errors = [];
  walk(value, (path, s) => {
    const low = s.toLowerCase();
    // one report per string: मत्स्य and মৎস্য contain shorter entries of the list
    const word = FORBIDDEN_WORDS.find((w) => low.includes(w)) ?? WHOLE.find(([, re]) => re.test(s))?.[0];
    if (word) errors.push(`${where}.${path}: forbidden word "${word}"`);
    if (FORBIDDEN_EMOJI.test(s)) errors.push(`${where}.${path}: forbidden fish emoji`);
    for (const m of s.matchAll(RUN)) {
      const run = toLatin(m[0]);
      if (run.length >= 10) errors.push(`${where}.${path}: phone-like digit run "${m[0]}"`);
      else if (run.length >= 6 && run !== PIN)
        errors.push(`${where}.${path}: unexpected ${run.length}-digit run "${m[0]}"`);
    }
    for (const m of s.matchAll(GROUPED)) {
      if (!/[^0-9०-९০-৯]/.test(m[0])) continue; // a plain run: reported above
      const digits = toLatin(m[0]).replace(/[^0-9]/g, '');
      if (digits.length >= 10 || (m[0].startsWith('+') && digits.length >= 7))
        errors.push(`${where}.${path}: phone-like number "${m[0]}"`);
    }
  });
  return errors;
}

/** Whitespace and Latin-script rules for display copy (spec 4.1 step 4, 4.4). */
export function scriptViolations(value, lang, where) {
  const errors = [];
  walk(value, (path, s, isCopy) => {
    if (!isCopy) return;
    if (/^[\s\u2060]|[\s\u2060]$/u.test(s)) errors.push(`${where}.${path}: leading or trailing space in "${s}"`);
    if (/[ \u00a0]{2,}/.test(s)) errors.push(`${where}.${path}: double space in "${s}"`);
    if (/[ \u00a0][,\u0964]/.test(s)) errors.push(`${where}.${path}: space before punctuation in "${s}"`);
    if (/["']/.test(s)) errors.push(`${where}.${path}: straight quote in "${s}" (use “ ” ‘ ’)`);
    if (lang === 'en') return;
    let rest = s;
    for (const re of LATIN_ALLOWED) rest = rest.replace(re, '');
    if (/[0-9]/.test(rest)) errors.push(`${where}.${path}: Latin digits in "${s}"`);
    if (/[A-Za-z]/.test(rest)) errors.push(`${where}.${path}: Latin letters in "${s}"`);
  });
  return errors;
}

/** The placeholders of a UI string: [{ name, unit }]. Mirrors src/i18n/translate.ts placeholders(). */
export const placeholdersOf = (text) =>
  [...String(text).matchAll(/\{(\w+)(?::([\w.]+))?\}/g)].map((m) => ({ name: m[1], unit: m[2] ?? null }));

const uiForms = (x) => (typeof x === 'string' ? [x] : x && typeof x === 'object' ? [x.one, x.other] : []);

/** content/ui.json rules (spec 4.7): all four languages, plural forms, the same placeholders, valid review lists. */
export function validateUi(ui) {
  const errors = [];
  if (!ui || typeof ui.strings !== 'object') return ['ui.json: no "strings" object'];
  for (const k of Object.keys(ui)) {
    if (!['_note', 'strings', 'reviewed', 'review'].includes(k)) errors.push(`ui.json: unknown top-level key "${k}"`);
  }
  const keys = Object.keys(ui.strings);
  for (const [key, byLang] of Object.entries(ui.strings)) {
    if (!/^[a-z0-9]+\.[a-zA-Z0-9]+$/.test(key)) errors.push(`ui.${key}: key must look like "group.name"`);
    for (const lang of Object.keys(byLang))
      if (!LANGS.includes(lang)) errors.push(`ui.${key}: unknown language ${lang}`);
    let names = null;
    for (const lang of LANGS) {
      const x = byLang[lang];
      if (typeof x === 'string') {
        if (!x.trim()) errors.push(`ui.${key}.${lang} is empty`);
      } else if (!x || typeof x.one !== 'string' || typeof x.other !== 'string' || !x.one || !x.other) {
        errors.push(`ui.${key}.${lang} must be a string or { one, other }`);
        continue;
      } else if (lang === 'mai' || lang === 'bn') {
        errors.push(`ui.${key}.${lang}: ${lang} has one plural form (spec 4.5); use a string`);
      }
      // the same placeholders in every language and form ({gen} only in bn, next to {event})
      for (const form of uiForms(x)) {
        const found = placeholdersOf(form);
        for (const p of found) {
          if (p.unit && !keys.includes(p.unit)) errors.push(`ui.${key}.${lang}: {${p.name}:${p.unit}} unknown key`);
          if (p.name === 'gen' && (lang !== 'bn' || !found.some((q) => q.name === 'event')))
            errors.push(`ui.${key}.${lang}: {gen} only in bn, after {event}`);
        }
        const set = [...new Set(found.filter((p) => p.name !== 'gen').map((p) => p.name))].sort().join(',');
        if (names === null) names = set;
        else if (set !== names) errors.push(`ui.${key}.${lang}: placeholders {${set}} differ from {${names}}`);
        if (/[{}]/.test(form.replace(/\{(\w+)(?::([\w.]+))?\}/g, '')))
          errors.push(`ui.${key}.${lang}: stray brace in "${form}"`);
      }
    }
  }
  for (const r of ui.reviewed ?? []) {
    const [key, lang] = r.match(/^(.+?)(?:\.(en|hi|mai|bn))?$/).slice(1);
    if (!ui.strings[key]) errors.push(`ui.reviewed: unknown key "${r}"`);
    else if (lang && !(lang in ui.strings[key])) errors.push(`ui.reviewed: unknown language in "${r}"`);
  }
  for (const key of Object.keys(ui.review ?? {})) if (!ui.strings[key]) errors.push(`ui.review: unknown key "${key}"`);
  errors.push(...textViolations(ui.strings, 'ui'));
  return errors;
}

/** Facts and content equality of one variant (spec 4.1 step 4, 0.2 rules 3 and 4). */
function validateVariant(errors, V, raw, lang, vk, facts) {
  const where = `${lang}.${vk}`;
  const order = vk[0];
  const reception = vk[1] === '1';
  const system = LANG_META[lang].numerals;
  const same = (field, got, want) => {
    if (plain(got ?? '') !== (want ?? ''))
      errors.push(`${where}.${field} differs from content ("${plain(got)}" != "${want}")`);
  };

  // shloka: hi and mai only, two lines (card)
  if ((lang === 'hi' || lang === 'mai') && !(V.shloka && V.shloka[0] && V.shloka[1]))
    errors.push(`${where}: shloka must have 2 lines`);
  if ((lang === 'en' || lang === 'bn') && V.shloka) errors.push(`${where}: unexpected shloka`);
  if (V.shloka) same('shloka', V.shloka.join(' '), raw.shloka.replace(/\s+/g, ' ').trim());

  // every display string equals content.json (hygiene characters aside): the generator never rewrites copy
  same('invocation', V.invocation, raw.invocation);
  same('invocationSecondary', V.invocationSecondary ?? '', raw.invocation_secondary ?? '');
  same('heading', V.heading, raw.heading);
  same('blessing', V.blessing, raw.blessing_line);
  same('host', V.host, raw.host_line);
  same('pairFull', V.pairFull, raw.names.pair_full);
  same('pair.text', V.pair.text, raw.names.pair_short);
  same('pair', `${V.pair.first} ${V.pair.joiner} ${V.pair.second}`, raw.names.pair_short);
  same('names.first', V.names.first.text, raw.names.first);
  same('names.second', V.names.second.text, raw.names.second);
  same('names.first.honorific', V.names.first.honorific ?? '', raw.names.first_honorific ?? '');
  same('names.second.honorific', V.names.second.honorific ?? '', raw.names.second_honorific ?? '');
  same('eventsHeading', V.eventsHeading, raw.single_page.events_heading);
  same('labels.date', V.labels.date, raw.labels.date);
  same('labels.time', V.labels.time, raw.labels.time);
  same('labels.venue', V.labels.venue, raw.labels.venue);
  same('labels.map', V.labels.map, raw.labels.map_label);
  same('cities', V.cities.join(' · '), raw.city);
  same(
    'dateline',
    V.dateline.cities == null ? V.dateline.dates : `${V.dateline.dates} · ${V.dateline.cities}`,
    raw.save_the_date.line,
  );
  same('closing.big', V.closing.big, raw.closing_big);
  same('closing.small', V.closing.small, raw.closing_small);
  same('closing.regards', V.closing.regards, raw.regards);
  V.closing.families.forEach((f, i) => same(`closing.families.${i}`, f, raw.regards_families_lines[i]));
  same('head.title', V.head.title, `${raw.names.pair_short} · ${raw.heading}`);
  same('head.description', V.head.description, `${raw.heading} · ${raw.save_the_date.line}`);
  same('head.ogAlt', V.head.ogAlt, V.head.description);

  // U+2060 only in the host line (card.js): the Devanagari and Bengali font subsets have no glyph for it
  walk({ ...V, host: '' }, (path, s) => {
    if (s.includes('\u2060')) errors.push(`${where}.${path}: U+2060 outside the host line`);
  });

  // closing split joins back (storyboard 4.1 table)
  if (CLOSING_SPLIT[lang].join(' ') !== raw.closing_big)
    errors.push(`${where}: closing split does not join to closing_big`);
  V.closing.bigLines.forEach((l, i) => same(`closing.bigLines.${i}`, l, CLOSING_SPLIT[lang][i]));

  // order rule (spec 0.2 rule 3)
  const [hostFam, guestFam] = order === 'G' ? ['jha', 'sil'] : ['sil', 'jha'];
  const firstRole = order === 'G' ? 'groom' : 'bride';
  const has = (fam, s) => FAMILY[fam][lang].some((t) => plain(s).includes(t));
  if (V.names.first.role !== firstRole) errors.push(`${where}: names.first must be the ${firstRole}`);
  if (V.names.second.role !== (firstRole === 'groom' ? 'bride' : 'groom'))
    errors.push(`${where}: names.second has the wrong role`);
  if (raw.names.first_role !== firstRole) errors.push(`${where}: content first_role is ${raw.names.first_role}`);
  if (V.monogram !== (order === 'G' ? 'AS' : 'SA'))
    errors.push(`${where}: monogram must be ${order === 'G' ? 'AS' : 'SA'}`);
  if (raw.monogram.latin !== V.monogram) errors.push(`${where}: monogram differs from content`);
  if (!has(hostFam, V.closing.families[0]))
    errors.push(
      `${where}: families[0] must be the ${hostFam === 'jha' ? 'Jha' : 'Sil'} family ("${plain(V.closing.families[0])}")`,
    );
  if (!has(guestFam, V.closing.families[2]))
    errors.push(`${where}: families[2] must be the ${guestFam === 'jha' ? 'Jha' : 'Sil'} family`);
  if (!has(hostFam, V.host) || has(guestFam, V.host))
    errors.push(`${where}: the host line must name the ${hostFam === 'jha' ? 'Jha' : 'Sil'} family only`);
  if (!plain(V.names.first.text).startsWith(V.pair.first)) errors.push(`${where}: pair.first is not names.first`);
  if (!plain(V.names.second.text).startsWith(V.pair.second)) errors.push(`${where}: pair.second is not names.second`);
  if (lang === 'en') {
    const groom = order === 'G' ? V.names.first : V.names.second;
    if (plain(groom.text) !== raw.names[order === 'G' ? 'first' : 'second'] || !plain(groom.text).includes('Akshay'))
      errors.push(`${where}: the groom must be Akshay`);
  }

  // events: the order of events_order, the facts of facts.events, the copy of content
  const keys = V.events.map((e) => e.key);
  if (keys.join() !== raw.events_order.join())
    errors.push(`${where}: events ${keys} != events_order ${raw.events_order}`);
  const expected = reception ? EVENT_KEYS : EVENT_KEYS.filter((x) => x !== 'reception');
  if (keys.join() !== expected.join()) errors.push(`${where}: events must be ${expected.join(', ')}`);
  for (const e of V.events) {
    const r = raw.events?.[e.key];
    const f = facts[e.key];
    if (!r || !f) {
      errors.push(`${where}.${e.key}: event not in the content of this variant`);
      continue;
    }
    const at = `events.${e.key}`;
    if (e.dateIso !== f.dateIso || r.date_iso !== f.dateIso)
      errors.push(`${where}.${e.key}: date_iso ${e.dateIso} != facts ${f.dateIso}`);
    if (r.time_24h !== undefined && r.time_24h !== f.time24)
      errors.push(`${where}.${e.key}: time_24h ${r.time_24h} != facts ${f.time24}`);
    if (e.startUtc !== f.startUtc) errors.push(`${where}.${e.key}: startUtc ${e.startUtc} != ${f.startUtc}`);
    if (e.venueKey !== f.venueKey || e.city !== f.city) errors.push(`${where}.${e.key}: venue key or city differs`);
    if (!(e.city < V.cities.length)) errors.push(`${where}.${e.key}: city ${e.city} not in cities`);
    same(`${at}.title`, e.title, r.title);
    same(`${at}.tagline`, e.tagline, r.tagline);
    same(`${at}.date`, e.date, r.date);
    same(`${at}.time`, e.time, r.time);
    same(`${at}.dateTime`, e.dateTime, r.date_time);
    same(`${at}.venue`, e.venue, r.venue_name_full);
    same(`${at}.address`, e.address.join(' '), r.venue_address);
    if (e.mapQuery !== r.map_line_en) errors.push(`${where}.${at}.mapQuery differs from content map_line_en`);
    if (!/^[\x20-\x7e]+$/.test(e.mapQuery)) errors.push(`${where}.${at}.mapQuery must be plain English (ASCII)`);

    // the visible date and time agree with the facts, in the language's own digits
    const day = Number(f.dateIso.slice(8, 10));
    const [h24, min] = f.time24.split(':').map(Number);
    const h12 = ((h24 + 11) % 12) + 1;
    if (!numbersIn(e.date).includes(day))
      errors.push(`${where}.${at}.date "${plain(e.date)}" does not show day ${day}`);
    if (!numbersIn(e.dateTime).includes(day)) errors.push(`${where}.${at}.dateTime does not show day ${day}`);
    if (!numbersIn(e.time).includes(h12)) errors.push(`${where}.${at}.time "${plain(e.time)}" does not show ${h12}`);
    if (!plain(e.dateTime).includes(plain(e.time))) errors.push(`${where}.${at}.dateTime does not contain the time`);
    if (lang === 'en') {
      const want = `${h12}:${String(min).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
      if (plain(e.time) !== want) errors.push(`${where}.${at}.time "${plain(e.time)}" != ${want}`);
    } else if (!plain(e.date).includes(toSystem(day, system))) {
      errors.push(`${where}.${at}.date does not use ${system} digits`);
    }
  }

  // days (Venues, single page): content copy, same map lines as their events, every event exactly once
  const rawDays = raw.single_page.days;
  if (V.days.length !== rawDays.length) errors.push(`${where}: ${V.days.length} days != content ${rawDays.length}`);
  const dayKeys = [];
  V.days.forEach((d, i) => {
    const r = rawDays[i];
    if (!r) return;
    const at = `days.${i}`;
    if (d.dateIso !== r.date_iso) errors.push(`${where}.${at}: dateIso ${d.dateIso} != ${r.date_iso}`);
    same(`${at}.heading`, d.heading, r.heading);
    same(`${at}.venue`, d.venue, r.venue_name_full);
    same(`${at}.address`, d.address.join(' '), r.venue_address);
    if (d.mapQuery !== r.map_line_en) errors.push(`${where}.${at}.mapQuery differs from content`);
    if (!numbersIn(d.heading).includes(Number(d.dateIso.slice(8, 10))))
      errors.push(`${where}.${at}.heading "${plain(d.heading)}" does not show its day`);
    d.lines.forEach((l, j) => {
      same(`${at}.lines.${j}`, l.text, r.events[j]?.line);
      if (l.key !== r.events[j]?.key) errors.push(`${where}.${at}.lines.${j}: key ${l.key} != ${r.events[j]?.key}`);
      const ev = V.events.find((e) => e.key === l.key);
      if (!ev) errors.push(`${where}.${at}: line for ${l.key}, which is not an event of this variant`);
      else {
        if (ev.dateIso !== d.dateIso) errors.push(`${where}.${at}: ${l.key} is not on ${d.dateIso}`);
        if (ev.mapQuery !== d.mapQuery) errors.push(`${where}.${at}: ${l.key} map line differs from its day`);
        if (ev.city !== d.city) errors.push(`${where}.${at}: ${l.key} city differs from its day`);
      }
      dayKeys.push(l.key);
    });
  });
  if (dayKeys.join() !== keys.join()) errors.push(`${where}: days list ${dayKeys} != events ${keys}`);

  // the dateline shows exactly the event days
  const eventDays = [...new Set(V.events.map((e) => Number(e.dateIso.slice(8, 10))))].sort((a, b) => a - b);
  const shown = [...new Set(numbersIn(V.dateline.dates))].sort((a, b) => a - b);
  if (shown.join() !== eventDays.join())
    errors.push(`${where}: dateline days ${shown} != event days ${eventDays} ("${plain(V.dateline.dates)}")`);

  // cities: Kolkata first; Saharsa only with the Reception (spec 0.2 rule 4)
  if (plain(V.cities[0]) !== KOLKATA[lang]) errors.push(`${where}: cities[0] must be ${KOLKATA[lang]}`);
  if (!reception) {
    if (keys.includes('reception')) errors.push(`${where}: reception event present`);
    if (V.cities.length !== 1) errors.push(`${where}: cities must be Kolkata only (${V.cities})`);
    if (V.days.some((d) => d.dateIso === '2026-11-29' || d.lines.some((l) => l.key === 'reception')))
      errors.push(`${where}: day 29 present`);
    if (/29|२९|২৯/.test(V.dateline.dates) || /29|२९|২৯/.test(V.head.description))
      errors.push(`${where}: dateline mentions the 29th`);
    walk(V, (path, s) => {
      if (SAHARSA.some((c) => s.includes(c))) errors.push(`${where}.${path}: mentions Saharsa without the Reception`);
    });
  } else {
    if (V.cities.length !== 2) errors.push(`${where}: cities must be Kolkata and Saharsa (${V.cities})`);
    else if (!SAHARSA.includes(plain(V.cities[1]))) errors.push(`${where}: cities[1] must be Saharsa`);
  }
}

/**
 * Validate the four LangFiles against the snapshot.
 * @param {Record<string, any>} files { en, hi, mai, bn } LangFile objects
 * @param {any} content content.json
 * @param {any} ui content/ui.json
 */
export function validateAll(files, content, ui) {
  const errors = [];
  const facts = eventFacts(content.facts);
  errors.push(...validateUi(ui));

  const mapLines = {};
  for (const lang of LANGS) {
    const file = files[lang];
    if (!file) {
      errors.push(`${lang}: file missing`);
      continue;
    }
    const shapeErrors = checkShape(file, LANG_FILE_SHAPE, lang);
    if (shapeErrors.length) {
      errors.push(...shapeErrors);
      continue;
    }
    if (file.lang !== lang) errors.push(`${lang}: lang is "${file.lang}"`);
    if (JSON.stringify(file.meta) !== JSON.stringify(LANG_META[lang]))
      errors.push(`${lang}: meta differs from LANG_META`);
    const meta = content.variants[lang].G.meta;
    if (file.meta.numerals !== meta.numerals)
      errors.push(`${lang}: numerals ${file.meta.numerals} != content ${meta.numerals}`);
    const uiKeys = Object.keys(ui.strings);
    if (Object.keys(file.ui).join() !== uiKeys.join()) errors.push(`${lang}: ui keys differ from content/ui.json`);
    for (const key of uiKeys) {
      const want = ui.strings[key][lang];
      const got = file.ui[key];
      if (JSON.stringify(uiForms(got).map(plain)) !== JSON.stringify(uiForms(want)))
        errors.push(`${lang}.ui.${key} differs from content/ui.json`);
    }

    for (const vk of VARIANT_KEYS) {
      const raw = resolveReception(content.variants[lang][vk[0]], vk[1] === '1');
      validateVariant(errors, file.variants[vk], raw, lang, vk, facts);
      for (const e of file.variants[vk].events) (mapLines[e.key] ??= new Set()).add(e.mapQuery);
      for (const d of file.variants[vk].days) (mapLines[`day:${d.dateIso}`] ??= new Set()).add(d.mapQuery);
    }
    // honorifics belong to their person in both orders
    const { G1, B1 } = file.variants;
    if (
      G1.names.first.honorific !== B1.names.second.honorific ||
      G1.names.second.honorific !== B1.names.first.honorific
    )
      errors.push(`${lang}: honorifics change owner between G and B`);

    // forbidden words, phone-like numbers, Latin digits and letters outside en, spacing
    errors.push(...textViolations({ ui: file.ui, variants: file.variants }, lang));
    errors.push(...scriptViolations({ ui: file.ui, variants: file.variants }, lang, lang));
  }

  // map_line_en identical across all 8 variants (spec 4.1 step 4)
  for (const [key, set] of Object.entries(mapLines)) {
    if (set.size !== 1) errors.push(`map_line_en for ${key} differs across variants: ${[...set].join(' | ')}`);
  }
  return errors;
}
