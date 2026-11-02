/* Sprites and textures (browser side of tools/plates/export.mjs). Classic script after vendor/engine.js,
 * vendor/paint.js, recipes.js and plates.js. Exposes window.SPRITES:
 *   couple(event)            the owner's couple cut-out, with a fine untiled grain + contact shadow (+ the
 *                            Reception's aripan floor ring), native resolution, with its figure geometry
 *   motif(spec)              a painted motif SVG (motif tints, filter, hidden parts) rasterised at a pixel size
 *   bamboo()                 the Reception's gold Madhubani bamboo + lotus buds (card.js geometry), left and right
 *   textures()               paper grain, gold leaf, brush stamps, brush edge, brush wipe
 *   dabs(kind, palette, n, size)  painted particle sprites in one atlas row
 * Everything returns PNG data URLs; export.mjs encodes them (sharp) and writes the manifests. */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const SRC = '/src/'; // the invitation project root, served by export.mjs
  const { ell } = window.PLATES;

  const loadImg = (u) => new Promise((res, rej) => { const im = new Image(); im.onload = () => im.decode().then(() => res(im), () => res(im)); im.onerror = () => rej(new Error('image failed: ' + u)); im.src = u; });
  const svgImg = (str) => loadImg(URL.createObjectURL(new Blob([str], { type: 'image/svg+xml' })));
  const getText = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(p + ' ' + r.status); return r.text(); });
  const url = (c) => c.toDataURL('image/png');

  /** trim to the alpha bounding box (alpha > t), with pad px; returns { canvas, x, y } (offset of the crop) */
  function trim(c, t = 3, pad = 2) {
    const g = P.ctx2d(c), { width: w, height: h } = c, d = g.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > t) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return { canvas: c, x: 0, y: 0 };
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    const o = P.canvas(x1 - x0 + 1, y1 - y0 + 1, true);
    P.ctx2d(o).drawImage(c, -x0, -y0);
    return { canvas: o, x: x0, y: y0 };
  }

  /* -------------------------------------------------------------------------------------------- couples */
  const COUPLE = {
    mehndi: { file: 'mehndi', pal: 'sage', crown: 52, k: 0.975, idx: 0 },
    engagement: { file: 'engagement', pal: 'rose', crown: 12, k: 1, idx: 1 },
    haldi: { file: 'haldi', pal: 'turmeric', crown: 12, k: 1, idx: 2 },
    wedding: { file: 'wedding', pal: 'vermilion', crown: 12, k: 1, idx: 3 },
    reception: { file: 'reception', pal: 'teal', crown: 12, k: 0.97, idx: 4 },
  };
  /** a very light, untiled grain so the couple sits with the painted plates: mono per-pixel noise plus a soft 4 px
   *  tooth (bilinear value noise), about +-4 % of full scale, colour and alpha untouched (a tiled paper grain read as
   *  streaks across the faces) */
  function fineGrain(fig, seed) {
    const w = fig.width, h = fig.height, g = P.ctx2d(fig), id = g.getImageData(0, 0, w, h), d = id.data;
    const r = E.rng(seed), S = 4, gw = Math.ceil(w / S) + 2, gh = Math.ceil(h / S) + 2, grid = new Float32Array(gw * gh);
    for (let i = 0; i < grid.length; i++) grid[i] = r() - 0.5;
    const FINE = 8, TOOTH = 16;
    for (let y = 0; y < h; y++) {
      const gy = y / S, y0 = gy | 0, fy = gy - y0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] === 0) continue;
        const gx = x / S, x0 = gx | 0, fx = gx - x0, k = y0 * gw + x0;
        const t = (grid[k] * (1 - fx) + grid[k + 1] * fx) * (1 - fy) + (grid[k + gw] * (1 - fx) + grid[k + gw + 1] * fx) * fy;
        const n = (r() - 0.5) * FINE + t * TOOTH;
        d[i] = d[i] + n; d[i + 1] = d[i + 1] + n; d[i + 2] = d[i + 2] + n;
      }
    }
    g.putImageData(id, 0, 0);
  }
  /** the Reception's aripan under the feet (card.js PROPS.reception, scaled to the figure): rings, lotus scallops,
   *  rice + sindoor dots */
  function aripanRing(g, cx, cy, u) {
    const GOLD = '#d8b468', RICE = '#efe6d2';
    const RX = 236 * u, RY = 70 * u, sc = RX / 252;
    const ring = (rx, ry, n = 120, t0 = Math.PI * 0.62) => { const pts = []; for (let i = 0; i <= n; i++) { const t = t0 + (i / n) * TAU; pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); } return pts; };
    const paths = [ring(RX, RY), ring(RX - 11 * u, RY - 3.5 * u, 120, Math.PI * 1.55)];
    { const pts = [], n = 16 * 14; for (let i = 0; i <= n; i++) { const t = Math.PI * 0.62 + (i / n) * TAU, b = Math.abs(Math.sin(8 * (t - Math.PI * 0.62))); pts.push([cx + (196 + 30 * b) * sc * Math.cos(t), cy + (59 + 9.5 * b) * sc * Math.sin(t)]); } paths.push(pts); }
    paths.push(ring(128 * sc, 39 * sc, 90, Math.PI * 0.5));
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + Math.PI / 8, lx = cx + 52 * sc * Math.cos(a), ly = cy + 16 * sc * Math.sin(a), pts = []; for (let i = 0; i <= 22; i++) { const t = a - 2.15 + (i / 22) * 4.3; pts.push([lx + 15 * sc * Math.cos(t), ly + 9.5 * sc * Math.sin(t)]); } paths.push(pts); }
    paths.push(ring(17 * sc, 6.5 * sc, 30, 0));
    const r2 = E.rng('aripan:3768');
    g.save(); g.globalAlpha = 0.6;
    for (const p of paths) { const S = P.prepStroke(p, { width: 2.5 * u, color: RICE, colors: [RICE, '#f6efe1', '#e0d3b8'], body: 0.75, impasto: 0.12, jitter: 0.05, dry: 0.2, taper: [0.08, 0.18], pressure: 0.35, seed: (r2() * 1e6) | 0 }); P.drawStroke(g, S, 1, 1); }
    g.restore();
    for (let k = 0; k < 16; k++) { const t = (k / 16) * TAU + Math.PI / 16; ell(g, cx + 166 * sc * Math.cos(t), cy + 50 * sc * Math.sin(t), 3.4 * u, 2.1 * u, [[0, P.css(RICE, 0.62)], [0.8, P.css(RICE, 0.5)], [1, P.css(RICE, 0)]]); }
    for (let k = 0; k < 8; k++) { const t = Math.PI * 0.62 + ((2 * k + 0.5) / 16) * TAU; ell(g, cx + 213 * sc * Math.cos(t), cy + 64 * sc * Math.sin(t), 6.5 * u, 3.6 * u, [[0, P.css(GOLD, 0.9)], [0.8, P.css(GOLD, 0.7)], [1, P.css(GOLD, 0)]]); }
    return { rx: RX + 8 * u, ry: RY + 6 * u };
  }
  async function couple(event) {
    const C = COUPLE[event];
    const pal = PAL[C.pal]();
    const img = await loadImg(SRC + `assets/couples_user/${C.file}.png`);
    const nw = img.naturalWidth, nh = img.naturalHeight, crown = C.crown, feet = nh - 13, figH = feet - crown;
    // card units: crown-to-feet = 0.53 x 1289 x 1.0166 x k (card.js couple()); u = px per card unit for this figure
    const u = figH / (0.53 * 1289 * 1.0166 * C.k);
    const fig = P.canvas(nw, nh, true);
    P.ctx2d(fig).drawImage(img, 0, 0);
    fineGrain(fig, 'couple:' + event);
    // contact shadow (card: rx = min(300, 0.46 box width), ry = 22 units, darks[0] 0.24 -> 0.7 -> 0.2 -> 0)
    const rx = Math.min(0.46 * nw, 0.43 * figH), ry = 0.032 * figH;
    const ringR = event === 'reception' ? { rx: 252 * u, ry: 80 * u } : { rx: 0, ry: 0 };
    const padX = Math.ceil(Math.max(0, rx - nw / 2, ringR.rx - nw / 2) + 8);
    const padB = Math.ceil(Math.max(ry + 2 * u, ringR.ry - 26 * u) + 8);
    const out = P.canvas(nw + 2 * padX, nh + padB, true), g = P.ctx2d(out);
    const cx = padX + nw / 2, fy = feet;
    if (event === 'reception') aripanRing(g, cx, fy - 26 * u, u);
    const a = 0.24, d0 = pal.darks[0];
    ell(g, cx, fy + 2 * u, rx, ry, [[0, P.css(d0, a)], [0.45, P.css(d0, a * 0.7)], [0.8, P.css(d0, a * 0.2)], [1, P.css(d0, 0)]]);
    g.drawImage(fig, padX, 0);
    fig.width = fig.height = 1;
    const t = trim(out, 2, 2);
    const W = t.canvas.width, H = t.canvas.height, r4 = (v) => Math.round(v * 1e4) / 1e4;
    const res = { event, source: `couples_user/${C.file}.png`, width: W, height: H, png: url(t.canvas),
      figure: { cx: r4((cx - t.x) / W), crown: r4((crown - t.y) / H), feet: r4((fy - t.y) / H) }, heightScale: C.k, palette: pal.name };
    out.width = out.height = 1; t.canvas.width = t.canvas.height = 1;
    return res;
  }

  /* --------------------------------------------------------------------------------------------- motifs */
  /** the SVG root gets an explicit px size and the motif tints (CSS variables); `hide` ids are display:none */
  function svgSized(str, wpx, hpx, vars, hide) {
    const css = vars ? Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';') : '';
    let s = str.replace(/^\s*<\?xml[^>]*>/, '').replace(/<svg\b([^>]*)>/, (m, at) => {
      let a = at.replace(/\s(width|height)="[^"]*"/g, '');
      if (css) a = /\sstyle="/.test(a) ? a.replace(/\sstyle="/, ` style="${css};`) : a + ` style="${css}"`;
      return `<svg${a} width="${Math.round(wpx)}" height="${Math.round(hpx)}">`;
    });
    if (hide && hide.length) s = s.replace(/(<svg\b[^>]*>)/, `$1<style>${hide.map((h) => `g[id="${h}"]`).join(',')}{display:none}</style>`);
    return s;
  }
  /** spec: { name, kind: 'paint'|'line', w | h (px), vars, filter, hide: [ids], only: [ids] (hide every other top part) } */
  async function motif(spec) {
    const raw = await getText(SRC + `assets/motifs/${spec.name}_${spec.kind || 'paint'}.svg`);
    const vb = (raw.match(/viewBox="([^"]+)"/) || [0, '0 0 100 100'])[1].trim().split(/[\s,]+/).map(Number);
    const ar = vb[2] / vb[3];
    const w = Math.round(spec.w ?? spec.h * ar), h = Math.round(spec.h ?? spec.w / ar);
    let hide = spec.hide || [];
    if (spec.only) {
      const ids = [...raw.matchAll(/<g\b[^>]*\sid="([^"]+)"/g)].map((m) => m[1]).filter((i) => i.startsWith(spec.name + '-') && !/-(gouache|wash|brush|soft|glowf)$/.test(i));
      hide = hide.concat(ids.filter((i) => !spec.only.includes(i)));
    }
    const im = await svgImg(svgSized(raw, w, h, spec.vars, hide));
    const c = P.canvas(w, h, true), g = P.ctx2d(c);
    if (spec.filter) g.filter = spec.filter;
    g.drawImage(im, 0, 0, w, h);
    return { width: w, height: h, viewBox: vb, png: url(c) };
  }

  /* --------------------------------------------------------------------------------------- Reception bamboo */
  function bambooGeo(o) {
    const { x0, yBase, yTop, rings, lean, side, w0 = 22, w1 = 15, bow = 0, brk = -1 } = o;
    const Hh = yBase - yTop;
    const cx = (y) => { const u = (yBase - y) / Hh; return x0 + lean * u * u + bow * Math.sin(Math.PI * u); };
    const wd = (y) => { const u = (yBase - y) / Hh; return w0 + (w1 - w0) * u; };
    const seg = Hh / (rings + 0.45);
    const ringY = []; for (let k = 1; k <= rings; k++) ringY.push(yBase - k * seg);
    const strokes = [];
    const edges = (ya, yb) => {
      const L = [], R = [];
      for (let q = 0; q <= 10; q++) { const y = ya + (yb - ya) * (q / 10), m = Math.sin((Math.PI * q) / 10) * 1.1; L.push([cx(y) - wd(y) / 2 + m, y]); R.push([cx(y) + wd(y) / 2 - m, y]); }
      return [L, R];
    };
    let ya = yBase + 6;
    const list = ringY.concat([yTop]);
    list.forEach((yb, k) => {
      const top = k === list.length - 1;
      const [L, R] = edges(ya, top ? yb + 10 : yb - 2);
      if (k === brk) { const inner = side > 0 ? R : L, outer = side > 0 ? L : R; strokes.push({ pts: outer, kind: 'out' }, { pts: inner.slice(0, 5), kind: 'out' }, { pts: inner.slice(7), kind: 'out' }); }
      else strokes.push({ pts: L, kind: 'out' }, { pts: R, kind: 'out' });
      const y0 = ya - 7, y1 = top ? yb + 26 : yb + 6;
      for (let y = y0; y > y1; y -= 9) {
        const xl = cx(y) - wd(y) / 2 + 3, xr = cx(y) + wd(y) / 2 - 3, dy = (xr - xl) * 0.62;
        if (y - dy < y1 - 2) break;
        const a = side > 0 ? [xl, y] : [xr, y], c = side > 0 ? [xr, y - dy] : [xl, y - dy];
        strokes.push({ pts: [a, [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2 + 0.6], c], kind: 'hatch' });
      }
      if (!top) {
        for (const dy of [0, -5]) { const y = yb + dy, w = wd(y) / 2 + 3.5, pts = []; for (let q = 0; q <= 8; q++) { const u = q / 8 - 0.5; pts.push([cx(y) + 2 * u * w, y + 2.2 * (1 - 4 * u * u)]); } strokes.push({ pts: side > 0 ? pts : pts.reverse(), kind: 'ring' }); }
      } else { const y = yb + 10, w = wd(y) / 2; strokes.push({ pts: [[cx(y) - w, y], [cx(y) - w * 0.4, y - 9], [cx(y), y - 14], [cx(y) + w * 0.4, y - 9], [cx(y) + w, y]], kind: 'ring' }); }
      ya = yb - 5;
    });
    return { strokes, ringY, cx, wd };
  }
  function bambooLeaf(px, py, ang, len, wid, bend) {
    const up = [], dn = [], mid = [];
    for (let q = 0; q <= 14; q++) {
      const u = q / 14, a = ((ang + bend * u * u) * Math.PI) / 180;
      const prev = mid.length ? mid[mid.length - 1] : [px, py], step = len / 14;
      const c = q === 0 ? [px, py] : [prev[0] + Math.cos(a) * step, prev[1] + Math.sin(a) * step];
      mid.push(c);
      const hw = (wid / 2) * Math.sin(Math.PI * Math.pow(u, 0.72)) * (1 - 0.15 * u), nx = -Math.sin(a), ny = Math.cos(a);
      up.push([c[0] + nx * hw, c[1] + ny * hw]); dn.push([c[0] - nx * hw, c[1] - ny * hw]);
    }
    return [up, dn, mid.slice(1, 12)];
  }
  const line = (g, pts, o) => { const S = P.prepStroke(pts, Object.assign({ body: 0.75, impasto: 0.2, jitter: 0.05, dry: 0.25, taper: [0.12, 0.2], pressure: 0.4 }, o)); P.drawStroke(g, S, 1, 1); };
  /** card.js PROPS.reception bamboo (page units: 1080 x 1532.4, ground line 1142), split into a left and a right sprite.
   *  Geometry in the manifest: each sprite's box in card units, so the layout can place it as fractions of the frame. */
  async function bamboo(res = 2) {
    const GROUND = 1142, GOLD = '#d8b468', GOLD_HI = '#e8cf8a', GOLD_SH = '#b8964f';
    const STALKS = [
      { x0: 98, yBase: GROUND + 90, yTop: 470, rings: 5, lean: 12, side: 1, seed: 3764, budX: 138, bow: 11, brk: 2 },
      { x0: 982, yBase: GROUND + 90, yTop: 560, rings: 4, lean: -11, side: -1, seed: 3765, budX: 942, bow: -8 },
      { x0: 66, yBase: GROUND + 90, yTop: 880, rings: 2, lean: 8, side: 1, seed: 3767, w0: 15, w1: 11, bow: 4, noBud: true },
    ];
    const LEAF = { 0: [[1, 205, 84, 14, -18], [3, 200, 96, 15, -16], [3, 58, 52, 10, 18], ['tip', 248, 102, 15, -26], ['tip', 292, 80, 13, 22]],
      1: [[1, -25, 84, 14, 18], [2, -20, 90, 15, 16], ['tip', 292, 98, 15, 26], ['tip', 248, 78, 13, -22]], 2: [['tip', 238, 66, 11, -20], ['tip', 268, 54, 10, 14]] };
    const vars = { '--m-petal': '#dfbca4', '--m-petal-hi': '#ecd6c2', '--m-petal-sh': '#ad8572', '--m-ivory-hi': '#eedfcc', '--m-leaf': '#6f8f80', '--m-leaf-hi': '#93ab9c', '--m-leaf-sh': '#4a675d', '--m-ink': '#6d5546' };
    const budRaw = await getText(SRC + 'assets/motifs/lotus_bud_paint.svg');
    const bvb = (budRaw.match(/viewBox="([^"]+)"/) || [0, '0 0 100 100'])[1].trim().split(/[\s,]+/).map(Number);
    const budH = 124, budW = budH * (bvb[2] / bvb[3]);
    const budImg = await svgImg(svgSized(budRaw, budW * res, budH * res, vars));
    const boxes = { left: [0, 380, 300, GROUND + 140], right: [780, 470, 1080, GROUND + 140] };
    const out = {};
    for (const [side, box] of Object.entries(boxes)) {
      const [bx0, by0, bx1, by1] = box;
      const c = P.canvas((bx1 - bx0) * res, (by1 - by0) * res, true), g = P.ctx2d(c);
      g.setTransform(res, 0, 0, res, -bx0 * res, -by0 * res);
      STALKS.forEach((st, si) => {
        const isLeft = st.x0 < 540;
        if ((side === 'left') !== isLeft) return;
        const bg = bambooGeo(st), r = E.rng('bam:' + st.seed);
        g.save();
        for (const s of bg.strokes) {
          const wdt = s.kind === 'out' ? 2.4 : s.kind === 'ring' ? 1.9 : 1.05;
          g.globalAlpha = s.kind === 'hatch' ? 0.54 : 0.8;
          line(g, s.pts, { width: wdt, color: GOLD, colors: [GOLD, GOLD_HI, GOLD_SH], seed: (r() * 1e6) | 0, pressure: s.kind === 'hatch' ? 0.25 : 0.4, bristles: s.kind === 'hatch' ? 3 : undefined });
        }
        g.globalAlpha = 0.8;
        for (const [atK, ang, len, wid, bend] of LEAF[si]) {
          const y = atK === 'tip' ? st.yTop + 12 : bg.ringY[Math.min(atK, bg.ringY.length - 1)];
          const x = bg.cx(y) + (atK === 'tip' ? 0 : (Math.cos((ang * Math.PI) / 180) > 0 ? 1 : -1) * bg.wd(y) * 0.45);
          for (const p of bambooLeaf(x, y, ang + r.range(-4, 4), len * r.range(0.94, 1.06), wid, bend)) line(g, p, { width: 2.0, color: GOLD, colors: [GOLD, GOLD_HI], pressure: 0.5, taper: [0.05, 0.6], seed: (r() * 1e6) | 0 });
        }
        g.restore();
        if (!st.noBud) {
          g.save(); g.filter = 'saturate(0.85) brightness(0.8)';
          const bx = st.budX - budW / 2, by = GROUND + 96 - budH;
          if (st.side < 0) { g.translate(st.budX, 0); g.scale(-1, 1); g.translate(-st.budX, 0); }
          g.drawImage(budImg, bx, by, budW, budH);
          g.restore();
        }
      });
      out[side] = { png: url(c), width: c.width, height: c.height, box: { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 }, page: { W: 1080, H: 1532.4, ground: GROUND } };
      c.width = c.height = 1;
    }
    return out;
  }

  /* ------------------------------------------------------------------------------------------- textures */
  function textures() {
    const out = {};
    // paper grain: P.grain('paper') grey tile (512, tileable), used soft-light over paper bands
    { const gr = P.grain('paper', 1); out['paper-512'] = url(gr.grey); }
    // gold leaf: leaf squares, seams, crackle (multiplied into the gold-leaf text gradient)
    { const c = P.goldTexture(256, 256, { seed: 3611, gold: P.palette('ivory').gold }); out['gold-leaf-256'] = url(c); }
    // brush stamps: 6 bristle dabs, white on transparent, 128 px cells in one row (paint-reveal masks, SPEC 3.5)
    {
      const N = 6, S = 128, c = P.canvas(N * S, S, true), g = P.ctx2d(c), r = E.rng('stamps:2601');
      for (let i = 0; i < N; i++) {
        const cx = i * S + S / 2, cy = S / 2, len = r.range(56, 84), ang = r.range(-0.25, 0.25), pts = [];
        for (let k = 0; k <= 10; k++) { const u = k / 10 - 0.5; pts.push([cx + Math.cos(ang) * len * u, cy + Math.sin(ang) * len * u + 5 * Math.sin(u * 3 + i)]); }
        const S1 = P.prepStroke(pts, { width: r.range(70, 92), color: '#ffffff', color2: '#ffffff', alpha: 1, body: 0.85, dry: 0.45, impasto: 0, jitter: 0.08, bristles: 14, seed: (r() * 1e6) | 0, taper: [0.25, 0.35] });
        g.save(); g.beginPath(); g.rect(i * S, 0, S, S); g.clip(); P.drawStroke(g, S1); g.restore();
      }
      out['brush-stamps'] = url(c);
    }
    // brush edge: a ragged dry-brush bottom edge, repeat-x (1024 x 96, white = paint)
    {
      const Wd = 1024, Hd = 96, c = P.canvas(Wd, Hd, true), g = P.ctx2d(c), r = E.rng('edge:2602');
      g.fillStyle = '#fff'; g.fillRect(0, 0, Wd, 34);
      for (let i = 0; i < 26; i++) {
        const x = r.range(-80, Wd), len = r.range(120, 260), y = r.range(30, 52), pts = [];
        for (let k = 0; k <= 12; k++) { const u = k / 12; pts.push([x + len * u, y + 6 * Math.sin(u * 4 + i) + r.range(-1, 1)]); }
        const S1 = P.prepStroke(pts, { width: r.range(26, 46), color: '#ffffff', alpha: 1, body: 0.7, dry: 0.65, impasto: 0, jitter: 0.07, bristles: 12, seed: (r() * 1e6) | 0 });
        for (const dx of [0, -Wd, Wd]) { g.save(); g.translate(dx, 0); P.drawStroke(g, S1); g.restore(); }
      }
      out['brush-edge'] = url(c);
    }
    // brush wipe: horizontal dry-brush gradient with bristle streaks at the leading edge (1024 x 128 alpha), the
    // hand-title mask (SPEC 3.4)
    {
      const Wd = 1024, Hd = 128, c = P.canvas(Wd, Hd, true), g = P.ctx2d(c), r = E.rng('wipe:2603');
      const lg = g.createLinearGradient(0, 0, Wd, 0);
      lg.addColorStop(0, 'rgba(255,255,255,1)'); lg.addColorStop(0.42, 'rgba(255,255,255,1)'); lg.addColorStop(0.62, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.fillRect(0, 0, Wd, Hd);
      for (let i = 0; i < 18; i++) {
        const y = (i + r.range(0.1, 0.9)) * (Hd / 18), x0 = r.range(300, 420), x1 = r.range(560, 760), pts = [];
        for (let k = 0; k <= 12; k++) { const u = k / 12; pts.push([x0 + (x1 - x0) * u, y + 2 * Math.sin(u * 5 + i)]); }
        const S1 = P.prepStroke(pts, { width: r.range(8, 16), color: '#ffffff', alpha: 1, body: 0.6, dry: 0.7, impasto: 0, jitter: 0.05, bristles: 6, seed: (r() * 1e6) | 0, taper: [0.02, 0.5] });
        P.drawStroke(g, S1);
      }
      out['brush-wipe'] = url(c);
    }
    return out;
  }

  function dabs(kind, palette, n = 6, size = 96, seed = 1) {
    const pal = PAL[palette] ? PAL[palette]() : P.palette(palette);
    const spr = P.dabSprites(kind, pal, { n, size, seed });
    const c = P.canvas(n * size, size, true), g = P.ctx2d(c);
    spr.forEach((s, i) => g.drawImage(s, i * size, 0, size, size));
    return { png: url(c), n, size };
  }

  window.SPRITES = { couple, motif, bamboo, textures, dabs, trim };
})();
