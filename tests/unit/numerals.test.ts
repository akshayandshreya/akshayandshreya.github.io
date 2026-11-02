import { describe, expect, it } from 'vitest';
import { padNative, pluralCategory, toLatinDigits, toNativeDigits } from '../../src/lib/numerals';
import { bengaliGenitive, translate } from '../../src/i18n/translate';
import { formatDate } from '../../src/lib/dates';
import { FILES, plainText } from '../helpers';

describe('numerals (spec 4.5)', () => {
  it('maps digits per system', () => {
    expect(toNativeDigits(2026, 'latin')).toBe('2026');
    expect(toNativeDigits(2026, 'devanagari')).toBe('२०२६');
    expect(toNativeDigits('29', 'bengali')).toBe('২৯');
    expect(toLatinDigits('৮৫২২০১ / ८५२२०१')).toBe('852201 / 852201');
  });
  it('pads with the native zero', () => {
    expect(padNative(7, 2, 'devanagari')).toBe('०७');
    expect(padNative(5, 2, 'bengali')).toBe('০৫');
    expect(padNative(12, 2, 'latin')).toBe('12');
  });
  it('plural categories', () => {
    expect(pluralCategory('en', 1)).toBe('one');
    expect(pluralCategory('en', 2)).toBe('other');
    expect(pluralCategory('hi', 1)).toBe('one');
    expect(pluralCategory('hi', 3)).toBe('other');
    expect(pluralCategory('bn', 1)).toBe('other');
  });
});

describe('translate (t)', () => {
  it('plural forms (A-CD-2)', () => {
    expect(translate(FILES.en.ui, 'en', 'countdown.days', undefined, 1)).toBe('day');
    expect(translate(FILES.en.ui, 'en', 'countdown.days', undefined, 24)).toBe('days');
    expect(translate(FILES.hi.ui, 'hi', 'countdown.hours', undefined, 1)).toBe('घंटा');
    expect(translate(FILES.hi.ui, 'hi', 'countdown.hours', undefined, 5)).toBe('घंटे');
  });
  it('interpolates numbers in native digits', () => {
    expect(plainText(translate(FILES.bn.ui, 'bn', 'countdown.sr', { d: 24, h: 3, m: 5 }))).toBe(
      'শুভ বিবাহের আর ২৪ দিন, ৩ ঘণ্টা ও ৫ মিনিট বাকি',
    );
    expect(plainText(translate(FILES.en.ui, 'en', 'countdown.sr', { d: 24, h: 3, m: 5 }))).toBe(
      '24 days, 3 hours and 5 minutes until the wedding',
    );
  });
  it('the Bengali genitive (spec 4.7)', () => {
    expect(bengaliGenitive('মেহেন্দি')).toBe('র');
    expect(bengaliGenitive('বাগদান')).toBe('ের');
    expect(bengaliGenitive('গায়ে হলুদ')).toBe('ের');
    expect(plainText(translate(FILES.bn.ui, 'bn', 'alt.couple', { event: 'মেহেন্দি' }))).toBe(
      'মেহেন্দির সাজে বর-কনের ছবি',
    );
    expect(plainText(translate(FILES.mai.ui, 'mai', 'alt.couple', { event: 'सगाई' }))).toBe(
      'सगाईक परिधानमे वर-कनियाँक चित्र',
    );
  });
});

describe('formatDate', () => {
  it('formats in IST with native digits', () => {
    const t = '2026-11-25T20:00:00Z'; // 01:30 on the 26th in Kolkata
    expect(formatDate(t, 'en')).toMatch(/26/);
    expect(formatDate(t, 'hi')).toMatch(/२६/);
    expect(formatDate(t, 'bn')).toMatch(/২৬/);
    expect(formatDate(t, 'mai')).toMatch(/२६/);
  });
});
