// G-ROUTE-1 (spec 2.1, 8.0, 9.5): the URL contract on the static dist/ served by a plain static host (directory
// indexes + 404.html, no rewrites), with query and hash kept through every redirect.
import { expect, test } from '@playwright/test';
import { fixClock } from './support/site';

const CASES: [string, string][] = [
  ['/en/', '/en/'],
  ['/en', '/en/'],
  ['/bn?side=bride#haldi', '/bn/?side=bride#haldi'],
  ['/EN/?side=bride#haldi', '/en/?side=bride#haldi'],
  ['/english', '/en/'],
  ['/hindi?reception=0', '/hi/?reception=0'],
  ['/Maithili/', '/mai/'],
  ['/bangla#venues', '/bn/#venues'],
  ['/bengali', '/bn/'],
  ['/bn/some/deep/path?x=1#haldi', '/bn/?x=1#haldi'],
  ['/nowhere?side=bride#wedding', '/en/?side=bride#wedding'],
  ['/fr/', '/en/'],
];

test.describe('G-ROUTE-1: the URL contract on a static host', () => {
  for (const [from, to] of CASES) {
    test(`${from} -> ${to}`, async ({ page }) => {
      await fixClock(page);
      await page.goto(from);
      await page.waitForURL((u) => `${u.pathname}${u.search}${u.hash}` === to, { timeout: 10_000 });
      await expect(page.locator('h1')).toHaveCount(1);
      const lang = to.split('/')[1];
      await expect(page.locator('html')).toHaveAttribute('lang', lang!);
    });
  }

  test('/ follows the browser language (bn-IN)', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'bn-IN' });
    const page = await ctx.newPage();
    await page.goto('/?side=bride#closing');
    await page.waitForURL(/\/bn\/\?side=bride#closing$/);
    await ctx.close();
  });

  test('/ prefers mai over hi when both are listed', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'languages', { get: () => ['hi-IN', 'mai', 'en'] });
    });
    await page.goto('/');
    await page.waitForURL(/\/mai\/$/);
  });

  test('/ uses the stored choice first', async ({ page }) => {
    await page.goto('/en/');
    await page.evaluate(() => localStorage.setItem('asw.lang', 'hi'));
    await page.goto('/#venues');
    await page.waitForURL(/\/hi\/#venues$/);
  });

  test('/ without JavaScript: a refresh to en/ and four plain links', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    const res = await page.goto('/', { waitUntil: 'commit' });
    const html = (await res?.text()) ?? '';
    expect(html).toMatch(/<meta http-equiv="refresh" content="0; ?url=\/?en\/"/i);
    for (const l of ['en', 'hi', 'mai', 'bn']) expect(html).toContain(`href="/${l}/"`);
    await ctx.close();
  });

  test('the language pages are files (200) and unknown paths get the 404 page', async ({ request }) => {
    for (const l of ['en', 'hi', 'mai', 'bn']) expect((await request.get(`/${l}/`)).status()).toBe(200);
    const miss = await request.get('/nowhere/at/all');
    expect(miss.status()).toBe(404);
    expect(await miss.text()).toContain('redirect.js');
  });

  test('Back after a redirect does not loop', async ({ page }) => {
    await page.goto('/en/');
    await page.goto('/english');
    await page.waitForURL(/\/en\/$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/en\/$/);
  });
});
