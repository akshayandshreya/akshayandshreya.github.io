// G-MOT-1..3 (spec 3, 8.0) and the motion parts of A-OPEN-4, A-CLO-1.
import { expect, test, type Page } from '@playwright/test';
import { open, pageUrl, scrollThrough, settle, waitUntil } from './support/site';

/** Count requestAnimationFrame callbacks from page start (installed before any app code). */
const countRaf = () => {
  const w = window as unknown as { __raf: number };
  w.__raf = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => ((w.__raf += 1), cb(t)));
};

test.describe('G-MOT-3: prefers-reduced-motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('no animations after load or after scrolling to the end, no idle rAF, all content visible', async ({ page }) => {
    await page.addInitScript(countRaf);
    await open(page, pageUrl('en', 'G1'));
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await expect(page.locator('html')).toHaveClass(/motion-none/);
    await scrollThrough(page, 150);
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    const idleStart = await page.evaluate(() => (window as unknown as { __raf: number }).__raf);
    await page.waitForTimeout(2000);
    const idleEnd = await page.evaluate(() => (window as unknown as { __raf: number }).__raf);
    expect(idleEnd - idleStart, 'rAF callbacks while idle').toBe(0);
    const hidden = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('main *'))
        .filter((e) => e.childNodes.length && Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim()))
        .filter((e) => !e.closest('.sr-only, [hidden], [aria-hidden="true"]'))
        .filter((e) => {
          const cs = getComputedStyle(e);
          return cs.visibility === 'hidden' || Number(cs.opacity) < 0.99 || e.dataset.reveal === 'pending';
        })
        .map((e) => e.textContent!.trim().slice(0, 30)),
    );
    expect(hidden).toEqual([]);
  });
});

/** Text elements of one section: position relative to the section, transform, opacity (scrolling is not motion). */
const textGeometry = (page: Page, id: string) =>
  page.evaluate((sid) => {
    const s = document.getElementById(sid)!;
    const sr = s.getBoundingClientRect();
    return Array.from(s.querySelectorAll<HTMLElement>('[class*="t-"]'))
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => {
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        return `${e.className.split(' ')[0]}:${(r.left - sr.left).toFixed(1)},${(r.top - sr.top).toFixed(1)}:${cs.transform}:${cs.opacity}`;
      });
  }, id);

test.describe('motion: full tier', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('G-MOT-1: no text moves after its entrance (10 s idle)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'timing probe on Chromium');
    test.setTimeout(120_000);
    for (const id of ['opening', 'haldi', 'closing']) {
      await open(page, pageUrl('en', 'G1', id === 'opening' ? '' : `#${id}`));
      await page.mouse.move(0, 0);
      await settle(page, 4000);
      const a = await textGeometry(page, id);
      await page.waitForTimeout(5000);
      const b = await textGeometry(page, id);
      await page.waitForTimeout(5000);
      const c = await textGeometry(page, id);
      const diff = (x: string[]) => x.filter((v, i) => v !== a[i]).map((v, i) => `${a[i]} -> ${v}`);
      expect(diff(b), `${id} at 5 s`).toEqual([]);
      expect(diff(c), `${id} at 10 s`).toEqual([]);
    }
  });

  test('G-MOT-2: at most 3 continuous motions per viewport besides the plate drift', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'counted on Chromium');
    await open(page, pageUrl('en', 'G1'));
    const vh = await page.evaluate(() => innerHeight);
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    const report: string[] = [];
    for (let y = 0; y < h; y += vh) {
      await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' as ScrollBehavior }), y);
      await settle(page, 3500);
      // one "motion" = one group of 3.6 (sparks x6 is one motion; a flame on two keyframe tracks is one motion):
      // the closest [data-motion] group, else the gold shimmer, else the element; the plate drift ([data-drift] and
      // the plate/gold pictures of .frame outside any [data-motion] group) does not count
      const groups = await page.evaluate(() => {
        const keys = new Set<string>();
        for (const a of document.getAnimations()) {
          if (a.playState !== 'running' || a.effect?.getTiming().iterations !== Infinity) continue;
          const t = (a.effect as KeyframeEffect | null)?.target;
          if (!(t instanceof Element)) continue;
          const r = t.getBoundingClientRect();
          if (!(r.bottom > 0 && r.top < innerHeight && r.width > 0)) continue;
          const group = t.closest('[data-motion]');
          if (!group && (t.closest('[data-drift]') || t.closest('.frame'))) continue;
          const sec = t.closest('section, footer')?.id ?? 'chrome';
          // the gold shimmer is one synchronised glint on every gold-leaf element in view: one motion
          keys.add(group ? `${sec}:${group.getAttribute('data-motion')}` : t.classList.contains('gold-leaf') ? 'shimmer' : `${sec}:${t.tagName}.${t.classList[0] ?? ''}`);
        }
        return [...keys];
      });
      report.push(`${y}: ${groups.join(', ')}`);
      expect(groups.length, `continuous motions at scrollY ${y}: ${groups.join(', ')}`).toBeLessThanOrEqual(3);
    }
  });

  test('A-OPEN-4: the opening entrance completes within 2.9 s of fonts-ready; the shimmer at most once per 5 s', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'timing probe on Chromium');
    await fixed(page);
    const t0 = Date.now();
    await waitUntil(
      page,
      () =>
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .filter((a) => {
            const t = (a.effect as KeyframeEffect | null)?.target;
            return t instanceof Element && t.closest('#opening');
          })
          .every((a) => a.playState !== 'running'),
      null,
      6000,
    );
    expect(Date.now() - t0).toBeLessThanOrEqual(2900 + 300); // 300 ms probe slack
    const shimmer = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => (a.effect as KeyframeEffect | null)?.target instanceof Element && ((a.effect as KeyframeEffect).target as Element).closest('#opening h1'))
        .filter((a) => a.effect?.getTiming().iterations === Infinity)
        .map((a) => Number(a.effect?.getComputedTiming().duration ?? 0)),
    );
    for (const d of shimmer) expect(d).toBeGreaterThanOrEqual(5000);
  });

  test('A-CLO-1: the diya flame flickers under full motion and is still under none', async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'Chromium');
    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      const ctx = await browser.newContext({ reducedMotion });
      const page = await ctx.newPage();
      await open(page, pageUrl('en', 'G1', '#closing'));
      await settle(page, 4000);
      const n = await page.evaluate(
        () =>
          document.getAnimations().filter((a) => {
            const t = (a.effect as KeyframeEffect | null)?.target;
            return a.playState === 'running' && t instanceof Element && t.closest('#closing [data-slot="diya"], #closing .diya');
          }).length,
      );
      if (reducedMotion === 'reduce') expect(n).toBe(0);
      else expect(n).toBeGreaterThan(0);
      await ctx.close();
    }
  });
});

async function fixed(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00Z'));
  await page.goto(pageUrl('en', 'G1'));
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}
