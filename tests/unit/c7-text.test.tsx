// Spec 7.2, the text building blocks: <NamesBlock> (pair, full), <Dateline>, <Facts>, in all four languages and all
// four variants. The order rule (0.2 rule 3), the honorific-above-its-own-name rule (A-INV-3), the joiner (A-INV-4),
// the two-line dateline (A-OPEN-5) and the facts list (2.3.4) are checked on the rendered DOM against the generated copy.
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from '../../src/config';
import { CopyProvider } from '../../src/i18n/context';
import type { Lang, VariantKey } from '../../src/i18n/types';
import { NamesBlock } from '../../src/components/text/NamesBlock';
import { Dateline } from '../../src/components/text/Dateline';
import { Facts } from '../../src/components/text/Facts';
import { FILES, plainText } from '../helpers';

const LANGS: Lang[] = ['en', 'hi', 'mai', 'bn'];
const VARIANTS: VariantKey[] = ['G1', 'G0', 'B1', 'B0'];
const QUERY: Record<VariantKey, string> = {
  G1: '',
  G0: '?reception=0',
  B1: '?side=bride',
  B0: '?side=bride&reception=0',
};
const norm = (s: string | null | undefined) =>
  plainText(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

function withCopy(lang: Lang, v: VariantKey, ui: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[`/${lang}/${QUERY[v]}`]} future={ROUTER_FUTURE}>
      <CopyProvider lang={lang}>{ui}</CopyProvider>
    </MemoryRouter>,
  );
}

for (const lang of LANGS) {
  for (const v of VARIANTS) {
    const copy = FILES[lang].variants[v];
    const firstRole = v.startsWith('G') ? 'groom' : 'bride';

    describe(`${lang} ${v}`, () => {
      it('NamesBlock full: variant order, each honorific directly above its own name, the gold joiner', () => {
        const { container } = withCopy(lang, v, <NamesBlock variant="full" />);
        const people = [...container.querySelectorAll('p[data-role]')];
        expect(people.map((p) => p.getAttribute('data-role'))).toEqual([
          firstRole,
          firstRole === 'groom' ? 'bride' : 'groom',
        ]);
        const persons = [copy.names.first, copy.names.second];
        people.forEach((p, i) => {
          const person = persons[i]!;
          const parts = [...p.children];
          const name = p.querySelector('.t-names')!;
          expect(name.textContent).toBe(person.text);
          if (person.honorific) {
            // the honorific is the element right before its own name, inside the same line block
            expect(parts.indexOf(p.querySelector('.t-honor')!)).toBe(parts.indexOf(name) - 1);
            expect(p.querySelector('.t-honor')!.textContent).toBe(person.honorific);
          } else {
            expect(p.querySelector('.t-honor')).toBeNull();
          }
        });
        const joiner = container.querySelector('.joiner')!;
        expect(joiner.textContent).toBe(lang === 'bn' ? 'ও' : '&');
        expect(joiner.classList.contains('gold-leaf')).toBe(true);
        // DOM order: name 1, joiner, name 2
        expect(people[0]!.compareDocumentPosition(joiner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(joiner.compareDocumentPosition(people[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      });

      it('NamesBlock pair: one line, first and second in variant order with the joiner', () => {
        const { container } = withCopy(lang, v, <NamesBlock variant="pair" />);
        const p = container.querySelector('p.t-pair')!;
        expect(norm(p.textContent)).toBe(norm(`${copy.pair.first} ${copy.pair.joiner} ${copy.pair.second}`));
        // side=bride swaps the pair of side=groom
        const g = FILES[lang].variants.G1.pair;
        expect(v.startsWith('G') ? [copy.pair.first, copy.pair.second] : [copy.pair.second, copy.pair.first]).toEqual([
          g.first,
          g.second,
        ]);
      });

      it('Dateline: the dates, then the cities on their own line', () => {
        const { container } = withCopy(lang, v, <Dateline value={copy.dateline} />);
        const p = container.querySelector('p.t-dateline')!;
        const lines = [...p.children].filter((c) => !c.classList.contains('sr-only'));
        expect(lines.map((l) => l.textContent)).toEqual(
          copy.dateline.cities ? [copy.dateline.dates, copy.dateline.cities] : [copy.dateline.dates],
        );
        if (v.endsWith('0')) expect(toLatin(p.textContent ?? '')).not.toMatch(/29/);
      });

      it('Facts: date · time, venue, two-line address, labelled for screen readers only', () => {
        for (const event of copy.events) {
          const { container, unmount } = withCopy(lang, v, <Facts event={event} />);
          const dl = container.querySelector('dl.facts')!;
          expect(dl.getAttribute('data-event')).toBe(event.key);
          const dts = [...dl.querySelectorAll('dt')];
          expect(dts.every((d) => d.classList.contains('sr-only'))).toBe(true);
          expect(norm(dts[0]!.textContent)).toBe(norm(`${copy.labels.date}, ${copy.labels.time}`));
          expect(norm(dts[1]!.textContent)).toBe(norm(copy.labels.venue));
          const when = dl.querySelector('dd.t-when')!;
          const visible = [...when.querySelectorAll(':scope > span')].map((s) =>
            norm(
              [...s.childNodes]
                .filter((n) => !(n instanceof HTMLElement && n.matches('.sep, .sr-only')))
                .map((n) => n.textContent)
                .join(''),
            ),
          );
          expect(visible.join(' · ')).toBe(norm(event.dateTime));
          expect(when.querySelectorAll('.sep[aria-hidden="true"]')).toHaveLength(
            event.dateTime.split(' · ').length - 1,
          );
          expect(dl.querySelector('dd.t-venue')!.textContent).toBe(event.venue);
          const addr = [...dl.querySelectorAll('dd.t-addr > span')].map((s) => s.textContent);
          expect(addr).toEqual(event.address);
          unmount();
        }
      });
    });
  }
}

function toLatin(s: string) {
  return s
    .replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x966))
    .replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x9e6));
}
