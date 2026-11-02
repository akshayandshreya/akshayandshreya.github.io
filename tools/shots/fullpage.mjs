#!/usr/bin/env node
// Full-page review images (integration check): each language x variant x viewport walked from the top to the footer
// the way a guest scrolls, one viewport at a time. At each step the tool waits until the viewport is at rest (the
// paint-reveal done, the entrances in, lib.mjs settle), takes the viewport, and stitches the steps into one tall
// JPEG. A browser's own "full page" capture cannot show this site: the painted frames are sticky and 100lvh tall, so
// they would be laid out once at the top of each section instead of behind the text that scrolls over them. The
// fixed top bar shows on the first step only. A step where the next section only peeks in below its brush line
// (still waiting for its paint-reveal) first lets that section paint, so every part of the page shows painted.
//   node tools/shots/fullpage.mjs                                  # en hi mai bn x G1 G0 B1 B0 x 390x844 1440x900
//   node tools/shots/fullpage.mjs --langs en --variants G1 --viewports 390x844 --scale 0.8 --quality 0.6
// Options: --base URL | --dist dir, --out dir, --langs, --variants, --viewports, --scale (per viewport width:
//          "390=0.8,1440=0.4", or one number), --quality (JPEG 0-1), --settle ms, --reduced
// Output: <out>/<lang>-<variant>-<w>x<h>.jpg and index.json (page height, steps, steps not at rest).
import fs from 'node:fs';
import path from 'node:path';
import { args, baseUrl, launchChromium, openPage, outDir, settle, variantQuery, viewport } from './lib.mjs';

const a = args();
const out = outDir(a, 'fullpage');
const list = (v, d) => (v && v !== true ? String(v).split(',') : d);
const langs = list(a.langs, ['en', 'hi', 'mai', 'bn']);
const variants = list(a.variants, ['G1', 'G0', 'B1', 'B0']);
const viewports = list(a.viewports, ['390x844', '1440x900']);
const quality = Number(a.quality ?? 0.6);
const scaleFor = (w) => {
  const s = a.scale;
  if (s && s !== true && !String(s).includes('=')) return Number(s);
  const map = Object.fromEntries(
    String(s && s !== true ? s : '390=0.8,1440=0.4')
      .split(',')
      .map((kv) => kv.split('=').map(Number)),
  );
  return map[w] ?? (w < 800 ? 0.8 : 0.4);
};

const { base, stop } = await baseUrl(a);
const { browser } = await launchChromium();
const index = [];
try {
  for (const lang of langs)
    for (const key of variants)
      for (const vpName of viewports) {
        const vp = viewport(vpName);
        const ctx = await browser.newContext({
          viewport: vp,
          deviceScaleFactor: 1,
          reducedMotion: a.reduced ? 'reduce' : 'no-preference',
          locale: 'en-US',
          timezoneId: 'Asia/Kolkata',
        });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        await openPage(page, `${base}/${lang}/${variantQuery(key)}`);
        await settle(page, Number(a.settle ?? 5000));
        const slices = [];
        const busy = [];
        let y = 0;
        for (let step = 0; step < 80; step++) {
          const total = await page.evaluate(() => document.scrollingElement.scrollHeight);
          const target = Math.min(y, Math.max(0, total - vp.height));
          await page.evaluate((t) => window.scrollTo({ top: t, behavior: 'instant' }), target);
          await page.mouse.move(vp.width / 2, vp.height / 2);
          let rest = await settle(page, Number(a.settle ?? 5000));
          if (rest.busy && rest.paint) {
            // the next section peeks in below its brush line and waits there (its resting state while the guest
            // stays here): let it paint by stepping a little further, as a guest reading on would, then come back
            await page.evaluate((t) => window.scrollTo({ top: t, behavior: 'instant' }), target + Math.round(vp.height * 0.35));
            await settle(page, Number(a.settle ?? 5000));
            await page.evaluate((t) => window.scrollTo({ top: t, behavior: 'instant' }), target);
            rest = await settle(page, Number(a.settle ?? 5000));
          }
          const at = await page.evaluate(() => Math.round(scrollY));
          if (rest.busy) busy.push(at);
          slices.push({ y: at, png: (await page.screenshot({ type: 'png' })).toString('base64') });
          // the fixed top bar belongs to the screen, not the page: keep it on the first step only, so the stitched
          // image reads as one continuous page
          if (step === 0) await page.addStyleTag({ content: 'header[data-tone]{visibility:hidden!important}' }).catch(() => undefined);
          if (at + vp.height >= total - 1) break;
          y = at + vp.height;
        }
        const height = await page.evaluate(() => document.scrollingElement.scrollHeight);
        const scale = scaleFor(vp.width);
        // stitched in a blank page (the site's CSP is not in the way of data: URLs there)
        const blank = await ctx.newPage();
        const jpeg = await blank.evaluate(
          async ({ slices, w, h, scale, quality }) => {
            const c = document.createElement('canvas');
            c.width = Math.round(w * scale);
            c.height = Math.round(h * scale);
            const g = c.getContext('2d');
            g.imageSmoothingQuality = 'high';
            for (const s of slices) {
              const im = new Image();
              im.src = `data:image/png;base64,${s.png}`;
              await im.decode();
              g.drawImage(im, 0, Math.round(s.y * scale), c.width, Math.round(im.naturalHeight * scale));
            }
            return c.toDataURL('image/jpeg', quality);
          },
          { slices, w: vp.width, h: height, scale, quality },
        );
        const file = path.join(out, `${lang}-${key}-${vp.width}x${vp.height}.jpg`);
        fs.writeFileSync(file, Buffer.from(jpeg.split(',')[1], 'base64'));
        const kb = Math.round(fs.statSync(file).size / 1024);
        index.push({ file: path.basename(file), lang, variant: key, viewport: vpName, height, steps: slices.length, notAtRest: busy, errors, kb });
        console.log(`${path.basename(file)}: ${height} px, ${slices.length} steps, ${kb} KB${busy.length ? `, not at rest at ${busy.join(' ')}` : ''}${errors.length ? `, ${errors.length} console error(s)` : ''}`);
        await ctx.close();
      }
} finally {
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 2));
  await browser.close();
  stop();
}
