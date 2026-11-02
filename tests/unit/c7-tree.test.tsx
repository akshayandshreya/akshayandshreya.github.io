// Spec 7.2, the component tree as rendered: App -> LangLayout -> CopyProvider -> MotionProvider -> HeadManager,
// SkipLink, TopBar (monogram, language switch, menu button), SectionNav, <main> with the sections in the page order of
// 2.2, Footer. Checked for every language in the default and the bride-first, no-Reception variants.
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../src/App';
import { ROUTER_FUTURE } from '../../src/config';
import type { Lang, VariantKey } from '../../src/i18n/types';
import { FILES } from '../helpers';

const LANGS: Lang[] = ['en', 'hi', 'mai', 'bn'];
const CASES: [VariantKey, string][] = [
  ['G1', ''],
  ['B0', '?side=bride&reception=0'],
];
/** 2.2: every section id in page order (optional ones included); the rendered order must be a subsequence. */
const PAGE_ORDER = [
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
  'rsvp',
  'gallery',
  'closing',
];
const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]} future={ROUTER_FUTURE}>
      <App />
    </MemoryRouter>,
  );
}

for (const lang of LANGS) {
  for (const [v, query] of CASES) {
    const copy = FILES[lang].variants[v];
    describe(`${lang} ${v}`, () => {
      it('chrome order: skip link first, then the bar, the sheet, main, the footer', () => {
        renderAt(`/${lang}/${query}`);
        const focusables = document.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])');
        const skip = focusables[0] as HTMLAnchorElement;
        expect(skip.getAttribute('href')).toBe('#invitation');
        const bar = document.querySelector('header[role="banner"], body > div header, header')!;
        const main = document.querySelector('main#main')!;
        const footer = document.querySelector('footer')!;
        expect(bar).not.toBeNull();
        expect(main).not.toBeNull();
        expect(footer).not.toBeNull();
        expect(follows(skip, bar)).toBe(true);
        expect(follows(bar, main)).toBe(true);
        expect(follows(main, footer)).toBe(true);
        expect(main.contains(footer)).toBe(false);
      });

      it('TopBar holds the small monogram (to #opening), the language switch and the menu button', () => {
        renderAt(`/${lang}/${query}`);
        const bar = [...document.querySelectorAll('header')].find((h) => !h.closest('main'))!;
        const home = bar.querySelector('a[href="#opening"], a[href$="#opening"]');
        expect(home).not.toBeNull();
        expect(home!.textContent).toContain(copy.monogram);
        const langLinks = [...bar.querySelectorAll('a[hreflang]')];
        expect(langLinks.map((a) => a.getAttribute('hreflang')).sort()).toEqual(['bn', 'en', 'hi', 'mai']);
        expect(
          langLinks.filter((a) => a.getAttribute('aria-current') === 'true').map((a) => a.getAttribute('hreflang')),
        ).toEqual([lang]);
        expect(bar.querySelector('button[aria-expanded]')).not.toBeNull();
      });

      it('main: the sections of 2.2 in page order, each labelled, ids unique', () => {
        renderAt(`/${lang}/${query}`);
        const sections = [...document.querySelectorAll('main#main section[id]')].filter(
          (s) => !s.parentElement?.closest('section[id]'),
        );
        const ids = sections.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.every((id) => PAGE_ORDER.includes(id))).toBe(true);
        expect(ids).toEqual(PAGE_ORDER.filter((id) => ids.includes(id)));
        const required = [
          'opening',
          'invitation',
          'celebrations',
          ...copy.events.map((e) => e.key),
          'cultures',
          'venues',
          'closing',
        ];
        for (const id of required) expect(ids).toContain(id);
        if (v.endsWith('0')) expect(ids).not.toContain('reception');
        for (const s of sections) {
          const by = s.getAttribute('aria-labelledby');
          const name = by ? document.getElementById(by)?.textContent : s.getAttribute('aria-label');
          expect(name, `#${s.id} has an accessible name`).toBeTruthy();
        }
      });

      it('headings: one h1 (the opening heading), events are h3 under the Celebrations h2', () => {
        renderAt(`/${lang}/${query}`);
        const h1 = document.querySelectorAll('h1');
        expect(h1).toHaveLength(1);
        expect(h1[0]!.closest('section')!.id).toBe('opening');
        const eventTitles = copy.events.map((e) => document.getElementById(e.key)!.querySelector('h3'));
        expect(eventTitles.every(Boolean)).toBe(true);
        expect(eventTitles.map((h) => h!.textContent)).toEqual(copy.events.map((e) => e.title));
      });

      it('optional modules are absent with the default config (A-OPT-1)', () => {
        renderAt(`/${lang}/${query}`);
        expect(document.getElementById('rsvp')).toBeNull();
        expect(document.getElementById('gallery')).toBeNull();
        expect(document.querySelector('audio')).toBeNull();
      });
    });
  }
}
