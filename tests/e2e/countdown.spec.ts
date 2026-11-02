// A-CD-2..4 in real browsers (spec 2.3.3, 8.3).
import { expect, test } from '@playwright/test';
import { AFTER_START, open, pageUrl, waitUntil } from './support/site';

test('A-CD-3: the row never shifts width when the digits change', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-02T10:00:58Z') });
  await page.goto(pageUrl('bn', 'G1', '#countdown'));
  await waitUntil(page, () => /\bmotion-/.test(document.documentElement.className), null);
  const row = page.locator('#countdown .countdown__units');
  const w0 = (await row.boundingBox())!.width;
  const d0 = await page.locator('#countdown .t-digits').allTextContents();
  for (let i = 0; i < 12; i++) {
    await page.clock.runFor(60_000);
    const box = (await row.boundingBox())!;
    expect(Math.abs(box.width - w0), `width after ${i + 1} min`).toBeLessThanOrEqual(0.5);
  }
  expect(await page.locator('#countdown .t-digits').allTextContents()).not.toEqual(d0);
});

test('A-CD-4: after the start: no section, no nav item, #countdown lands on the celebrations', async ({ page }) => {
  await open(page, pageUrl('en', 'G1', '#countdown'), { at: AFTER_START });
  await expect(page.locator('#countdown')).toHaveCount(0);
  await expect(page.locator('a[href="#countdown"]')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => Math.abs(document.getElementById('celebrations')!.getBoundingClientRect().top)))
    .toBeLessThan(120);
});
