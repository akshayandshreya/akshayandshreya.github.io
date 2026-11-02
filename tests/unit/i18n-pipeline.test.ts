// The i18n pipeline beyond the scaffold checks (spec 4.1-4.5, 4.8): line-break rules, the strict schema, the UI-string
// rules, the extra fact checks, plural placeholders and the native review table.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import content from '../../content/content.json';
import ui from '../../content/ui.json';
import { bindUnits, hygiene, NBSP, plain, WJ } from '../../scripts/lib/hygiene.mjs';
import {
  checkShape,
  LANG_FILE_SHAPE,
  scriptViolations,
  textViolations,
  validateAll,
  validateUi,
} from '../../scripts/lib/validate.mjs';
import { parseReviewTable, renderReviewTable, reviewDocErrors, updateReviewDoc } from '../../scripts/lib/review.mjs';
import { placeholders, translate } from '../../src/i18n/translate';
import type { Lang, LangFile, VariantKey } from '../../src/i18n/types';
import { FILES } from '../helpers';

const LANGS: Lang[] = ['en', 'hi', 'mai', 'bn'];
const KEYS: VariantKey[] = ['G1', 'G0', 'B1', 'B0'];
const clone = () => structuredClone(FILES) as Record<Lang, LangFile>;
const errorsOf = (files: Record<Lang, LangFile>) => validateAll(files, content, ui) as string[];
const uiClone = () =>
  structuredClone(ui) as { strings: Record<string, Record<string, unknown>> } & Record<string, unknown>;

/** Every string shown in the page body (data fields and the <head> strings excluded). */
function displayStrings(file: LangFile): string[] {
  const out: string[] = [];
  const data = new Set(['mapQuery', 'startUtc', 'dateIso', 'venueKey', 'key', 'role', 'monogram']);
  const walk = (v: unknown, key = '') => {
    if (typeof v === 'string') {
      if (!data.has(key)) out.push(v);
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'head') walk(x, k);
  };
  walk(file.variants);
  walk(file.ui);
  return out;
}

describe('line-break rules (spec 4.4)', () => {
  it('a number stays with its unit', () => {
    expect(bindUnits('26 November · 6:00 PM', 'en')).toBe(`26${NBSP}November${NBSP}· 6:00${NBSP}PM`);
    expect(bindUnits('२६ नवंबर · संध्या ६ बजे', 'hi')).toBe(`२६${NBSP}नवंबर${NBSP}· संध्या${NBSP}६${NBSP}बजे`);
    expect(bindUnits('२५, २६ आ २९ नवम्बर', 'mai')).toBe(`२५, २६${NBSP}आ${NBSP}२९${NBSP}नवम्बर`);
    expect(bindUnits('২৬শে নভেম্বর · সন্ধ্যা ৬টা', 'bn')).toBe(`২৬শে${NBSP}নভেম্বর${NBSP}· সন্ধ্যা${NBSP}৬টা`);
  });
  it('a conjunction never ends a line; after a number it stays with the number', () => {
    expect(bindUnits('Mithila & Bengal', 'en')).toBe(`Mithila &${NBSP}Bengal`);
    expect(bindUnits('music and laughter', 'en')).toBe(`music and${NBSP}laughter`);
    expect(bindUnits('Anand & Shreya', 'en')).toBe(`Anand &${NBSP}Shreya`);
    expect(bindUnits('192B & C, Netaji', 'en')).toBe(`192B${NBSP}&${NBSP}C, Netaji`);
    expect(bindUnits('मिथिला और बंगाल', 'hi')).toBe(`मिथिला और${NBSP}बंगाल`);
    expect(bindUnits('२५, २६ एवं २९ नवंबर', 'hi')).toBe(`२५, २६${NBSP}एवं${NBSP}२९${NBSP}नवंबर`);
    expect(bindUnits('मिथिला आ बंगाल', 'mai')).toBe(`मिथिला आ${NBSP}बंगाल`);
    expect(bindUnits('वे आ गए', 'hi')).toBe('वे आ गए');
    expect(bindUnits('মিথিলা ও বাংলা', 'bn')).toBe(`মিথিলা ও${NBSP}বাংলা`);
    expect(bindUnits('২৫, ২৬ ও ২৯শে নভেম্বর', 'bn')).toBe(`২৫, ২৬${NBSP}ও${NBSP}২৯শে${NBSP}নভেম্বর`);
    // words that only contain a conjunction are untouched
    expect(bindUnits('Anand Sandy', 'en')).toBe('Anand Sandy');
    for (const s of ['Mithila & Bengal', 'मिथिला और बंगाल', '২৫, ২৬ ও ২৯শে নভেম্বর'])
      expect(plain(bindUnits(s, 'en'))).toBe(s);
  });
  it('no line starts with the dot separator or a lone danda', () => {
    expect(bindUnits('Kolkata · Saharsa', 'en')).toBe(`Kolkata${NBSP}· Saharsa`);
    expect(bindUnits('॥ श्री गणेशाय नमः ॥', 'hi')).toBe(`॥${NBSP}श्री गणेशाय नमः${NBSP}॥`);
  });
  it('hyphens are joined only in the host line (card.js); no U+2060 elsewhere (the Indic subsets lack it)', () => {
    expect(bindUnits('वर-कनियाँक नव जीवन', 'mai')).toBe('वर-कनियाँक नव जीवन');
    for (const lang of LANGS)
      for (const key of KEYS) {
        const { host, ...rest } = FILES[lang].variants[key];
        expect(JSON.stringify(rest)).not.toContain(WJ);
        expect(host).not.toMatch(/[^\u2060]-|-[^\u2060]/);
      }
  });
  it('hygiene() = keep() + bindUnits() and plain() gives the input back', () => {
    const s = 'चि. अक्षय आनंद संग शुभ विवाह मे २६ नवम्बर · साँझक ६ बजे, वर-कनियाँक';
    const out = hygiene(s, 'mai', [{ name: 'अक्षय आनंद', honorific: 'चि.' }]);
    expect(out).toContain(`चि.${NBSP}अक्षय${NBSP}आनंद`);
    expect(out).toContain(`शुभ${NBSP}विवाह${NBSP}मे`);
    expect(plain(out)).toBe(s);
  });
  for (const lang of LANGS) {
    it(`${lang}: the generated copy follows the rules`, () => {
      for (const s of displayStrings(FILES[lang])) {
        expect(s, s).not.toMatch(/ ·/); // the dot never starts a line
        expect(s, s).not.toMatch(/[0-9०-९০-৯] (AM|PM|November|नवंबर|नवम्बर|बजे|নভেম্বর)/);
        expect(s, s).not.toMatch(/\u2060\u2060/); // hygiene ran once
      }
    });
  }
});

