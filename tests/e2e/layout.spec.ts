// G-RESP-1 (spec 5, 8.0) and the geometric criteria of 8.1-8.6: no horizontal scroll, no clipping, no text over text,
// over the couple or over an obstacle, at all viewports, in the resting state (reduced motion). Also A-OPEN-2/5,
// A-INV-2/3, A-EV-2, A-VEN-1 and A-CUL-2 geometry, and the 4.4 rule that hygiene-joined words never break.
import { expect, test, type Page } from '@playwright/test';
import { LANGS, VIEWPORTS, expectNoHorizontalScroll, open, pageUrl } from './support/site';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

interface Problem {
  kind: string;
  where: string;
  detail: string;
}

/** All layout problems of the section in view (run per section after scrolling it into view). */
function probeSection(id: string): Problem[] {
  const s = document.getElementById(id);
  if (!s) return [];
  const vw = document.documentElement.clientWidth;
  const out: Problem[] = [];
  type Box = { l: number; t: number; r: number; b: number; el: Element; text: string };
  const lines: Box[] = [];
  const walker = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement!;
    const text = (n.textContent ?? '').trim();
    if (!text || el.closest('.sr-only, [hidden], svg')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of Array.from(range.getClientRects())) {
      if (r.width < 1 || r.height < 1) continue;
      // the glyph core: content boxes of tall scripts overlap their neighbours' by design, so shrink 22% each side
      const pad = r.height * 0.22;
      lines.push({ l: r.left, t: r.top + pad, r: r.right, b: r.bottom - pad, el, text: text.slice(0, 24) });
      if (r.left < -1 || r.right > vw + 1) out.push({ kind: 'clipped', where: id, detail: `"${text.slice(0, 24)}" ${r.left.toFixed(0)}..${r.right.toFixed(0)} of ${vw}` });
    }
    // 4.4: words joined with NBSP / U+2060 stay on one line
    const joined = /\S+(?:[\u00a0\u2060]+\S+)+/g;
    for (const m of (n.textContent ?? '').matchAll(joined)) {
      const rr = document.createRange();
      rr.setStart(n, m.index!);
      rr.setEnd(n, m.index! + m[0].length);
      const tops = new Set(Array.from(rr.getClientRects()).filter((x) => x.width > 0).map((x) => Math.round(x.top / 3)));
      if (tops.size > 1) out.push({ kind: 'broken-join', where: id, detail: m[0].replace(/[\u00a0\u2060]/g, '_') });
    }
  }
  const blockOf = (el: Element) => el.closest('p, h1, h2, h3, h4, li, dd, dt, figcaption, a, button') ?? el;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i]!;
      const b = lines[j]!;
      const ba = blockOf(a.el);
      const bb = blockOf(b.el);
      if (ba === bb || ba.contains(bb) || bb.contains(ba)) continue;
      const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
      const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      if (w > 1 && h > 1) out.push({ kind: 'text-overlap', where: id, detail: `"${a.text}" x "${b.text}"` });
    }
  }
  const obstacles = Array.from(s.querySelectorAll('.event__couple img, [data-slot="couple"] img, [data-obstacle]')).map((e) => e.getBoundingClientRect());
  for (const o of obstacles) {
    if (o.width < 2) continue;
    // the couple's transparent margins: test against its inner 80% box
    const ix = o.width * 0.1;
    const iy = o.height * 0.06;
    for (const a of lines) {
      const w = Math.min(a.r, o.right - ix) - Math.max(a.l, o.left + ix);
      const h = Math.min(a.b, o.bottom - iy) - Math.max(a.t, o.top + iy);
      if (w > 2 && h > 2) out.push({ kind: 'text-on-figure', where: id, detail: `"${a.text}"` });
    }
  }
  return out;
}

