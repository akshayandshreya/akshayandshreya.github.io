// G-FACT-1, G-FACT-2, G-ORDER-1, G-REC-1 on the generated JSON (spec 8.0), and the generator's validations.
import { describe, expect, it } from 'vitest';
import content from '../../content/content.json';
import ui from '../../content/ui.json';
import { validateAll, textViolations } from '../../scripts/lib/validate.mjs';
import { buildLangFile } from '../../scripts/lib/model.mjs';
import { EVENT_FACTS, WEDDING_START_UTC } from '../../src/generated/facts';
import { UI_KEYS } from '../../src/generated/ui-keys';
import type { Lang, VariantKey } from '../../src/i18n/types';
import { FILES, plainText } from '../helpers';

const LANGS: Lang[] = ['en', 'hi', 'mai', 'bn'];
const KEYS: VariantKey[] = ['G1', 'G0', 'B1', 'B0'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- content.json is untyped
const raw = (lang: Lang, order: 'G' | 'B') => (content.variants as Record<string, Record<string, any>>)[lang]![order]!;

describe('generated copy', () => {
  it('passes every validation of spec 4.1', () => {
    expect(validateAll(FILES, content, ui)).toEqual([]);
  });

  it('is up to date with the snapshot (same as a fresh generation, ignoring generatedAt)', () => {
    for (const lang of LANGS) {
      const fresh = buildLangFile(content, ui, lang);
      const { source: _s, ...committed } = FILES[lang];
      expect(committed).toEqual(fresh);
    }
  });

  it('computes the UTC starts from IST', () => {
    expect(EVENT_FACTS.mehndi.startUtc).toBe('2026-11-25T05:30:00Z');
    expect(EVENT_FACTS.engagement.startUtc).toBe('2026-11-25T12:30:00Z');
    expect(EVENT_FACTS.haldi.startUtc).toBe('2026-11-26T04:30:00Z');
    expect(EVENT_FACTS.wedding.startUtc).toBe('2026-11-26T12:30:00Z');
    expect(EVENT_FACTS.reception.startUtc).toBe('2026-11-29T13:30:00Z');
    expect(WEDDING_START_UTC).toBe('2026-11-26T12:30:00Z');
  });

  it('has every UI key in every language', () => {
    for (const lang of LANGS) for (const key of UI_KEYS) expect(FILES[lang].ui[key], `${lang} ${key}`).toBeTruthy();
  });

  for (const lang of LANGS) {
    describe(lang, () => {
      it('G: groom first, AS, Jha family first; B: bride first, SA, Sil family first', () => {
        const g = FILES[lang].variants.G1;
        const b = FILES[lang].variants.B1;
        expect(plainText(g.names.first.text)).toBe(raw(lang, 'G').names.first);
        expect(g.names.first.role).toBe('groom');
        expect(g.monogram).toBe('AS');
        expect(b.names.first.role).toBe('bride');
        expect(b.monogram).toBe('SA');
        expect(plainText(g.closing.families[0])).toBe(raw(lang, 'G').regards_families_lines[0]);
        expect(plainText(b.closing.families[0])).toBe(raw(lang, 'B').regards_families_lines[0]);
        expect(g.pair.text).toBe(raw(lang, 'G').names.pair_short);
        expect(b.pair.text).toBe(raw(lang, 'B').names.pair_short);
        expect(g.head.title.startsWith(raw(lang, 'G').names.pair_short)).toBe(true);
      });

      it('reception=0 drops the Reception everywhere', () => {
        for (const key of ['G0', 'B0'] as const) {
          const v = FILES[lang].variants[key];
          expect(v.events.map((e) => e.key)).toEqual(['mehndi', 'engagement', 'haldi', 'wedding']);
          expect(v.cities).toHaveLength(1);
          expect(v.days.every((d) => d.city === 0)).toBe(true);
          expect(v.dateline.dates).not.toMatch(/29|२९|২৯/);
          expect(v.head.description).not.toMatch(/29|२९|২৯/);
        }
        for (const key of ['G1', 'B1'] as const) {
          expect(FILES[lang].variants[key].events.map((e) => e.key)).toContain('reception');
          expect(FILES[lang].variants[key].cities).toHaveLength(2);
        }
      });

      it('event facts equal content.json byte for byte (hygiene characters aside)', () => {
        for (const key of KEYS) {
          const v = FILES[lang].variants[key];
          const r = raw(lang, key[0] as 'G' | 'B');
          for (const e of v.events) {
            const re = r.events[e.key];
            expect(plainText(e.title)).toBe(re.title);
            expect(plainText(e.dateTime)).toBe(re.date_time);
            expect(plainText(e.venue)).toBe(re.venue_name_full);
            expect(plainText(e.address.join(' '))).toBe(re.venue_address);
            expect(e.mapQuery).toBe(re.map_line_en);
          }
        }
      });

      it('honorifics sit with their own person in both orders', () => {
        const g = FILES[lang].variants.G1.names;
        const b = FILES[lang].variants.B1.names;
        expect(g.first.honorific).toBe(b.second.honorific);
        expect(g.second.honorific).toBe(b.first.honorific);
      });

      it('the closing request splits into two lines that join back', () => {
        const c = FILES[lang].variants.G1.closing;
        expect(plainText(`${c.bigLines[0]} ${c.bigLines[1]}`)).toBe(plainText(c.big));
      });
    });
  }

  it('hi/mai carry the shloka on two lines; en/bn have none', () => {
    expect(FILES.hi.variants.G1.shloka).toHaveLength(2);
    expect(FILES.mai.variants.B0.shloka).toHaveLength(2);
    expect(FILES.en.variants.G1.shloka).toBeNull();
    expect(FILES.bn.variants.G1.shloka).toBeNull();
  });

  it('invocations are data-driven (A-OPEN-3)', () => {
    expect(FILES.en.variants.G1.invocationSecondary).toBeNull();
    expect(FILES.en.variants.B1.invocationSecondary).toBe('Sri Sri Prajapataye Namah');
    expect(FILES.bn.variants.G1.invocationSecondary).toBe('শ্রী গণেশায় নমঃ');
    expect(FILES.bn.variants.B1.invocationSecondary).toBeNull();
  });
});

describe('validations catch bad copy', () => {
  it('flags forbidden words and phone-like digit runs', () => {
    expect(textViolations({ a: 'a golden Fish' }, 'x')).toHaveLength(1);
    expect(textViolations({ a: 'मछली' }, 'x')).toHaveLength(1);
    expect(textViolations({ a: 'call ৯৮৭৬৫৪৩২১০' }, 'x')).toHaveLength(1);
    expect(textViolations({ a: 'PIN ८५२२०१' }, 'x')).toEqual([]);
    expect(textViolations({ a: 'code 123456' }, 'x')).toHaveLength(1);
  });

  it('flags a G variant that puts the bride first', () => {
    const broken = structuredClone(FILES);
    const v = broken.en.variants.G1;
    [v.names.first, v.names.second] = [v.names.second, v.names.first];
    v.monogram = 'SA';
    const errors = validateAll(broken, content, ui);
    expect(errors.some((e: string) => e.includes('names.first must be the groom'))).toBe(true);
    expect(errors.some((e: string) => e.includes('monogram must be AS'))).toBe(true);
  });

  it('flags a reception=0 variant that still lists the Reception', () => {
    const broken = structuredClone(FILES);
    broken.hi.variants.B0 = broken.hi.variants.B1;
    expect(validateAll(broken, content, ui).some((e: string) => e.startsWith('hi.B0'))).toBe(true);
  });

  it('flags Latin digits outside en', () => {
    const broken = structuredClone(FILES);
    broken.bn.variants.G1.events[0]!.date = '25 নভেম্বর';
    expect(validateAll(broken, content, ui).some((e: string) => e.includes('Latin digits'))).toBe(true);
  });
});
