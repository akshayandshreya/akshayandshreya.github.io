// G-FACT-1, G-FACT-2, G-ORDER-1, G-REC-1 (spec 8.0) on the rendered page of all 16 variants, in real browsers.
import { expect, test } from '@playwright/test';
import { FORBIDDEN, LANGS, PHONE, VARIANTS, copyOf, norm, open, pageUrl, sectionIds, separatedText } from './support/site';

const JHA = { en: 'Jha', hi: 'झा', mai: 'झा', bn: 'ঝা' } as const;

for (const lang of LANGS) {
  for (const key of VARIANTS) {
    test(`${lang} ${key}: facts, order and reception`, async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium' && key !== 'G1' && key !== 'B0', 'all 16 on Chromium, G1 + B0 elsewhere');
      await open(page, pageUrl(lang, key));
      const c = copyOf(lang, key);
      const groom = key[0] === 'G';
      const rec = key[1] === '1';

      // G-FACT-1: every event fact, as generated
      for (const e of c.events) {
        const t = norm(await page.locator(`#${e.key}`).textContent());
        for (const f of [e.title, e.tagline, e.venue, e.address[0], e.address[1]]) expect(t, `${e.key}`).toContain(norm(f));
        for (const part of e.dateTime.split(' · ')) expect(t).toContain(norm(part));
      }
      // G-FACT-2
      const text = await separatedText(page);
      expect(text).not.toMatch(FORBIDDEN);
      expect(text.replace(/852201|८५२२०१|৮৫২২০১/g, '')).not.toMatch(PHONE);

      // G-ORDER-1
      const people = await page.locator('#invitation .invitation__person').evaluateAll((ps) => ps.map((p) => (p as HTMLElement).dataset.role));
      expect(people).toEqual(groom ? ['groom', 'bride'] : ['bride', 'groom']);
      const monograms = await page.locator('.monogram__text').allTextContents();
      expect(new Set(monograms.map((m) => m.trim()))).toEqual(new Set([groom ? 'AS' : 'SA']));
      const fam = await page.locator('#closing .t-family').allTextContents();
      expect(fam[0]!.includes(JHA[lang])).toBe(groom);
      const firstName = groom ? copyOf(lang, 'G1').pair.first : copyOf(lang, 'G1').pair.second;
      for (const sel of ['#opening .t-pair', '#footer .t-pair']) {
        expect(norm(await page.locator(sel).textContent()).startsWith(norm(firstName)), sel).toBe(true);
      }
      expect((await page.title()).startsWith(firstName)).toBe(true);

      // G-REC-1
      const ids = await sectionIds(page);
      expect(ids.includes('reception')).toBe(rec);
      await expect(page.locator('a[href="#reception"]')).toHaveCount(rec ? 2 : 0); // chip + menu item
      await expect(page.locator('#venues .venue-card')).toHaveCount(rec ? 2 : 1);
      if (!rec) expect(text).not.toMatch(/29|२९|২৯/);
    });
  }
}
