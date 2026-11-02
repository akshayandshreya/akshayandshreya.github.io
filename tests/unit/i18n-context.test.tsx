// CopyProvider + useI18n (spec 4.3, 4.5, 4.6): the variant follows the URL query, t() and num() follow the language,
// and a change of language or query swaps the copy without an empty render.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CopyProvider, useI18n } from '../../src/i18n/context';
import { ROUTER_FUTURE } from '../../src/config';
import type { Lang } from '../../src/i18n/types';
import { FILES, plainText } from '../helpers';

const LANGS: Lang[] = ['en', 'hi', 'mai', 'bn'];
const ZERO: Record<Lang, string> = { en: '0', hi: '०', mai: '०', bn: '০' };

function Probe() {
  const { lang, copy, t, num, variant, meta } = useI18n();
  return (
    <dl lang={meta.bcp47}>
      <dt>lang</dt>
      <dd data-testid="lang">{lang}</dd>
      <dt>variant</dt>
      <dd data-testid="variant">{variant.key}</dd>
      <dt>first</dt>
      <dd data-testid="first">{copy.names.first.text}</dd>
      <dt>monogram</dt>
      <dd data-testid="monogram">{copy.monogram}</dd>
      <dt>events</dt>
      <dd data-testid="events">{copy.events.map((e) => e.key).join(',')}</dd>
      <dt>menu</dt>
      <dd data-testid="menu">{t('nav.menu')}</dd>
      <dt>hours</dt>
      <dd data-testid="hours">{t('countdown.hours', undefined, 1)}</dd>
      <dt>padded</dt>
      <dd data-testid="padded">{num(7, 2)}</dd>
      <dt>sr</dt>
      <dd data-testid="sr">{t('countdown.sr', { d: 24, h: 1, m: 5 })}</dd>
    </dl>
  );
}

function renderWith(lang: Lang, search = '') {
  const ui = (
    <MemoryRouter initialEntries={[`/${lang}/${search}`]} future={ROUTER_FUTURE}>
      <CopyProvider lang={lang}>
        <Probe />
      </CopyProvider>
    </MemoryRouter>
  );
  return render(ui);
}

const get = (id: string) => plainText(screen.getByTestId(id).textContent ?? '');

describe('CopyProvider', () => {
  for (const lang of LANGS) {
    for (const [search, key] of [
      ['', 'G1'],
      ['?side=bride', 'B1'],
      ['?reception=0', 'G0'],
      ['?side=bride&reception=0', 'B0'],
    ] as const) {
      it(`${lang} ${search || '(default)'} -> ${key}`, () => {
        renderWith(lang, search);
        const V = FILES[lang].variants[key];
        expect(get('lang')).toBe(lang);
        expect(get('variant')).toBe(key);
        expect(get('first')).toBe(plainText(V.names.first.text));
        expect(get('monogram')).toBe(key[0] === 'G' ? 'AS' : 'SA');
        expect(get('events')).toBe(
          key[1] === '1' ? 'mehndi,engagement,haldi,wedding,reception' : 'mehndi,engagement,haldi,wedding',
        );
        expect(get('menu')).toBe(plainText(FILES[lang].ui['nav.menu'] as string));
        expect(get('padded')).toBe(`${ZERO[lang]}${lang === 'en' ? '7' : lang === 'bn' ? '৭' : '७'}`);
      });
    }
  }

  it('the hour unit and the screen-reader sentence agree with the number', () => {
    renderWith('en');
    expect(get('hours')).toBe('hour');
    expect(get('sr')).toBe('24 days, 1 hour and 5 minutes until the wedding');
  });

  it('Hindi: १ घंटा in the sentence, native digits everywhere', () => {
    renderWith('hi');
    expect(get('hours')).toBe('घंटा');
    expect(get('sr')).toBe('शुभ विवाह में २४ दिन, १ घंटा और ५ मिनट शेष');
    expect(get('sr')).not.toMatch(/[0-9]/);
  });

  it('Bengali: native digits in the sentence', () => {
    renderWith('bn');
    expect(get('sr')).toBe('শুভ বিবাহের আর ২৪ দিন, ১ ঘণ্টা ও ৫ মিনিট বাকি');
  });

  it('switching the language re-renders with the new copy at once (loaded chunk), never empty', () => {
    const view = renderWith('en', '?side=bride');
    expect(get('first')).toBe('Shreya Sil');
    view.rerender(
      <MemoryRouter initialEntries={['/bn/?side=bride']} future={ROUTER_FUTURE}>
        <CopyProvider lang="bn">
          <Probe />
        </CopyProvider>
      </MemoryRouter>,
    );
    expect(get('lang')).toBe('bn');
    expect(get('first')).toBe(plainText(FILES.bn.variants.B1.names.first.text));
    expect(get('monogram')).toBe('SA');
  });

  it('useI18n outside the provider throws', () => {
    const err = console.error;
    console.error = () => undefined;
    expect(() =>
      render(
        <MemoryRouter future={ROUTER_FUTURE}>
          <Probe />
        </MemoryRouter>,
      ),
    ).toThrow(/outside <CopyProvider>/);
    console.error = err;
  });
});
