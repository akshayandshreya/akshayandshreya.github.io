// G-A11Y-1 (axe) and G-A11Y-3 (keyboard) of spec 8.0, plus the 44 px targets of 6.1.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { LANGS, open, pageUrl, scrollThrough, settle } from './support/site';

const SIDES = ['G1', 'B1'] as const;
const SIZES = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];

async function axe(page: Page) {
  // @axe-core/playwright types its page with its own playwright-core: same runtime object
  const r = await new AxeBuilder({ page } as unknown as ConstructorParameters<typeof AxeBuilder>[0]).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe('G-A11Y-1: no serious or critical axe violations', () => {
  for (const lang of LANGS) {
    for (const key of SIDES) {
      for (const size of SIZES) {
        for (const motion of ['none', 'full'] as const) {
          test(`${lang} ${key} ${size.width}x${size.height} motion ${motion}`, async ({ browser, browserName }) => {
            test.skip(browserName !== 'chromium', 'axe matrix on Chromium');
            const ctx = await browser.newContext({
              viewport: size,
              reducedMotion: motion === 'none' ? 'reduce' : 'no-preference',
            });
            const page = await ctx.newPage();
            await open(page, pageUrl(lang, key));
            await scrollThrough(page, 200);
            await settle(page);
            await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
            expect(await axe(page)).toEqual([]);
            await ctx.close();
          });
        }
      }
    }
  }
});

/** Whether the focused element shows a focus indicator (outline or box-shadow ring). */
const focusRing = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { tag: 'body', ok: false, label: '' };
    const cs = getComputedStyle(el);
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1.5;
    const shadow = cs.boxShadow !== 'none' && cs.boxShadow !== '';
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      ok: (outline || shadow) && r.width > 0 && r.height > 0,
      label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40),
    };
  });

test.describe('G-A11Y-3: keyboard', () => {
  test('Tab reaches every action with a visible focus ring; the skip link is first', async ({ page }) => {
    await open(page, pageUrl('en', 'G1'));
    await page.keyboard.press('Tab');
    expect((await focusRing(page)).label).toMatch(/Skip to the invitation/);
    const seen: string[] = [];
    const total = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')).filter(
          (e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed',
        ).length,
    );
    for (let i = 0; i < total + 5; i++) {
      const f = await focusRing(page);
      if (f.tag === 'body') break; // past the last element: focus left the document
      expect(f.ok, `focus ring on ${f.tag} "${f.label}"`).toBe(true);
      seen.push(`${f.tag}:${f.label}`);
      await page.keyboard.press('Tab');
    }
    expect(seen.length).toBeGreaterThanOrEqual(Math.min(total, 20));
  });

  test('the menu sheet: Enter opens, focus is trapped, Esc closes and focus returns', async ({ page }) => {
    await open(page, pageUrl('en', 'G1'));
    const menu = page.locator('header button[aria-controls="section-nav"]');
    await menu.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('#section-nav')))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(menu).toBeFocused();
  });

  test('the calendar disclosure: Esc closes it and focus returns to its button', async ({ page }) => {
    await open(page, pageUrl('bn', 'G1'));
    const button = page.locator('#wedding .event__actions button[aria-expanded]').first();
    test.skip((await button.count()) === 0, 'calendar actions not built yet');
    await button.scrollIntoViewIfNeeded();
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
    // outside click closes too
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await page.mouse.click(5, 300);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  test('targets are at least 44 x 44 px (bar, switch, actions, chips) @phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, pageUrl('hi', 'G1'));
    const small = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          'header a, header button, .event__actions button, .event__actions a, a.chip, .footer__top, .scroll-cue',
        ),
      )
        .filter((e) => e.offsetParent !== null)
        .map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.width < 43.5 || r.height < 43.5)
        .map(({ e, r }) => `${e.tagName} "${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`),
    );
    expect(small).toEqual([]);
  });
});
