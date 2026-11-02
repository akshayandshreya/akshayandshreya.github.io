// G-I18N-1 and G-I18N-2 (spec 2.1.2, 4.6, 6.2, 8.0) and A-LANG-1 (8.8) in real browsers.
import { expect, test } from '@playwright/test';
import { FILES, LANGS, VARIANTS, copyOf, norm, open, pageUrl } from './support/site';

const top = (page: import('@playwright/test').Page, id: string) =>
  page.evaluate((i) => {
    const el = document.getElementById(i);
    return el ? el.getBoundingClientRect().top / window.innerHeight : null;
  }, id);

async function switchTo(page: import('@playwright/test').Page, lang: string) {
  const link = page.locator('header nav a[hreflang="' + lang + '"]').first();
  if (await link.isVisible()) await link.click();
  else await page.locator('footer nav a[hreflang="' + lang + '"]').click();
}

test.describe('G-I18N-1: the language switch keeps the query and the place', () => {
  test('/hi/?side=bride&reception=0#haldi -> bn keeps everything, Haldi stays put, no replay', async ({ page }) => {
    await open(page, '/hi/?side=bride&reception=0#haldi');
    await page.waitForTimeout(600); // the scrollspy settles on #haldi
    const before = await top(page, 'haldi');
    expect(before).not.toBeNull();
    await switchTo(page, 'bn');
    await page.waitForURL(/\/bn\/\?side=bride&reception=0#haldi$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
    await expect(page.locator('#haldi h3')).toHaveText(norm(copyOf('bn', 'B0').events.find((e) => e.key === 'haldi')!.title));
    const after = await top(page, 'haldi');
    expect(Math.abs(after! - before!), `Haldi moved from ${before} to ${after} viewport heights`).toBeLessThanOrEqual(0.1);
    // nothing in Haldi waits for (or plays) its entrance again
    const replay = await page.evaluate(() => {
      const s = document.getElementById('haldi')!;
      const pending = s.querySelectorAll('[data-reveal="pending"], [data-reveal="in"]').length;
      const running = document
        .getAnimations()
        .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity)
        .filter((a) => {
          const t = (a.effect as KeyframeEffect | null)?.target;
          return t instanceof Element && s.contains(t) && !t.closest('.frame');
        }).length;
      return { pending, running };
    });
    expect(replay).toEqual({ pending: 0, running: 0 });
    // Back returns to Hindi (push, not replace)
    await page.goBack();
    await page.waitForURL(/\/hi\/\?side=bride&reception=0/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  });

  test('every switch link carries the query and the section in view', async ({ page }) => {
    await open(page, '/mai/?reception=0#venues');
    await page.waitForTimeout(600);
    const hrefs = await page.locator('header nav a[hreflang]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs).toEqual(['/en/?reception=0#venues', '/hi/?reception=0#venues', '/mai/?reception=0#venues', '/bn/?reception=0#venues']);
  });

  test('A-LANG-1 @phone: compact labels below 480 px keep full aria-labels; aria-current on the current one', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '/bn/');
    const links = page.locator('header nav a[hreflang]');
    await expect(links).toHaveCount(4);
    expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute('aria-label')))).toEqual(['English', 'हिन्दी', 'मैथिली', 'বাংলা']);
    expect(await links.evaluateAll((as) => as.map((a) => (a as HTMLElement).innerText.trim()))).toEqual(['EN', 'हि', 'मै', 'বা']);
    await expect(links.nth(3)).toHaveAttribute('aria-current', 'true');
    for (const i of [0, 1, 2]) await expect(links.nth(i)).not.toHaveAttribute('aria-current', /.*/);
  });
});

test.describe('G-I18N-2: head and numerals per language and variant', () => {
  for (const lang of LANGS) {
    test(`${lang}: the pre-rendered head is right for G1 (no JS needed)`, async ({ request }) => {
      const html = await (await request.get(`/${lang}/`)).text();
      const c = copyOf(lang, 'G1');
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      expect(html).toContain(`<html lang="${lang}"`);
      expect(html).toContain(`<title>${esc(c.head.title)}</title>`);
      expect(html).toContain(`name="description" content="${esc(c.head.description)}"`);
      expect(html).toContain(`property="og:title" content="${esc(c.head.title)}"`);
      expect(html).toContain(`property="og:locale" content="${FILES[lang].meta.ogLocale}"`);
      expect(html).toContain('name="robots" content="noindex, nofollow"');
    });

    for (const key of VARIANTS) {
      test(`${lang} ${key}: client head and native numerals`, async ({ page, browserName }) => {
        test.skip(browserName !== 'chromium' && key !== 'B0', 'the full variant matrix runs on Chromium');
        await open(page, pageUrl(lang, key));
        const c = copyOf(lang, key);
        await expect(page).toHaveTitle(c.head.title);
        await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', c.head.description);
        await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', c.head.description);
        if (lang !== 'en') {
          const latin = await page.evaluate(() => {
            const bad: string[] = [];
            const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            for (let n = w.nextNode(); n; n = w.nextNode()) {
              const t = n.textContent ?? '';
              if (/[0-9]/.test(t) && !n.parentElement?.closest('[lang="en"]')) bad.push(t.trim());
            }
            return bad;
          });
          expect(latin).toEqual([]);
          const digits = await page.locator('#countdown .t-digits').allTextContents();
          expect(digits.join('')).toMatch(lang === 'bn' ? /^[০-৯]+$/ : /^[०-९]+$/);
        }
      });
    }
  }
});