describe('strict schema (spec 4.2)', () => {
  it('the committed files match it exactly', () => {
    for (const lang of LANGS) expect(checkShape(FILES[lang], LANG_FILE_SHAPE, lang)).toEqual([]);
  });
  it('reports missing, empty and unknown fields', () => {
    const f = clone();
    const v = f.en.variants.G1 as unknown as Record<string, unknown>;
    delete v.heading;
    v.blessing = ' ';
    v.extra = 'x';
    (f.en.variants.G1.events[0] as unknown as Record<string, unknown>).address = ['only one line'];
    const errors = checkShape(f.en, LANG_FILE_SHAPE, 'en');
    expect(errors).toEqual(
      expect.arrayContaining([
        'en.variants.G1.heading: missing',
        'en.variants.G1.blessing: must be a non-empty string',
        'en.variants.G1.extra: unknown field',
        'en.variants.G1.events.0.address: must be a list of 2',
      ]),
    );
    expect(errorsOf(f).some((e) => e.includes('unknown field'))).toBe(true);
  });
});

describe('the fact checks catch broken copy (spec 4.1 step 4)', () => {
  it('a host line that names the wrong family', () => {
    const f = clone();
    f.hi.variants.G1.host = f.hi.variants.B1.host;
    expect(errorsOf(f).some((e) => e.startsWith('hi.G1') && e.includes('host line must name the Jha family'))).toBe(
      true,
    );
  });
  it('the guest family in the wrong place', () => {
    const f = clone();
    const fam = f.bn.variants.B0.closing.families;
    f.bn.variants.B0.closing.families = [fam[2], fam[1], fam[0]];
    expect(errorsOf(f).some((e) => e.startsWith('bn.B0') && e.includes('families[0] must be the Sil family'))).toBe(
      true,
    );
  });
  it('an event date or time that disagrees with facts.events', () => {
    const f = clone();
    const wedding = f.mai.variants.G1.events.find((e) => e.key === 'wedding')!;
    wedding.date = wedding.date.replace('२६', '२७');
    const haldi = f.en.variants.B1.events.find((e) => e.key === 'haldi')!;
    haldi.time = '10:00 PM';
    const errors = errorsOf(f);
    expect(errors.some((e) => e.startsWith('mai.G1') && e.includes('does not show day 26'))).toBe(true);
    expect(errors.some((e) => e.startsWith('en.B1') && e.includes('!= 10:00 AM'))).toBe(true);
  });
  it('a dateline that misses a day, and Saharsa without the Reception', () => {
    const f = clone();
    f.en.variants.G1.dateline.dates = '25 & 26 November';
    f.hi.variants.G0.closing.small += ' सहरसा';
    const errors = errorsOf(f);
    expect(errors.some((e) => e.startsWith('en.G1') && e.includes('dateline days'))).toBe(true);
    expect(errors.some((e) => e.startsWith('hi.G0') && e.includes('Saharsa without the Reception'))).toBe(true);
  });
  it('a map line that differs between variants', () => {
    const f = clone();
    f.bn.variants.B1.events[0]!.mapQuery += ' India';
    expect(errorsOf(f).some((e) => e.includes('map_line_en for mehndi differs'))).toBe(true);
  });
  it('copy that is not the content any more', () => {
    const f = clone();
    f.en.variants.G0.blessing = 'With love,';
    expect(errorsOf(f).some((e) => e.startsWith('en.G0.blessing differs from content'))).toBe(true);
  });
});

