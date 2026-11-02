import { describe, expect, it } from 'vitest';
import { deepMerge, resolveReception, withoutReception } from '../../scripts/lib/merge.mjs';
import content from '../../content/content.json';

describe('deepMerge (card.js semantics)', () => {
  it('merges objects key by key, replaces arrays and strings, deletes on null', () => {
    const a = { x: { y: 1, z: 2 }, arr: [1, 2, 3], s: 'a', gone: 1 };
    const b = { x: { z: 3 }, arr: [9], s: 'b', gone: null };
    expect(deepMerge(a, b)).toEqual({ x: { y: 1, z: 3 }, arr: [9], s: 'b' });
  });
  it('does not mutate its inputs', () => {
    const a = { x: { y: 1 } };
    deepMerge(a, { x: { y: 2 } });
    expect(a).toEqual({ x: { y: 1 } });
  });
});

describe('withoutReception', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- content.json is untyped
  const variants = content.variants as Record<string, Record<string, Record<string, any>>>;
  for (const lang of ['en', 'hi', 'mai', 'bn']) {
    for (const order of ['G', 'B']) {
      it(`${lang}_${order}: four events, no Reception, Kolkata only`, () => {
        const v = variants[lang]![order]!;
        const w = withoutReception(v);
        expect(w.events_order).toEqual(['mehndi', 'engagement', 'haldi', 'wedding']);
        expect(w.events.reception).toBeUndefined();
        expect(w.city).not.toMatch(/·/);
        expect(w.save_the_date.line).not.toMatch(/29|२९|২৯/);
        expect(w.single_page.days).toHaveLength(2);
        expect(w.without_reception).toBeUndefined();
        // untouched fields stay byte-identical
        expect(w.host_line).toBe(v.host_line);
        expect(w.events.wedding).toEqual(v.events.wedding);
      });
    }
  }
  it('reception=1 keeps the stored copy and drops only the overlay', () => {
    const v = variants.en!.G!;
    const r = resolveReception(v, true);
    expect(r.events_order).toHaveLength(5);
    expect(r.without_reception).toBeUndefined();
  });
  it('throws without an overlay', () => {
    expect(() => withoutReception({ variant_id: 'x' })).toThrow(/no without_reception/);
  });
});
