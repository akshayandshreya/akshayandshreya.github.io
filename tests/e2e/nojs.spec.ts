// G-NOJS-1 and A-CD-5 (spec 8.0, 8.3): with JavaScript off every section shows, with its plate and every fact.
import { expect, test } from '@playwright/test';
import { FILES, LANGS, copyOf, norm } from './support/site';

test.use({ javaScriptEnabled: false });

for (const lang of LANGS) {
  test(`${lang}: all sections, plates and facts without JavaScript`, async ({ page, browserName }) => {
    await page.goto(`/${lang}/`);
    const c = copyOf(lang, 'G1');
    const ids = ['opening', 'invitation', 'countdown', 'celebrations', ...c.events.map((e) => e.key), 'cultures', 'venues', 'closing', 'footer'];
    for (const id of ids) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box?.height ?? 0, `#${id} has height`).toBeGreaterThan(40);
    }
    // nothing waits for a script to become visible
    const hidden = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('main *, footer *'))
        .filter((e) => Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim()))
        .filter((e) => !e.closest('.sr-only, [hidden], #section-nav'))
        .filter((e) => {
          const cs = getComputedStyle(e);
          return cs.visibility === 'hidden' || Number(cs.opacity) < 0.99 || cs.display === 'none';
        })
        .map((e) => e.textContent!.trim().slice(0, 30)),
    );
    expect(hidden).toEqual([]);
    const body = norm(await page.locator('main').textContent());
    for (const e of c.events) for (const f of [e.title, e.venue, e.address[0], e.address[1]]) expect(body).toContain(norm(f));
    // links work: anchors point at existing ids, outbound links are complete
    const broken = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
        .map((a) => a.getAttribute('href')!)
        .filter((h) => (h.startsWith('#') ? !document.getElementById(h.slice(1)) : !/^(https:\/\/|\/)/.test(h))),
    );
    expect(broken).toEqual([]);
    // A-CD-5: the countdown heading and the wedding line, no numbers
    const cd = norm(await page.locator('#countdown').textContent());
    expect(cd).toContain(norm(FILES[lang].ui['countdown.title'] as string));
    expect(cd).toContain(norm(c.events.find((e) => e.key === 'wedding')!.dateTime.split(' · ')[0]!));
    expect(await page.locator('#countdown .t-digits').allTextContents()).toEqual(['—', '—', '—']);
    // plates (if any image is in the section) load natively, lazily, without script. Playwright's Linux WebKit
    // advertises AVIF but cannot decode it (environment, not the site): the decode check runs on Chromium/Firefox;
    // Safari is checked on a real iPhone (docs/QA.md, manual list)
    for (const id of browserName === 'webkit' ? [] : ['opening', 'haldi', 'closing']) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      const imgs = page.locator(`#${id} img`);
      const n = await imgs.count();
      for (let i = 0; i < n; i++) {
        const img = imgs.nth(i);
        if (!(await img.isVisible())) continue;
        const src = await img.evaluate((e: HTMLImageElement) => e.currentSrc || e.src);
        await expect
          .poll(() => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0), { timeout: 8000, message: `#${id} image loads: ${src}` })
          .toBe(true);
      }
    }
  });
}

