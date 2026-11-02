// Routing, redirects, variants and the language switch, rendered with MemoryRouter (spec 2.1, 2.5, 8.0, 8.8).
import { describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App } from '../../src/App';
import { ROUTER_FUTURE } from '../../src/config';
import { plainText } from '../helpers';

let current = '';
function Probe() {
  const l = useLocation();
  current = `${l.pathname}${l.search}${l.hash}`;
  return null;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]} future={ROUTER_FUTURE}>
      <App />
      <Probe />
    </MemoryRouter>,
  );
}

const text = () => plainText(document.body.textContent ?? '');

describe('URL contract (G-ROUTE-1)', () => {
  const redirects: [string, string][] = [
    ['/en', '/en/'],
    ['/EN/?side=bride#haldi', '/en/?side=bride#haldi'],
    ['/english', '/en/'],
    ['/hindi?reception=0', '/hi/?reception=0'],
    ['/maithili', '/mai/'],
    ['/bangla#venues', '/bn/#venues'],
    ['/bengali', '/bn/'],
    ['/bn/some/deep/path?x=1', '/bn/?x=1'],
    ['/nowhere?side=b#wedding', '/en/?side=b#wedding'],
    // variant pages (QA r1 T1) and native-script language paths (QA r1 I4)
    ['/bn/B?reception=0#haldi', '/bn/b/?reception=0#haldi'],
    ['/hi/bk/deep/path', '/hi/bk/'],
    [`/${encodeURIComponent('বাংলা')}/k/#venues`, '/bn/k/#venues'],
    [`/${encodeURIComponent('मैथिली')}`, '/mai/'],
  ];
  for (const [from, to] of redirects) {
    it(`${from} -> ${to}`, () => {
      renderAt(from);
      expect(current).toBe(to);
    });
  }

  it('/ detects the language from the stored choice, keeping query and hash', () => {
    window.localStorage.setItem('asw.lang', 'mai');
    renderAt('/?side=bride#closing');
    expect(current).toBe('/mai/?side=bride#closing');
  });

  it('/ falls back to the browser languages', () => {
    const langs = Object.getOwnPropertyDescriptor(Navigator.prototype, 'languages');
    Object.defineProperty(window.navigator, 'languages', { value: ['bn-IN', 'en'], configurable: true });
    renderAt('/');
    expect(current).toBe('/bn/');
    if (langs) Object.defineProperty(window.navigator, 'languages', langs);
  });
});

describe('page', () => {
  it('renders the default variant in English: one h1, Akshay first, five events', () => {
    renderAt('/en/');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Shubh Vivah');
    const t = text();
    expect(t.indexOf('Akshay Anand')).toBeLessThan(t.indexOf('Shreya Sil'));
    expect(t).toContain('the Jha family warmly invites you');
    expect(document.getElementById('reception')).not.toBeNull();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => plainText(h.textContent ?? ''))).toEqual(
      expect.arrayContaining(['Mehndi', 'Engagement', 'Haldi', 'Wedding', 'Reception', 'Kolkata', 'Saharsa']),
    );
  });

  it('?side=bride: Shreya first, the Sil family hosts (G-ORDER-1)', () => {
    renderAt('/en/?side=bride');
    const t = text();
    const invite = plainText(document.getElementById('invitation')?.textContent ?? '');
    expect(invite.indexOf('Shreya Sil')).toBeLessThan(invite.indexOf('Akshay Anand'));
    expect(t).toContain('the Sil family warmly invites you');
    const closing = plainText(document.getElementById('closing')?.textContent ?? '');
    expect(closing.indexOf('Sil Family')).toBeLessThan(closing.indexOf('Jha Family'));
  });

  it('?reception=0: no Reception section, chip, nav item or Saharsa card (G-REC-1)', () => {
    renderAt('/hi/?reception=0');
    expect(document.getElementById('reception')).toBeNull();
    expect(text()).not.toMatch(/सहरसा|२९/);
    expect(document.querySelectorAll('.venue-card')).toHaveLength(1);
    expect(text()).toContain('२५–२६ नवंबर');
  });

  it('Bengali uses the gold "ও" joiner and Bengali numerals', () => {
    renderAt('/bn/');
    const pair = document.querySelector('#opening .t-pair');
    expect(pair?.textContent).toContain('ও');
    expect(text()).toContain('২৫শে নভেম্বর');
  });

  it('hi shows the shloka on two lines (A-INV-1)', () => {
    renderAt('/hi/');
    const shloka = document.querySelector('.t-shloka');
    expect(shloka?.querySelectorAll('span')).toHaveLength(2);
  });

  it('the default config renders no RSVP, music or gallery (A-OPT-1)', () => {
    renderAt('/en/');
    expect(document.getElementById('rsvp')).toBeNull();
    expect(document.getElementById('gallery')).toBeNull();
    expect(document.querySelector('audio')).toBeNull();
  });

  it('Open in Maps links open a new tab and say so', () => {
    renderAt('/en/');
    const links = within(document.getElementById('mehndi')!).getAllByRole('link', { name: /Open in Maps/ });
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
    expect(links[0]).toHaveAccessibleName('Open in Maps (opens in a new tab)');
  });
});

describe('language switch (A-LANG-1, G-I18N-1)', () => {
  it('four endonyms as real links with lang/hreflang; the current one has aria-current', () => {
    renderAt('/hi/?side=bride&reception=0#haldi');
    const nav = screen.getAllByRole('navigation', { name: 'भाषा' })[0]!;
    const links = within(nav).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('aria-label'))).toEqual(['English', 'हिन्दी', 'मैथिली', 'বাংলা']);
    expect(links.map((a) => a.getAttribute('hreflang'))).toEqual(['en', 'hi', 'mai', 'bn']);
    expect(links[1]).toHaveAttribute('aria-current', 'true');
    // the query is kept (the hash follows the section in view: the scrollspy needs layout, so here it is the opening)
    expect(links[3]).toHaveAttribute('href', '/bn/?side=bride&reception=0');
  });

  it('switching keeps the query, swaps the copy and stores the choice', async () => {
    const user = userEvent.setup();
    renderAt('/en/?side=bride');
    const nav = screen.getAllByRole('navigation', { name: 'Language' })[0]!;
    await act(async () => {
      await user.click(within(nav).getByRole('link', { name: 'বাংলা' }));
    });
    expect(current).toBe('/bn/?side=bride');
    expect(window.localStorage.getItem('asw.lang')).toBe('bn');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('শুভ');
    expect(document.documentElement.lang).toBe('bn');
    expect(document.title).toBe('শ্রেয়া ও অক্ষয় · শুভ বিবাহ');
  });
});

describe('chrome', () => {
  it('the skip link is the first focusable element and targets the invitation', () => {
    renderAt('/en/');
    const first = document.querySelector('a, button');
    expect(first).toHaveTextContent('Skip to the invitation');
    expect(first).toHaveAttribute('href', '#invitation');
  });

  it('the menu sheet lists the sections in page order with the variant events; Esc closes it and focus returns', async () => {
    const user = userEvent.setup();
    renderAt('/en/?reception=0');
    const button = screen.getByRole('button', { name: 'Menu' });
    await user.click(button);
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    const labels = within(dialog)
      .getAllByRole('link')
      .map((a) => plainText(a.textContent ?? ''));
    expect(labels[0]).toBe('Invitation');
    expect(labels).toContain('Celebrations');
    expect(labels.some((l) => l.startsWith('Reception'))).toBe(false);
    expect(labels).toContain('Venues');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
  });
});
