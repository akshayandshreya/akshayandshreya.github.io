// The calendar and maps actions (spec 2.3.4, 6.1; A-EV-4/5/6, G-A11Y-3): the disclosure's keyboard and pointer
// behaviour, the .ics hand-off (Blob, file name, VEVENT count per variant) and the Google links.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../src/App';
import { ROUTER_FUTURE } from '../../src/config';
import { escapeText, foldLine, plainCopy } from '../../src/lib/ics';
import { FILES, plainText } from '../helpers';

const NOW = Date.parse('2026-11-02T10:00:00Z');

/** An accessible-name matcher that ignores the copy hygiene (no-break spaces, word joiners). */
const named = (want: string | RegExp) => (name: string) => {
  const n = plainText(name).replace(/\s+/g, ' ').trim();
  return typeof want === 'string' ? n === want : want.test(n);
};

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]} future={ROUTER_FUTURE}>
      <App />
    </MemoryRouter>,
  );
}

/** Capture what downloadIcs() hands to the browser. */
function captureDownloads() {
  const files: { name: string; blob: Blob }[] = [];
  const blobs = new Map<string, Blob>();
  let n = 0;
  URL.createObjectURL = vi.fn((b: Blob) => {
    const url = `blob:test/${n++}`;
    blobs.set(url, b);
    return url;
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    if (this.download) files.push({ name: this.download, blob: blobs.get(this.href)! });
  });
  return files;
}

const blobText = (b: Blob) =>
  new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(b);
  });

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Add to calendar disclosure (2.3.4, G-A11Y-3)', () => {
  it('a button with aria-expanded opens a panel with .ics and Google; Esc closes it and focus returns', async () => {
    const user = userEvent.setup();
    renderAt('/en/');
    const haldi = document.getElementById('haldi')!;
    const button = within(haldi).getByRole('button', { name: named(/Add to calendar/) });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    const panel = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(panel).not.toBeVisible();

    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toBeVisible();
    expect(within(panel).getByRole('button', { name: named('Apple · Outlook (.ics)') })).toBeVisible();
    const google = within(panel).getByRole('link', { name: named(/Google Calendar/) });
    expect(google).toHaveAttribute('target', '_blank');
    expect(google).toHaveAttribute('rel', 'noopener noreferrer');
    expect(named('Google Calendar (opens in a new tab)')(google.textContent ?? '')).toBe(true);
    const u = new URL(google.getAttribute('href')!);
    expect(u.searchParams.get('dates')).toBe('20261126T043000Z/20261126T043000Z');

    google.focus();
    await user.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  it('a click outside closes it without stealing focus', async () => {
    const user = userEvent.setup();
    renderAt('/en/');
    const button = within(document.getElementById('mehndi')!).getByRole('button', { name: named(/Add to calendar/) });
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await user.click(document.querySelector('#mehndi h3')!);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('Tab past the last item closes it', async () => {
    const user = userEvent.setup();
    renderAt('/en/');
    const button = within(document.getElementById('wedding')!).getByRole('button', { name: named(/Add to calendar/) });
    await user.click(button);
    await user.tab(); // .ics
    await user.tab(); // Google
    await user.tab(); // Open in Maps (outside the disclosure)
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('the event .ics: one VEVENT, the event file name, the page language', async () => {
    const files = captureDownloads();
    const user = userEvent.setup();
    renderAt('/bn/?side=bride');
    const wedding = document.getElementById('wedding')!;
    await user.click(within(wedding).getByRole('button', { name: named(/ক্যালেন্ডারে যোগ করুন/) }));
    await act(async () => {
      await user.click(within(wedding).getByRole('button', { name: named('Apple · Outlook (.ics)') }));
    });
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe('akshay-shreya-wedding.ics');
    expect(files[0]!.blob.type).toMatch(/^text\/calendar/);
    const text = await blobText(files[0]!.blob);
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(text).toContain('DTSTART:20261126T123000Z');
    // SUMMARY in Bengali, bride first (G-ORDER-1); fold-aware: unfold before matching
    const unfolded = text.replace(/\r\n /g, '');
    const v = FILES.bn.variants.B1;
    expect(unfolded).toContain(`SUMMARY:${escapeText(plainCopy(`${v.events[3]!.title} · ${v.pair.text}`))}`);
  });

  it('"Add all": every event of the variant in one file, and one Google link per event', async () => {
    const files = captureDownloads();
    const user = userEvent.setup();
    renderAt('/hi/?reception=0');
    const header = document.getElementById('celebrations')!;
    const all = within(header).getByRole('button', { name: named(/सभी कार्यक्रम कैलेंडर में जोड़ें/) });
    await user.click(all);
    const panel = document.getElementById(all.getAttribute('aria-controls')!)!;
    expect(within(panel).getAllByRole('link')).toHaveLength(4); // no Reception with reception=0 (G-REC-1)
    await act(async () => {
      await user.click(within(panel).getByRole('button', { name: named('Apple · Outlook (.ics)') }));
    });
    expect(files[0]!.name).toBe('akshay-shreya-celebrations.ics');
    const text = await blobText(files[0]!.blob);
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    expect(text).not.toContain('reception-20261129');
    expect(all).toHaveFocus();
  });

  it('the countdown offers the wedding alone', () => {
    renderAt('/en/');
    const cd = document.getElementById('countdown')!;
    const button = within(cd).getByRole('button', { name: named(/Add to calendar/) });
    const panel = document.getElementById(button.getAttribute('aria-controls')!)!;
    const google = within(panel).getByRole('link', { hidden: true });
    expect(new URL(google.getAttribute('href')!).searchParams.get('dates')).toBe('20261126T123000Z/20261126T123000Z');
  });
});

describe('Open in Maps (A-EV-4)', () => {
  it('every event and every venue day links the English map line in a new tab', () => {
    renderAt('/mai/?side=bride');
    const v = FILES.mai.variants.B1;
    for (const e of v.events) {
      const a = within(document.getElementById(e.key)!).getByRole('link', { name: named(/मैपमे देखू/) });
      expect(a).toHaveAttribute(
        'href',
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.mapQuery)}`,
      );
      expect(a).toHaveAttribute('target', '_blank');
    }
    const venueLinks = within(document.getElementById('venues')!).getAllByRole('link', { name: named(/मैपमे देखू/) });
    expect(venueLinks.map((a) => new URL(a.getAttribute('href')!).searchParams.get('query'))).toEqual(
      v.days.map((d) => d.mapQuery),
    );
  });
});

describe('ics text helpers', () => {
  it('escapes TEXT per RFC 5545', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });
  it('folds at 75 octets and never splits a UTF-8 sequence (Devanagari, Bengali)', () => {
    const enc = new TextEncoder();
    for (const s of [
      'SUMMARY:' + 'शुभ विवाह · '.repeat(12),
      'SUMMARY:' + 'অক্ষয় ও শ্রেয়া '.repeat(12),
      'X:' + 'a'.repeat(200),
    ]) {
      const folded = foldLine(s);
      const lines = folded.split('\r\n');
      for (const l of lines) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
      for (const l of lines.slice(1)) expect(l.startsWith(' ')).toBe(true);
      expect(lines.map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(s);
    }
  });
  it('drops the hygiene characters for calendars', () => {
    expect(plainCopy('गुरुजन\u2060-\u2060परिजनक\u00a0घर')).toBe('गुरुजन-परिजनक घर');
  });
});
