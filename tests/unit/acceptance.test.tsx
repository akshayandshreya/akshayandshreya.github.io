// The acceptance criteria of spec 8 that hold on the rendered DOM, for all 16 variants (4 languages x side x reception),
// in jsdom. Layout, motion, pixels and real browsers are in tests/e2e and tools/shots. Each test names its criterion.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { within } from '@testing-library/react';
import { textViolations } from '../../scripts/lib/validate.mjs';
import { ENDONYMS } from '../../src/lib/langs';
import type { Lang, LangFile, SiteCopy, UiValue } from '../../src/i18n/types';
import { FILES } from '../helpers';
import { LANGS, VARIANTS, before, norm, renderVariant, separatedText, textNodes } from './support/render';

const NOW = Date.parse('2026-11-02T10:00:00Z'); // before the wedding: the countdown is on

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});

const byId = (id: string) => document.getElementById(id);
const all = (sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<HTMLElement>(sel));
const txt = (el: Element | null | undefined) => norm(el?.textContent);

// ---- the strings a page may show: its variant's copy, the UI strings, endonyms, brand names (G-FACT-1) -------------
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(norm(value));
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function allowed(file: LangFile, copy: SiteCopy) {
  const literal = new Set<string>([...strings(copy), 'AS', 'SA', '·', '—', '&', 'ও', '.ics', 'Apple', 'Outlook', 'Google']);
  for (const e of Object.values(ENDONYMS)) literal.add(e.full).add(e.short);
  const templates: RegExp[] = [];
  const ui = (Object.values(file.ui) as UiValue[]).flatMap((v) => (typeof v === 'string' ? [v] : [v.one, v.other]));
  for (const s of ui) {
    if (/\{[\w.:]+\}/.test(s)) {
      templates.push(new RegExp(`^${norm(s).split(/\{[\w.:]+\}/).map(escapeRe).join('.+?')}$`, 'u'));
      for (const part of norm(s).split(/\{[\w.:]+\}/)) if (part.trim()) literal.add(part.trim());
    } else literal.add(norm(s));
  }
  const corpus = [...literal];
  const numeric = /^[\s0-9०-९০-৯—–·:,.]+$/u;
  return (text: string) =>
    numeric.test(text) || literal.has(text) || corpus.some((c) => c.includes(text)) || templates.some((r) => r.test(text));
}

const GROOM_HONORIFIC: Record<Lang, string | null> = { en: null, hi: 'चि.', mai: 'चि०', bn: 'শ্রীমান' };
const BRIDE_HONORIFIC: Record<Lang, string | null> = { en: null, hi: 'सौ. कां.', mai: 'आयु०', bn: 'কল্যাণীয়া' };
const JHA: Record<Lang, string> = { en: 'Jha', hi: 'झा', mai: 'झा', bn: 'ঝা' };
const SIL: Record<Lang, RegExp> = { en: /Sil/, hi: /सील|शील/, mai: /सील|शील/, bn: /শীল/ };
const FOUR_EVENT_DATELINE: Record<Lang, string> = {
  en: '25–26 November · Kolkata',
  hi: '२५–२६ नवंबर · कोलकाता',
  mai: '२५–२६ नवम्बर · कोलकाता',
  bn: '২৫ ও ২৬শে নভেম্বর · কলকাতা',
};

