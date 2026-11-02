// G-PRIV-1 and A-OPT-1 (spec 6.3, 8.0, 8.9): a full scroll with the usual interactions requests the site's own
// origin only (no fonts, analytics, maps or audio from anywhere else; no audio at all by default).
import { expect, test } from '@playwright/test';
import { open, pageUrl, scrollThrough } from './support/site';

for (const [lang, key] of [
  ['en', 'G1'],
  ['bn', 'B0'],
  ['mai', 'G1'],
] as const) {
  test(`${lang} ${key}: same-origin requests only, no CSP violation`, async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __csp: string[] };
      w.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await open(page, pageUrl(lang, key));
    await scrollThrough(page, 200);
    await page.locator('header button[aria-controls="section-nav"]').click();
    await page.keyboard.press('Escape');
    await page.locator('header nav a[hreflang="hi"]').first().hover();
    await page.waitForTimeout(500);
    const origin = new URL(baseURL!).origin;
    const foreign = urls.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
    expect(foreign).toEqual([]);
    expect(urls.filter((u) => /\.(mp3|m4a|ogg|opus|wav|aac)(\?|$)/.test(u))).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
  });
}
