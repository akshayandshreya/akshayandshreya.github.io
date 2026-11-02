import { describe, expect, it } from 'vitest';
import { resolveSectionHash, sectionFlags, visibleSections } from '../../src/lib/sections';
import { config } from '../../src/config';
import { FILES } from '../helpers';

describe('sections and hashes (spec 2.1, 2.2)', () => {
  const flags = sectionFlags(config, true);
  const five = visibleSections(FILES.en.variants.G1, flags);
  const four = visibleSections(FILES.en.variants.G0, flags);

  it('lists the page order', () => {
    expect(five).toEqual([
      'opening',
      'invitation',
      'countdown',
      'celebrations',
      'mehndi',
      'engagement',
      'haldi',
      'wedding',
      'reception',
      'cultures',
      'venues',
      'closing',
      'footer',
    ]);
    expect(four).not.toContain('reception');
  });
  it('maps hidden sections to their nearest visible parent', () => {
    expect(resolveSectionHash('#haldi', five)).toBe('haldi');
    expect(resolveSectionHash('#reception', four)).toBe('celebrations');
    expect(resolveSectionHash('#countdown', visibleSections(FILES.en.variants.G1, sectionFlags(config, false)))).toBe(
      'celebrations',
    );
    expect(resolveSectionHash('#rsvp', five)).toBe('closing');
    expect(resolveSectionHash('#gallery', five)).toBe('closing');
    expect(resolveSectionHash('#nothing', five)).toBeNull();
    expect(resolveSectionHash('', five)).toBeNull();
  });
  it('the default config hides rsvp and gallery (A-OPT-1)', () => {
    expect(five).not.toContain('rsvp');
    expect(five).not.toContain('gallery');
  });
});