for (const lang of LANGS) {
  for (const key of VARIANTS) {
    const file = FILES[lang];
    const copy = file.variants[key];
    const groomFirst = key[0] === 'G';
    const withReception = key[1] === '1';

    describe(`${lang} ${key}`, () => {
      it('G-FACT-1: every visible string and label comes from the generated copy', () => {
        renderVariant(lang, key);
        const ok = allowed(file, copy);
        const stray = textNodes()
          .map((t) => t.text)
          .filter((t) => !ok(t));
        expect(stray).toEqual([]);
        const attrs = all('[aria-label], [alt], [title]')
          .flatMap((el) => ['aria-label', 'alt', 'title'].map((a) => el.getAttribute(a)))
          .filter((v): v is string => Boolean(v && v.trim()))
          .map(norm)
          .filter((t) => !ok(t));
        expect(attrs).toEqual([]);
      });

      it('G-FACT-1: every fact of every event is on the page', () => {
        renderVariant(lang, key);
        for (const e of copy.events) {
          const sec = byId(e.key);
          expect(sec, e.key).not.toBeNull();
          const t = txt(sec);
          for (const fact of [e.title, e.tagline, e.dateTime, e.venue, e.address[0], e.address[1]]) {
            expect(t, `${e.key}: ${fact}`).toContain(norm(fact));
          }
        }
      });

      it('G-FACT-2: no forbidden word and no phone-like number in the rendered text', () => {
        renderVariant(lang, key);
        const labels = all('[aria-label], [alt]').map((el) => el.getAttribute('aria-label') ?? el.getAttribute('alt'));
        expect(textViolations({ dom: separatedText(), labels: labels.join('\n'), title: document.title }, 'dom')).toEqual(
          [],
        );
      });

      it('G-ORDER-1: names, host, monogram, families and title follow the side', () => {
        renderVariant(lang, key);
        const people = all('#invitation .invitation__person');
        expect(people.map((p) => p.dataset.role)).toEqual(groomFirst ? ['groom', 'bride'] : ['bride', 'groom']);
        expect(txt(byId('invitation')?.querySelector('.t-host'))).toBe(norm(copy.host));
        expect(new Set(all('.monogram__text').map(txt))).toEqual(new Set([groomFirst ? 'AS' : 'SA']));
        const g1 = file.variants.G1;
        const firstName = groomFirst ? g1.pair.first : g1.pair.second;
        for (const pair of all('#opening .t-pair, #footer .t-pair')) expect(txt(pair).startsWith(norm(firstName))).toBe(true);
        const fams = all('#closing .t-family').map(txt);
        expect(fams).toHaveLength(2);
        expect(fams[0]!.includes(JHA[lang])).toBe(groomFirst);
        expect(SIL[lang].test(fams[0]!)).toBe(!groomFirst);
        expect(document.title).toBe(copy.head.title);
        expect(document.title.startsWith(firstName)).toBe(true);
      });

      it(`G-REC-1: ${withReception ? 'five events and two cities' : 'no Reception anywhere, the four-event dateline'}`, () => {
        renderVariant(lang, key);
        const links = all('a[href="#reception"]');
        if (withReception) {
          expect(byId('reception')).not.toBeNull();
          expect(links.length).toBeGreaterThanOrEqual(2); // chip + nav item
          expect(all('.venue-card')).toHaveLength(2);
        } else {
          expect(byId('reception')).toBeNull();
          expect(links).toEqual([]);
          expect(all('.venue-card')).toHaveLength(1);
          expect(separatedText()).not.toMatch(/29|२९|২৯/);
          expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).not.toMatch(/29|२९|২৯/);
          const parts = all('#opening .t-dateline > span').map(txt);
          expect(parts.join(' · ')).toBe(FOUR_EVENT_DATELINE[lang]);
        }
      });

      it('G-I18N-2: html lang, title, description and og tags match the language and variant', () => {
        renderVariant(lang, key);
        expect(document.documentElement.lang).toBe(lang);
        expect(document.title).toBe(copy.head.title);
        const meta = (sel: string) => document.querySelector(sel)?.getAttribute('content');
        expect(meta('meta[name="description"]')).toBe(copy.head.description);
        expect(meta('meta[property="og:title"]')).toBe(copy.head.title);
        expect(meta('meta[property="og:description"]')).toBe(copy.head.description);
        expect(meta('meta[name="robots"]')).toBe('noindex, nofollow');
      });

      if (lang !== 'en') {
        it('G-I18N-2: native numerals everywhere (Latin digits only inside lang="en" spans)', () => {
          renderVariant(lang, key);
          const latin = textNodes()
            .filter((t) => !t.node.parentElement?.closest('[lang="en"]'))
            .map((t) => t.text)
            .filter((t) => /[0-9]/.test(t));
          expect(latin).toEqual([]);
        });
      }

      it('A-OPEN-2/3/5: the opening in card order, data-driven invocations, a two-line dateline', () => {
        renderVariant(lang, key);
        const op = byId('opening')!;
        const kickers = all('.t-kicker', op).map(txt);
        expect(kickers).toEqual([copy.invocation, copy.invocationSecondary].filter(Boolean).map((s) => norm(s)));
        if (lang === 'bn' && !groomFirst) expect(kickers).toEqual([norm('শ্রী শ্রী প্রজাপতয়ে নমঃ')]);
        if (lang === 'bn' && groomFirst) expect(kickers[1]).toBe('শ্রী গণেশায় নমঃ');
        if (lang !== 'bn') expect(kickers).toHaveLength(groomFirst ? 1 : 2);
        const chain = [
          op.querySelector('[data-slot="ganesh"], .ganesh'),
          op.querySelector('.t-kicker'),
          op.querySelector('h1'),
          op.querySelector('.gold-rule'),
          op.querySelector('.monogram'),
          op.querySelector('.t-pair'),
          op.querySelector('.t-dateline'),
        ].filter((x): x is Element => x !== null);
        expect(chain).toHaveLength(7);
        for (let i = 1; i < chain.length; i++) expect(before(chain[i - 1]!, chain[i]!), `opening item ${i}`).toBe(true);
        expect(all('h1')).toHaveLength(1);
        expect(txt(op.querySelector('h1'))).toBe(norm(copy.heading));
        expect(all('.t-dateline > span', op)).toHaveLength(copy.dateline.cities ? 2 : 1);
      });

      it('A-INV-1/3/4: shloka, honorifics above their own person, the gold joiner', () => {
        renderVariant(lang, key);
        const inv = byId('invitation')!;
        const shloka = inv.querySelector('.t-shloka');
        if (lang === 'hi' || lang === 'mai') expect(shloka?.querySelectorAll(':scope > span')).toHaveLength(2);
        else expect(shloka).toBeNull();
        for (const p of all('.invitation__person', inv)) {
          const role = p.dataset.role as 'groom' | 'bride';
          const expected = role === 'groom' ? GROOM_HONORIFIC[lang] : BRIDE_HONORIFIC[lang];
          const hon = p.querySelector('.t-honor');
          const name = p.querySelector('.t-names')!;
          if (expected === null) expect(hon).toBeNull();
          else {
            expect(txt(hon)).toBe(expected);
            expect(before(hon!, name)).toBe(true);
          }
        }
        const joiner = inv.querySelector('.invitation__joiner')!;
        expect(txt(joiner)).toBe(lang === 'bn' ? 'ও' : '&');
        expect(joiner.classList.contains('gold-leaf')).toBe(true);
        expect(joiner.getAttribute('lang')).toBe(lang === 'bn' ? null : 'en');
      });

      it('A-CD-2: the countdown in native digits with the right unit forms', () => {
        renderVariant(lang, key);
        const units = all('#countdown .countdown__unit');
        expect(units).toHaveLength(3); // showSeconds is off
        // 2026-11-02T10:00Z -> 24 days, 2 hours, 30 minutes
        const digits = units.map((u) => txt(u.querySelector('.t-digits')));
        const expected = { en: ['24', '02', '30'], hi: ['२४', '०२', '३०'], mai: ['२४', '०२', '३०'], bn: ['২৪', '০২', '৩০'] };
        expect(digits).toEqual(expected[lang]);
        const label = (k: 'countdown.days' | 'countdown.hours' | 'countdown.minutes', n: number) => {
          const v = file.ui[k];
          return typeof v === 'string' ? v : lang === 'en' || lang === 'hi' ? (n === 1 ? v.one : v.other) : v.other;
        };
        expect(units.map((u) => txt(u.querySelector('.t-ui')))).toEqual([
          label('countdown.days', 24),
          label('countdown.hours', 2),
          label('countdown.minutes', 30),
        ]);
      });

      it('A-EV-1/4: events in order, each with title, tagline, date · time, venue, two-line address and actions', () => {
        renderVariant(lang, key);
        const order = withReception
          ? ['mehndi', 'engagement', 'haldi', 'wedding', 'reception']
          : ['mehndi', 'engagement', 'haldi', 'wedding'];
        expect(all('section.event').map((s) => s.id)).toEqual(order);
        expect(all('#celebrations a.chip').map((a) => a.getAttribute('href'))).toEqual(order.map((k) => `#${k}`));
        for (const e of copy.events) {
          const s = byId(e.key)!;
          expect(txt(s.querySelector('h3'))).toBe(norm(e.title));
          expect(s.getAttribute('aria-labelledby')).toBe(s.querySelector('h3')!.id);
          expect(all('.t-addr > span', s).map(txt)).toEqual(e.address.map(norm));
          const maps = within(s).getAllByRole('link', { name: new RegExp(file.ui['maps.open'] as string) });
          expect(maps[0]).toHaveAttribute(
            'href',
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.mapQuery)}`,
          );
          expect(maps[0]).toHaveAttribute('target', '_blank');
        }
      });

      it('A-VEN-1/2: one card per city with its days, events, venue, address and Maps', () => {
        renderVariant(lang, key);
        const cards = all('#venues .venue-card');
        expect(cards.map((c) => txt(c.querySelector('h3')))).toEqual(copy.cities.map(norm));
        cards.forEach((card, i) => {
          const days = copy.days.filter((d) => d.city === i);
          const shown = all('.venue-card__day', card);
          expect(shown).toHaveLength(days.length);
          days.forEach((d, j) => {
            const day = shown[j]!;
            expect(txt(day.querySelector('h4'))).toBe(norm(d.heading));
            expect(all('li', day).map(txt)).toEqual(d.lines.map((l) => norm(l.text)));
            expect(txt(day.querySelector('.t-venue'))).toBe(norm(d.venue));
            expect(all('.t-addr > span', day).map(txt)).toEqual(d.address.map(norm));
            expect(day.querySelector('a[href^="https://www.google.com/maps/search/"]')).not.toBeNull();
          });
        });
        if (withReception) {
          expect(copy.days.filter((d) => d.city === 1).map((d) => d.dateIso)).toEqual(['2026-11-29']);
          expect(copy.days.filter((d) => d.city === 0).map((d) => d.dateIso)).toEqual(['2026-11-25', '2026-11-26']);
        }
      });

      it('A-CLO-1: monogram, two-line request, line, rule, regards, family, joiner, family, diya', () => {
        renderVariant(lang, key);
        const c = byId('closing')!;
        const h2 = c.querySelector('h2')!;
        expect(all(':scope > span', h2).map(txt)).toEqual(copy.closing.bigLines.map(norm));
        const fam = c.querySelector('.closing__families')!;
        expect(Array.from(fam.children).map(txt)).toEqual(copy.closing.families.map(norm));
        const chain = [
          c.querySelector('.monogram'),
          h2,
          c.querySelector('.t-closeline'),
          c.querySelector('.gold-rule'),
          fam,
          c.querySelector('[data-slot="diya"], .diya'),
        ].filter((x): x is Element => x !== null);
        expect(chain).toHaveLength(6);
        for (let i = 1; i < chain.length; i++) expect(before(chain[i - 1]!, chain[i]!), `closing item ${i}`).toBe(true);
        expect(all('.t-closeline', c).map(txt)).toEqual([norm(copy.closing.small), norm(copy.closing.regards)]);
      });

      it('A-FOOT-1: the footer holds the monogram, the pair, the switch and "back to top", nothing else', () => {
        renderVariant(lang, key);
        const f = byId('footer')!;
        const expected = new Set([
          groomFirst ? 'AS' : 'SA',
          ...[copy.pair.first, copy.pair.joiner, copy.pair.second].map(norm),
          ...Object.values(ENDONYMS).map((e) => e.full),
          norm(file.ui['nav.top'] as string),
        ]);
        expect(textNodes(f).map((t) => t.text).filter((t) => !expected.has(t))).toEqual([]);
        expect(f.querySelector('a[href="#opening"]')).not.toBeNull();
        expect(all('nav a[hreflang]', f)).toHaveLength(4);
      });

      it('A-LANG-1: both switches are real links with lang/hreflang; only the current one has aria-current', () => {
        renderVariant(lang, key);
        const navs = all('nav').filter((n) => n.querySelectorAll('a[hreflang]').length === 4);
        expect(navs).toHaveLength(2);
        for (const nav of navs) {
          const links = all('a[hreflang]', nav);
          expect(links.map((a) => a.getAttribute('hreflang'))).toEqual(['en', 'hi', 'mai', 'bn']);
          expect(links.map((a) => a.getAttribute('lang'))).toEqual(['en', 'hi', 'mai', 'bn']);
          expect(links.map((a) => a.getAttribute('aria-current'))).toEqual(
            LANGS.map((l) => (l === lang ? 'true' : null)),
          );
          for (const a of links) expect(a.getAttribute('href')).toMatch(new RegExp(`^/${a.getAttribute('hreflang')}/`));
        }
        const bar = navs[0]!;
        expect(all('a', bar).map((a) => a.getAttribute('aria-label'))).toEqual(LANGS.map((l) => ENDONYMS[l].full));
      });

      it('A-NAV-1: the menu lists the visible sections in page order with the variant events', () => {
        renderVariant(lang, key);
        const sheet = byId('section-nav')!;
        const events = copy.events.map((e) => `#${e.key}`);
        expect(all('a', sheet).map((a) => a.getAttribute('href'))).toEqual([
          '#invitation',
          '#countdown',
          '#celebrations',
          ...events,
          '#cultures',
          '#venues',
        ]);
        const sub = all('a[href^="#"]', sheet).filter((a) => events.includes(a.getAttribute('href')!));
        sub.forEach((a, i) => expect(txt(a)).toContain(norm(copy.events[i]!.date)));
      });

      it('A-CUL-1/2: ivory, title and captions only; the Tirhuta flourish and "বাংলা" never side by side', () => {
        renderVariant(lang, key);
        const c = byId('cultures')!;
        expect(c.classList.contains('pal-ivory')).toBe(true);
        const keys = ['title', 'tirhuta', 'aripan', 'paag', 'lotus', 'bangla', 'alpana', 'topor', 'shankha'] as const;
        const want = new Set<string>([...keys.map((k) => norm(file.ui[`cultures.${k}`] as string)), 'বাংলা']);
        expect(new Set(textNodes(c).map((t) => t.text))).toEqual(want);
        const tirhuta = c.querySelector('[data-slot="tirhuta"], .tirhuta')!;
        const bangla = all('p, span, div', c).find((el) => txt(el) === 'বাংলা' && el.children.length === 0)!;
        expect(tirhuta.closest('[aria-hidden="true"]')).not.toBeNull();
        expect(bangla.getAttribute('lang')).toBe('bn');
        const seam = c.querySelector('.cultures__seam, [data-slot="lotus"]')!;
        expect(before(tirhuta, seam) && before(seam, bangla)).toBe(true);
      });
    });
  }
}

describe('A-OPT-1: optional modules are off by default', () => {
  it('no RSVP, music button, gallery or audio element in any language', () => {
    for (const lang of LANGS) {
      const { unmount } = renderVariant(lang, 'G1');
      expect(byId('rsvp')).toBeNull();
      expect(byId('gallery')).toBeNull();
      expect(document.querySelector('audio, [data-music], button[aria-pressed]')).toBeNull();
      unmount();
    }
  });
});