describe('text checks (spec 0.2 rules 1-2, 4.1)', () => {
  it('fish in any language, as a whole word or emoji', () => {
    expect(textViolations({ a: 'Machhli motif' }, 'x')).toHaveLength(1);
    expect(textViolations({ a: 'मीन राशि' }, 'x')).toHaveLength(1);
    expect(textViolations({ a: 'ज़मीन' }, 'x')).toEqual([]); // मीन inside another word is fine
    expect(textViolations({ a: 'golden 🐟' }, 'x')).toHaveLength(1);
    expect(textViolations({ a: 'মৎস্যকন্যা' }, 'x')).toHaveLength(1);
  });
  it('phone numbers written in groups or with a country code', () => {
    expect(textViolations({ a: 'call 98765 43210' }, 'x')).toHaveLength(1);
    expect(textViolations({ a: '+91 98765' }, 'x')).toHaveLength(1);
    expect(textViolations({ a: '৯৮৭৬৫-৪৩২১০' }, 'x')).toHaveLength(1);
    expect(textViolations({ a: '25, 26 & 29 November · 11:00 AM, Bihar 852201' }, 'x')).toEqual([]);
  });
  it('Latin letters or digits outside en, except brand names and placeholders', () => {
    expect(scriptViolations({ a: 'Apple · Outlook (.ics)', b: '{event}{gen} সাজে' }, 'bn', 'bn')).toEqual([]);
    expect(scriptViolations({ a: 'गेट No. २' }, 'hi', 'hi')).toHaveLength(1);
    expect(scriptViolations({ a: '२६ November' }, 'mai', 'mai')).toHaveLength(1);
    expect(scriptViolations({ a: ' padded' }, 'en', 'en')).toHaveLength(1);
    expect(scriptViolations({ a: 'two  spaces' }, 'en', 'en')).toHaveLength(1);
  });
});

describe('ui.json rules (spec 4.7)', () => {
  it('the committed ui.json passes', () => {
    expect(validateUi(ui)).toEqual([]);
  });
  it('catches a missing language, a placeholder mismatch, a bad plural and bad review lists', () => {
    const u = uiClone();
    delete u.strings['nav.menu']!.mai;
    u.strings['countdown.sr']!.bn = 'শুভ বিবাহের আর {d} দিন বাকি';
    u.strings['cal.add']!.hi = 'कैलेंडर {x:countdown.nope} में जोड़ें';
    u.strings['countdown.days']!.bn = { one: 'দিন', other: 'দিন' };
    u.strings['music.play']!.hi = 'संगीत {gen} चलाएँ';
    u.strings['gallery.title']!.en = 'Gallery}';
    u.reviewed = ['nav.nope', 'cal.ics.xx'];
    const errors = validateUi(u) as string[];
    const has = (s: string) =>
      expect(
        errors.some((e) => e.includes(s)),
        s,
      ).toBe(true);
    has('ui.nav.menu.mai must be a string or { one, other }');
    has('ui.countdown.sr.bn: placeholders {d} differ from {d,h,m}');
    has('{x:countdown.nope} unknown key');
    has('ui.countdown.days.bn: bn has one plural form');
    has('ui.music.play.hi: {gen} only in bn');
    has('stray brace');
    has('ui.reviewed: unknown key "nav.nope"');
  });
});