async function probeAll(page: Page): Promise<Problem[]> {
  const ids = await page.evaluate(() => Array.from(document.querySelectorAll('main > section[id], footer[id]')).map((s) => s.id));
  const all: Problem[] = [];
  for (const id of ids) {
    await page.evaluate((i) => document.getElementById(i)!.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior }), id);
    await page.waitForTimeout(80);
    all.push(...(await page.evaluate(probeSection, id)));
    const h = await page.evaluate((i) => document.getElementById(i)!.getBoundingClientRect().height, id);
    const vh = page.viewportSize()!.height;
    for (let y = vh; y < h - vh * 0.3; y += vh) {
      await page.evaluate((dy) => window.scrollBy({ top: dy, behavior: 'instant' as ScrollBehavior }), vh);
      await page.waitForTimeout(60);
      all.push(...(await page.evaluate(probeSection, id)));
    }
  }
  const seen = new Set<string>();
  return all.filter((p) => {
    const k = `${p.kind}|${p.where}|${p.detail}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

test.describe('G-RESP-1: no horizontal scroll, clipping or overlap', () => {
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    for (const lang of LANGS) {
      for (const key of ['G1', 'B0'] as const) {
        test(`${name} ${vp.width}x${vp.height} ${lang} ${key}`, async ({ page, browserName }) => {
          test.skip(browserName !== 'chromium', 'layout matrix on Chromium (WebKit/Firefox: the phone and laptop rows)');
          await page.setViewportSize(vp);
          await open(page, pageUrl(lang, key));
          await expectNoHorizontalScroll(page);
          const problems = await probeAll(page);
          expect(problems.map((p) => `${p.kind} #${p.where}: ${p.detail}`)).toEqual([]);
          await expectNoHorizontalScroll(page);
        });
      }
    }
  }
  for (const size of [VIEWPORTS.phone, VIEWPORTS.laptop]) {
    test(`other engines ${size.width}x${size.height} bn G1`, async ({ page, browserName }) => {
      test.skip(browserName === 'chromium', 'covered by the Chromium matrix');
      await page.setViewportSize(size);
      await open(page, pageUrl('bn', 'G1'));
      await expectNoHorizontalScroll(page);
      const problems = await probeAll(page);
      expect(problems.map((p) => `${p.kind} #${p.where}: ${p.detail}`)).toEqual([]);
    });
  }
});

