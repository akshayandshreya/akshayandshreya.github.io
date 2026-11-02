/* Plate painter (browser side of tools/plates/export.mjs). Classic script after vendor/engine.js, vendor/paint.js and
 * recipes.js. window.PLATES.paint(id, frame, width) paints one plate the way card.js paintPage() does (P.paint, the
 * hue clamp, the `under` glows, grain over everything, the palette vignette) minus anything position-critical, and
 * returns PNG data URLs for three layers on the same pixel grid:
 *   base  opaque: ground, washes, underpainting, textured strokes, grain, vignette (SPEC 1.3)
 *   gold  transparent: gold-leaf flecks + gilded lines, erased (feathered) inside every calm zone
 *   veil  transparent, half resolution: 14-20 sparse low-contrast strokes on the same flow field (drifts against base)
 * plus `strokes`: an atlas of 3 live-stroke sprites (SPEC 3.6) with their placement in frame fractions. */
(function () {
  'use strict';
  const TAU = Math.PI * 2;

  function ell(g, cx, cy, rx, ry, stops, blend) {
    g.save(); if (blend) g.globalCompositeOperation = blend;
    g.translate(cx, cy); g.scale(rx, ry);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const [s, c] of stops) gr.addColorStop(s, c);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore();
  }
  const glow = (g, x, y, r, color, alpha, blend = 'screen') => ell(g, x, y, r, r, [[0, P.css(color, alpha)], [0.5, P.css(color, alpha * 0.45)], [1, P.css(color, 0)]], blend);

  /** zones in logical px for frame (W, H) */
  function zonesPx(R, frame, W, H) {
    const S = Math.min(W, H);
    const z = R.zones(frame) || {};
    const calm = (z.calm || []).map((c) => ({ x: c.x * W, y: c.y * H, rx: c.r != null ? c.r * S : c.rx * W, ry: c.r != null ? c.r * S : c.ry * H, k: c.k }));
    const glowZ = z.glow ? { x: z.glow.x * W, y: z.glow.y * H, r: z.glow.r * S, k: z.glow.k } : undefined;
    const vortices = z.vortices ? z.vortices.map((v) => ({ x: v.x * W, y: v.y * H, r: v.r * S, s: v.s })) : undefined;
    const floor = z.floor != null ? z.floor * H : undefined;
    const under = R.under && z.couple ? R.under(z.couple).map((u) => ({ x: u.at[0] * W, y: u.at[1] * H, r: u.r * S, color: u.color, alpha: u.alpha, blend: u.blend })) : [];
    return { calm, glow: glowZ, vortices, floor, under, couple: z.couple, raw: z };
  }

  const url = (c, type = 'image/png', q) => c.toDataURL(type, q);
  function crop(src, M, w, h) {
    const c = P.canvas(w, h, true), g = P.ctx2d(c);
    g.drawImage(src, -M, -M);
    return c;
  }

  /** the veil: sparse, low-contrast long strokes traced on the plate's own flow field, outside the calm zones */
  function veil(pt, W, H, res, seed) {
    const pal = pt.palette, deep = pal.mood === 'deep';
    const c = P.canvas(W * res, H * res, true), g = P.ctx2d(c);
    g.setTransform(res, 0, 0, res, 0, 0);
    const rr = E.rng('veil:' + seed);
    const n = 14 + Math.floor(rr() * 7);
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0;
      for (let k = 0; k < 30; k++) { x = rr.range(-40, W + 40); y = rr.range(-40, H + 40); if (rr() > pt.calmAt(x, y) * 1.4) break; }
      const w = rr.range(28, 70);
      const pts = P.trace(pt.field, x, y, { len: rr.range(280, 620), step: Math.max(3, w / 6), sign: rr() < 0.5 ? 1 : -1, bend: rr.range(-0.1, 0.1), maxTurn: 0.07, wander: 0.2, seed: rr() * 100, bounds: [-80, -80, W + 80, H + 80] });
      if (pts.length < 4) continue;
      let col = pt.colorAt(x, y, pal.strokes, rr);
      const q = rr();
      col = q < 0.55 ? P.shade(col, deep ? 0.1 : 0.16) : q < 0.75 ? P.shade(col, -0.08) : col;
      const S = P.prepStroke(pts, { width: w, color: col, color2: P.shade(col, rr.range(-0.06, 0.08)), alpha: 0.42, body: 0.45, dry: 0.55, impasto: 0.3, jitter: 0.06, seed: (rr() * 1e6) | 0 });
      P.drawStroke(g, S);
    }
    return c;
  }

  /** 3 live-stroke sprites (SPEC 3.6): drawn on their own boxes, outside calm zones; each records its box in frame
   *  fractions and the brush direction (start -> end, sprite fractions) for the reveal mask */
  function liveStrokes(pt, W, H, res, seed, count = 3) {
    const pal = pt.palette;
    const rr = E.rng('livestrokes:' + seed);
    const items = [];
    for (let i = 0; i < count; i++) {
      let pts = null;
      for (let tries = 0; tries < 40 && !pts; tries++) {
        const x = rr.range(W * 0.04, W * 0.96), y = rr.range(H * 0.04, H * 0.96);
        if (pt.calmAt(x, y) > 0.12) continue;
        const w0 = rr.range(16, 36);
        const p = P.trace(pt.field, x, y, { len: rr.range(200, 380), step: Math.max(3, w0 / 6), sign: rr() < 0.5 ? 1 : -1, bend: rr.range(-0.1, 0.1), maxTurn: 0.07, wander: 0.2, seed: rr() * 100, bounds: [0, 0, W, H] });
        if (p.length < 8) continue;
        if (p.some(([px, py]) => pt.calmAt(px, py) > 0.25)) continue;
        pts = { p, w: w0 };
      }
      if (!pts) continue;
      const xs = pts.p.map((q) => q[0]), ys = pts.p.map((q) => q[1]);
      const pad = pts.w * 1.2;
      const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, x1 = Math.max(...xs) + pad, y1 = Math.max(...ys) + pad;
      let col = pt.colorAt(pts.p[0][0], pts.p[0][1], pal.strokes, rr);
      const q = rr();
      col = q < 0.45 ? P.shade(col, 0.18) : q < 0.6 ? P.shade(col, -0.12) : col;
      items.push({ pts: pts.p, w: pts.w, col, box: [x0, y0, x1, y1], seed: (rr() * 1e6) | 0 });
    }
    // atlas: stack the boxes vertically
    const gap = 4;
    const aw = Math.ceil(Math.max(...items.map((s) => (s.box[2] - s.box[0]) * res)));
    const ah = Math.ceil(items.reduce((a, s) => a + (s.box[3] - s.box[1]) * res + gap, 0));
    const c = P.canvas(aw, ah, true), g = P.ctx2d(c);
    let oy = 0;
    const meta = [];
    for (const s of items) {
      const bw = (s.box[2] - s.box[0]) * res, bh = (s.box[3] - s.box[1]) * res;
      g.setTransform(res, 0, 0, res, -s.box[0] * res, oy - s.box[1] * res);
      const S = P.prepStroke(s.pts, { width: s.w, color: s.col, color2: P.shade(s.col, 0.06), alpha: 0.55, body: 0.4, dry: 0.5, impasto: 0.45, seed: s.seed });
      P.drawStroke(g, S);
      const a = s.pts[0], b = s.pts[s.pts.length - 1];
      const r4 = (v) => Math.round(v * 1e4) / 1e4;
      meta.push({
        atlas: [0, Math.round(oy), Math.round(bw), Math.round(bh)],
        frame: [r4(s.box[0] / W), r4(s.box[1] / H), r4((s.box[2] - s.box[0]) / W), r4((s.box[3] - s.box[1]) / H)],
        from: [r4((a[0] - s.box[0]) / (s.box[2] - s.box[0])), r4((a[1] - s.box[1]) / (s.box[3] - s.box[1]))],
        to: [r4((b[0] - s.box[0]) / (s.box[2] - s.box[0])), r4((b[1] - s.box[1]) / (s.box[3] - s.box[1]))],
      });
      oy += bh + gap;
    }
    return { canvas: c, meta };
  }

  async function paint(id, frame, width) {
    const t0 = performance.now();
    const R = RECIPES[id], F = FRAMES[frame];
    if (!R || !F) throw new Error('unknown plate ' + id + '/' + frame);
    const W = F.W, H = F.H, res = width / W;
    const pal = PAL[R.palette]();
    const Z = zonesPx(R, frame, W, H);
    const pt = P.paint({ W, H, res, palette: pal, seed: R.seed, style: R.style, calm: Z.calm, glow: Z.glow, floor: Z.floor, vortices: Z.vortices,
      density: R.density, contrast: R.contrast, gold: R.gold, goldLines: R.goldLines, flecks: R.flecks, grainAlpha: 0.16 });
    const M = pt.M * res;
    if (R.hue) {
      // card.js / 02-couple single-hue clamp: a 'color' blend of one hue over base and mid keeps every value and mark
      const [hue, k] = R.hue;
      const gb = P.ctx2d(pt.base); gb.save(); gb.setTransform(1, 0, 0, 1, 0, 0); gb.globalCompositeOperation = 'color'; gb.globalAlpha = k; gb.fillStyle = hue; gb.fillRect(0, 0, pt.base.width, pt.base.height); gb.restore();
      const t = P.canvas(pt.mid.width, pt.mid.height, true), tg = P.ctx2d(t);
      tg.drawImage(pt.mid, 0, 0); tg.globalCompositeOperation = 'color'; tg.globalAlpha = k; tg.fillStyle = hue; tg.fillRect(0, 0, t.width, t.height);
      tg.globalAlpha = 1; tg.globalCompositeOperation = 'destination-in'; tg.drawImage(pt.mid, 0, 0);
      const gm = P.ctx2d(pt.mid); gm.clearRect(0, 0, pt.mid.width, pt.mid.height); gm.drawImage(t, 0, 0); t.width = t.height = 1;
    }
    // base: base + mid, the recipe's glows, grain over everything, the palette vignette (card.js paintPage)
    const c = P.canvas(W * res, H * res, true), g = P.ctx2d(c);
    g.drawImage(pt.base, -M, -M); g.drawImage(pt.mid, -M, -M);
    g.setTransform(res, 0, 0, res, 0, 0);
    for (const u of Z.under) glow(g, u.x, u.y, u.r, u.color, u.alpha, u.blend);
    {
      const gr = P.grain('paper', R.seed % 5);
      g.save(); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.2;
      g.fillStyle = g.createPattern(gr.grey, 'repeat'); g.fillRect(0, 0, W, H); g.restore();
      const vc = pal.ground[2], va = pal.mood === 'deep' ? 0.22 : 0.14;
      g.save(); g.globalCompositeOperation = 'multiply'; g.translate(W / 2, H * 0.46); g.scale(W * 0.75, H * 0.62);
      const vg = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      vg.addColorStop(0, P.css(vc, 0)); vg.addColorStop(0.55, P.css(vc, 0)); vg.addColorStop(0.82, P.css(vc, va * 0.6)); vg.addColorStop(1, P.css(vc, va));
      g.fillStyle = vg; g.fillRect(-1.2, -1.2, 2.4, 2.4); g.restore();
    }
    // gold: feathered erase inside every calm zone (no gold fleck beside a date or a name: card rule)
    let gold = null;
    if (pt.gold) {
      const gg = P.ctx2d(pt.gold); gg.save(); gg.setTransform(res, 0, 0, res, M, M); gg.globalCompositeOperation = 'destination-out';
      for (const z of Z.calm) ell(gg, z.x, z.y, z.rx * 0.95, z.ry * 0.95, [[0, '#000'], [0.7, '#000'], [1, 'rgba(0,0,0,0)']]);
      gg.restore();
      gold = crop(pt.gold, M, W * res, H * res);
    }
    const vres = res * 0.5;
    const fi = { tall: 1, mid: 2, wide: 3 }[frame];
    const vl = veil(pt, W, H, vres, R.seed * 7 + fi);
    const ls = liveStrokes(pt, W, H, Math.min(res, 1), R.seed * 11 + fi);
    const out = {
      id, frame, W, H, width: Math.round(W * res), height: Math.round(H * res),
      base: url(c), gold: gold ? url(gold) : null, veil: url(vl), strokes: url(ls.canvas), strokeMeta: ls.meta, strokeScale: Math.min(res, 1),
      palette: pal.name, paper: P.css(pal.paper), groundMid: P.css(pal.ground[1]), deep: pal.mood === 'deep',
      calm: Z.raw.calm || [], glow: Z.raw.glow || null, couple: Z.couple || null, floor: Z.raw.floor ?? null,
      ms: Math.round(performance.now() - t0),
    };
    for (const k of ['base', 'mid', 'gold']) if (pt[k]) pt[k].width = pt[k].height = 1;
    for (const k of [c, gold, vl, ls.canvas]) if (k) k.width = k.height = 1;
    return out;
  }
  window.PLATES = { paint, ell, glow };
})();
