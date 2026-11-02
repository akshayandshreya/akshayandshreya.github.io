import { describe, expect, it } from 'vitest';
import { joinHyphens, keep, NBSP, plain, splitAddress, WJ } from '../../scripts/lib/hygiene.mjs';

describe('keep()', () => {
  it('en: Block H, Gate No.2, bus stand, Bose Rd stay whole', () => {
    expect(keep('67, Nalini Ranjan Ave, Block H, New Alipore', 'en')).toContain(`Block${NBSP}H,`);
    expect(keep('Roy Bari Events, Gate No.2', 'en')).toContain(`Gate${NBSP}No.2`);
    expect(keep('near the bus stand, Sant Nagar', 'en')).toContain(`bus${NBSP}stand`);
    expect(keep('Netaji Subhas Chandra Bose Rd, Regent Park', 'en')).toContain(`Bose${NBSP}Rd,`);
  });
  it('hi/mai: a postposition never starts a line; शुभ stays with its noun; नं. with its number', () => {
    expect(keep('बस स्टैंड के पास, संत नगर', 'hi')).toBe(`बस${NBSP}स्टैंड${NBSP}के${NBSP}पास, संत नगर`);
    expect(keep('शुभ विवाह', 'mai')).toBe(`शुभ${NBSP}विवाह`);
    expect(keep('गेट नं. २', 'hi')).toBe(`गेट नं.${NBSP}२`);
  });
  it('bn: শুভ and নং stay with the next word', () => {
    expect(keep('শুভ বিবাহ', 'bn')).toBe(`শুভ${NBSP}বিবাহ`);
    expect(keep('গেট নং ২', 'bn')).toBe(`গেট নং${NBSP}২`);
  });
  it('full names and their honorifics never break', () => {
    const out = keep('to Akshay Anand with Shreya Sil', 'en', [{ name: 'Akshay Anand' }, { name: 'Shreya Sil' }]);
    expect(out).toBe(`to Akshay${NBSP}Anand with Shreya${NBSP}Sil`);
    const hi = keep('चि. अक्षय आनंद', 'hi', [{ name: 'अक्षय आनंद', honorific: 'चि.' }]);
    expect(hi).toBe(`चि.${NBSP}अक्षय${NBSP}आनंद`);
  });
  it('plain() undoes the hygiene characters', () => {
    expect(plain(keep('शुभ विवाह के पास', 'hi'))).toBe('शुभ विवाह के पास');
  });
});

describe('joinHyphens()', () => {
  it('puts U+2060 on both sides of a hyphen', () => {
    expect(joinHyphens('गुरुजन-परिजनक')).toBe(`गुरुजन${WJ}-${WJ}परिजनक`);
  });
});

describe('splitAddress()', () => {
  const cases = [
    '67, Nalini Ranjan Ave, Block H, New Alipore, Kolkata',
    '192B & C, Netaji Subhas Chandra Bose Rd, Regent Park, Kolkata',
    'Gangjala Chowk Dhala, near the bus stand, Sant Nagar, Saharsa, Bihar 852201',
    '१९२-बी एवं सी, नेताजी सुभाष चंद्र बोस रोड, रीजेंट पार्क, कोलकाता',
    'গংজলা চক ঢালা, বাস স্ট্যান্ডের কাছে, সন্ত নগর, সহরসা, বিহার ৮৫২২০১',
  ];
  for (const s of cases) {
    it(`two lines that join back: ${s.slice(0, 24)}…`, () => {
      const [a, b] = splitAddress(s);
      expect(a.endsWith(',')).toBe(true);
      expect(`${a} ${b}`).toBe(s);
      expect(b.length).toBeGreaterThan(0);
    });
  }
  it('minimises the longer line', () => {
    expect(splitAddress('Gangjala Chowk Dhala, near the bus stand, Sant Nagar, Saharsa, Bihar 852201')).toEqual([
      'Gangjala Chowk Dhala, near the bus stand,',
      'Sant Nagar, Saharsa, Bihar 852201',
    ]);
  });
  it('refuses an address without a comma', () => {
    expect(() => splitAddress('Kolkata')).toThrow();
  });
});
