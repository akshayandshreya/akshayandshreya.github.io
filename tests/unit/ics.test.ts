// A-EV-5 (.ics) and A-EV-6 (Google Calendar link), spec 2.3.4 and 8.4.
// The validator in ./support/ics.ts is independent of the code under test and is checked first on its own.
// The contract tests switch on by themselves when src/lib/ics.ts and src/lib/google-calendar.ts exist; the contract
// (exports and options) is written down in docs/QA.md ("Contracts the tests rely on").
import { describe, expect, it } from 'vitest';
import type { EventCopy, Lang, VariantKey } from '../../src/i18n/types';
import { FILES, plainText } from '../helpers';
import {
  escapeReference,
  events,
  foldReference,
  icsUtc,
  octets,
  parseIcs,
  prop,
  unescapeText,
  validateIcs,
  validateIcsBytes,
} from './support/ics';

const LANGS: Lang[] = ['en', 'hi', 'mai', 'bn'];
const KEYS: VariantKey[] = ['G1', 'G0', 'B1', 'B0'];
const NOW = Date.parse('2026-11-02T10:00:00Z');

/* eslint-disable @typescript-eslint/no-explicit-any -- optional modules, typed by the contract below */
const icsMod = Object.values(import.meta.glob('../../src/lib/ics.ts', { eager: true }))[0] as any;
const gcalMod = Object.values(import.meta.glob('../../src/lib/google-calendar.ts', { eager: true }))[0] as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

// the contract: buildIcs(events, { pair, durationMinutes, url, now? }), icsFileName(events),
// googleCalendarUrl(event, { pair, durationMinutes, url }); `url` is the page URL (null without VITE_SITE_URL)
interface IcsOptions {
  pair: string;
  now?: number;
  url?: string | null;
  durationMinutes?: number | null;
}
const buildIcs = (evs: EventCopy[], o: IcsOptions): string =>
  icsMod.buildIcs(evs, {
    pair: o.pair,
    durationMinutes: o.durationMinutes ?? null,
    url: o.url ?? null,
    now: o.now === undefined ? undefined : new Date(o.now),
  });
const googleUrl = (ev: EventCopy, o: Omit<IcsOptions, 'now'>): string =>
  gcalMod.googleCalendarUrl(ev, { pair: o.pair, durationMinutes: o.durationMinutes ?? null, url: o.url ?? null });

describe('the .ics validator itself', () => {
  const cal = (body: string[]) =>
    ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//t//t//EN', ...body, 'END:VCALENDAR', ''].join('\r\n');
  const ev = (extra: string[] = []) => [
    'BEGIN:VEVENT',
    'UID:a@b',
    'DTSTAMP:20261102T100000Z',
    'DTSTART:20261126T123000Z',
    'SUMMARY:Wedding',
    ...extra,
    'END:VEVENT',
  ];

  it('accepts a minimal valid file', () => {
    expect(validateIcs(cal(ev()))).toEqual([]);
  });
  it('rejects LF line ends, long lines, unescaped commas, local times and bad escapes', () => {
    expect(validateIcs(cal(ev()).replace(/\r\n/g, '\n'))).not.toEqual([]);
    expect(validateIcs(cal(ev([`DESCRIPTION:${'x'.repeat(80)}`])))[0]).toMatch(/octets/);
    expect(validateIcs(cal(ev(['LOCATION:Kolkata, India'])))[0]).toMatch(/unescaped/);
    expect(validateIcs(cal(ev()).replace('DTSTART:20261126T123000Z', 'DTSTART:20261126T180000'))[0]).toMatch(/UTC/);
    expect(validateIcs(cal(ev(['DESCRIPTION:a\\qb'])))[0]).toMatch(/invalid escape/);
  });
  it('rejects a fold that cuts a multi-byte sequence', () => {
    const bengali = 'অ'.repeat(30); // 3 octets each
    const good = cal(ev([foldReference(`SUMMARY;LANGUAGE=bn:${bengali}`)]).filter((l) => l !== 'SUMMARY:Wedding'));
    expect(validateIcs(good)).toEqual([]);
    // a fold after 74 octets cuts the 25th "অ" (octets 73-75) in two: the validator must see it on the byte level
    const prefix = 'DESCRIPTION:' + 'অ'.repeat(20) + 'x'; // 12 + 60 + 1 = 73 octets, then a 3-octet character
    const bytes = new TextEncoder().encode(`${prefix}অঅ`);
    const crlf = new TextEncoder().encode('\r\n ');
    const broken = new Uint8Array([...bytes.subarray(0, 74), ...crlf, ...bytes.subarray(74)]);
    expect(validateIcsBytes(cal(ev(['@@']))
      .split('@@')
      .map((p) => new TextEncoder().encode(p))
      .reduce((a, b) => new Uint8Array([...a, ...broken, ...b])))).toContainEqual(expect.stringMatching(/UTF-8/));
  });
  it('folds and unescapes losslessly', () => {
    const text = 'मेहँदी · अक्षय & श्रेया; Agora Banquets, 67\\Kolkata\nline two'.repeat(3);
    const folded = foldReference(`DESCRIPTION:${escapeReference(text)}`);
    for (const line of folded.split('\r\n')) expect(octets(line)).toBeLessThanOrEqual(75);
    const parsed = parseIcs(cal(ev([folded])));
    expect(unescapeText(prop(events(parsed)[0]!, 'DESCRIPTION')!.value)).toBe(text);
  });
  it('writes UTC date-times in the ICS basic form', () => {
    expect(icsUtc('2026-11-26T12:30:00Z')).toBe('20261126T123000Z');
  });
});

