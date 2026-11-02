#!/usr/bin/env node
// Motion check of spec 8 (A-INV-5, A-EV-7, A-CLO-2, G-MOT-1): scroll into a section the way a guest does (wheel
// steps, downwards) and record frames while its paint-reveal and content entrance run, then a resting frame. Writes
// one JPEG per frame, a filmstrip JPEG per section and frames.json with, per frame, the time, the section's
// data-paint phase, the number of running finite animations, the section's elements whose entrance is pending /
// running (data-reveal pending / in) and the pixel change from the previous frame.
//   node tools/shots/frames.mjs                                 # en G1 at 390x844, invitation + every event + closing
//   node tools/shots/frames.mjs --langs bn,hi --viewports 390x844,1440x900 --sections invitation,wedding --every 100
// Options: --base URL | --dist dir, --out dir, --langs, --variants, --viewports, --sections, --every ms (frame
//          spacing, default 140), --frames n (default 22), --step f (wheel per frame in viewport heights, default
//          0.22, about a phone flick; 0.05 = a slow read), --no-sheet
// Reading the numbers: "handover" is the change between the last frame with the reveal canvas (phase run/fade) and the
// first after it (phase done or gone), as a share of the frame's pixels that changed by more than 24/255. A clean
// hand-over is a small step compared with the frames before it (the paint is still moving there); a jump (shift,
// colour pop, white flash) shows as a spike. "jank" lists frames whose change is more than 4x the median of the
// running frames after the first 3 (a stall followed by a catch-up, or a pop).
import fs from 'node:fs';
import path from 'node:path';
import { args, baseUrl, busyProbe, contactSheet, launchChromium, openPage, settle, variantQuery, viewport, outDir } from './lib.mjs';

const a = args();
const out = outDir(a, 'frames');
const list = (v, d) => (v && v !== true ? String(v).split(',') : d);
const langs = list(a.langs, ['en']);
const variants = list(a.variants, ['G1']);
const viewports = list(a.viewports, ['390x844']);
const wanted = list(a.sections, ['invitation', 'mehndi', 'engagement', 'haldi', 'wedding', 'reception', 'closing']);
const every = Number(a.every ?? 140);
const count = Number(a.frames ?? 22);
const step = Number(a.step ?? 0.22); // wheel distance per frame, as a share of the viewport height

/** Mean change and the share of changed pixels between two JPEG buffers, computed on a canvas (no image library). */
async function differ(browser) {
  const page = await browser.newPage();
  return {
    async diff(pa, pb) {
      return page.evaluate(
        async ({ a, b }) => {
          const load = (src) =>
            new Promise((res, rej) => {
              const im = new Image();
              im.onload = () => res(im);
              im.onerror = rej;
              im.src = src;
            });
          const [ia, ib] = await Promise.all([load(a), load(b)]);
          const w = Math.min(ia.naturalWidth, ib.naturalWidth, 480);
          const h = Math.round((w / ia.naturalWidth) * ia.naturalHeight);
          const read = (im) => {
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const g = c.getContext('2d', { willReadFrequently: true });
            g.drawImage(im, 0, 0, w, h);
            return g.getImageData(0, 0, w, h).data;
          };
          const da = read(ia);
          const db = read(ib);
          let sum = 0;
          let changed = 0;
          let whiter = 0;
          for (let i = 0; i < da.length; i += 4) {
            const d = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3;
            sum += d;
            if (d > 24) changed++;
            // a flash: the new pixel is near white and much lighter than before
            if (db[i] + db[i + 1] + db[i + 2] > 735 && db[i] + db[i + 1] + db[i + 2] - (da[i] + da[i + 1] + da[i + 2]) > 120) whiter++;
          }
          const n = da.length / 4;
          return { mean: +(sum / n).toFixed(2), changed: +(changed / n).toFixed(4), flash: +(whiter / n).toFixed(4) };
        },
        { a: `data:image/jpeg;base64,${pa.toString('base64')}`, b: `data:image/jpeg;base64,${pb.toString('base64')}` },
      );
    },
    close: () => page.close(),
  };
}