test.describe('section geometry', () => {
  test('A-OPEN-2/5: the opening fits a 360x640 screen in card order; the dateline is two lines', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phoneS);
    for (const lang of LANGS) {
      for (const key of ['G1', 'B1'] as const) {
        await open(page, pageUrl(lang, key));
        const g = await page.evaluate(() => {
          const op = document.getElementById('opening')!;
          const sel = ['[data-slot="ganesh"]', '.t-kicker', 'h1', '.gold-rule', '.monogram', '.t-pair', '.t-dateline'];
          const rects = sel.map((q) => op.querySelector(q)!.getBoundingClientRect());
          const spans = Array.from(op.querySelectorAll('.t-dateline > span')).map((s) => {
            const r = document.createRange();
            r.selectNodeContents(s);
            return new Set(Array.from(r.getClientRects()).map((x) => Math.round(x.top / 4))).size;
          });
          const centre = rects.slice(1).map((r) => Math.abs(r.left + r.width / 2 - innerWidth / 2));
          return { tops: rects.map((r) => r.top), bottom: rects[rects.length - 1]!.bottom, spans, centre, vh: innerHeight };
        });
        for (let i = 1; i < g.tops.length; i++) expect(g.tops[i]!, `${lang} ${key} item ${i} order`).toBeGreaterThan(g.tops[i - 1]!);
        expect(g.bottom, `${lang} ${key} fits`).toBeLessThanOrEqual(g.vh);
        expect(g.spans.every((n) => n === 1), `${lang} ${key} dateline lines`).toBe(true);
        expect(Math.max(...g.centre), `${lang} ${key} centred`).toBeLessThan(6);
      }
    }
  });

  test('A-INV-2/3: host line 2 lines (3 at 360 px), honorifics directly above their names', async ({ page }) => {
    for (const vp of [VIEWPORTS.phoneS, VIEWPORTS.phone, VIEWPORTS.laptop]) {
      await page.setViewportSize(vp);
      for (const lang of LANGS) {
        for (const key of ['G1', 'B1'] as const) {
          await open(page, pageUrl(lang, key, '#invitation'));
          const g = await page.evaluate(() => {
            const inv = document.getElementById('invitation')!;
            const lineCount = (el: Element) => {
              const r = document.createRange();
              r.selectNodeContents(el);
              return new Set(Array.from(r.getClientRects()).filter((x) => x.width > 1).map((x) => Math.round(x.top / 4))).size;
            };
            const host = lineCount(inv.querySelector('.t-host')!);
            const names = Array.from(inv.querySelectorAll('.t-names')).map(lineCount);
            const pairs = Array.from(inv.querySelectorAll('.invitation__person')).map((p) => {
              const h = p.querySelector('.t-honor')?.getBoundingClientRect();
              const n = p.querySelector('.t-names')!.getBoundingClientRect();
              return h ? { above: h.bottom <= n.top + 3, off: Math.abs(h.left + h.width / 2 - (n.left + n.width / 2)) / n.width } : null;
            });
            return { host, names, pairs };
          });
          const where = `${lang} ${key} ${vp.width}`;
          if (vp.width >= 390) expect(g.host, `${where} host lines`).toBe(2);
          else expect(g.host, `${where} host lines`).toBeLessThanOrEqual(3);
          expect(g.names, `${where} names unbroken`).toEqual([1, 1]);
          for (const p of g.pairs) if (p) expect(p.above && p.off < 0.25, `${where} honorific above its name`).toBe(true);
        }
      }
    }
  });

  test('A-EV-2: the couple is never cut and clears the tagline by 16 px when stacked', async ({ page }) => {
    for (const vp of [VIEWPORTS.phoneS, VIEWPORTS.phone, VIEWPORTS.tablet, VIEWPORTS.laptop, VIEWPORTS.desktop]) {
      await page.setViewportSize(vp);
      await open(page, pageUrl('en', 'G1'));
      for (const k of ['mehndi', 'engagement', 'haldi', 'wedding', 'reception']) {
        await page.evaluate((id) => document.getElementById(id)!.scrollIntoView({ behavior: 'instant' as ScrollBehavior }), k);
        const g = await page.evaluate((id) => {
          const s = document.getElementById(id)!;
          const img = s.querySelector('.event__couple img, [data-slot="couple"] img');
          if (!img) return null;
          const f = img.getBoundingClientRect();
          const sec = s.getBoundingClientRect();
          const tag = s.querySelector('.event__tagline')!.getBoundingClientRect();
          const overlapX = Math.min(f.right, tag.right) - Math.max(f.left, tag.left) > 0;
          return { inside: f.left >= sec.left - 1 && f.right <= sec.right + 1 && f.top >= sec.top - 1 && f.bottom <= sec.bottom + 1, stacked: overlapX, gap: f.top - tag.bottom };
        }, k);
        test.skip(g === null, 'couple sprites not in the page yet');
        expect(g!.inside, `${k} ${vp.width}: couple inside its section`).toBe(true);
        if (g!.stacked) expect(g!.gap, `${k} ${vp.width}: gap below the tagline`).toBeGreaterThanOrEqual(16);
      }
    }
  });

  test('A-VEN-1: Kolkata then Saharsa side by side (wide) or stacked; one centred card without the Reception', async ({ page }) => {
    for (const vp of [VIEWPORTS.phone, VIEWPORTS.laptop]) {
      await page.setViewportSize(vp);
      for (const key of ['G1', 'G0'] as const) {
        await open(page, pageUrl('en', key, '#venues'));
        const g = await page.evaluate(() => {
          const cards = Array.from(document.querySelectorAll('#venues .venue-card')).map((c) => c.getBoundingClientRect());
          return { cards: cards.map((r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom })), vw: document.documentElement.clientWidth };
        });
        if (key === 'G0') {
          expect(g.cards).toHaveLength(1);
          expect(Math.abs((g.cards[0]!.l + g.cards[0]!.r) / 2 - g.vw / 2)).toBeLessThan(3);
        } else if (vp.width >= 1024) {
          expect(g.cards[0]!.r).toBeLessThanOrEqual(g.cards[1]!.l);
        } else {
          expect(g.cards[0]!.b).toBeLessThanOrEqual(g.cards[1]!.t);
        }
      }
    }
  });

  test('A-CUL-2: the lotus seam always sits between the Tirhuta flourish and "বাংলা"', async ({ page }) => {
    for (const vp of [VIEWPORTS.phone, VIEWPORTS.tabletL, VIEWPORTS.laptop]) {
      await page.setViewportSize(vp);
      await open(page, pageUrl('bn', 'G1', '#cultures'));
      const g = await page.evaluate(() => {
        const c = document.getElementById('cultures')!;
        const r = (q: string) => c.querySelector(q)!.getBoundingClientRect();
        const t = r('[data-slot="tirhuta"]');
        const b = r('.cultures__bangla');
        const s = r('.cultures__seam');
        const cx = (x: DOMRect) => x.left + x.width / 2;
        const cy = (x: DOMRect) => x.top + x.height / 2;
        const sameRow = Math.min(t.bottom, b.bottom) - Math.max(t.top, b.top) > 0;
        return sameRow
          ? { between: (cx(t) - cx(s)) * (cx(b) - cx(s)) < 0, sameRow }
          : { between: (cy(t) - cy(s)) * (cy(b) - cy(s)) < 0, sameRow };
      });
      expect(g.between, `${vp.width}: seam between (same row: ${g.sameRow})`).toBe(true);
    }
  });
});
