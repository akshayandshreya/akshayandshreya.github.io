import { describe, expect, it } from 'vitest';
import { parseVariant } from '../../src/state/variant';

describe('parseVariant (?side, ?reception)', () => {
  it('defaults to groom-first with the Reception', () =>
    expect(parseVariant('')).toEqual({ side: 'groom', reception: true, key: 'G1', path: null }));
  it('side=bride', () => expect(parseVariant('?side=bride').key).toBe('B1'));
  it('side=b and reception=0', () => expect(parseVariant('?side=b&reception=0').key).toBe('B0'));
  it("the engine's order=B", () => expect(parseVariant('?order=B').key).toBe('B1'));
  it('reception false/no/off', () => {
    for (const v of ['false', 'no', 'off', 'OFF', '0']) expect(parseVariant(`?reception=${v}`).reception).toBe(false);
  });
  it('reception true/yes/on', () => {
    for (const v of ['true', 'yes', 'on', '1']) expect(parseVariant(`?reception=${v}`).reception).toBe(true);
  });
  it('invalid values fall back to the defaults', () =>
    expect(parseVariant('?side=both&reception=maybe').key).toBe('G1'));
  it('ignores unknown parameters', () => expect(parseVariant('?utm=x&side=groom').key).toBe('G1'));

  it('the variant path sets the defaults, the query wins (QA r1 T1)', () => {
    expect(parseVariant('', 'B1').key).toBe('B1');
    expect(parseVariant('', 'G0').key).toBe('G0');
    expect(parseVariant('', 'B0')).toEqual({ side: 'bride', reception: false, key: 'B0', path: 'B0' });
    expect(parseVariant('?reception=0', 'B1').key).toBe('B0');
    expect(parseVariant('?side=groom', 'B0').key).toBe('G0');
    expect(parseVariant('?order=G', 'B1').key).toBe('G1');
    // an invalid value falls back to the path's variant
    expect(parseVariant('?side=both&reception=maybe', 'B0').key).toBe('B0');
  });
});