describe('translate() placeholders (spec 4.5)', () => {
  it('a sentence agrees with each of its numbers', () => {
    expect(plain(translate(FILES.en.ui, 'en', 'countdown.sr', { d: 1, h: 1, m: 1 }))).toBe(
      '1 day, 1 hour and 1 minute until the wedding',
    );
    expect(plain(translate(FILES.en.ui, 'en', 'countdown.sr', { d: 0, h: 2, m: 30 }))).toBe(
      '0 days, 2 hours and 30 minutes until the wedding',
    );
    expect(plain(translate(FILES.hi.ui, 'hi', 'countdown.sr', { d: 3, h: 1, m: 5 }))).toBe(
      'शुभ विवाह में ३ दिन, १ घंटा और ५ मिनट शेष',
    );
    expect(plain(translate(FILES.hi.ui, 'hi', 'countdown.sr', { d: 3, h: 0, m: 5 }))).toBe(
      'शुभ विवाह में ३ दिन, ० घंटे और ५ मिनट शेष',
    );
    expect(plain(translate(FILES.mai.ui, 'mai', 'countdown.sr', { d: 12, h: 1, m: 0 }))).toBe(
      'शुभ विवाहमे १२ दिन, १ घंटा आ ० मिनट बाँकी',
    );
  });
  it('every UI string renders without a leftover placeholder in every language', () => {
    const vars = { d: 2, h: 3, m: 4, event: 'X' };
    for (const lang of LANGS) {
      for (const key of Object.keys(ui.strings) as (keyof typeof ui.strings)[]) {
        const out = translate(FILES[lang].ui, lang, key, vars);
        expect(out, `${lang} ${key}`).not.toMatch(/[{}]/);
      }
    }
  });
  it('placeholders() lists names and unit keys', () => {
    expect(placeholders('{h} {h:countdown.hours} {gen}')).toEqual([
      { name: 'h', unit: null },
      { name: 'h', unit: 'countdown.hours' },
      { name: 'gen', unit: null },
    ]);
  });
  it('the alt text uses each event title of the variant', () => {
    for (const lang of LANGS)
      for (const key of KEYS)
        for (const e of FILES[lang].variants[key].events) {
          const alt = plain(translate(FILES[lang].ui, lang, 'alt.couple', { event: e.title }));
          expect(alt).toContain(plain(e.title));
        }
    const bn = FILES.bn.variants.G1.events.map((e) =>
      plain(translate(FILES.bn.ui, 'bn', 'alt.couple', { event: e.title })),
    );
    expect(bn).toEqual([
      'মেহেন্দির সাজে বর-কনের ছবি',
      'বাগদানের সাজে বর-কনের ছবি',
      'গায়ে হলুদের সাজে বর-কনের ছবি',
      'শুভ বিবাহের সাজে বর-কনের ছবি',
      'প্রীতিভোজের সাজে বর-কনের ছবি',
    ]);
  });
});

describe('native review table (spec 4.8)', () => {
  const doc = readFileSync(`${process.cwd()}/docs/NATIVE_REVIEW.md`, 'utf8');
  it('docs/NATIVE_REVIEW.md shows the current ui.json', () => {
    expect(reviewDocErrors(doc, ui)).toEqual([]);
  });
  it('lists every key with its check note', () => {
    const table = parseReviewTable(doc)!;
    expect([...table.keys()]).toEqual(Object.keys(ui.strings));
    expect(table.get('countdown.hours')!.hi).toBe('घंटा / घंटे');
    expect(table.get('maps.open')!.bn).toBe('ম্যাপে খুঁজুন (reviewed)');
    expect(table.get('nav.countdown')!.check).toContain('बाँकी दिन');
  });
  it('keeps the reviewers’ answers when the strings change', () => {
    const answers = new Map([['nav.menu', { review: 'ok / ok / ok' }]]);
    const answered = `# x\n\n${renderReviewTable(ui, answers)}\n`;
    expect(parseReviewTable(answered)!.get('nav.menu')!.review).toBe('ok / ok / ok');
    const u = uiClone();
    u.strings['nav.menu']!.hi = 'सूची';
    expect(reviewDocErrors(answered, u).some((e) => e.includes('nav.menu hi'))).toBe(true);
    const updated = updateReviewDoc(answered, u);
    expect(reviewDocErrors(updated, u)).toEqual([]);
    expect(parseReviewTable(updated)!.get('nav.menu')).toMatchObject({ hi: 'सूची', review: 'ok / ok / ok' });
  });
});
