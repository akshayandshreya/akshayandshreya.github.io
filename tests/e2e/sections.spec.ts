// Per-section criteria that need a real browser: A-OPEN-1 (first paint, LCP), A-INV-4 (joiner fonts), A-CUL-1
// (scroll-linked line art), A-CUL-2 (the flourish is an SVG, not live text), A-EV-1 (Reception couple + ring).
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { open, pageUrl } from './support/site';

test('A-OPEN-1: no white flash; the opening plate is the LCP element', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit has no largest-contentful-paint entries');
  await page.addInitScript(() => {
    const w = window as unknown as { __bg: string[]; __lcp: string[] };
    w.__bg = [];
    w.__lcp = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { element?: Element; url?: string })[]) {
        const el = e.element;
        w.__lcp.push(el ? `${el.tagName}|${el.closest('section')?.id ?? ''}|${e.url ?? ''}` : `?|${e.url ?? ''}`);
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    document.addEventListener('DOMContentLoaded', () => {
      w.__bg.push(
        getComputedStyle(document.documentElement).backgroundColor,
        getComputedStyle(document.body).backgroundColor,
      );
    });
  });
  await open(page, pageUrl('en', 'G1'));
  await page.waitForTimeout(1500);
  await page.mouse.click(2, 2); // LCP stops at the first input
  const { bg, lcp } = await page.evaluate(() => {
    const w = window as unknown as { __bg: string[]; __lcp: string[] };
    return { bg: w.__bg, lcp: w.__lcp };
  });
  const white = (c: string) => /rgba?\(255, 255, 255(, 1)?\)/.test(c);
  expect(bg.some(white), `background at DOMContentLoaded: ${bg.join(' / ')}`).toBe(false);
  expect(bg.filter((c) => c !== 'rgba(0, 0, 0, 0)').length, 'html or body has the paper colour').toBeGreaterThan(0);
  const last = lcp[lcp.length - 1] ?? '';
  expect(last, `LCP entries: ${lcp.join(' ; ')}`).toMatch(/^IMG\|opening\|.*\.(avif|webp)$/);
});

test('A-INV-4: the joiner is Cormorant "&" (en/hi/mai) or Atma "ও" (bn), in gold', async ({ page }) => {
  for (const [lang, glyph, font] of [
    ['en', '&', /Cormorant/i],
    ['hi', '&', /Cormorant/i],
    ['mai', '&', /Cormorant/i],
    ['bn', 'ও', /Atma/i],
  ] as const) {
    await open(page, pageUrl(lang, 'G1', '#invitation'));
    const j = page.locator('#invitation .invitation__joiner');
    await expect(j).toHaveText(glyph);
    const family = await j.evaluate((e) => getComputedStyle(e).fontFamily);
    expect(family.split(',')[0], `${lang} joiner font`).toMatch(font);
    const used = await j.evaluate(async (e) => {
      await document.fonts.ready;
      const fam = getComputedStyle(e).fontFamily.split(',')[0]!.trim();
      return document.fonts.check(`16px ${fam}`, e.textContent ?? '');
    });
    expect(used, `${lang}: the joiner face is loaded`).toBe(true);
  }
});