describe.skipIf(!icsMod)('src/lib/ics.ts (A-EV-5)', () => {
  it('exports buildIcs(events, { pair, durationMinutes, url, now })', () => {
    expect(typeof icsMod?.buildIcs).toBe('function');
  });

  for (const lang of LANGS) {
    for (const key of KEYS) {
      it(`${lang} ${key}: the "all" file is valid RFC 5545 with every event of the variant`, () => {
        const v = FILES[lang].variants[key];
        const text = buildIcs(v.events, { pair: v.pair.text, now: NOW, url: null, durationMinutes: null });
        expect(validateIcs(text)).toEqual([]);
        const cal = parseIcs(text);
        expect(prop(cal, 'PRODID')?.value).toBe('-//Akshay & Shreya//Wedding//EN');
        expect(prop(cal, 'CALSCALE')?.value).toBe('GREGORIAN');
        expect(prop(cal, 'METHOD')?.value).toBe('PUBLISH');
        const evs = events(cal);
        expect(evs).toHaveLength(key.endsWith('1') ? 5 : 4); // G-REC-1: no Reception VEVENT with reception=0
        evs.forEach((ev, i) => {
          const e = v.events[i]!;
          const t = (name: string) => plainText(unescapeText(prop(ev, name)?.value ?? ''));
          expect(prop(ev, 'UID')?.value).toBe(`${e.key}-${e.dateIso.replace(/-/g, '')}@akshay-shreya.wedding`);
          expect(prop(ev, 'DTSTART')?.value).toBe(icsUtc(e.startUtc));
          expect(prop(ev, 'DTSTAMP')?.value).toBe(icsUtc(new Date(NOW).toISOString()));
          expect(prop(ev, 'DTEND')).toBeUndefined(); // O3: point-in-time events
          // SUMMARY in the page language, the variant's pair order (G-ORDER-1)
          expect(t('SUMMARY')).toBe(plainText(`${e.title} · ${v.pair.text}`));
          expect(t('LOCATION')).toBe(e.mapQuery); // English, as the map line
          expect(t('DESCRIPTION').split('\n')[0]).toBe(plainText(`${e.venue}, ${e.address.join(' ')}`));
        });
      });
    }
  }

  it('one file per event, DTEND only with a configured duration, the site URL when known', () => {
    const v = FILES.bn.variants.B1;
    const wedding = v.events.find((e) => e.key === 'wedding')!;
    const text = buildIcs([wedding], {
      pair: v.pair.text,
      now: NOW,
      url: 'https://example.com/bn/',
      durationMinutes: 90,
    });
    expect(validateIcs(text)).toEqual([]);
    const [ev] = events(parseIcs(text));
    expect(prop(ev!, 'DTSTART')?.value).toBe('20261126T123000Z');
    expect(prop(ev!, 'DTEND')?.value).toBe('20261126T140000Z');
    expect(unescapeText(prop(ev!, 'DESCRIPTION')!.value)).toMatch(/\nhttps:\/\/example\.com\/bn\/$/);
    expect(prop(ev!, 'URL')?.value).toBe('https://example.com/bn/');
    expect(plainText(unescapeText(prop(ev!, 'SUMMARY')!.value))).toBe(plainText(`${wedding.title} · ${v.pair.text}`));
  });

  it('folds long Devanagari and Bengali lines at 75 octets without splitting a character', () => {
    for (const lang of ['hi', 'mai', 'bn'] as const) {
      const v = FILES[lang].variants.G1;
      const text = buildIcs(v.events, { pair: v.pair.text, now: NOW, url: 'https://example.com/hi/', durationMinutes: null });
      const lines = text.split('\r\n');
      expect(lines.some((l) => l.startsWith(' ')), `${lang}: something must be folded`).toBe(true);
      expect(validateIcs(text)).toEqual([]);
    }
  });

  it.skipIf(typeof icsMod?.icsFileName !== 'function')('names the files akshay-shreya-<event>.ics / -celebrations.ics', () => {
    const evs = FILES.en.variants.G1.events;
    expect(icsMod.icsFileName(evs.filter((e) => e.key === 'haldi'))).toBe('akshay-shreya-haldi.ics');
    expect(icsMod.icsFileName(evs)).toBe('akshay-shreya-celebrations.ics');
  });
});

describe.skipIf(!gcalMod)('src/lib/google-calendar.ts (A-EV-6)', () => {
  it('exports googleCalendarUrl(event, { pair, durationMinutes, url })', () => {
    expect(typeof gcalMod?.googleCalendarUrl).toBe('function');
  });

  for (const lang of LANGS) {
    it(`${lang}: a prefilled event at the right instant, start/start without a duration`, () => {
      const v = FILES[lang].variants.G1;
      for (const e of v.events) {
        const u = new URL(googleUrl(e, { pair: v.pair.text, durationMinutes: null, url: null }));
        expect(`${u.origin}${u.pathname}`).toBe('https://calendar.google.com/calendar/render');
        expect(u.searchParams.get('action')).toBe('TEMPLATE');
        expect(u.searchParams.get('dates')).toBe(`${icsUtc(e.startUtc)}/${icsUtc(e.startUtc)}`);
        expect(u.searchParams.get('ctz')).toBe('Asia/Kolkata');
        expect(plainText(u.searchParams.get('text') ?? '')).toBe(plainText(`${e.title} · ${v.pair.text}`));
        expect(u.searchParams.get('location')).toBe(e.mapQuery);
        expect(plainText(u.searchParams.get('details') ?? '')).toContain(plainText(e.venue));
      }
    });
  }

  it('uses start + durationMinutes as the end when configured', () => {
    const e = FILES.en.variants.G1.events.find((x) => x.key === 'reception')!;
    const u = new URL(googleUrl(e, { pair: 'Akshay & Shreya', durationMinutes: 120, url: null }));
    expect(u.searchParams.get('dates')).toBe('20261129T133000Z/20261129T153000Z');
  });
});
