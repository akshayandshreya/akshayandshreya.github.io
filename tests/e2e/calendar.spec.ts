// A-EV-1, A-EV-3..6 (spec 2.3.4, 8.4): event structure, alternating sides, Maps and calendar actions; the downloaded
// .ics is validated byte for byte with the independent reader in tests/unit/support/ics.ts.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { events, icsUtc, parseIcs, prop, unescapeText, validateIcsBytes } from '../unit/support/ics';
import { LANGS, copyOf, norm, open, pageUrl } from './support/site';

test.describe('A-EV-4/6: outbound links', () => {
  test('Open in Maps: the English map line, a new tab, no opener', async ({ page }) => {
    await open(page, pageUrl('bn', 'G1'));
    for (const e of copyOf('bn', 'G1').events) {
      const a = page.locator(`#${e.key} a[href^="https://www.google.com/maps/"]`).first();
      await expect(a).toHaveAttribute('href', `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.mapQuery)}`);
      await expect(a).toHaveAttribute('target', '_blank');
      await expect(a).toHaveAttribute('rel', /noopener/);
    }
  });

  test('Google Calendar: TEMPLATE at the IST start, start/start, ctz Asia/Kolkata', async ({ page }) => {
    await open(page, pageUrl('hi', 'B1'));
    test.skip((await page.locator('.event__actions button[aria-expanded]').count()) === 0, 'calendar actions not built yet');
    const c = copyOf('hi', 'B1');
    for (const e of c.events) {
      await page.locator(`#${e.key} .event__actions button[aria-expanded]`).first().click();
      const a = page.locator(`#${e.key} a[href^="https://calendar.google.com/"]`).first();
      await expect(a).toBeVisible();
      const u = new URL((await a.getAttribute('href'))!);
      expect(u.searchParams.get('action')).toBe('TEMPLATE');
      expect(u.searchParams.get('dates')).toBe(`${icsUtc(e.startUtc)}/${icsUtc(e.startUtc)}`);
      expect(u.searchParams.get('ctz')).toBe('Asia/Kolkata');
      expect(norm(u.searchParams.get('text'))).toBe(norm(`${e.title} · ${c.pair.text}`));
      await expect(a).toHaveAttribute('target', '_blank');
      await page.keyboard.press('Escape');
    }
  });
});

test.describe('A-EV-5: the downloaded .ics files', () => {
  for (const lang of LANGS) {
    test(`${lang}: one event and "add all" (with and without the Reception)`, async ({ page }) => {
      for (const key of ['G1', 'B0'] as const) {
        await open(page, pageUrl(lang, key));
        test.skip((await page.locator('.event__actions button[aria-expanded]').count()) === 0, 'calendar actions not built yet');
        const c = copyOf(lang, key);
        const grab = async (scope: string) => {
          await page.locator(`${scope} button[aria-expanded]`).first().click();
          const [dl] = await Promise.all([
            page.waitForEvent('download'),
            page.locator(`${scope} button:has-text(".ics")`).first().click(),
          ]);
          const bytes = new Uint8Array(readFileSync((await dl.path())!));
          return { name: dl.suggestedFilename(), bytes };
        };
        const one = await grab('#haldi .event__actions');
        expect(one.name).toBe('akshay-shreya-haldi.ics');
        expect(validateIcsBytes(one.bytes)).toEqual([]);
        const [ev] = events(parseIcs(new TextDecoder().decode(one.bytes)));
        const haldi = c.events.find((e) => e.key === 'haldi')!;
        expect(prop(ev!, 'DTSTART')?.value).toBe(icsUtc(haldi.startUtc));
        expect(prop(ev!, 'DTEND')).toBeUndefined();
        expect(norm(unescapeText(prop(ev!, 'SUMMARY')!.value))).toBe(norm(`${haldi.title} · ${c.pair.text}`));
        expect(unescapeText(prop(ev!, 'LOCATION')!.value)).toBe(haldi.mapQuery);

        const all = await grab('#celebrations');
        expect(all.name).toBe('akshay-shreya-celebrations.ics');
        expect(validateIcsBytes(all.bytes)).toEqual([]);
        const evs = events(parseIcs(new TextDecoder().decode(all.bytes)));
        expect(evs.map((e) => prop(e, 'UID')!.value.split('-')[0])).toEqual(c.events.map((e) => e.key));
      }
    });
  }
});

test.describe('A-EV-1/3: structure and the alternating wide layout', () => {
  test('wide: couple on alternating sides (Mehndi left, Engagement right, ...); stacked: centred', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'layout geometry on Chromium');
    for (const [w, h, wide] of [
      [1440, 900, true],
      [390, 844, false],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await open(page, pageUrl('en', 'G1'));
      const expected = ['left', 'right', 'left', 'right', 'left'];
      const keys = ['mehndi', 'engagement', 'haldi', 'wedding', 'reception'];
      for (const [i, k] of keys.entries()) {
        await page.locator(`#${k}`).scrollIntoViewIfNeeded();
        const g = await page.evaluate((id) => {
          const s = document.getElementById(id)!;
          const fig = s.querySelector('.event__couple img, [data-slot="couple"] img, .event__couple')!.getBoundingClientRect();
          const title = s.querySelector('h3')!.getBoundingClientRect();
          return { fig: fig.left + fig.width / 2, text: title.left + title.width / 2, vw: window.innerWidth, fw: fig.width };
        }, k);
        if (wide) {
          const side = g.fig < g.text ? 'left' : 'right';
          expect(side, `${k} couple side`).toBe(expected[i]);
        } else {
          expect(Math.abs(g.fig - g.vw / 2), `${k} couple centred`).toBeLessThan(g.vw * 0.08);
        }
      }
    }
  });
});
