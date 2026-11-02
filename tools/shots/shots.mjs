#!/usr/bin/env node
// The screenshot matrix of spec 8.10: each language x variant x viewport, every section at its resting state, plus
// contact sheets per language and viewport. Output: ~/wedding_site/work/shots/<date>/ (Docker on dvd, /work) or
// /tmp/wedsite_shots/<date>/ (the Mac). Never committed.
//   node tools/shots/shots.mjs                          # all languages, G1, all viewports + B0 at 390/1440 + reduced 390
//   node tools/shots/shots.mjs --langs en,bn,mai --viewports 390x844,1440x900 --variants G1
//   node tools/shots/shots.mjs --base http://127.0.0.1:4173 --sections opening,haldi --reduced
// Options: --base URL | --dist dir, --out dir, --langs, --variants, --viewports, --sections, --reduced, --settle ms,
//          --deep (also a shot at each tall section's end), --no-sheet
import fs from 'node:fs';
import path from 'node:path';
import { VIEWPORTS, args, baseUrl, contactSheet, launchChromium, openPage, outDir, settle, variantQuery, viewport } from './lib.mjs';

const a = args();
const out = outDir(a, 'shots');
const list = (v, d) => (v && v !== true ? String(v).split(',') : d);
const langs = list(a.langs, ['en', 'hi', 'mai', 'bn']);
const variants = list(a.variants, null);
const viewports = list(a.viewports, null);
const sections = list(a.sections, null);

// the default matrix of 8.10
const jobs = [];
if (variants || viewports || a.reduced) {
  for (const l of langs) for (const v of variants ?? ['G1']) for (const vp of viewports ?? Object.keys(VIEWPORTS)) jobs.push({ lang: l, key: v, vp, reduced: Boolean(a.reduced) });
} else {
  for (const l of langs) {
    for (const vp of Object.keys(VIEWPORTS)) jobs.push({ lang: l, key: 'G1', vp, reduced: false });
    for (const vp of ['390x844', '1440x900']) jobs.push({ lang: l, key: 'B0', vp, reduced: false });
    jobs.push({ lang: l, key: 'G1', vp: '390x844', reduced: true });
  }
}

const { base, stop } = await baseUrl(a);
const { browser } = await launchChromium();
const written = [];
try {
  for (const job of jobs) {
    const vp = viewport(job.vp);
    const ctx = await browser.newContext({
      viewport: vp,
      deviceScaleFactor: vp.width < 800 ? 2 : 1,
      reducedMotion: job.reduced ? 'reduce' : 'no-preference',
      locale: 'en-US',
      timezoneId: 'Asia/Kolkata',
    });
    const page = await ctx.newPage();
    await openPage(page, `${base}/${job.lang}/${variantQuery(job.key)}`);
    const ids = await page.evaluate(() => Array.from(document.querySelectorAll('main > section[id], footer[id]')).map((s) => s.id));
    const tiles = [];
    const tag = `${job.lang}-${job.key}-${vp.width}x${vp.height}${job.reduced ? '-reduced' : ''}`;
    for (const id of ids.filter((i) => !sections || sections.includes(i))) {
      // scroll down to the section through its predecessor, as a guest would, so the reveal runs once
      await page.evaluate((i) => {
        const s = document.getElementById(i);
        window.scrollTo({ top: Math.max(0, s.getBoundingClientRect().top + scrollY - innerHeight * 0.6), behavior: 'instant' });
      }, id);
      await page.waitForTimeout(150);
      await page.evaluate((i) => document.getElementById(i).scrollIntoView({ block: 'start', behavior: 'instant' }), id);
      await page.mouse.move(vp.width / 2, vp.height / 2);
      const rest = await settle(page, Number(a.settle ?? (job.reduced ? 400 : 6000)));
      // still moving after the wait: say so, the shot is not the resting state (an entrance that never ran, or a slow one)
      if (rest.busy) console.log(`not at rest: ${tag} #${id} (finite ${rest.finite}, paint ${rest.paint}, reveal ${rest.reveal})`);
      const file = path.join(out, `${tag}-${id}.png`);
      await page.screenshot({ path: file });
      tiles.push({ file, label: id });
      if (a.deep) {
        const h = await page.evaluate((i) => document.getElementById(i).getBoundingClientRect().height, id);
        if (h > vp.height * 1.4) {
          await page.evaluate((dy) => window.scrollBy({ top: dy, behavior: 'instant' }), h - vp.height);
          await settle(page, 1200);
          const f2 = path.join(out, `${tag}-${id}-end.png`);
          await page.screenshot({ path: f2 });
          tiles.push({ file: f2, label: `${id} (end)` });
        }
      }
    }
    written.push(...tiles.map((t) => t.file));
    if (!a['no-sheet'] && tiles.length) {
      const cols = vp.width < 800 ? 6 : 3;
      const sheet = await contactSheet(browser, tiles, path.join(out, `sheet-${tag}.jpg`), {
        cols,
        width: vp.width < 800 ? 300 : 560,
        title: `${tag}  ${base.replace(/^https?:\/\//, '')}`,
      });
      console.log(`sheet ${sheet}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  stop();
}
console.log(`${written.length} screenshots in ${out}`);
