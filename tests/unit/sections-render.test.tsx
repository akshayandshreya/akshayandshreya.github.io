// Section components (spec 2.2, 2.3; A-EV-1, A-CD-4/5, A-CUL-1, A-VEN-1, A-CLO-1, G-NOJS-1): the art each section
// places, the countdown's server placeholders and its disappearance at the wedding start, and the page order.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { App } from '../../src/App';
import { ROUTER_FUTURE } from '../../src/config';
import type { Lang } from '../../src/i18n/types';
import { translate } from '../../src/i18n/translate';
import { FILES, plainText } from '../helpers';

afterEach(() => {
  vi.useRealTimers();
});

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]} future={ROUTER_FUTURE}>
      <App />
    </MemoryRouter>,
  );
}

const ids = () => Array.from(document.querySelectorAll<HTMLElement>('[data-section]')).map((s) => s.id);

describe('page order and anchors (2.2)', () => {
  it('the default variant, before the wedding', () => {
    vi.useFakeTimers({ now: Date.parse('2026-11-02T10:00:00Z'), toFake: ['Date'] });
    renderAt('/en/');
    expect(ids()).toEqual([
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
  });

  it('A-CD-4: at the wedding start the countdown and its nav item are gone; #countdown maps to the celebrations', () => {
    vi.useFakeTimers({ now: Date.parse('2026-11-26T12:30:00Z'), toFake: ['Date'] });
    renderAt('/en/?reception=0#countdown');
    expect(document.getElementById('countdown')).toBeNull();
    expect(ids()).not.toContain('countdown');
    expect(document.querySelector('#section-nav a[href="#countdown"]')).toBeNull();
    expect(ids()).not.toContain('reception');
  });
});

describe('the couple per event (2.3.4, A-EV-1)', () => {
  const langs: Lang[] = ['en', 'hi', 'mai', 'bn'];
  for (const lang of langs) {
    it(`${lang}: each event shows its own couple with the translated alt text`, () => {
      renderAt(`/${lang}/`);
      const file = FILES[lang];
      for (const e of file.variants.G1.events) {
        const img = document.querySelector<HTMLImageElement>(`#${e.key} figure img`);
        expect(img, e.key).not.toBeNull();
        expect(img!.getAttribute('alt')).toBe(translate(file.ui, lang, 'alt.couple', { event: e.title }));
        expect(img!.getAttribute('loading')).toBe('lazy');
        const sources = Array.from(document.querySelectorAll(`#${e.key} figure source`)).map((s) =>
          s.getAttribute('type'),
        );
        expect(sources).toContain('image/avif');
      }
    });
  }

  it('bn alt text takes the genitive (মেহেন্দির, বাগদানের)', () => {
    renderAt('/bn/');
    expect(document.querySelector('#mehndi figure img')?.getAttribute('alt')).toMatch(/মেহেন্দির/);
    expect(document.querySelector('#engagement figure img')?.getAttribute('alt')).toMatch(/বাগদানের/);
  });

  it('only the wedding has the kalash and shankha by the couple (1.7)', () => {
    renderAt('/en/');
    expect(document.querySelectorAll('[data-slot="near-motifs"]')).toHaveLength(1);
    const near = document.querySelector('#wedding [data-slot="near-motifs"]')!;
    expect(near.getAttribute('aria-hidden')).toBe('true');
    expect(near.querySelectorAll('img')).toHaveLength(2);
  });
});

describe('section art (1.7)', () => {
  it('opening: Ganesh is decorative; invitation: kalash, the alpana ghost behind the names and the shehnai line', () => {
    renderAt('/hi/');
    const ganesh = document.querySelector('#opening [data-slot="ganesh"]')!;
    expect(ganesh.getAttribute('aria-hidden')).toBe('true');
    const inv = document.getElementById('invitation')!;
    expect(inv.querySelector('[data-slot="kalash"] img')).not.toBeNull();
    expect(inv.querySelector('.invitation__names [data-ghost="alpana"]')).not.toBeNull();
    expect(inv.querySelector('[data-slot="shehnai"] .line-art--shehnai')).not.toBeNull();
  });

  it('cultures: six line-art motifs in the two halves and the seam, captions only', () => {
    renderAt('/mai/');
    const c = document.getElementById('cultures')!;
    const names = Array.from(c.querySelectorAll('.line-art')).map(
      (el) => Array.from(el.classList).find((k) => k.startsWith('line-art--'))?.slice('line-art--'.length),
    );
    expect(names).toEqual(['aripan', 'paag', 'lotus_open', 'alpana', 'topor', 'shankha']);
    for (const el of c.querySelectorAll('.line-art')) expect(el.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(c.querySelector('.cultures__half--mithila [data-slot="tirhuta"] svg')).not.toBeNull();
    expect(c.querySelector('.cultures__half--bengal [lang="bn"]')?.textContent).toBe('বাংলা');
  });

  it('venues: Kolkata wears the alpana ghost, Saharsa the aripan; reception=0 keeps one card', () => {
    const { unmount } = renderAt('/en/');
    const cards = Array.from(document.querySelectorAll('#venues .venue-card'));
    expect(cards.map((c) => c.querySelector('[data-ghost]')?.getAttribute('data-ghost'))).toEqual(['alpana', 'aripan']);
    unmount();
    renderAt('/en/?reception=0');
    expect(document.querySelectorAll('#venues .venue-card')).toHaveLength(1);
    expect(document.querySelector('#venues [data-ghost]')?.getAttribute('data-ghost')).toBe('alpana');
  });

  it('closing: the diya stands last: glow, lamp and flame layers', () => {
    renderAt('/en/');
    const col = document.querySelector('#closing .closing__col')!;
    const diya = col.querySelector('[data-slot="diya"]')!;
    expect(col.lastElementChild).toBe(diya);
    expect(diya.getAttribute('aria-hidden')).toBe('true');
    const layers = Array.from(diya.querySelectorAll('.diya__layer')).map(
      (l) => Array.from(l.classList).find((k) => /^diya__(glow|body|flame)$/.test(k)),
    );
    expect(layers).toEqual(['diya__glow', 'diya__body', 'diya__flame']);
    expect(diya.querySelectorAll('img')).toHaveLength(3);
  });
});

describe('celebrations header (2.3.4)', () => {
  it('chips in each event palette, linking to the events, with dates', () => {
    renderAt('/bn/?side=bride&reception=0');
    const v = FILES.bn.variants.B0;
    const chips = within(document.getElementById('celebrations')!).getAllByRole('link');
    expect(chips.map((a) => a.getAttribute('href'))).toEqual(v.events.map((e) => `#${e.key}`));
    expect(chips.map((a) => plainText(a.textContent ?? ''))).toEqual(
      v.events.map((e) => plainText(`${e.title}${e.date}`)),
    );
    expect(chips[3]!.className).toMatch(/pal-vermilion/);
  });
});

describe('server render (G-NOJS-1, A-CD-5, R6)', () => {
  it('the prerender shows the countdown heading and the wedding line with placeholders, never numbers', () => {
    const html = renderToString(
      <StaticRouter location="/en/" future={ROUTER_FUTURE}>
        <App />
      </StaticRouter>,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const cd = doc.getElementById('countdown')!;
    expect(cd).not.toBeNull();
    expect(cd.querySelector('h2')?.textContent).toBe('Until the wedding');
    const digits = Array.from(cd.querySelectorAll('.t-digits')).map((d) => d.textContent);
    expect(digits).toEqual(['—', '—', '—']);
    expect(plainText(cd.textContent ?? '')).toContain('26 November · 6:00 PM');
    // every event, venue day and fact is in the HTML (no JS needed to read the invitation)
    for (const e of FILES.en.variants.G1.events) {
      expect(doc.getElementById(e.key)).not.toBeNull();
      expect(plainText(doc.getElementById(e.key)!.textContent ?? '')).toContain(plainText(e.venue));
    }
    expect(doc.querySelectorAll('#venues .venue-card')).toHaveLength(2);
  });
});