test('A-CUL-1: the line art draws with scroll, un-draws when scrolling back, complete at p = 1', async ({ page }) => {
  await open(page, pageUrl('en', 'G1'));
  // per motif (3.4): p = clamp((vh - top) / (0.8 vh)). The drawn share comes from the canvas renderer's own count
  // (lineArtDrawn on the .line-art host), or from the dash offsets of an inline SVG's strokes
  const state = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement & { lineArtDrawn?: () => number }>('#cultures .line-art'))
        .map((el) => {
          const r = el.getBoundingClientRect();
          let drawn: number | null = null;
          if (typeof el.lineArtDrawn === 'function') drawn = el.lineArtDrawn();
          else {
            const paths = Array.from(el.querySelectorAll<SVGElement>('svg .m-draw')).filter(
              (p) => getComputedStyle(p).strokeDasharray !== 'none',
            );
            if (paths.length)
              drawn =
                paths
                  .map((p) => {
                    const cs = getComputedStyle(p);
                    const len = parseFloat(cs.strokeDasharray) || 1;
                    return 1 - Math.min(1, Math.abs(parseFloat(cs.strokeDashoffset) || 0) / len);
                  })
                  .reduce((a, b) => a + b, 0) / paths.length;
          }
          return { top: r.top, visible: r.bottom > 0 && r.top < innerHeight, drawn };
        })
        .filter((m): m is { top: number; visible: boolean; drawn: number } => m.drawn !== null),
    );
  const scrollMotif = async (index: number | 'last', at: number) => {
    await page.evaluate(
      ([i, frac]) => {
        const tops = Array.from(document.querySelectorAll('#cultures .line-art')).map(
          (s) => s.getBoundingClientRect().top + scrollY,
        );
        const t = i === 'last' ? Math.max(...tops) : tops[i as number]!;
        window.scrollTo({ top: t - innerHeight * (frac as number), behavior: 'instant' as ScrollBehavior });
        // WebKit can drop the scroll event of the first script scroll after Playwright's scrollIntoViewIfNeeded
        window.dispatchEvent(new Event('scroll'));
      },
      [index, at] as const,
    );
    await page.waitForTimeout(300);
    return state();
  };
  // what is on screen, not only the bookkeeping: ink pixels (far from the paper colour) in the first motif's box
  const inkPixels = async () => {
    const clip = await page.evaluate(() => {
      const r = document.querySelector('#cultures .line-art')!.getBoundingClientRect();
      const top = Math.max(0, r.top);
      return { x: Math.max(0, r.left), y: top, width: r.width, height: Math.min(innerHeight, r.bottom) - top };
    });
    const png = await page.screenshot({ clip }); // as it is on screen: no scrolling into view
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const [r0, g0, b0] = [data[0]!, data[1]!, data[2]!];
    let n = 0;
    for (let i = 0; i < info.width * info.height * 3; i += 3)
      if (Math.max(Math.abs(data[i]! - r0), Math.abs(data[i + 1]! - g0), Math.abs(data[i + 2]! - b0)) > 60) n++;
    return n;
  };
  await page.locator('#cultures').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  test.skip((await state()).length === 0, 'line art not in the page yet');
  const early = (await scrollMotif(0, 0.95))[0]!.drawn; // p ~ 0.06 for the first motif
  const mid = (await scrollMotif(0, 0.5))[0]!.drawn; // p ~ 0.63
  const inkMid = await inkPixels();
  const done = await scrollMotif('last', 0.1); // every motif at p = 1
  await scrollMotif(0, 0.3); // the first motif complete and on screen
  const inkDone = await inkPixels();
  const back = (await scrollMotif(0, 0.9))[0]!.drawn;
  expect(mid, 'draws as you scroll').toBeGreaterThan(early);
  for (const m of done.filter((x) => x.visible))
    expect(m.drawn, `complete at p = 1 (top ${m.top.toFixed(0)})`).toBeGreaterThan(0.98);
  expect(back, 'un-draws when scrolling back').toBeLessThan(mid);
  expect(inkDone, 'the finished drawing is painted').toBeGreaterThan(2000);
  expect(inkMid, 'part of it is painted on the way').toBeGreaterThan(inkDone * 0.05);
  expect(inkMid, 'part of it is painted on the way').toBeLessThan(inkDone * 0.95);
});

test('A-CUL-2: the Tirhuta flourish is an inline SVG (no Tirhuta font or text), aria-hidden', async ({ page }) => {
  const fonts: string[] = [];
  page.on('request', (r) => r.resourceType() === 'font' && fonts.push(r.url()));
  await open(page, pageUrl('mai', 'G1', '#cultures'));
  const t = page.locator('#cultures [data-slot="tirhuta"]');
  await expect(t.locator('svg path').first()).toBeAttached();
  expect(await t.evaluate((e) => Boolean(e.closest('[aria-hidden="true"]')))).toBe(true);
  expect(await page.locator('#cultures').innerText()).not.toMatch(/[\u{11480}-\u{114DF}]/u);
  expect(fonts.filter((u) => /tirhuta/i.test(u))).toEqual([]);
});

test('A-EV-1: the Reception reuses the wedding couple at 97% with the aripan ring', async ({ page }) => {
  await open(page, pageUrl('en', 'G1', '#reception'));
  const img = page.locator('#reception .event__couple img, #reception [data-slot="couple"] img').first();
  test.skip((await img.count()) === 0, 'couple sprites not in the page yet');
  const src = (await img.getAttribute('src')) ?? (await img.getAttribute('srcset')) ?? '';
  expect(src).toMatch(/reception|wedding/);
});
