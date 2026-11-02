// <HeadManager> (spec 4.6, 6.2, G-I18N-2): the head follows the language and the variant on screen.
import { afterEach, describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from '../../src/config';
import { CopyProvider } from '../../src/i18n/context';
import { HeadManager } from '../../src/components/chrome/HeadManager';
import { FONTS_ATTR } from '../../src/lib/head';
import { FILES } from '../helpers';
import type { Lang } from '../../src/i18n/types';

function ui(lang: Lang, search = '') {
  return (
    <MemoryRouter key={search} initialEntries={[`/${lang}/${search}`]} future={ROUTER_FUTURE}>
      <CopyProvider lang={lang}>
        <HeadManager />
      </CopyProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  document.head.innerHTML = '';
  document.title = '';
  document.documentElement.lang = 'en';
});

const desc = () => document.head.querySelector('meta[name="description"]')?.getAttribute('content');

describe('HeadManager', () => {
  it('renders nothing visible', () => {
    const { container } = render(ui('en'));
    expect(container.innerHTML).toBe('');
  });

  it('sets <html lang>, the title and the description of the default variant', () => {
    render(ui('hi'));
    expect(document.documentElement.lang).toBe('hi');
    expect(document.title).toBe(FILES.hi.variants.G1.head.title);
    expect(desc()).toBe(FILES.hi.variants.G1.head.description);
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
  });

  it('follows ?side=bride&reception=0 (bride-first title, four-event description)', () => {
    render(ui('mai', '?side=bride&reception=0'));
    const b0 = FILES.mai.variants.B0.head;
    expect(document.title).toBe(b0.title);
    expect(desc()).toBe(b0.description);
    expect(document.title.indexOf(FILES.mai.variants.B0.pair.first)).toBe(0);
  });

  it('updates on a language switch and swaps the font rules to the new language', async () => {
    const view = render(ui('hi'));
    await waitFor(() =>
      expect(document.head.querySelector(`style[${FONTS_ATTR}]`)?.getAttribute(FONTS_ATTR)).toBe('hi'),
    );
    view.rerender(ui('bn'));
    expect(document.documentElement.lang).toBe('bn');
    expect(document.title).toBe(FILES.bn.variants.G1.head.title);
    expect(document.head.querySelector('meta[property="og:locale"]')?.getAttribute('content')).toBe('bn_IN');
    await waitFor(() =>
      expect(document.head.querySelector(`style[${FONTS_ATTR}]`)?.getAttribute(FONTS_ATTR)).toBe('bn'),
    );
    expect(document.head.querySelectorAll(`style[${FONTS_ATTR}]`)).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
  });
});