const median = (xs) => {
  const s = [...xs].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

const { base, stop } = await baseUrl(a);
const { browser } = await launchChromium();
const cmp = await differ(browser);
const report = [];
try {
  for (const lang of langs)
    for (const key of variants)
      for (const vpKey of viewports) {
        const vp = viewport(vpKey);
        for (const id of wanted) {
          const ctx = await browser.newContext({
            viewport: vp,
            deviceScaleFactor: 1,
            reducedMotion: 'no-preference',
            locale: 'en-US',
            timezoneId: 'Asia/Kolkata',
          });
          const page = await ctx.newPage();
          await openPage(page, `${base}/${lang}/${variantQuery(key)}`);
          const exists = await page.evaluate((i) => Boolean(document.getElementById(i)), id);
          if (!exists) {
            await ctx.close();
            continue;
          }
          // park the section's top just below the fold (through its predecessor), then wheel it in like a guest
          await page.evaluate((i) => {
            const s = document.getElementById(i);
            window.scrollTo({ top: Math.max(0, s.getBoundingClientRect().top + scrollY - innerHeight * 1.05), behavior: 'instant' });
          }, id);
          await settle(page, 1500);
          await page.mouse.move(vp.width / 2, vp.height / 2);
          const tag = `${lang}-${key}-${vp.width}x${vp.height}-${id}`;
          const frames = [];
          const t0 = Date.now();
          let prev = null;
          for (let f = 0; f < count; f++) {
            const top = await page.evaluate((i) => document.getElementById(i).getBoundingClientRect().top, id);
            if (top > 2) {
              await page.mouse.wheel(0, Math.min(top, vp.height * step));
              // let the smooth scroll land: a screenshot taken mid-scroll shows sticky frames out of step with the
              // scroll offset (a band of bare paper at the top), which no guest ever sees
              await page.evaluate(
                () =>
                  new Promise((res) => {
                    let y = scrollY;
                    let still = 0;
                    const t0 = performance.now();
                    const tick = () => {
                      still = scrollY === y ? still + 1 : 0;
                      y = scrollY;
                      if (still >= 3 || performance.now() - t0 > 700) res(undefined);
                      else requestAnimationFrame(tick);
                    };
                    requestAnimationFrame(tick);
                  }),
              );
            }
            const b = await page.evaluate(busyProbe);
            const state = await page.evaluate(
              (i) => {
                const s = document.getElementById(i);
                const n = (v) => s.querySelectorAll(`[data-reveal="${v}"]`).length;
                return { paint: s.dataset.paint ?? '-', pending: n('pending'), entering: n('in'), top: Math.round(s.getBoundingClientRect().top) };
              },
              id,
            );
            Object.assign(state, { finite: b.finite, reveal: b.reveal });
            // JPEG: about 3x faster to capture than PNG at 1920 px, so the entrance gets more frames
            const shot = await page.screenshot({ type: 'jpeg', quality: 80 });
            const file = path.join(out, `${tag}-${String(f).padStart(2, '0')}.jpg`);
            fs.writeFileSync(file, shot);
            const d = prev ? await cmp.diff(prev, shot) : { mean: 0, changed: 0, flash: 0 };
            frames.push({ f, ms: Date.now() - t0, ...state, ...d, file });
            prev = shot;
            await page.waitForTimeout(every);
          }
          const atRest = await settle(page, 6000);
          const rest = await page.screenshot({ type: 'jpeg', quality: 80 });
          const restFile = path.join(out, `${tag}-rest.jpg`);
          fs.writeFileSync(restFile, rest);
          const toRest = await cmp.diff(prev, rest);

          // hand-over: last frame with the canvas -> first without it
          const live = (p) => p === 'run' || p === 'fade' || p === 'pending';
          const k = frames.findIndex((x, i) => i > 0 && live(frames[i - 1].paint) && !live(x.paint));
          const running = frames.slice(3).filter((x) => live(x.paint) || x.finite > 0 || x.reveal > 0).map((x) => x.changed);
          const med = median(running);
          const jank = frames.slice(3).filter((x, i) => med > 0.002 && x.changed > med * 4 && x.top <= 2 && frames[i + 2].top <= 2).map((x) => `${x.f}:${x.changed}`);
          const flash = frames.filter((x) => x.flash > 0.01).map((x) => `${x.f}:${x.flash}`);
          const row = {
            tag,
            phases: [...new Set(frames.map((x) => x.paint))].join('>'),
            handover: k > 0 ? { frame: k, changed: frames[k].changed, medianRunning: med } : null,
            toRest,
            stuck: atRest.busy ? atRest : null,
            jank,
            flash,
            frames: frames.map(({ file, ...x }) => x),
          };
          report.push(row);
          console.log(
            `${tag}: phases ${row.phases}; handover ${row.handover ? `f${k} ${row.handover.changed} (median ${med})` : 'not seen'}; ` +
              `to rest ${toRest.changed}${row.stuck ? ` NOT AT REST (reveal ${row.stuck.reveal}, paint ${row.stuck.paint})` : ''}; ` +
              `pending/in per frame [${frames.map((x) => `${x.pending}/${x.entering}`).join(' ')}]; jank [${jank.join(' ')}]; flash [${flash.join(' ')}]`,
          );
          if (!a['no-sheet']) {
            const pick = frames.filter((_, i) => i % 2 === 0 || i === k || i === k - 1);
            const tiles = [...pick.map((x) => ({ file: x.file, label: `${x.f} ${x.ms}ms top${x.top} ${x.pending}/${x.entering} d${x.changed}` })), { file: restFile, label: 'rest' }];
            await contactSheet(browser, tiles, path.join(out, `strip-${tag}.jpg`), {
              cols: vp.width < 800 ? 8 : 4,
              width: vp.width < 800 ? 220 : 420,
              title: tag,
            });
          }
          await ctx.close();
        }
      }
} finally {
  fs.writeFileSync(path.join(out, 'frames.json'), JSON.stringify(report, null, 1));
  await cmp.close();
  await browser.close();
  stop();
}
console.log(`frames in ${out}`);
