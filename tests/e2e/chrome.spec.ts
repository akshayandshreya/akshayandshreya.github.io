// A-BAR-1, A-NAV-1, A-FOOT-1 and the skip link (spec 2.3.8, 8.7, 8.8) in real browsers.
import { expect, test } from '@playwright/test';
import { copyOf, norm, open, pageUrl } from './support/site';

// A section lands flush with the top of the screen (layout.css, 838ed29): its content already pads for the bar, so a
// bar-height scroll margin would leave a strip of the previous painting above every jumped-to section. The criterion
// that matters, the first heading below the bar, is checked for every section; the bar + 8 px margin stays the rule
// for anchors that are not sections.
test('A-BAR-1: anchor jumps never hide a heading under the bar (sections land flush, padded for the bar)', async ({ page }) => {
  await open(page, pageUrl('en', 'G1'));
  const ids = ['invitation', 'countdown', 'celebrations', 'mehndi', 'haldi', 'reception', 'cultures', 'venues', 'closing'];
  for (const id of ids) {
    const item = page.locator(`#section-nav a[href="#${id}"]`);
    if (await item.count()) {
      await page.locator('header button[aria-controls="section-nav"]').click();
      await item.click();
    } else {
      await page.evaluate((i) => (location.hash = i), id); // sections without a menu item (closing)
    }
    await page.waitForTimeout(900); // smooth scroll, if any
    const g = await page.evaluate((i) => {
      const s = document.getElementById(i)!;
      const bar = document.querySelector('header[data-tone]')!.getBoundingClientRect();
      // the first visible heading, else the first visible text block (the invitation's h2 is visually hidden)
      const first = Array.from(s.querySelectorAll<HTMLElement>('h2:not(.sr-only), h3, [class*="t-"]')).find(
        (e) => e.getBoundingClientRect().height > 0 && !e.closest('.sr-only'),
      );
      const h = (first ?? s).getBoundingClientRect();
      return { barBottom: Math.max(0, bar.bottom), barH: bar.height, heading: h.top, margin: parseFloat(getComputedStyle(s).scrollMarginTop) };
    }, id);
    expect(g.heading, `#${id} heading below the bar`).toBeGreaterThanOrEqual(g.barBottom - 1);
    expect(g.margin, `#${id} lands flush (scroll-margin-top ${g.margin})`).toBeLessThanOrEqual(1.5);
  }
});

test('2.1 deep links: /en/#haldi lands on Haldi under the bar and stays there', async ({ page }) => {
  for (const id of ['haldi', 'venues', 'closing']) {
    // a fresh load each time: from /en/#haldi, a goto to /en/#venues is a same-document hash navigation, not a deep link
    await page.goto('about:blank');
    await open(page, pageUrl('en', 'G1', `#${id}`));
    const where = () =>
      page.evaluate((i) => ({
        top: Math.round(document.getElementById(i)!.getBoundingClientRect().top),
        y: Math.round(scrollY),
      }), id);
    await page.waitForTimeout(700);
    const a = await where();
    await page.waitForTimeout(4000);
    const b = await where();
    expect(Math.abs(a.top), `#${id} in place 0.7 s after load`).toBeLessThan(90);
    expect(b, `#${id} stays put`).toEqual(a);
  }
});

test('A-BAR-1 @phone: the bar hides on scroll down after the invitation and returns on scroll up', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, pageUrl('hi', 'G1', '#celebrations'));
  await page.waitForTimeout(400);
  const barTop = () => page.evaluate(() => document.querySelector('header[data-tone]')!.getBoundingClientRect().bottom);
  // small scroll steps with pauses (a finger flick; mouse.wheel is not available in mobile WebKit)
  const scroll = async (dy: number, n: number) => {
    for (let i = 0; i < n; i++) {
      await page.evaluate((d) => window.scrollBy({ top: d, behavior: 'instant' as ScrollBehavior }), dy);
      await page.waitForTimeout(60);
    }
  };
  await scroll(250, 6);
  await page.waitForTimeout(500);
  expect(await barTop(), 'hidden after scrolling down').toBeLessThanOrEqual(1);
  await scroll(-200, 3);
  await page.waitForTimeout(500);
  expect(await barTop(), 'back after scrolling up').toBeGreaterThan(40);
});

test('A-BAR-1: the bar reads on every section (its tone follows the section in view)', async ({ page }) => {
  await open(page, pageUrl('en', 'G1'));
  for (const [id, tone] of [
    ['haldi', 'light'],
    ['wedding', 'deep'],
    ['reception', 'deep'],
    ['venues', 'light'],
  ] as const) {
    await page.evaluate((i) => document.getElementById(i)!.scrollIntoView({ behavior: 'instant' as ScrollBehavior }), id);
    await page.evaluate(() => window.scrollBy({ top: 40, behavior: 'instant' as ScrollBehavior }));
    await expect(page.locator('header[data-tone]'), `#${id}`).toHaveAttribute('data-tone', tone, { timeout: 3000 });
  }
});

test('A-NAV-1: the sheet lists the variant sections in page order and slides from the right (wide) / bottom (tall)', async ({ page }) => {
  for (const [vp, from] of [
    [{ width: 1440, height: 900 }, 'right'],
    [{ width: 390, height: 844 }, 'bottom'],
  ] as const) {
    await page.setViewportSize(vp);
    await open(page, pageUrl('bn', 'B0'));
    await page.locator('header button[aria-controls="section-nav"]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(500);
    const c = copyOf('bn', 'B0');
    const hrefs = await dialog.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs).toEqual(['#invitation', '#countdown', '#celebrations', ...c.events.map((e) => `#${e.key}`), '#cultures', '#venues']);
    const r = (await page.locator('#section-nav').boundingBox())!;
    if (from === 'right') {
      expect(Math.round(r.x + r.width)).toBe(vp.width);
      expect(Math.round(r.height)).toBe(vp.height);
    } else {
      expect(Math.round(r.y + r.height)).toBe(vp.height);
      expect(Math.round(r.width)).toBe(vp.width);
    }
    await page.keyboard.press('Escape');
  }
});

test('A-FOOT-1 and the skip link', async ({ page }) => {
  await open(page, pageUrl('mai', 'B1'));
  const c = copyOf('mai', 'B1');
  const footer = norm(await page.locator('#footer').textContent());
  expect(footer).toContain(norm(c.pair.text).replace(/\s+/g, ' '));
  for (const e of ['English', 'हिन्दी', 'मैथिली', 'বাংলা']) expect(footer).toContain(e);
  await page.keyboard.press('Tab');
  const skip = page.locator(':focus');
  await expect(skip).toHaveAttribute('href', '#invitation');
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => Math.abs(document.getElementById('invitation')!.getBoundingClientRect().top))).toBeLessThan(120);
});
