import { describe, expect, it } from 'vitest';
import { detectLang, langHref, normalizeLang, resolvePath, variantPath } from '../../src/lib/langs';

describe('normalizeLang', () => {
  it('accepts codes, endonym-free aliases, any case', () => {
    expect(normalizeLang('en')).toBe('en');
    expect(normalizeLang('EN')).toBe('en');
    expect(normalizeLang('Hindi')).toBe('hi');
    expect(normalizeLang('maithili')).toBe('mai');
    expect(normalizeLang('BANGLA')).toBe('bn');
    expect(normalizeLang('bengali')).toBe('bn');
    expect(normalizeLang('fr')).toBeNull();
    expect(normalizeLang('')).toBeNull();
  });
  it('accepts the endonyms as typed or shared, also percent-encoded (QA r1 I4)', () => {
    expect(normalizeLang('हिन्दी')).toBe('hi');
    expect(normalizeLang('हिंदी')).toBe('hi');
    expect(normalizeLang('मैथिली')).toBe('mai');
    expect(normalizeLang('বাংলা')).toBe('bn');
    expect(normalizeLang('বাঙলা')).toBe('bn');
    expect(normalizeLang(encodeURIComponent('বাংলা'))).toBe('bn');
  });
});

describe('resolvePath (spec 2.1 table)', () => {
  const cases: [string, ReturnType<typeof resolvePath>][] = [
    ['/', { kind: 'root' }],
    ['/en/', { kind: 'page', lang: 'en', variant: null }],
    ['/mai/', { kind: 'page', lang: 'mai', variant: null }],
    ['/bn/b/', { kind: 'page', lang: 'bn', variant: 'B1' }],
    ['/hi/k/', { kind: 'page', lang: 'hi', variant: 'G0' }],
    ['/en/bk/', { kind: 'page', lang: 'en', variant: 'B0' }],
    ['/en/b', { kind: 'redirect', to: '/en/b/' }],
    ['/EN/BK/', { kind: 'redirect', to: '/en/bk/' }],
    ['/bn/kb/', { kind: 'redirect', to: '/bn/bk/' }],
    ['/bn/b/extra', { kind: 'redirect', to: '/bn/b/' }],
    ['/bn/x/', { kind: 'redirect', to: '/bn/' }],
    ['/বাংলা/b/', { kind: 'redirect', to: '/bn/b/' }],
    ['/en', { kind: 'redirect', to: '/en/' }],
    ['/EN/', { kind: 'redirect', to: '/en/' }],
    ['/english', { kind: 'redirect', to: '/en/' }],
    ['/hindi', { kind: 'redirect', to: '/hi/' }],
    ['/maithili/', { kind: 'redirect', to: '/mai/' }],
    ['/bangla', { kind: 'redirect', to: '/bn/' }],
    ['/Bengali', { kind: 'redirect', to: '/bn/' }],
    ['/bn/anything/else', { kind: 'redirect', to: '/bn/' }],
    ['/fr/', { kind: 'redirect', to: '/en/' }],
    ['/random', { kind: 'redirect', to: '/en/' }],
  ];
  for (const [path, want] of cases) it(path, () => expect(resolvePath(path)).toEqual(want));
});

describe('detectLang (2.1.1)', () => {
  it('prefers a stored choice', () => expect(detectLang('bn', ['hi-IN'])).toBe('bn'));
  it('ignores an invalid stored value', () => expect(detectLang('xx', ['hi-IN'])).toBe('hi'));
  it('takes the first supported primary subtag', () => expect(detectLang(null, ['fr-FR', 'bn-IN', 'en'])).toBe('bn'));
  it('mai wins over hi', () => expect(detectLang(null, ['hi-IN', 'mai-IN'])).toBe('mai'));
  it('falls back to en', () => expect(detectLang(null, ['fr', 'de'])).toBe('en'));
  it('handles no languages', () => expect(detectLang(null, undefined)).toBe('en'));
});

describe('variant paths (QA r1 T1)', () => {
  it('one path per variant, the switch keeps it', () => {
    expect(variantPath('bn', 'G1')).toBe('/bn/');
    expect(variantPath('bn', 'B1')).toBe('/bn/b/');
    expect(variantPath('bn', 'G0')).toBe('/bn/k/');
    expect(variantPath('bn', 'B0')).toBe('/bn/bk/');
    expect(langHref('hi', '?x=1', 'venues', 'B0')).toEqual({ pathname: '/hi/bk/', search: '?x=1', hash: '#venues' });
    expect(langHref('hi', '', 'opening')).toEqual({ pathname: '/hi/', search: '', hash: '' });
  });
});
