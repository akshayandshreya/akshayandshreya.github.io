// PlateSection's sticky frame (spec 5.3), the couple figure (5.2) and the page's plate sections in every language and
// both orders (2.5): structure, lazy/eager loading, sizes, safe alternation, nothing visible inside the frame for
// assistive technology.
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../src/App';
import { ROUTER_FUTURE } from '../../src/config';
import { CoupleFigure, PlateSection } from '../../src/components/paint/PlateSection';
import { translate } from '../../src/i18n/translate';
import type { Lang } from '../../src/i18n/types';
import { FILES } from '../helpers';

describe('PlateSection (5.3)', () => {
  it('a sticky frame (LQIP ground, plate picture, gold layer, layers, hairlines) under the content', () => {
    const { container } = render(
      <PlateSection id="mehndi" palette="sage" labelledBy="t" layers={<div className="veil-probe" />} prevGround="#eee">
        <h3 id="t">Mehndi</h3>
      </PlateSection>,
    );
    const section = container.querySelector('section#mehndi') as HTMLElement;
    expect(section).toHaveClass('plate-section', 'pal-sage');
    expect(section).toHaveAttribute('data-section', 'mehndi');
    expect(section).toHaveAttribute('data-plate', 'mehndi');
    expect(section).toHaveAttribute('data-tone', 'light');
    expect(section).toHaveAttribute('aria-labelledby', 't');
    expect(section.style.getPropertyValue('--focal')).toBe('50% 45%');
    expect(section.style.getPropertyValue('--lqip-tall')).toMatch(/^url\("data:image\/webp/);
    expect(section.style.getPropertyValue('--prev-ground')).toBe('#eee');

    const [frame, content] = Array.from(section.children) as HTMLElement[];
    expect(frame).toHaveClass('frame');
    expect(frame).toHaveAttribute('aria-hidden', 'true');
    expect(content).toHaveClass('content');
    expect(content?.querySelector('h3')).toHaveTextContent('Mehndi');

    // layer order inside the frame
    const order = Array.from(frame?.children ?? []).map((c) => c.className.split(' ')[0]);
    expect(order.slice(0, 3)).toEqual(['frame__ground', 'plate-scroll', 'veil-probe']);
    expect(order[3]).toMatch(/hairlines|frame-lines/); // the gold frame is the top layer
    expect(order).toHaveLength(4);
    const pointer = frame?.querySelector('.plate-scroll > .plate-pointer');
    expect(pointer?.querySelector(':scope > picture.plate')).not.toBeNull();
    expect(pointer?.querySelector(':scope > picture.gold')).not.toBeNull();

    const sources = frame?.querySelectorAll('picture.plate source') ?? [];
    expect(sources).toHaveLength(6);
    expect(sources[0]).toHaveAttribute('type', 'image/avif');
    expect(sources[0]).toHaveAttribute('media', '(max-aspect-ratio: 3/5)');
    expect(sources[0]?.getAttribute('sizes')).toBe('(max-aspect-ratio: 6/13) 46.15lvh, 100vw');
    expect(sources[5]?.hasAttribute('media')).toBe(false);

    const img = frame?.querySelector('picture.plate img');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
    expect(img).toHaveAttribute('width', '1920');
    expect(img).toHaveAttribute('height', '1080');
    expect(img?.hasAttribute('fetchpriority')).toBe(false);
    expect(frame?.querySelector('picture.gold img')).toHaveAttribute('loading', 'lazy');
  });

  it('the opening plate is eager with high fetch priority (it is the LCP)', () => {
    const { container } = render(
      <PlateSection id="opening" palette="ivory" eager label="Opening">
        <p>x</p>
      </PlateSection>,
    );
    const img = container.querySelector('picture.plate img');
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('fetchpriority', 'high');
    expect(container.querySelector('section')).toHaveAttribute('aria-label', 'Opening');
  });

  it('deep palettes mark the section deep; an unknown plate falls back to painted paper', () => {
    const { container } = render(
      <PlateSection id="wedding" palette="vermilion" plate="nope" label="x">
        <p>x</p>
      </PlateSection>,
    );
    const s = container.querySelector('section') as HTMLElement;
    expect(s).toHaveAttribute('data-tone', 'deep');
    expect(s.querySelector('.frame__paper')).not.toBeNull();
    expect(s.querySelector('picture')).toBeNull();
    expect(s.style.getPropertyValue('--lqip-tall')).toBe('');
  });
});

describe('CoupleFigure (5.2)', () => {
  const langs: Lang[] = ['en', 'hi', 'mai', 'bn'];
  for (const lang of langs) {
    it(`${lang}: alt from t('alt.couple'), lazy, sized by its drawn width`, () => {
      const f = FILES[lang];
      const ev = f.variants.G1.events.find((e) => e.key === 'haldi');
      expect(ev).toBeDefined();
      const alt = translate(f.ui, lang, 'alt.couple', { event: ev?.title ?? '' });
      const { container } = render(<CoupleFigure event="haldi" alt={alt} className="event__couple" />);
      const fig = container.querySelector('figure') as HTMLElement;
      expect(fig).toHaveClass('couple', 'event__couple');
      expect(fig.style.getPropertyValue('--couple-aspect')).not.toBe('');
      const img = fig.querySelector('img');
      expect(img).toHaveAttribute('alt', alt);
      expect(alt).toContain(ev?.title ?? '?');
      expect(alt).not.toMatch(/[{}]/);
      expect(img).toHaveAttribute('loading', 'lazy');
      expect(img?.getAttribute('sizes')).toMatch(/\(max-height: 520px\) and \(orientation: landscape\)/);
      expect(fig.querySelector('source')).toHaveAttribute('type', 'image/avif');
    });
  }

  it('an unknown event renders an empty, hidden figure (no broken image)', () => {
    const { container } = render(<CoupleFigure event="nope" alt="x" />);
    expect(container.querySelector('figure')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('the page: every plate section in 4 languages x 2 orders x reception on/off', () => {
  const urls: string[] = [];
  for (const lang of ['en', 'hi', 'mai', 'bn']) {
    for (const q of ['', '?side=bride', '?reception=0', '?side=bride&reception=0']) urls.push(`/${lang}/${q}`);
  }
  for (const url of urls) {
    it(url, () => {
      const { container } = render(
        <MemoryRouter initialEntries={[url]} future={ROUTER_FUTURE}>
          <App />
        </MemoryRouter>,
      );
      const sections = Array.from(container.querySelectorAll<HTMLElement>('section.plate-section'));
      const ids = sections.map((s) => s.id);
      const events = url.includes('reception=0')
        ? ['mehndi', 'engagement', 'haldi', 'wedding']
        : ['mehndi', 'engagement', 'haldi', 'wedding', 'reception'];
      expect(ids).toEqual(['opening', 'invitation', ...events, 'cultures', 'closing']);
      for (const s of sections) {
        const frame = s.querySelector(':scope > .frame');
        expect(frame, s.id).toHaveAttribute('aria-hidden', 'true');
        expect(frame?.querySelectorAll('picture.plate source'), s.id).toHaveLength(6);
        expect(s.querySelector(':scope > .content'), s.id).not.toBeNull();
        // nothing focusable or labelled inside the decorative frame
        expect(frame?.querySelector('a, button, [tabindex], h1, h2, h3'), s.id).toBeNull();
      }
      // the couple alternates sides in the split layout: Mehndi left, Engagement right, ...
      const sides = events.map((e) => container.querySelector(`#${e} .event__grid`)?.getAttribute('data-couple'));
      expect(sides).toEqual(events.map((_, i) => (i % 2 === 0 ? 'left' : 'right')));
    });
  }
});
