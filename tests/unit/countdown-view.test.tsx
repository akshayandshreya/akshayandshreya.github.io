// A-CD-1..5 on the rendered countdown (spec 2.3.3, 8.3): device time zones, minute-boundary updates, pausing while
// hidden, disappearing at the wedding start, and the server render without numbers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { render as renderServer } from '../../src/entry-server';
import { resolveSectionHash, visibleSections, sectionFlags } from '../../src/lib/sections';
import { config } from '../../src/config';
import { FILES } from '../helpers';
import { norm, renderVariant } from './support/render';

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  vi.useRealTimers();
  process.env.TZ = ORIGINAL_TZ;
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
});

const digits = () => Array.from(document.querySelectorAll('#countdown .t-digits')).map((d) => norm(d.textContent));

async function mountAt(iso: string, lang: 'en' | 'hi' | 'mai' | 'bn' = 'en') {
  vi.useFakeTimers({ now: Date.parse(iso), toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  const r = renderVariant(lang, 'G1');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return r;
}

describe('A-CD-1: days, hours, minutes to 2026-11-26T12:30:00Z in any device time zone', () => {
  for (const tz of ['UTC', 'Asia/Kolkata', 'America/Los_Angeles']) {
    it(tz, async () => {
      process.env.TZ = tz;
      await mountAt('2026-11-02T10:00:00Z');
      expect(digits()).toEqual(['24', '02', '30']);
      // seconds are off by default (config.countdown.showSeconds)
      expect(document.querySelectorAll('#countdown .countdown__unit')).toHaveLength(3);
    });
  }
  it('one minute before the start shows 0 days, 00 hours, 01 minute (en "minute")', async () => {
    await mountAt('2026-11-26T12:29:00Z');
    expect(digits()).toEqual(['0', '00', '01']);
    const labels = Array.from(document.querySelectorAll('#countdown .t-ui')).map((l) => norm(l.textContent));
    expect(labels).toEqual(['days', 'hours', 'minute']);
  });
});

describe('A-CD-2: unit forms', () => {
  it('hi: घंटा for one hour, घंटे otherwise', async () => {
    await mountAt('2026-11-25T11:00:00Z', 'hi'); // 1 day, 1 hour, 30 minutes
    expect(digits()).toEqual(['१', '०१', '३०']);
    expect(document.querySelectorAll('#countdown .t-ui')[1]?.textContent).toBe('घंटा');
  });
  it('en: day/days', async () => {
    await mountAt('2026-11-25T11:00:00Z');
    expect(document.querySelectorAll('#countdown .t-ui')[0]?.textContent).toBe('day');
  });
});

describe('A-CD-3: minute-boundary updates, paused while hidden', () => {
  it('ticks exactly on each minute boundary with a single timeout (no interval)', async () => {
    await mountAt('2026-11-02T10:00:59.500Z'); // 2 h 29 min 0.5 s left
    expect(digits()).toEqual(['24', '02', '29']);
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500 + 59_999); // 10:01:59.999: still the 10:01:00 value
    });
    expect(digits()).toEqual(['24', '02', '29']);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1); // 10:02:00.000
    });
    expect(digits()).toEqual(['24', '02', '28']);
    expect(vi.getTimerCount()).toBe(1);
  });
  it('stops while the tab is hidden and catches up at once when shown', async () => {
    await mountAt('2026-11-02T10:00:00Z');
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(Date.parse('2026-11-02T13:00:00Z'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(digits()).toEqual(['23', '23', '30']);
    expect(vi.getTimerCount()).toBe(1);
  });
  it('the numbers have tabular, fixed-width slots (min-width 2ch, see e2e for the measured width)', async () => {
    await mountAt('2026-11-02T10:00:00Z');
    for (const d of document.querySelectorAll('#countdown .t-digits')) expect(d.className).toContain('t-digits');
  });
});

describe('A-CD-4: gone at the wedding start', () => {
  it('no section and no nav item at 2026-11-26T12:30:00Z; #countdown maps to #celebrations', async () => {
    await mountAt('2026-11-26T12:30:00Z');
    expect(document.getElementById('countdown')).toBeNull();
    expect(document.querySelector('a[href="#countdown"]')).toBeNull();
    const visible = visibleSections(FILES.en.variants.G1, sectionFlags(config, false));
    expect(resolveSectionHash('#countdown', visible)).toBe('celebrations');
  });
  it('disappears while the page is open when the start passes', async () => {
    await mountAt('2026-11-26T12:29:30Z');
    expect(document.getElementById('countdown')).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(document.getElementById('countdown')).toBeNull();
  });
});

describe('A-CD-5: the pre-rendered page (no JS) shows the heading and the wedding date line, no numbers', () => {
  // jsdom has a window, so the isomorphic layout effect warns under renderToString; the real prerender runs in Node
  beforeEach(() => void vi.spyOn(console, 'error').mockImplementation(() => undefined));
  for (const lang of ['en', 'hi', 'mai', 'bn'] as const) {
    it(lang, async () => {
      const { html } = await renderServer(lang); // sync or async render(lang) -> { html }
      const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
      const cd = doc.getElementById('countdown')!;
      expect(cd).not.toBeNull();
      expect(norm(cd.querySelector('h2')?.textContent)).toBe(norm(FILES[lang].ui['countdown.title'] as string));
      const wedding = FILES[lang].variants.G1.events.find((e) => e.key === 'wedding')!;
      expect(norm(cd.textContent)).toContain(norm(wedding.dateTime));
      const nums = Array.from(cd.querySelectorAll('.t-digits')).map((d) => norm(d.textContent));
      expect(nums.every((n) => n === '—')).toBe(true);
    });
  }
});
