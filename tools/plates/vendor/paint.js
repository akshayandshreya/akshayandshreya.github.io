/* Painterly rendering library for the v2 engine: window.P (also E.paint).
 * Classic script; load AFTER lib/engine.js (e.g. ?scenes=../lib/paint/paint,main). See engine/README.md, section "Paint".
 *
 * Everything is deterministic: geometry comes from seeded RNG/noise only, and every animated thing is a pure
 * function of the time / progress passed to its seek(). Static layers are painted once at build into canvases;
 * per frame only a few small things are redrawn (live strokes, shimmer, reveal masks, lettering in progress).
 */
(function () {
  'use strict';
  const E = window.E;
  if (!E) throw new Error('paint.js: load lib/engine.js first');
  const { clamp, lerp, smoothstep, rng, hash1 } = E;
  const TAU = Math.PI * 2;
  const W0 = E.W, H0 = E.H;

  /* ------------------------------------------------------------ async readiness */
  // Lettering waits for fonts. Its promises are tracked here; a zero-length hidden scene registered below makes
  // E.init() wait for all of them before seek(0), so builds can stay synchronous.
  const pending = [];
  const track = (pr) => { pending.push(pr); return pr; };
  async function ready() { await null; let n = -1; while (n !== pending.length) { n = pending.length; await Promise.all(pending.slice()); } }
  E.register('__paint_ready', 0, 0, { build: () => ready(), z: -1 });

  /* ----------------------------------------------------------------- canvases */
  // Canvas backing. Chromium's GPU canvas rasterises paths through caches shared by the whole GPU process, so the same
  // drawing can differ by a few levels between pages / workers. Software (CPU) canvases are bit-exact. Default: static
  // layers on CPU (painted once), per-frame layers on GPU unless ?paintcpu=1 (everything CPU) or ?paintcpu=0.
  const CPU_MODE = E.params.get('paintcpu');
  const config = { staticCPU: CPU_MODE !== '0', dynamicCPU: CPU_MODE === '1' };
  function canvas(w, h, cpu) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    c.__cpu = cpu === 'static' ? config.staticCPU : cpu === 'dynamic' ? config.dynamicCPU : !!cpu;
    return c;
  }
  const ctx2d = (c) => c.getContext('2d', c.__cpu ? { willReadFrequently: true } : undefined);
  function free(c) { if (c) { c.width = 1; c.height = 1; } }

  /* ------------------------------------------------------------------ colours */
  const rgbCache = new Map();
  function toRGB(c) {
    if (Array.isArray(c)) return c;
    let v = rgbCache.get(c);
    if (!v) { const p = E.parseColor(c); if (!p) throw new Error('paint: bad colour ' + c); v = [p[0], p[1], p[2]]; rgbCache.set(c, v); }
    return v;
  }
  const css = (c, a) => { const [r, g, b] = toRGB(c); return a == null ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${+a.toFixed(4)})`; };
  const mix = (a, b, p) => { const A = toRGB(a), B = toRGB(b); return [lerp(A[0], B[0], p), lerp(A[1], B[1], p), lerp(A[2], B[2], p)]; };
  /** shade(c, k): k > 0 lightens toward warm white, k < 0 darkens (deepens a little rather than greying) */
  function shade(c, k) {
    const A = toRGB(c);
    if (k >= 0) return mix(A, [255, 251, 242], Math.min(1, k));
    const m = Math.max(0, 1 + k);
    const lum = (A[0] * 0.3 + A[1] * 0.59 + A[2] * 0.11);
    return A.map((v) => clamp((v + (v - lum) * -k * 0.35) * m, 0, 255));
  }
  /** colour along a list of stops, u in [0,1] */
  function ramp(list, u) {
    const n = list.length; if (n === 1) return toRGB(list[0]);
    const x = clamp(u) * (n - 1), i = Math.min(n - 2, Math.floor(x));
    return mix(list[i], list[i + 1], x - i);
  }

  /* ----------------------------------------------------------------- palettes */
  // Every palette: paper (ground), ground[light, mid, deep] (washes), strokes (mid values, close together),
  // lights, darks (sparse accents), accent, gold[deep, base, light, glint], ink (+ inkAlt) for lettering,
  // petals (particle colours), grain kind. All softened: event colour families, no neon.
  const PALETTES = {
    ivory: {
      name: 'ivory', paper: '#f2e8d8', ground: ['#f7f0e4', '#ebdcc3', '#d9c3a0'],
      strokes: ['#efe4d0', '#e7d8bd', '#f4ecdd', '#e0cdae', '#ebddc5', '#dac39f'],
      lights: ['#faf5ec', '#fdf8ef', '#f5ede0'], darks: ['#c7ab7a', '#b39062'], accent: '#a8814a',
      gold: ['#8c6526', '#bf9644', '#e6cb86', '#fff3d1'], ink: '#6f4f22', inkAlt: '#7a1e24', inkLight: false,
      petals: ['#e8c06a', '#f3dea8', '#f8f3e6', '#d9a442'], grain: 'paper', mood: 'light', glaze: ['#f5e2d6', 0.16],
    },
    sage: {
      name: 'sage', paper: '#e3e7d4', ground: ['#eef0e1', '#cdd6b8', '#a7b78c'],
      strokes: ['#c3cfa8', '#b3c296', '#ccd6b3', '#a5b688', '#d6ddc2', '#9db07f'],
      lights: ['#eff1e3', '#f6f5ea', '#e5e9d4'], darks: ['#71875b', '#5f744b'], accent: '#7d5634',
      gold: ['#86662a', '#b9984a', '#e1cc8c', '#fbf1cf'], ink: '#3f5233', inkAlt: '#f8f4e6', inkLight: false,
      petals: ['#9fb27c', '#c4cf9f', '#e2b25a', '#f4efe0'], grain: 'paper', mood: 'light',
    },
    rose: {
      name: 'rose', paper: '#eee0df', ground: ['#f6ecea', '#e3c8cc', '#c9a8b9'],
      strokes: ['#dfc2c7', '#d3b2bf', '#e8d2d4', '#c6a8bd', '#d9bcc4', '#bea3c3'],
      lights: ['#f8efed', '#fbf5f2', '#f1e3e2'], darks: ['#8f6c87', '#7b5a77'], accent: '#93678a',
      gold: ['#8a6a35', '#bd9a57', '#e5cf98', '#fff4dc'], ink: '#5a3553', inkAlt: '#fbf3ee', inkLight: false,
      petals: ['#d79aa6', '#e9bfc4', '#c8a3c9', '#f5e6e4'], grain: 'paper', mood: 'light',
    },
    turmeric: {
      name: 'turmeric', paper: '#f2deaa', ground: ['#f8ebc6', '#eccb78', '#d9a547'],
      strokes: ['#e9c46d', '#e3b95c', '#efd086', '#dcae52', '#e7c068', '#f0d595'],
      lights: ['#fbefcb', '#fff5da', '#f7e5b0'], darks: ['#b77b25', '#9f3a22'], accent: '#a3341f',
      gold: ['#8f6220', '#c4952f', '#ecd07e', '#fff3c9'], ink: '#8a2c18', inkAlt: '#fff6e0', inkLight: false,
      petals: ['#e99a2c', '#f2b93f', '#d9752a', '#f7d77c'], grain: 'paper', mood: 'light',
    },
    vermilion: {
      name: 'vermilion', paper: '#a02024', ground: ['#b8352c', '#9a1e23', '#741320'],
      strokes: ['#ac2629', '#ba342d', '#9e1f26', '#c4442f', '#921b24', '#b22d2a'],
      lights: ['#d05a3e', '#d96d4f', '#c94c39'], darks: ['#650f1b', '#540c17'], accent: '#e2b15a',
      gold: ['#9a6a24', '#d1a24a', '#f0d88e', '#fff6d6'], ink: '#f7ead0', inkAlt: '#f0d88e', inkLight: true,
      petals: ['#e8963a', '#f2c25a', '#c43a2c', '#f6efe2'], grain: 'paper', mood: 'deep',
    },
    indigo: {
      name: 'indigo', paper: '#1e2650', ground: ['#2d3868', '#1f2752', '#141a37'],
      strokes: ['#2c376b', '#26305f', '#34417a', '#212a56', '#3c4a85', '#2a3466'],
      lights: ['#4f5f9a', '#5d6da8', '#45548c'], darks: ['#111630', '#0d1127'], accent: '#d8b468',
      gold: ['#8f6c2f', '#c9a457', '#ecd593', '#fff6d8'], ink: '#f3e7c6', inkAlt: '#e8cf8a', inkLight: true,
      petals: ['#e8cf8a', '#f6ecd0', '#c9a457', '#9fb0e0'], grain: 'paper', mood: 'deep',
    },
    // 06b reception (reception=1 only): deep peacock teal with soft gold evening lights (STORYBOARD 5; characters DESIGN.md).
    // QA r1 2026-11-02 (text #4): registered here, so 06b no longer patches it in at load with a PALETTE warning
    teal: {
      name: 'teal', paper: '#21484a', ground: ['#2e5a59', '#21484a', '#153537'],
      strokes: ['#24504f', '#2b5857', '#1f4547', '#33605e', '#1b3f41', '#295453'],
      lights: ['#3f6f6c', '#4a7a76', '#386663'], darks: ['#102a2c', '#0c2224'], accent: '#d8b468',
      gold: ['#8f6c2f', '#c9a457', '#ecd593', '#fff6d8'], ink: '#f3e7c6', inkAlt: '#e8cf8a', inkLight: true,
      petals: ['#e8cf8a', '#f6ecd0', '#c9a457', '#f8f3e6'], grain: 'paper', mood: 'deep',
    },
  };
  // aliases by event
  const ALIAS = { opening: 'ivory', closing: 'ivory', cream: 'ivory', gold: 'ivory', invitation: 'ivory', mehndi: 'sage', engagement: 'rose', lilac: 'rose',
    haldi: 'turmeric', ochre: 'turmeric', wedding: 'vermilion', red: 'vermilion', crimson: 'vermilion', night: 'indigo', savethedate: 'indigo',
    reception: 'teal', peacock: 'teal' };
  function palette(p) {
    if (p && typeof p === 'object') return p;
    const k = ALIAS[p] || p || 'ivory';
    const v = PALETTES[k];
    if (!v) throw new Error('paint: unknown palette ' + p);
    return v;
  }

  /* -------------------------------------------------------------- 2-D noise */
  const noiseCache = new Map();
  function noiseFn(seed) {
    seed = seed | 0;
    let f = noiseCache.get(seed);
    if (f) return f;
    const r = rng('n2:' + seed);
    const p = new Uint8Array(256); for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    const perm = new Uint8Array(512); for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const gx = new Float32Array(256), gy = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const a = r() * TAU; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
    f = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const X = xi & 255, Y = yi & 255;
      const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
      const h00 = perm[X + perm[Y]], h10 = perm[X + 1 + perm[Y]], h01 = perm[X + perm[Y + 1]], h11 = perm[X + 1 + perm[Y + 1]];
      const n00 = gx[h00] * xf + gy[h00] * yf, n10 = gx[h10] * (xf - 1) + gy[h10] * yf;
      const n01 = gx[h01] * xf + gy[h01] * (yf - 1), n11 = gx[h11] * (xf - 1) + gy[h11] * (yf - 1);
      const a = n00 + (n10 - n00) * u, b = n01 + (n11 - n01) * u;
      return (a + (b - a) * v) * 1.41;
    };
    noiseCache.set(seed, f);
    return f;
  }
  /** noise2(x, y, seed) in about [-1, 1] (Perlin gradient noise) */
  const noise2 = (x, y, seed = 0) => noiseFn(seed)(x, y);
  /** fbm2(x, y, seed, octaves=4) */
  function fbm2(x, y, seed = 0, oct = 4) {
    let a = 0, amp = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { a += amp * noiseFn(seed + i * 31)(x * f, y * f); n += amp; amp *= 0.5; f *= 2.03; }
    return a / n;
  }

  /* --------------------------------------------------------------- flow field */
  /** flow({seed, scale, swirl, drift:[vx,vy], vortices:[{x,y,r,s}], maxTurn}) -> {vel(x,y), dir(x,y), angle(x,y)}
   *  Curl noise (divergence free, so streamlines swirl and never bunch) + a global drift + optional vortices. */
  function flow(o = {}) {
    const seed = o.seed ?? 1, sc = o.scale ?? 600, swirl = o.swirl ?? 1;
    const drift = o.drift ?? [0.6, -0.25];
    const vort = o.vortices ?? [];
    const n1 = noiseFn(seed * 7 + 1), n2 = noiseFn(seed * 7 + 2);
    const pot = (X, Y) => n1(X, Y) + 0.38 * n2(X * 2.1 + 3.7, Y * 2.1 - 1.3);
    const hh = 0.012;
    function vel(x, y) {
      const X = x / sc, Y = y / sc;
      const dpx = (pot(X + hh, Y) - pot(X - hh, Y)) / (2 * hh), dpy = (pot(X, Y + hh) - pot(X, Y - hh)) / (2 * hh);
      let vx = dpy * swirl + drift[0], vy = -dpx * swirl + drift[1];
      for (let i = 0; i < vort.length; i++) {
        const v = vort[i], dx = x - v.x, dy = y - v.y, R = v.r;
        const f = (v.s ?? 1) * Math.exp(-(dx * dx + dy * dy) / (R * R)) * 2 / R;
        vx += -dy * f; vy += dx * f;
      }
      return [vx, vy];
    }
    const dir = (x, y) => { const [vx, vy] = vel(x, y); const m = Math.hypot(vx, vy) || 1; return [vx / m, vy / m]; };
    const angle = (x, y) => { const [vx, vy] = vel(x, y); return Math.atan2(vy, vx); };
    return { vel, dir, angle, seed, opts: o };
  }

  /** trace(field, x, y, {len, step, sign, bend, maxTurn, wander, seed, bounds:[x0,y0,x1,y1]}) -> [[x,y],...] along the flow */
  function trace(field, x, y, o = {}) {
    const len = o.len ?? 200, step = o.step ?? 5, sign = o.sign ?? 1, bend = o.bend ?? 0, maxTurn = o.maxTurn ?? 0.09;
    const wander = o.wander ?? 0, ws = o.seed ?? 0, b = o.bounds;
    const pts = [[x, y]];
    let a = null;
    for (let d = 0; d < len; d += step) {
      const [dx, dy] = field.dir(x, y);
      const [mx, my] = field.dir(x + dx * step * 0.5 * sign, y + dy * step * 0.5 * sign);
      let na = Math.atan2(my * sign, mx * sign) + bend + (wander ? wander * E.noise(d / 90 + ws, ws) : 0);
      if (a !== null) {
        let da = na - a; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
        if (o.orient !== false && Math.abs(da) > Math.PI / 2) da -= Math.sign(da) * Math.PI; // orientation field: keep heading
        na = a + clamp(da, -maxTurn, maxTurn);
      }
      a = na;
      x += Math.cos(a) * step; y += Math.sin(a) * step;
      pts.push([x, y]);
      if (b && (x < b[0] || y < b[1] || x > b[2] || y > b[3])) break;
    }
    return pts;
  }

  /* ------------------------------------------------------------- brush strokes */
  function resample(pts, step) {
    if (pts.length < 2) return pts.slice();
    const out = [[pts[0][0], pts[0][1]]];
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const seg = Math.hypot(x1 - x0, y1 - y0);
      if (seg < 1e-6) continue;
      let d = step - carry;
      while (d <= seg) { const f = d / seg; out.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]); d += step; }
      carry = seg - (d - step);
    }
    const last = pts[pts.length - 1], pl = out[out.length - 1];
    if (Math.hypot(last[0] - pl[0], last[1] - pl[1]) > step * 0.3) out.push([last[0], last[1]]);
    return out;
  }
  const LIGHT = [-0.55, -0.83];
  /** prepStroke(pts, opts) -> stroke geometry + bristle set (reuse it to draw a stroke many times, e.g. draw-on).
   *  opts: width, color, color2 (double-loaded brush: blends across the stroke), colors (other paints picked up by some
   *  bristles), mix (0..1 amount of color2), alpha, body (0..1 opaque underpaint), bodyW (body width share, 0.72),
   *  bristles (count), dry (0..1 dry-brush breakup, strongest at the end and edges), impasto (0..1 ridge light/shadow),
   *  jitter (bristle colour variation), brush ('round' tapers | 'flat' blunt with a dry trailing end), taper [start, end],
   *  splay (bristles fan out at the end), wobble, step, seed, flat (constant width, for masks) */
  function prepStroke(pts, o = {}) {
    const W = o.width ?? 24;
    const step = o.step ?? clamp(W / 7, 1.6, 6);
    const P = resample(pts, step);
    const n = P.length;
    const S = { n, W, o, px: new Float32Array(n), py: new Float32Array(n), nx: new Float32Array(n), ny: new Float32Array(n), s: new Float32Array(n), w: new Float32Array(n), sp: new Float32Array(n), el: new Float32Array(n), er: new Float32Array(n), L: 0 };
    for (let i = 0; i < n; i++) { S.px[i] = P[i][0]; S.py[i] = P[i][1]; if (i) S.s[i] = S.s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); }
    S.L = n ? S.s[n - 1] : 0;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
      let tx = S.px[b] - S.px[a], ty = S.py[b] - S.py[a]; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
      S.nx[i] = -ty; S.ny[i] = tx;
    }
    const r = rng(o.seed ?? 1);
    const nseed = Math.floor(r() * 1000);
    const brush = o.brush ?? 'round';
    const ta = o.taper ? o.taper[0] : brush === 'flat' ? 0.04 : 0.1, tb = o.taper ? o.taper[1] : brush === 'flat' ? 0.25 : 0.38;
    const tailMin = brush === 'flat' ? 0.72 : 0.22, headMin = brush === 'flat' ? 0.85 : 0.4;
    const wob = o.wobble ?? 0.12, splay = o.splay ?? (brush === 'flat' ? 0.22 : 0.1);
    let avgDot = 0;
    for (let i = 0; i < n; i++) {
      const u = S.L ? S.s[i] / S.L : 0;
      let f = 1;
      if (!o.flat) {
        const head = headMin + (1 - headMin) * smoothstep(0, ta, u);
        const tail = 1 - (1 - tailMin) * Math.pow(smoothstep(1 - tb, 1, u), 1.2);
        f = head * tail;
      }
      const pr = o.pressure ?? 0;
      if (pr > 0) f *= (1 - pr) + pr * (0.55 + 0.75 * Math.sin(Math.PI * clamp(u * 1.08 - 0.04)) * (0.8 + 0.4 * (0.5 + 0.5 * E.noise(S.s[i] / 90 + nseed, nseed + 5))));
      S.w[i] = W * f * (1 + wob * E.noise(u * 3.3 + nseed, nseed));
      S.sp[i] = 1 + splay * smoothstep(0.78, 1, u);
      const rg = o.rag ?? 0.14, sd = S.s[i] / (4 + W * 0.2);
      S.el[i] = 1 + rg * (0.65 * E.noise(sd, nseed + 1) + 0.35 * E.noise(sd * 3.1, nseed + 2));
      S.er[i] = 1 + rg * (0.65 * E.noise(sd, nseed + 3) + 0.35 * E.noise(sd * 3.1, nseed + 4));
      avgDot += S.nx[i] * LIGHT[0] + S.ny[i] * LIGHT[1];
    }
    S.side = avgDot >= 0 ? 1 : -1;
    const base = toRGB(o.color ?? '#888888');
    const c2 = o.color2 ? toRGB(o.color2) : null;
    const list = o.colors ? o.colors.map(toRGB) : null;
    const jit = o.jitter ?? 0.07;
    const N = o.bristles ?? clamp(Math.round(W / 1.7), 4, 48);
    const dry = o.dry ?? 0.3;
    S.bodyA = o.body ?? 0.6;
    S.bodyW = (o.bodyW ?? 0.72) / 2;
    S.bodyRGB = c2 ? mix(base, c2, 0.35 * (o.mix ?? 0.8)) : base;
    S.bodyCol = css(S.bodyRGB);
    S.fadeLen = o.flat ? 0 : Math.min(S.L * 0.3, W * (brush === 'flat' ? 0.9 : 1.0) + 10);
    S.alpha = o.alpha ?? 1;
    S.br = [];
    for (let b = 0; b < N; b++) {
      const off = ((b + 0.5) / N - 0.5) + r.range(-0.4, 0.4) / N;
      const edge = Math.min(1, Math.abs(off) * 2);
      let col = base;
      if (c2) col = mix(col, c2, smoothstep(0.15, 0.85, off + 0.5) * (o.mix ?? 0.8) * r.range(0.55, 1));
      if (list && r() < 0.35) col = mix(col, list[Math.floor(r() * list.length)], r.range(0.3, 0.75));
      col = shade(col, r.gauss() * jit);
      S.br.push({
        off, lw: Math.max(0.55, (W / N) * r.range(1.0, 1.75) * (1 - 0.3 * edge)), col: css(col), a: r.range(0.45, 0.95) * (1 - 0.25 * edge),
        u0: r() < 0.15 + 0.3 * edge ? r.range(0, 0.1) : 0, u1: 1 - Math.min(0.6, (0.06 + dry * (0.3 + 0.5 * edge)) * Math.pow(r(), 1.3) * Math.min(1, (S.fadeLen * 2.2) / (S.L || 1)) * 2.2), g: r.range(0, 500), gk: dry * (0.55 + 0.8 * edge),
      });
    }
    const imp = o.impasto ?? 0.35;
    S.ridges = imp > 0 ? [
      { off: 0.17 * S.side, lw: Math.max(0.7, W * 0.045), col: css(shade(base, 0.3)), a: imp * 0.45, u0: 0.03, u1: 0.85, g: r.range(0, 500), gk: 0.5 },
      { off: r.range(-0.12, 0.08) * S.side, lw: Math.max(0.6, W * 0.03), col: css(shade(base, 0.2)), a: imp * 0.3, u0: 0.12, u1: 0.7, g: r.range(0, 500), gk: 0.6 },
      { off: -0.3 * S.side, lw: Math.max(0.7, W * 0.045), col: css(shade(base, -0.2)), a: imp * 0.28, u0: 0.05, u1: 0.92, g: r.range(0, 500), gk: 0.5 },
    ] : [];
    S.chunk = Math.max(2, Math.round((o.chunk ?? 14) / step));
    S.lead = o.lead ?? 0.35;
    return S;
  }
  /** index + fraction of arc length d along S */
  function locate(S, d) {
    if (d <= 0) return [0, 0];
    if (d >= S.L) return [S.n - 1, 0];
    let lo = 0, hi = S.n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S.s[m] <= d) lo = m; else hi = m; }
    return [lo, (d - S.s[lo]) / ((S.s[lo + 1] - S.s[lo]) || 1)];
  }
  function ptAt(S, i, f, off) {
    const j = Math.min(S.n - 1, i + 1);
    const x = S.px[i] + (S.px[j] - S.px[i]) * f, y = S.py[i] + (S.py[j] - S.py[i]) * f;
    const w = (S.w[i] + (S.w[j] - S.w[i]) * f) * (S.sp[i] + (S.sp[j] - S.sp[i]) * f), nx = S.nx[i] + (S.nx[j] - S.nx[i]) * f, ny = S.ny[i] + (S.ny[j] - S.ny[i]) * f;
    return [x + nx * off * w, y + ny * off * w];
  }
  function bodyPoly(g, S, i0, f0, i1, f1, bw, round) {
    g.beginPath();
    let p = ptAt(S, i0, f0, bw * S.el[i0]); g.moveTo(p[0], p[1]);
    for (let i = i0 + 1; i <= i1; i++) { const w = S.w[i] * bw * S.el[i]; g.lineTo(S.px[i] + S.nx[i] * w, S.py[i] + S.ny[i] * w); }
    p = ptAt(S, i1, f1, bw * S.el[i1]); g.lineTo(p[0], p[1]);
    if (round) { // rounded, slightly irregular brush head
      const c = ptAt(S, i1, f1, 0), j = Math.min(S.n - 1, i1 + 1);
      const nx = S.nx[i1], ny = S.ny[i1], tx = ny, ty = -nx, w = S.w[i1] * bw;
      for (let k = 1; k < 8; k++) { const a = (k / 8) * Math.PI; const rr = w * (1 + 0.12 * E.noise(k * 1.7 + S.s[j] * 0.01, 9)); g.lineTo(c[0] + nx * Math.cos(a) * rr + tx * Math.sin(a) * rr * round, c[1] + ny * Math.cos(a) * rr + ty * Math.sin(a) * rr * round); }
    }
    p = ptAt(S, i1, f1, -bw * S.er[i1]); g.lineTo(p[0], p[1]);
    for (let i = i1; i > i0; i--) { const w = S.w[i] * -bw * S.er[i]; g.lineTo(S.px[i] + S.nx[i] * w, S.py[i] + S.ny[i] * w); }
    p = ptAt(S, i0, f0, -bw * S.er[i0]); g.lineTo(p[0], p[1]);
    g.closePath();
  }
  /** drawStroke(g, S, u1=1, alpha=1, u0=0): paint stroke S from u0 to u1 (fractions of its length) */
  function drawStroke(g, S, u1 = 1, alpha = 1, u0 = 0) {
    if (S.n < 2 || u1 <= u0) return;
    const A = S.alpha * alpha;
    if (A <= 0.003) return;
    const d0 = u0 * S.L, d1 = u1 * S.L;
    const [i0, f0] = locate(S, d0), [i1, f1] = locate(S, d1);
    const prevA = g.globalAlpha;
    g.lineCap = 'butt'; g.lineJoin = 'round';
    if (S.bodyA > 0) {
      const bw = S.bodyW;
      g.globalAlpha = prevA * A * S.bodyA;
      // the body thins out over the last stretch so the splayed bristle tips show (paint running out)
      const fs = S.L - S.fadeLen;
      if (S.fadeLen > 0 && d1 > fs) {
        const [ia, fa] = locate(S, Math.max(d0, fs)), [ib, fb] = locate(S, S.L);
        const pa = ptAt(S, ia, fa, 0), pb = ptAt(S, ib, fb, 0);
        const u = Math.max(d0, fs);
        const gr = g.createLinearGradient(pa[0], pa[1], pb[0], pb[1]);
        const c = S.bodyRGB, k0 = 1 - (u - fs) / (S.fadeLen || 1);
        gr.addColorStop(0, css(c, clamp(k0))); gr.addColorStop(0.4, css(c, clamp(k0) * 0.55)); gr.addColorStop(0.75, css(c, clamp(k0) * 0.12)); gr.addColorStop(1, css(c, 0));
        g.fillStyle = gr;
        if (d0 < fs) { // solid part first
          bodyPoly(g, S, i0, f0, ...locate(S, fs), bw); g.fillStyle = S.bodyCol; g.fill(); g.fillStyle = gr;
        }
        bodyPoly(g, S, ia, fa, i1, f1, bw); g.fill();
      } else if (u1 < 1 && S.lead > 0) {
        const [ib, fb] = locate(S, Math.max(d0, d1 - S.W * S.lead * 0.55));
        bodyPoly(g, S, i0, f0, ib, fb, bw, 0.6); g.fillStyle = S.bodyCol; g.fill();
      } else { bodyPoly(g, S, i0, f0, i1, f1, bw); g.fillStyle = S.bodyCol; g.fill(); }
    }
    const lines = S.br.length ? S.br.concat(S.ridges) : S.ridges;
    const partial = u1 < 1 && S.lead > 0;
    for (let k = 0; k < lines.length; k++) {
      const b = lines[k];
      // while the brush is moving, centre bristles lead and edge bristles trail: a rounded, ragged head
      const lag = partial ? S.W * S.lead * (b.off * b.off * 4) * (0.7 + 0.3 * Math.sin(b.g)) : 0;
      const bd0 = Math.max(d0, b.u0 * S.L), bd1 = Math.min(d1 - lag, b.u1 * S.L);
      if (bd1 <= bd0) continue;
      const [j0, g0] = locate(S, bd0), [j1, g1] = locate(S, bd1);
      g.strokeStyle = b.col; g.lineWidth = b.lw;
      const endFade = b.u1 * S.L;
      let start = j0, sf = g0;
      while (true) {
        const end = Math.min(j1, start + S.chunk);
        const last = end >= j1;
        const dm = S.s[(start + end) >> 1];
        const u = dm / S.L;
        let fa = b.a;
        if (b.gk > 0) {
          const thr = b.gk * (0.04 + 0.96 * Math.pow(u, 1.6));
          const v = 0.5 + 0.5 * E.noise(dm / (S.W * 0.7 + 6) + b.g, 3);
          fa *= smoothstep(thr - 0.15, thr + 0.15, v);
        }
        fa *= 1 - smoothstep(endFade - S.W * 0.35 - 10, endFade, dm);
        if (fa > 0.01) {
          g.globalAlpha = prevA * A * fa;
          g.beginPath();
          let p = ptAt(S, start, sf, b.off); g.moveTo(p[0], p[1]);
          for (let i = start + 1; i < end; i++) { const w = S.w[i] * S.sp[i] * b.off; g.lineTo(S.px[i] + S.nx[i] * w, S.py[i] + S.ny[i] * w); }
          p = last ? ptAt(S, j1, g1, b.off) : ptAt(S, end, 0, b.off); g.lineTo(p[0], p[1]);
          g.stroke();
        }
        if (last) break;
        start = end; sf = 0;
      }
    }
    g.globalAlpha = prevA;
  }
  /** stroke(g, pts, opts): prepare + paint in one call (static painting) */
  function stroke(g, pts, o) { const S = prepStroke(pts, o); drawStroke(g, S, 1, 1); return S; }

  /* -------------------------------------------------------------------- washes */
  function deform(poly, depth, v, r) {
    let pts = poly;
    for (let d = 0; d < depth; d++) {
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        out.push(a);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const vv = (a[2] + b[2]) * 0.5;
        const ang = r() * TAU, mag = r.gauss() * len * v * vv * 0.5;
        out.push([(a[0] + b[0]) / 2 + Math.cos(ang) * mag, (a[1] + b[1]) / 2 + Math.sin(ang) * mag, vv * r.range(0.75, 1.2)]);
      }
      pts = out;
    }
    return pts;
  }
  function blobPoly(x, y, rx, ry, n, rot, r) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU + r.range(-0.15, 0.15); const k = r.range(0.85, 1.12); pts.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k, r.range(0.6, 1.4)]); }
    return pts;
  }
  /** wash(g, {x, y, rx, ry, rot | poly:[[x,y]...], color, alpha, layers, spread, edge, bleed, seed})
   *  Watercolour/gouache glaze: many very transparent deformed layers (soft edges), optional edge darkening
   *  (pigment pooling at the rim, `edge` 0..1) and bleed (wet-in-wet softening, px). */
  function wash(g, o) {
    const r = rng(o.seed ?? 1);
    const spread = o.spread ?? 0.5;
    const base0 = o.poly ? o.poly.map((p) => [p[0], p[1], r.range(0.6, 1.4)]) : blobPoly(o.x, o.y, o.rx ?? o.r ?? 200, o.ry ?? o.r ?? 200, o.sides ?? 9, o.rot ?? 0, r);
    const base = deform(base0, o.depth ?? 3, spread, r);
    const layers = o.layers ?? 26, alpha = o.alpha ?? 0.045;
    const col = css(o.color ?? '#999');
    const needOff = (o.edge ?? 0) > 0 || (o.bleed ?? 0) > 0;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const p of base) { bx0 = Math.min(bx0, p[0]); by0 = Math.min(by0, p[1]); bx1 = Math.max(bx1, p[0]); by1 = Math.max(by1, p[1]); }
    const padd = Math.max(40, (bx1 - bx0 + by1 - by0) * 0.12);
    bx0 -= padd; by0 -= padd; bx1 += padd; by1 += padd;
    const res = o.res ?? 1;
    let tg = g, off = null;
    if (needOff) { off = canvas((bx1 - bx0) * res, (by1 - by0) * res, 'static'); tg = ctx2d(off); tg.setTransform(res, 0, 0, res, -bx0 * res, -by0 * res); }
    tg.fillStyle = col;
    const prevA = tg.globalAlpha;
    for (let i = 0; i < layers; i++) {
      const p = deform(base, o.layerDepth ?? 3, spread * 0.55, r);
      tg.globalAlpha = (needOff ? 1 : prevA) * alpha;
      tg.beginPath(); tg.moveTo(p[0][0], p[0][1]);
      for (let k = 1; k < p.length; k++) tg.lineTo(p[k][0], p[k][1]);
      tg.closePath(); tg.fill();
    }
    tg.globalAlpha = prevA;
    if (!needOff) return;
    if (o.bleed > 0) { const b2 = canvas(off.width, off.height, 'static'); const bg = ctx2d(b2); bg.filter = `blur(${o.bleed * res}px)`; bg.drawImage(off, 0, 0); free(off); off = b2; }
    // place: draw in g's current transform
    g.save();
    g.drawImage(off, bx0, by0, bx1 - bx0, by1 - by0);
    if (o.edge > 0) {
      const ring = canvas(off.width, off.height, 'static'); const rg = ctx2d(ring);
      rg.drawImage(off, 0, 0);
      rg.globalCompositeOperation = 'destination-out';
      rg.filter = `blur(${(o.edgeWidth ?? 10) * res}px)`;
      rg.drawImage(off, 0, 0); rg.filter = 'none';
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha *= clamp(o.edge * 1.6, 0, 1);
      g.drawImage(ring, bx0, by0, bx1 - bx0, by1 - by0);
      free(ring);
    }
    g.restore();
    free(off);
  }
  /** bleed(g, {x, y, r, color, seed, strength}): watercolour bloom (back-run) with a darker cauliflower rim */
  function bleed(g, o) {
    const r = o.r ?? 120, s = o.strength ?? 1;
    wash(g, { x: o.x, y: o.y, rx: r * (o.sx ?? 1), ry: r * (o.sy ?? 0.8), rot: o.rot ?? 0, color: o.color, alpha: 0.05 * s, layers: 22, spread: 0.9, depth: 4, edge: 0.55 * s, edgeWidth: Math.max(4, r * 0.08), bleed: 1.5, seed: o.seed, res: o.res });
  }

  /* -------------------------------------------------------------------- grain */
  const grainCache = new Map();
  /** grain(kind='paper'|'canvas'|'rough', seed) -> {grey, dark, light} 512 px tileable canvases */
  function grain(kind = 'paper', seed = 1) {
    const key = kind + ':' + seed;
    if (grainCache.has(key)) return grainCache.get(key);
    const N = 512;
    const c = canvas(N, N, true), g = ctx2d(c);
    const id = g.createImageData(N, N), d = id.data;
    const vh = (ix, iy, P, s) => hash1(((ix % P) + P) % P * 7919 + (((iy % P) + P) % P) * 104729, s);
    const vnoise = (x, y, cell, s) => {
      const P = N / cell; const X = x / cell, Y = y / cell; const ix = Math.floor(X), iy = Math.floor(Y); const fx = X - ix, fy = Y - iy;
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const a = vh(ix, iy, P, s), b = vh(ix + 1, iy, P, s), cc = vh(ix, iy + 1, P, s), dd = vh(ix + 1, iy + 1, P, s);
      return (a + (b - a) * u + (cc - a) * v + (a - b - cc + dd) * u * v) * 2 - 1;
    };
    const wp = 8; // canvas weave period (px), divides 512
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v;
      const paper = 0.07 * vnoise(x, y, 64, seed) + 0.12 * vnoise(x, y, 16, seed + 1) + 0.36 * vnoise(x, y, 4, seed + 2) + 0.3 * vnoise(x, y, 2, seed + 7) + 0.22 * (hash1(x * 1031 + y * 7, seed + 3) - 0.5);
      if (kind === 'canvas') {
        const cx = Math.floor(x / wp), cy = Math.floor(y / wp);
        const th = 0.5 + 0.5 * Math.cos(((y % wp) / wp) * TAU + 0.6 * vnoise(x, cy * wp, 32, seed + 4));
        const tv = 0.5 + 0.5 * Math.cos(((x % wp) / wp) * TAU + 0.6 * vnoise(cx * wp, y, 32, seed + 5));
        const weave = ((cx + cy) & 1) ? th : tv;
        v = 0.75 * (weave - 0.5) * 1.4 + 0.45 * paper;
      } else if (kind === 'rough') v = paper * 1.25 + 0.2 * vnoise(x, y, 2, seed + 6);
      else v = paper;
      const q = clamp(128 + v * 120, 0, 255);
      const i = (y * N + x) * 4; d[i] = d[i + 1] = d[i + 2] = q; d[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    // fibres (paper only)
    if (kind !== 'canvas') {
      const r = rng('fib' + seed);
      g.lineCap = 'round';
      for (let i = 0; i < 260; i++) {
        const x = r() * N, y = r() * N, a = r() * TAU, l = r.range(6, 26), lt = r() < 0.5;
        g.strokeStyle = lt ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)'; g.lineWidth = r.range(0.5, 1.1);
        for (const [ox, oy] of [[0, 0], [-N, 0], [N, 0], [0, -N], [0, N]]) {
          g.beginPath(); g.moveTo(x + ox, y + oy); g.quadraticCurveTo(x + ox + Math.cos(a + 0.4) * l * 0.5, y + oy + Math.sin(a + 0.4) * l * 0.5, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); g.stroke();
        }
      }
    }
    // dark/light split tiles (for alpha-preserving application with source-atop)
    const src = g.getImageData(0, 0, N, N).data;
    const mk = (fn) => { const t = canvas(N, N, true), tg = ctx2d(t); const im = tg.createImageData(N, N); const dd = im.data; for (let i = 0; i < src.length; i += 4) { const [v, a] = fn(src[i]); dd[i] = dd[i + 1] = dd[i + 2] = v; dd[i + 3] = a; } tg.putImageData(im, 0, 0); return t; };
    const out = { grey: c, dark: mk((v) => [0, clamp((128 - v) * 2.2, 0, 255)]), light: mk((v) => [255, clamp((v - 128) * 2.2, 0, 255)]) };
    grainCache.set(key, out);
    return out;
  }
  const tintCache = new Map();
  function tintTile(tile, col, key) {
    const k = key + '|' + col;
    if (tintCache.has(k)) return tintCache.get(k);
    const c = canvas(tile.width, tile.height, 'static'), g = ctx2d(c);
    g.drawImage(tile, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = css(col); g.fillRect(0, 0, c.width, c.height);
    tintCache.set(k, c);
    return c;
  }
  /** applyGrain(g, {kind, seed, alpha, darkK, lightK, dark, light, rect:[x,y,w,h], scale}) — alpha-preserving
   *  (source-atop) paper/canvas texture. dark/light: tint colours of the valleys/ridges (default near-black/white;
   *  pass palette colours so the tooth keeps the hue instead of greying it). */
  function applyGrain(g, o = {}) {
    const kind = o.kind ?? 'paper', sd = o.seed ?? 1;
    const t = grain(kind, sd);
    const rect = o.rect ?? [0, 0, g.canvas.width, g.canvas.height];
    const a = o.alpha ?? 0.2;
    const dk = o.dark ? tintTile(t.dark, o.dark, kind + sd + 'd') : t.dark, lt = o.light ? tintTile(t.light, o.light, kind + sd + 'l') : t.light;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    for (const [tile, k] of [[dk, a * (o.darkK ?? 1)], [lt, a * (o.lightK ?? 0.7)]]) {
      const pat = g.createPattern(tile, 'repeat');
      if (o.scale && o.scale !== 1 && pat.setTransform) pat.setTransform(new DOMMatrix().scale(o.scale));
      g.globalAlpha = k; g.fillStyle = pat; g.fillRect(rect[0], rect[1], rect[2], rect[3]);
    }
    g.restore();
  }

  /* ---------------------------------------------------------------- gold leaf */
  const goldTexCache = new Map();
  /** goldTexture(w, h, {seed, gold}) -> canvas: leaf squares with seams, crackle and burnish variation */
  function goldTexture(w, h, o = {}) {
    const gold = o.gold ?? PALETTES.ivory.gold;
    const key = [w, h, o.seed ?? 1, gold.join()].join('|');
    if (goldTexCache.has(key)) return goldTexCache.get(key);
    const c = canvas(w, h, 'static'), g = ctx2d(c);
    const r = rng('gold' + (o.seed ?? 1));
    const gr = g.createLinearGradient(0, 0, w * 0.3, h);
    gr.addColorStop(0, css(gold[1])); gr.addColorStop(0.45, css(gold[2])); gr.addColorStop(0.7, css(gold[1])); gr.addColorStop(1, css(gold[0]));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // leaf sheets: slightly rotated squares with tonal shift and darker seams
    const sz = o.leaf ?? 46;
    for (let y = -sz; y < h + sz; y += sz * 0.92) for (let x = -sz; x < w + sz; x += sz * 0.92) {
      const k = r.range(-0.12, 0.14);
      g.save(); g.translate(x + r.range(-4, 4), y + r.range(-4, 4)); g.rotate(r.range(-0.05, 0.05));
      g.fillStyle = css(k > 0 ? gold[3] : gold[0], Math.abs(k) * 0.9); g.fillRect(0, 0, sz, sz);
      g.strokeStyle = css(gold[0], 0.28); g.lineWidth = 0.7; g.strokeRect(0, 0, sz, sz);
      g.restore();
    }
    // crackle
    g.lineCap = 'round';
    for (let i = 0; i < (w * h) / 900; i++) {
      let x = r() * w, y = r() * h, a = r() * TAU;
      g.strokeStyle = css(gold[0], r.range(0.25, 0.5)); g.lineWidth = r.range(0.4, 0.9);
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { a += r.range(-0.9, 0.9); x += Math.cos(a) * r.range(3, 9); y += Math.sin(a) * r.range(3, 9); g.lineTo(x, y); }
      g.stroke();
    }
    // burnish speckle
    for (let i = 0; i < (w * h) / 160; i++) { g.fillStyle = css(r() < 0.5 ? gold[3] : gold[0], r.range(0.08, 0.3)); g.fillRect(r() * w, r() * h, r.range(0.6, 2), r.range(0.6, 2)); }
    goldTexCache.set(key, c);
    return c;
  }
  /** goldFlecks(g, {count, rect:[x,y,w,h], density(x,y)->0..1, size:[a,b], field, gold, seed}) — gold-leaf flakes */
  function goldFlecks(g, o = {}) {
    const r = rng(o.seed ?? 5);
    const gold = o.gold ?? PALETTES.ivory.gold;
    const [rx, ry, rw, rh] = o.rect ?? [0, 0, W0, H0];
    const [s0, s1] = o.size ?? [2, 8];
    const count = o.count ?? 60;
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 20; tries++) {
      const x = rx + r() * rw, y = ry + r() * rh;
      if (o.density && r() > o.density(x, y)) continue;
      placed++;
      const sz = s0 + (s1 - s0) * Math.pow(r(), 2.2);
      const ang = o.field ? o.field.angle(x, y) : r() * TAU;
      const el = r.range(1.1, 2.4), nv = r.int(5, 8);
      g.save(); g.translate(x, y); g.rotate(ang + r.range(-0.4, 0.4));
      g.beginPath();
      for (let k = 0; k < nv; k++) { const a = (k / nv) * TAU + r.range(-0.3, 0.3); const rr = sz * r.range(0.45, 1.05); const px = Math.cos(a) * rr * el, py = Math.sin(a) * rr; k ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.closePath();
      const gr = g.createLinearGradient(-sz * el, -sz, sz * el, sz);
      gr.addColorStop(0, css(gold[0])); gr.addColorStop(0.45, css(gold[2])); gr.addColorStop(0.62, css(gold[3])); gr.addColorStop(1, css(gold[1]));
      g.globalAlpha = r.range(0.75, 1); g.fillStyle = gr; g.fill();
      g.globalAlpha = 0.5; g.strokeStyle = css(gold[0]); g.lineWidth = 0.6; g.stroke();
      g.restore();
    }
  }
  /** goldStroke(g, pts, {width, gold, seed, alpha}) — a gilded brush line (impasto gold) */
  function goldStroke(g, pts, o = {}) {
    const gold = o.gold ?? PALETTES.ivory.gold;
    return stroke(g, pts, Object.assign({ color: gold[1], color2: gold[2], colors: [gold[1], gold[2], gold[3], gold[0]], body: 0.9, impasto: 0.9, jitter: 0.08, dry: 0.35, bristles: clamp(Math.round((o.width ?? 6) / 1.4), 3, 16) }, o));
  }
  /** goldShimmer(src canvas, {angle, period, dur, delay, width, strength, left, top, glint}) -> {canvas, seek(t), bandAt(t)}
   *  Redraws src + a moving light band (source-atop) only while the band is on it. */
  function goldShimmer(src, o = {}) {
    const cv = canvas(src.width, src.height, 'dynamic'), g = ctx2d(cv);
    const ang = ((o.angle ?? 62) * Math.PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang);
    const period = o.period ?? 9, dur = o.dur ?? 3.2, delay = o.delay ?? 1.5, bw = o.width ?? 220, k = o.strength ?? 0.85;
    const ox = o.left ?? 0, oy = o.top ?? 0, sc = o.scale ?? 1; // src placement in stage coords (for sync with a stage-wide sweep)
    const span = Math.abs(W0 * ca) + Math.abs(H0 * sa) + bw * 2;
    let state = null;
    const bandAt = (t) => { const ph = (((t - delay) % period) + period) % period; if (t < delay || ph > dur) return null; return -span / 2 + span * E.ease.inOutSine(ph / dur); };
    return {
      canvas: cv, bandAt,
      seek(t) {
        const d = bandAt(t);
        const key = d == null ? 'off' : d; // exact: a rounded key would make frames depend on seek history
        if (key === state) return; state = key;
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        g.clearRect(0, 0, cv.width, cv.height);
        g.drawImage(src, 0, 0);
        if (d == null) return;
        // band in stage coords: centre line (x - W/2) ca + (y - H/2) sa = d
        const cx = W0 / 2 + ca * d, cy = H0 / 2 + sa * d;
        g.setTransform(1 / sc, 0, 0, 1 / sc, -ox / sc, -oy / sc);
        const gr = g.createLinearGradient(cx - ca * bw, cy - sa * bw, cx + ca * bw, cy + sa * bw);
        const glint = o.glint ?? '#fff7dc';
        gr.addColorStop(0, css(glint, 0)); gr.addColorStop(0.42, css(glint, k * 0.35)); gr.addColorStop(0.5, css(glint, k)); gr.addColorStop(0.58, css(glint, k * 0.35)); gr.addColorStop(1, css(glint, 0));
        g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr;
        g.fillRect(ox - 10, oy - 10, cv.width * sc + 20, cv.height * sc + 20);
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over';
      },
    };
  }

  /* ------------------------------------------------------------ the painting */
  const STYLES = {
    // calm swirls in the spirit of the inspiration (strokes curl around two soft eddies)
    swirl: (W, H) => ({ swirl: 0.5, flowScale: 780, drift: [0.72, -0.42], vortices: [{ x: W * 0.12, y: H * 0.28, r: W * 0.55, s: 0.55 }, { x: W * 0.92, y: H * 0.72, r: W * 0.6, s: -0.5 }], big: 1, mid: 1, fine: 1 }),
    // quieter: long horizontal veils, few strokes, more wash
    veil: (W, H) => ({ swirl: 0.35, flowScale: 900, drift: [1, 0.06], vortices: [], big: 0.9, mid: 0.6, fine: 0.6 }),
    // a single broad eddy behind the centre (for opening / closing medallion compositions)
    halo: (W, H) => ({ swirl: 0.45, flowScale: 800, drift: [0.15, -0.1], vortices: [{ x: W * 0.5, y: H * 0.42, r: W * 0.62, s: 1.25 }], big: 1, mid: 0.9, fine: 1 }),
    // sky: night wash, sparse strokes, gold stars
    night: (W, H) => ({ swirl: 0.6, flowScale: 760, drift: [0.8, -0.12], vortices: [{ x: W * 0.7, y: H * 0.22, r: W * 0.45, s: 0.8 }], big: 0.9, mid: 0.7, fine: 1.2 }),
  };
  function ellipseDist(x, y, z) { const dx = (x - z.x) / z.rx, dy = (y - z.y) / z.ry; return Math.sqrt(dx * dx + dy * dy); }

  /** paint(opts) -> {base, mid, gold, W, H, M, res, field, palette, calmAt, colorAt}
   *  A complete static painting, split into a base layer (ground washes + broad underpainting, opaque), a mid layer
   *  (textured strokes, transparent) and a gold layer (leaf flecks / gilded lines, transparent). Each canvas is
   *  (W + 2M) x (H + 2M) device px * res, so layers can drift without exposing edges.
   *  opts: palette, seed, style ('swirl'|'veil'|'halo'|'night'), W, H, M (bleed margin, 36), res (1; 2 for print),
   *  calm: [{x, y, rx, ry, k}] quiet zones (fewer, lighter strokes), glow: {x, y, r, k} luminous area, floor: y of the
   *  ground line (soft horizontal strokes + a little weight below), density (1), contrast (1), gold (0..1 amount),
   *  goldLines (count of gilded swirl lines), field (a P.flow to reuse), swirl/drift/vortices/flowScale overrides. */
  function paint(o = {}) {
    const W = o.W ?? W0, H = o.H ?? H0, M = o.M ?? 36, res = o.res ?? 1;
    const pal = palette(o.palette);
    const seed = o.seed ?? 1;
    const st = Object.assign({}, (STYLES[o.style ?? 'swirl'] || STYLES.swirl)(W, H));
    for (const k of ['swirl', 'flowScale', 'drift', 'vortices']) if (o[k] != null) st[k] = o[k];
    const field0 = o.field || flow({ seed, scale: st.flowScale, swirl: st.swirl, drift: st.drift, vortices: st.vortices });
    const floorY = o.floor ?? null;
    // near the ground line the flow lies down (horizontal, gently undulating), so figures stand on a painted floor
    const field = floorY == null ? field0 : Object.assign({}, field0, {
      dir(x, y) { const [dx, dy] = field0.dir(x, y); const k = smoothstep(floorY - 260, floorY + 40, y) * 0.92; if (k <= 0) return [dx, dy]; const th = Math.atan2(dy, dx), c = lerp(Math.cos(2 * th), 1, k), sn = lerp(Math.sin(2 * th), 0, k); let a = Math.atan2(sn, c) / 2 + 0.06 * k * E.noise(x / 170, seed); if (Math.cos(a - th) < 0) a += Math.PI; return [Math.cos(a), Math.sin(a)]; },
      angle(x, y) { const d = this.dir(x, y); return Math.atan2(d[1], d[0]); },
    });
    const calm = o.calm ?? [{ x: W * 0.5, y: H * 0.5, rx: W * 0.4, ry: H * 0.33, k: 0.7 }];
    const calmAt = (x, y) => { let m = 0; for (const z of calm) m = Math.max(m, (z.k ?? 0.7) * (1 - smoothstep(0.55, 1.15, ellipseDist(x, y, z)))); return m; };
    const glow = o.glow === false ? null : (o.glow ?? { x: W * 0.5, y: H * 0.42, r: H * 0.5, k: 0.55 });
    const floor = o.floor ?? null;
    const contrast = o.contrast ?? 1, dens = o.density ?? 1;
    const deep = pal.mood === 'deep';
    // colour field: regions of related colour (like a painter's patches), lighter in calm/glow, deeper at edges
    const cseed = seed * 13 + 7;
    function colorAt(x, y, set = pal.strokes, rr) {
      const f = fbm2(x / (W * 0.7), y / (H * 0.42), cseed, 3);
      let c = ramp(set, clamp(0.5 + f * 1.15 + (rr ? rr.range(-0.12, 0.12) : 0)));
      const cm = calmAt(x, y);
      if (cm > 0) c = mix(c, pal.lights[0], cm * 0.35);
      const ex = Math.abs(x / W - 0.5) * 2, ey = Math.abs(y / H - 0.5) * 2;
      const edge = smoothstep(0.55, 1.25, Math.hypot(ex * 0.9, ey));
      if (edge > 0) c = mix(c, pal.ground[2], edge * 0.32 * contrast);
      if (floor != null && y > floor) c = mix(c, pal.ground[2], smoothstep(floor, floor + 260, y) * 0.22 * contrast);
      return c;
    }
    const mk = () => { const c = canvas((W + 2 * M) * res, (H + 2 * M) * res, 'static'); const g = ctx2d(c); g.setTransform(res, 0, 0, res, M * res, M * res); return [c, g]; };
    const bounds = [-M - 60, -M - 60, W + M + 60, H + M + 60];
    const r = rng('paint:' + seed + ':' + pal.name);

    /* ---- base: ground + washes + broad underpainting ---- */
    const [base, g] = mk();
    g.fillStyle = css(pal.paper); g.fillRect(-M, -M, W + 2 * M, H + 2 * M);
    // vertical value structure (light top or centre, weight at the bottom)
    const vg = g.createLinearGradient(0, -M, 0, H + M);
    vg.addColorStop(0, css(pal.ground[deep ? 1 : 0], 0.9)); vg.addColorStop(0.45, css(pal.ground[0], deep ? 0.25 : 0.5)); vg.addColorStop(1, css(pal.ground[deep ? 2 : 1], 0.85));
    g.fillStyle = vg; g.fillRect(-M, -M, W + 2 * M, H + 2 * M);
    // broad washes: bands across the sheet
    for (let i = 0; i < 7; i++) {
      const y = lerp(-M, H + M, (i + r.range(0.1, 0.9)) / 7);
      wash(g, { x: W * r.range(0.3, 0.7), y, rx: W * r.range(0.6, 0.85), ry: H * r.range(0.07, 0.12), rot: r.range(-0.25, 0.25), color: ramp(pal.ground, r()), alpha: 0.05, layers: 18, spread: 0.65, edge: 0.25, edgeWidth: 14, seed: seed * 100 + i, res });
    }
    // edge weight (painted vignette)
    for (const [cx, cy] of [[-0.05, -0.04], [1.05, 0.02], [-0.06, 0.6], [1.06, 0.55], [0.15, 1.05], [0.85, 1.05]]) {
      wash(g, { x: W * cx, y: H * cy, rx: W * r.range(0.32, 0.48), ry: H * r.range(0.2, 0.3), rot: r.range(0, TAU), color: pal.ground[2], alpha: 0.045 * contrast, layers: 20, spread: 0.7, edge: 0.3, edgeWidth: 16, bleed: 2, seed: seed * 200 + Math.round(cx * 10 + cy * 100), res });
    }
    // luminous glow
    if (glow) {
      wash(g, { x: glow.x, y: glow.y, rx: glow.r * 0.62, ry: glow.r * 0.78, color: pal.lights[0], alpha: 0.05 * (glow.k ?? 0.55) * (deep ? 1.4 : 1), layers: 26, spread: 0.6, bleed: 6, seed: seed * 300 + 1, res });
      const rg = g.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, glow.r);
      rg.addColorStop(0, css(pal.lights[1], 0.32 * (glow.k ?? 0.55) * (deep ? 0.75 : 1))); rg.addColorStop(1, css(pal.lights[1], 0));
      g.fillStyle = rg; g.fillRect(-M, -M, W + 2 * M, H + 2 * M);
    }
    // a few watercolour blooms away from the calm zone
    for (let i = 0; i < 5; i++) {
      let x = 0, y = 0;
      for (let k = 0; k < 20; k++) { x = r.range(0, W); y = r.range(0, H); if (calmAt(x, y) < 0.25) break; }
      bleed(g, { x, y, r: r.range(90, 190), color: deep ? r.pick(pal.lights) : r() < 0.5 ? r.pick(pal.strokes) : pal.ground[1], seed: seed * 400 + i, strength: deep ? 0.35 : 0.8, rot: r.range(0, TAU), res });
    }
    // broad underpainting strokes (cover, low contrast)
    const areaK = ((W + 2 * M) * (H + 2 * M)) / ((W0 + 72) * (H0 + 72));
    const strokeLayer = (tg, lo) => {
      const count = Math.round(lo.count * dens * areaK);
      const cell = Math.sqrt(((W + 2 * M) * (H + 2 * M)) / Math.max(1, count));
      const cells = [];
      for (let y = -M; y < H + M; y += cell) for (let x = -M; x < W + M; x += cell) cells.push([x + r() * cell, y + r() * cell]);
      for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = cells[i]; cells[i] = cells[j]; cells[j] = t; }
      const out = [];
      for (const [x, y] of cells) {
        const cm = calmAt(x, y);
        if (r() < cm * (lo.avoid ?? 1)) continue;
        if (lo.accept && r() > lo.accept(x, y)) continue;
        const len = r.range(lo.len[0], lo.len[1]) * (1 - cm * 0.35);
        const w = r.range(lo.width[0], lo.width[1]);
        const sign = r() < 0.5 ? 1 : -1;
        const pts = trace(field, x, y, { len, step: Math.max(3, w / 6), sign, bend: r.range(-0.12, 0.12), maxTurn: lo.maxTurn ?? 0.07, wander: lo.wander ?? 0.25, seed: r() * 100, bounds });
        if (pts.length < 3) continue;
        const set = lo.set ? lo.set(x, y, r) : pal.strokes;
        const c1 = colorAt(x, y, set, r);
        const c2 = mix(c1, colorAt(pts[pts.length - 1][0], pts[pts.length - 1][1], set, r), 0.6);
        const tint = lo.tint ? lo.tint(r, x, y) : 0;
        const col = tint ? shade(c1, tint * contrast) : c1;
        const S = prepStroke(pts, { width: w, color: col, color2: shade(c2, (tint || 0) * contrast * 0.7 + r.range(-0.04, 0.04)), mix: 0.7, alpha: lo.alpha * (1 - cm * 0.4), body: lo.body, dry: lo.dry, impasto: lo.impasto, jitter: lo.jitter ?? 0.07, seed: r() * 1e6 | 0, bristles: lo.bristles, brush: lo.brush ?? (r() < (lo.flatShare ?? 0.4) ? 'flat' : 'round'), colors: lo.pick ? pal.strokes : undefined });
        drawStroke(tg, S);
        out.push(S);
      }
      return out;
    };
    strokeLayer(g, { count: 150 * st.big, len: [220, 560], width: [60, 130], alpha: 0.8, body: 0.75, dry: 0.4, impasto: 0.15, avoid: 0.45, jitter: 0.06 });
    // the quiet zone is painted too: broad, pale, soft strokes
    strokeLayer(g, { count: 70 * st.big, len: [300, 640], width: [90, 160], alpha: 0.38, body: 0.6, dry: 0.5, impasto: 0.08, avoid: 0, accept: (x, y) => calmAt(x, y) / 0.75, jitter: 0.035,
      set: () => [pal.lights[2] ?? pal.lights[0], pal.ground[0], pal.lights[0]] });
    // glaze to unify
    wash(g, { x: W * 0.5, y: H * 0.5, rx: W * 0.75, ry: H * 0.6, color: pal.ground[0], alpha: deep ? 0.012 : 0.02, layers: 14, spread: 0.5, seed: seed * 500, res });
    if (pal.glaze) { g.globalAlpha = pal.glaze[1]; g.fillStyle = css(pal.glaze[0]); g.fillRect(-M, -M, W + 2 * M, H + 2 * M); g.globalAlpha = 1; }
    const gDark = shade(pal.ground[2], deep ? -0.45 : -0.3), gLight = pal.lights[1];
    applyGrain(g, { kind: o.grain ?? pal.grain, seed: seed % 5, alpha: (o.grainAlpha ?? 0.22), darkK: deep ? 0.9 : 1, lightK: deep ? 0.35 : 0.8, dark: gDark, light: gLight });

    /* ---- mid: textured strokes + fine swirl streaks ---- */
    const [mid, gm] = mk();
    const tintLD = (r2) => { const q = r2(); return q < 0.08 ? -0.1 : q < 0.3 ? 0.1 : 0; };
    strokeLayer(gm, { count: 300 * st.mid, len: [120, 380], width: [16, 42], alpha: 0.85, body: 0.6, dry: 0.5, impasto: 0.4, avoid: 1, jitter: 0.07, tint: tintLD });
    // fine streaks (the long thin swirl lines of the inspiration, softened)
    strokeLayer(gm, { count: 150 * st.fine, len: [160, 460], width: [5, 12], alpha: 0.5, body: 0.3, dry: 0.5, impasto: 0.25, avoid: 1.15, jitter: 0.06, maxTurn: 0.06,
      set: (x, y, r2) => (r2() < 0.7 ? pal.lights : pal.strokes), bristles: 4 });
    // a few darker accents, only toward the edges (depth, like the inspiration's dark streaks, but sparse)
    strokeLayer(gm, { count: 40 * st.fine * contrast, len: [140, 360], width: [6, 16], alpha: 0.42, body: 0.4, dry: 0.55, impasto: 0.2, avoid: 1.6, jitter: 0.05, maxTurn: 0.06,
      accept: (x, y) => smoothstep(0.45, 1.0, Math.hypot((x / W - 0.5) * 2 * 0.9, (y / H - 0.5) * 2)), set: () => pal.darks, bristles: 5 });
    applyGrain(gm, { kind: o.grain ?? pal.grain, seed: (seed + 2) % 5, alpha: 0.24, darkK: 1, lightK: deep ? 0.35 : 0.7, dark: gDark, light: gLight });

    /* ---- gold layer ---- */
    let gold = null;
    const gAmt = o.gold ?? (pal.name === 'ivory' ? 1 : 0.5);
    if (gAmt > 0) {
      const [gc, gg] = mk();
      const gl = o.goldLines ?? Math.round(5 * gAmt);
      for (let i = 0; i < gl; i++) {
        // QA round 1 (elegance #13): a gilded line must curve like gold leaf laid with a brush; ruler-straight traces (the
        // flow lies flat on a floor or along a veil) are re-seeded, a few tries, else dropped
        for (let tries = 0; tries < 6; tries++) {
          let x = 0, y = 0;
          for (let k = 0; k < 30; k++) { x = r.range(-M, W + M); y = r.range(-M, H + M); if (calmAt(x, y) < 0.15 && (floorY == null || y < floorY - 160)) break; }
          const pts = trace(field, x, y, { len: r.range(240, 520), step: 3, sign: r() < 0.5 ? 1 : -1, maxTurn: 0.06, bounds });
          if (pts.length <= 4) continue;
          let len = 0; for (let j = 1; j < pts.length; j++) len += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
          const chord = Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]);
          if (chord / (len || 1) > 0.965) continue;
          goldStroke(gg, pts, { width: r.range(2.2, 4.6), gold: pal.gold, seed: r() * 1e6 | 0, alpha: 0.85, taper: [0.1, 0.5] });
          break;
        }
      }
      goldFlecks(gg, { count: Math.round((o.flecks ?? 70) * gAmt), rect: [-M, -M, W + 2 * M, H + 2 * M], density: (x, y) => 0.15 + 0.85 * (1 - calmAt(x, y) / 0.7), size: [1.6, 7.5], field, gold: pal.gold, seed: seed * 17 + 3 });
      gold = gc;
    }
    return { base, mid, gold, W, H, M, res, field, palette: pal, calmAt, colorAt, seed, opts: o };
  }

  /* ------------------------------------------------------------ live strokes */
  /** liveStrokes({painting | field+palette, W, H, slots, period:[a,b], draw:[a,b], fade, width, len, alpha, seed, calm})
   *  -> {canvas, seek(t)}. A hidden painter slowly adds low-contrast strokes that later sink back into the painting.
   *  Closed form in t: slot k runs cycles of its own period; cycle c's stroke is seeded by (k, c). */
  function liveStrokes(o = {}) {
    const pt = o.painting;
    const W = o.W ?? (pt ? pt.W : W0), H = o.H ?? (pt ? pt.H : H0);
    const pal = palette(o.palette ?? (pt ? pt.palette : 'ivory'));
    const field = o.field ?? (pt ? pt.field : flow({ seed: o.seed ?? 1 }));
    const calmAt = o.calmAt ?? (pt ? pt.calmAt : () => 0);
    const colorAt = pt ? pt.colorAt : (x, y) => ramp(pal.strokes, 0.5 + 0.5 * fbm2(x / 700, y / 700, 3, 2));
    const res = o.res ?? 1;
    const cv = canvas(W * res, H * res, 'dynamic'), g = ctx2d(cv);
    const seed = o.seed ?? 11, slots = o.slots ?? 7;
    const per = o.period ?? [10, 15], dr = o.draw ?? [2.6, 4.4], fade = o.fade ?? 3.5;
    const wr = o.width ?? [14, 36], lr = o.len ?? [180, 380], alpha = o.alpha ?? 0.55;
    const sl = [];
    for (let k = 0; k < slots; k++) { const rr = rng('live:' + seed + ':' + k); sl.push({ T: rr.range(per[0], per[1]), ph: rr() }); }
    const cache = new Map();
    function strokeFor(k, c) {
      const key = k + ':' + c;
      let s = cache.get(key);
      if (s) return s;
      const rr = rng('live:' + seed + ':' + k + ':' + c);
      let x = 0, y = 0;
      for (let i = 0; i < 25; i++) { x = rr.range(-20, W + 20); y = rr.range(-20, H + 20); if (rr() > calmAt(x, y) * 1.3) break; }
      const w = rr.range(wr[0], wr[1]);
      const pts = trace(field, x, y, { len: rr.range(lr[0], lr[1]), step: Math.max(3, w / 6), sign: rr() < 0.5 ? 1 : -1, bend: rr.range(-0.1, 0.1), maxTurn: 0.07, wander: 0.2, seed: rr() * 100 });
      const q = rr();
      let col = colorAt(x, y, pal.strokes, rr);
      col = q < 0.45 ? shade(col, 0.18) : q < 0.6 ? shade(col, -0.12) : col;
      s = { id: key, S: prepStroke(pts, { width: w, color: col, color2: shade(col, rr.range(-0.08, 0.1)), alpha, body: 0.4, dry: 0.5, impasto: 0.45, seed: rr() * 1e6 | 0 }), D: rr.range(dr[0], dr[1]) };
      if (cache.size > 64) cache.delete(cache.keys().next().value);
      cache.set(key, s);
      return s;
    }
    let lastKey = null;
    return {
      canvas: cv,
      seek(t, gain = 1) {
        const parts = [];
        for (let k = 0; k < slots; k++) {
          const { T, ph } = sl[k];
          const tt = t + ph * T;
          const c = Math.floor(tt / T), lt = tt - c * T;
          const s = strokeFor(k, c);
          const u = E.ease.inOutSine(clamp(lt / s.D));
          const a = (1 - smoothstep(T - fade, T, lt)) * gain;
          if (a > 0.004 && u > 0) parts.push([s, u, a]);
        }
        const key = parts.map((p) => p[0].id + ':' + p[1] + ':' + p[2]).join();
        if (key === lastKey) return; lastKey = key;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
        g.setTransform(res, 0, 0, res, 0, 0);
        for (const [s, u, a] of parts) drawStroke(g, s.S, u, a);
      },
    };
  }

  /* --------------------------------------------------------------- light, glow */
  /** lightSweep(parent, {angle, period, dur, delay, width, color, alpha, blend}) -> {el, seek(t), bandAt(t)} — a soft band of light */
  function lightSweep(parent, o = {}) {
    const ang = o.angle ?? 62, bw = o.width ?? 520;
    const period = o.period ?? 9, dur = o.dur ?? 3.2, delay = o.delay ?? 1.5;
    const col = o.color ?? '#fff3d6', a = o.alpha ?? 0.5;
    const span = Math.abs(W0 * Math.cos((ang * Math.PI) / 180)) + Math.abs(H0 * Math.sin((ang * Math.PI) / 180)) + 440;
    // a small static canvas texture (the compositor only resamples it; a CSS gradient layer would be re-rasterised at a
    // scale that depends on seek history)
    const el = canvas(64, Math.max(8, Math.round(bw / 2)), 'static');
    { const g = ctx2d(el), gr = g.createLinearGradient(0, 0, 0, el.height); gr.addColorStop(0, css(col, 0)); gr.addColorStop(0.38, css(col, a * 0.3)); gr.addColorStop(0.5, css(col, a)); gr.addColorStop(0.62, css(col, a * 0.3)); gr.addColorStop(1, css(col, 0)); g.fillStyle = gr; g.fillRect(0, 0, el.width, el.height); }
    el.className = 'p-sweep';
    Object.assign(el.style, { position: 'absolute', left: '50%', top: '50%', width: '3200px', height: bw * 2 + 'px', marginLeft: '-1600px', marginTop: -bw + 'px', pointerEvents: 'none', mixBlendMode: o.blend ?? 'soft-light', willChange: 'transform, opacity', opacity: '0' });
    parent.append(el);
    const bandAt = (t) => { const ph = (((t - delay) % period) + period) % period; if (t < delay || ph > dur) return null; return -span / 2 + span * E.ease.inOutSine(ph / dur); };
    return {
      el, bandAt,
      seek(t) {
        const d = bandAt(t);
        if (d == null) { el.style.opacity = '0'; return; }
        const ph = (((t - delay) % period) + period) % period / dur;
        el.style.opacity = String(+(Math.sin(ph * Math.PI)).toFixed(4));
        // the band's long axis is perpendicular to the sweep direction (angle)
        el.style.transform = `rotate(${ang - 90}deg) translate3d(0, ${(-d).toFixed(2)}px, 0)`;
      },
    };
  }
  /** glow(parent, {x, y, r, color, alpha, blend, period, amp}) -> {el, seek(t)} — a breathing pool of light */
  function glowPool(parent, o = {}) {
    const r = o.r ?? 520, col = o.color ?? '#fff1d2', a = o.alpha ?? 0.4;
    const el = canvas(256, 256, 'static');
    { const g = ctx2d(el), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, css(col, a)); gr.addColorStop(0.38, css(col, a * 0.45)); gr.addColorStop(0.7, css(col, 0)); gr.addColorStop(1, css(col, 0)); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
    el.className = 'p-glow';
    Object.assign(el.style, { position: 'absolute', left: (o.x ?? W0 / 2) - r + 'px', top: (o.y ?? H0 * 0.42) - r + 'px', width: r * 2 + 'px', height: r * 2 + 'px', pointerEvents: 'none', mixBlendMode: o.blend ?? 'soft-light', willChange: 'opacity, transform' });
    parent.append(el);
    const per = o.period ?? 7.5, amp = o.amp ?? 0.18;
    return { el, seek(t) { const b = 1 - amp * 0.5 + amp * 0.5 * Math.cos((t / per) * TAU); el.style.opacity = String(+b.toFixed(4)); el.style.transform = `scale(${+(1 + 0.015 * Math.sin((t / (per * 1.3)) * TAU)).toFixed(5)})`; } };
  }

  /* ---------------------------------------------------------------- backdrop */
  /** backdrop(parent, opts) -> living painted canvas: {el, painting, layers, seek(t), snapshot(), drawTo(g, t)}
   *  opts = paint() opts + motion (0..1+, default 1), live ({slots,...} or false), sweep ({angle, period, dur, delay,
   *  alpha} or false), shimmer (true), glowPulse ({...} or false), liveIn (s, fade-in of live strokes from t=0).
   *  At t = 0 every layer is at rest, so snapshot() == frame 0 (paint-reveal hands over without a pop). */
  function backdrop(parent, o = {}) {
    const pt = o.painting || paint(o);
    const { W, H, M, res } = pt;
    const el = E.h('div', { class: 'p-backdrop', style: { position: 'absolute', left: '0', top: '0', width: W + 'px', height: H + 'px', overflow: 'hidden' } });
    const place = (c, m) => { Object.assign(c.style, { position: 'absolute', left: -m + 'px', top: -m + 'px', width: (W + 2 * m) + 'px', height: (H + 2 * m) + 'px', willChange: 'transform' }); el.append(c); return c; };
    place(pt.base, M); place(pt.mid, M);
    const motion = o.motion ?? 1;
    const live = o.live === false ? null : liveStrokes(Object.assign({ painting: pt, seed: pt.seed * 3 + 1, res }, o.live || {}));
    if (live) { Object.assign(live.canvas.style, { position: 'absolute', left: '0', top: '0', width: W + 'px', height: H + 'px' }); el.append(live.canvas); }
    const deepP = pt.palette.mood === 'deep';
    // light palettes: screen with a neutral warm white (soft-light would push cream toward yellow-green)
    const sweepO = o.sweep === false ? null : Object.assign(deepP ? { color: '#ffd9a8', alpha: 0.42, blend: 'soft-light' } : { color: '#fffaf3', alpha: 0.2, blend: 'screen' }, o.sweep || {});
    let shimmer = null;
    if (pt.gold) {
      if (o.shimmer !== false && sweepO) {
        shimmer = goldShimmer(pt.gold, { angle: sweepO.angle, period: sweepO.period, dur: sweepO.dur, delay: sweepO.delay, left: -M, top: -M, scale: 1 / res, glint: pt.palette.gold[3], width: 200 });
        place(shimmer.canvas, M);
      } else place(pt.gold, M);
    }
    const glow = o.glowPulse === false ? null : glowPool(el, Object.assign({ x: o.glow && o.glow.x != null ? o.glow.x : W / 2, y: o.glow && o.glow.y != null ? o.glow.y : H * 0.42, r: o.glow && o.glow.r ? o.glow.r * 0.9 : H * 0.42 }, deepP ? { color: pt.palette.lights[1], alpha: 0.3, blend: 'soft-light' } : { color: '#fffaf3', alpha: 0.16, blend: 'screen' }, o.glowPulse || {}));
    const sweep = sweepO ? lightSweep(el, sweepO) : null;
    if (parent) parent.append(el);
    const liveIn = o.liveIn ?? 2.5;
    const goldLayer = shimmer ? shimmer.canvas : pt.gold;
    function tf(t) {
      const m = motion;
      return {
        base: { x: m * 3.2 * Math.sin((t / 17) * TAU), y: m * 2.6 * Math.sin((t / 13) * TAU), s: 1 + m * 0.0022 * Math.sin((t / 11) * TAU), r: m * 0.035 * Math.sin((t / 19) * TAU) },
        mid: { x: m * 7.5 * Math.sin((t / 14.5) * TAU), y: m * 5.5 * Math.sin((t / 16.5) * TAU), s: 1 + m * 0.0042 * Math.sin((t / 12.2) * TAU), r: m * 0.06 * Math.sin((t / 21) * TAU) },
      };
    }
    const tfs = (q) => `translate3d(${q.x.toFixed(3)}px,${q.y.toFixed(3)}px,0) rotate(${q.r.toFixed(4)}deg) scale(${q.s.toFixed(5)})`;
    let snap = null;
    const api = {
      el, painting: pt, live, sweep, shimmer, glow,
      layers: { base: pt.base, mid: pt.mid, gold: goldLayer, live: live && live.canvas },
      seek(t) {
        const q = tf(t);
        pt.base.style.transform = tfs(q.base);
        pt.mid.style.transform = tfs(q.mid);
        if (goldLayer) goldLayer.style.transform = tfs(q.mid);
        if (live) live.seek(t, smoothstep(0, liveIn, t));
        if (shimmer) shimmer.seek(t);
        if (sweep) sweep.seek(t);
        if (glow) glow.seek(t);
      },
      /** the rest frame (t = 0) as one W x H canvas (device px = W*res): base + mid + gold */
      snapshot() {
        if (snap) return snap;
        snap = canvas(W * res, H * res, 'static'); const g = ctx2d(snap);
        for (const c of [pt.base, pt.mid, pt.gold]) if (c) g.drawImage(c, M * res, M * res, W * res, H * res, 0, 0, W * res, H * res);
        return snap;
      },
    };
    return api;
  }

  /* -------------------------------------------------------------- paint-reveal */
  /** paintReveal(parent, {to, style:'sweep'|'diagonal'|'swirl'|'dabs'|'rise'|'bloom', seed, W, H, width, count, cx, cy,
   *  tilt, flood, fit, feather}) -> {canvas, seek(p), pFull}. Broad bristle strokes paint `to` (a canvas / image / backdrop /
   *  fn(g)) in over whatever is below. p in [0,1] (ease it yourself); hidden at p<=0 and p>=1. Put it on top of the
   *  outgoing scene, and show the incoming scene underneath from p = 1 (its first frame equals the target).
   *  fit (default true, QA round 1): the stroke schedule is measured once (CPU, low res) for the progress at which the
   *  strokes alone cover the frame, and seek(p) is remapped so coverage completes exactly at p = 1: the brush moves on the
   *  last beat, nothing freezes, and the full-target flood only closes pinholes over the last 10% (never a see-through
   *  double exposure). style 'bloom': a soft, organic light that grows out of (cx, cy), area-linear, feathered (no
   *  bristle heads, no rings): for a dark-to-light change that must not flash. */
  function paintReveal(parent, o = {}) {
    const W = o.W ?? W0, H = o.H ?? H0, res = o.res ?? 1;
    const cv = canvas(W * res, H * res, 'dynamic'), g = ctx2d(cv);
    Object.assign(cv.style, { position: 'absolute', left: '0', top: '0', width: W + 'px', height: H + 'px', pointerEvents: 'none', display: 'none' });
    if (parent) parent.append(cv);
    const r = rng('reveal:' + (o.seed ?? 1));
    const style = o.style ?? 'sweep';
    const strokes = [];
    const add = (pts, w, t0, t1) => strokes.push({ S: prepStroke(pts, { width: w, color: '#ffffff', body: 0.95, bodyW: 0.62, bristles: clamp(Math.round(w / 4.5), 12, 48), dry: 0.55, impasto: 0, jitter: 0, wobble: 0.22, rag: 0.28, splay: 0.12, taper: [0.06, 0.22], lead: 0.6, seed: r() * 1e6 | 0, step: 6, chunk: 22 }), t0, t1 });
    const wv = o.width ?? 230;
    const ff = flow({ seed: (o.seed ?? 1) + 5, scale: 900, swirl: 0.25, drift: [1, 0] });
    const cx = o.cx ?? W / 2, cy = o.cy ?? H * 0.45;
    if (style === 'sweep' || style === 'rise' || style === 'diagonal') {
      const rows = Math.ceil((H + 200) / (wv * 0.62));
      const tiltD = o.tilt ?? 0.32;
      for (let i = 0; i < rows; i++) {
        const k = style === 'rise' ? rows - 1 - i : i;
        const y = -60 + k * (wv * 0.62) + r.range(-18, 18);
        const ltr = i % 2 === 0;
        const x0 = ltr ? -wv * 0.8 : W + wv * 0.8;
        const tilt = style === 'diagonal' ? tiltD : r.range(-0.06, 0.06);
        const pts = [];
        const amp = r.range(30, 60), ph = r() * TAU; for (let s = 0; s <= W + wv * 1.6; s += 8) { const x = ltr ? x0 + s : x0 - s; const yy = y + (x - W / 2) * tilt + 40 * ff.vel(x, y)[1] + amp * Math.sin(s / r.range(300, 420) + ph); pts.push([x, yy]); }
        // o.jitter (QA r1 C2): a wider per-row timing scatter, so the leading edge is a ragged run of brush lobes instead of
        // one straight diagonal (default 0.02, the rows' own small scatter)
        const jt = o.jitter ?? 0.02;
        const t0 = (i / rows) * 0.72 + r.range(-jt, jt), t1 = t0 + 0.3;
        add(pts, wv * r.range(0.95, 1.15), t0, t1);
      }
    } else if (style === 'swirl') {
      // broad strokes riding a loose vortex, painted from the centre outward
      const vf = flow({ seed: (o.seed ?? 1) + 3, scale: 900, swirl: 0.2, drift: [0, 0], vortices: [{ x: cx, y: cy, r: Math.max(W, H) * 0.9, s: 3 }] });
      const maxR = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + wv * 0.4;
      const list = [];
      for (let rad = wv * 0.25; rad < maxR; rad += wv * 0.5) {
        const n = Math.max(2, Math.round((TAU * rad) / 430));
        const a0 = r() * TAU;
        for (let k = 0; k < n; k++) { const a = a0 + (k / n) * TAU; list.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, rad]); }
      }
      { const pts = []; for (let q = 0; q <= 40; q++) { const a = (q / 40) * TAU * 1.1; const rr = wv * (0.12 + 0.25 * q / 40); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } add(pts, wv * 0.9, 0, 0.16); }
      list.forEach(([x, y, rad], j) => {
        const pts = trace(vf, x, y, { len: Math.min(820, 300 + rad * 0.9), step: 8, sign: 1, maxTurn: 0.08, orient: false });
        // drift slightly outward so successive rings overlap
        const t0 = (j / list.length) * 0.74, t1 = t0 + 0.2;
        add(pts.map(([px, py], q) => { const dx = px - cx, dy = py - cy, m = Math.hypot(dx, dy) || 1; return [px + (dx / m) * q * 0.9, py + (dy / m) * q * 0.9]; }), wv * r.range(1.05, 1.3), t0, t1);
      });
      // a last pass along the four frame edges (overscanned 60 px): the corners the rings never reach are brushed,
      // not flooded (QA round 1: slivers of the outgoing scene at the frame edges vanished in one frame)
      const ew = wv * 0.9, ov = 60;
      const E4 = [[[-ov, ew * 0.3 - ov], [W + ov, ew * 0.3 - ov]], [[W + ov, H - ew * 0.3 + ov], [-ov, H - ew * 0.3 + ov]], [[ew * 0.3 - ov, H + ov], [ew * 0.3 - ov, -ov]], [[W - ew * 0.3 + ov, -ov], [W - ew * 0.3 + ov, H + ov]]];
      E4.forEach(([a, b], j) => { const pts = []; for (let q = 0; q <= 60; q++) { const u = q / 60; pts.push([lerp(a[0], b[0], u) + 18 * Math.sin(u * 7 + j), lerp(a[1], b[1], u) + 18 * Math.cos(u * 6 + j)]); } add(pts, ew, 0.7 + 0.04 * j, 0.92 + 0.02 * j); });
    } else if (style === 'dabs') {
      const n = o.count ?? 90;
      const cells = [];
      const cs = Math.sqrt((W * H) / n);
      for (let y = -cs / 2; y < H + cs / 2; y += cs) for (let x = -cs / 2; x < W + cs / 2; x += cs) cells.push([x + r() * cs, y + r() * cs]);
      for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = cells[i]; cells[i] = cells[j]; cells[j] = t; }
      const f2 = flow({ seed: (o.seed ?? 1) + 9, scale: 600, swirl: 0.9, drift: [0.4, -0.2] });
      cells.forEach(([x, y], j) => { const pts = trace(f2, x, y, { len: r.range(180, 300), step: 8, sign: r() < 0.5 ? 1 : -1 }); const t0 = (j / cells.length) * 0.75; add(pts, wv * r.range(0.6, 0.85), t0, t0 + 0.14); });
    }
    const bloom = style === 'bloom';
    const fit = !bloom && o.fit !== false;
    const flood0 = o.flood ?? (style === 'swirl' || style === 'dabs' ? [0.62, 0.98] : [0.82, 1]);
    // coverage of the strokes alone at raw progress p, on a small CPU canvas (deterministic, measured once)
    let pFull = 1;
    if (fit && strokes.length) {
      const k = 0.5, mw = Math.ceil(W * k), mh = Math.ceil(H * k);   // at 0.2 thin bristles under-count and the frame froze
      const mc = canvas(mw, mh, true), mg = ctx2d(mc);
      const cover = (p) => {
        mg.setTransform(1, 0, 0, 1, 0, 0); mg.globalAlpha = 1; mg.globalCompositeOperation = 'source-over'; mg.clearRect(0, 0, mw, mh);
        mg.setTransform(k, 0, 0, k, 0, 0);
        for (const s of strokes) { const u = (p - s.t0) / (s.t1 - s.t0); if (u <= 0) continue; drawStroke(mg, s.S, E.ease.inOutSine(clamp(u)), 1); }
        const d = mg.getImageData(0, 0, mw, mh).data; let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] >= 200) n++;
        return n / (mw * mh);
      };
      // the frame is visually done when the strokes cover 99.5% (or 99% of what they ever cover, for a style that leaves
      // corners to the flood)
      const goal = Math.min(o.cover ?? 0.995, cover(1) * 0.99);
      let lo = 0.2, hi = 1;
      for (let it = 0; it < 10; it++) { const m = (lo + hi) / 2; if (cover(m) >= goal) hi = m; else lo = m; }
      pFull = hi;
      free(mc);
    }
    // bloom: a feathered, organic disc of the target, drawn small (with a blur margin, so the frame edges stay opaque) and
    // blurred, then scaled up as the mask. Its radius follows the inverse of the frame-coverage curve, so the covered share
    // of the frame (and so the brightening) grows evenly over the whole reveal, not in the first half.
    const bk = 0.25, bw = Math.ceil(W * bk), bh = Math.ceil(H * bk);
    const feather = o.feather ?? 240, sig = feather * bk * 0.42, pad = Math.ceil(sig * 3);
    const bA = bloom ? canvas(bw + 2 * pad, bh + 2 * pad, 'dynamic') : null, bB = bloom ? canvas(bw + 2 * pad, bh + 2 * pad, 'dynamic') : null;
    // QA r2 2026-11-02 (elegance R2E-4): the soft edge of the bloom read as an airbrushed cloud (a 126 px Gaussian rim with
    // only faint bristles). Its transition band is now broken by fixed radial dry-brush streaks (per pixel, on a small CPU
    // mask bC): alpha m -> m (1 - STREAK s 4m(1 - m)), s in [0, 1] a field of dabs elongated along the rays from the lamp.
    // It only acts inside the band (0 < m < 1) and stays monotone in m (STREAK < 0.75), so each pixel still brightens once,
    // at the same mean rate (no flicker, no extra "big" change); the streaks ride out with the edge like paint dragged out.
    const STREAK = bloom ? (o.streak ?? 0.42) : 0;
    const bC = bloom && STREAK > 0 ? canvas(bw + 2 * pad, bh + 2 * pad, true) : null;
    let streakF = null;
    if (bC) {
      const w2 = bC.width, h2 = bC.height, ox = cx * bk + pad, oy = cy * bk + pad, sd = (o.seed ?? 1) * 13 + 5;
      streakF = new Float32Array(w2 * h2);
      for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
        const dx = x - ox, dy = y - oy, rr = Math.hypot(dx, dy) / bk, q = rr > 1e-6 ? 1 / (Math.hypot(dx, dy)) : 0;
        // noise on the circle of directions (no seam), K ~ 70 streaks around the lamp; the radius only nudges it, so each
        // streak is long along its ray, thin across it, and wavers a little along its length
        const ca = dx * q, sa = dy * q, K = 70 / TAU;
        // (dabs ~150 px long along the ray, so it reads as dry brush and never as continuous rays of light)
        const v = 0.5 + 0.5 * (0.7 * noise2(ca * K + rr / 150, sa * K - rr / 170, sd + 1) + 0.3 * noise2(ca * K * 2.7 + rr / 70, sa * K * 2.7 + rr / 90, sd + 2));
        streakF[y * w2 + x] = smoothstep(0.3, 0.72, v);
      }
    }
    const bAmp = 0.11, bSeed = (o.seed ?? 1) * 7 + 3;
    // QA r1 2026-11-02 (motion #2, elegance C12): the bloom is an irregular light, not a round spotlight. Its outline is
    // stretched upward (UP: up to +25% reach toward the top, so the top edge, the farthest from the lamp, is reached by
    // q ~ 0.85 instead of lifting off like a blind in the last 0.3 s) and slightly wider than tall below; the edge carries
    // dry-brush bristles (radial streaks out and pits in, drawn on the soft mask); the growth eases out (its rate falls to
    // half at the end), a 20% global lift spreads the brightening over the whole frame from the start, and the final flood
    // runs over the last 30% of the reveal (about 11 frames, was 2) below 25 levels a frame, so the last of the old canvas is
    // never a band lit all at once and nothing stops dead
    const UP = bloom ? (o.up ?? 0.3) : 0;
    // the bloom's own growth completes at BLOOM_END of the reveal; BLOOM_LIFT is the share of the global lift
    const BLOOM_END = 1, BLOOM_LIFT = 0.15;
    const shapeK = (c, s2) => 1 + UP * Math.max(0, -s2) * (0.6 + 0.4 * Math.abs(-s2)) + 0.06 * c * c;
    const corner = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
    const Rend = (corner + feather * 1.25) / (1 - bAmp * 1.2) + 20;
    let covR = null;
    if (bloom) {
      // mean mask coverage of the frame for a soft disc of radius R (Gaussian edge of the blur, coarse pixel grid), then the
      // radius at which each coverage is reached: the frame brightens at the rate of e, not faster at the end or the start
      const ds = []; for (let y = 10; y < H; y += 20) for (let x = 10; x < W; x += 20) { const d = Math.hypot(x - cx, y - cy) || 1; ds.push(d / shapeK((x - cx) / d, (y - cy) / d)); }
      const sF = sig / bk, Rs = [], Cs = [];
      for (let i = 0; i <= 320; i++) {
        const R = -3 * sF + ((Rend + 3 * sF) * i) / 320; let c = 0;
        for (const d of ds) c += 1 / (1 + Math.exp((-1.702 * (R - d)) / sF));
        Rs.push(R); Cs.push(c / ds.length);
      }
      const c0 = Cs[0], c1 = Cs[Cs.length - 1];
      covR = (e) => {
        const c = c0 + (c1 - c0) * clamp(e);
        let lo = 0, hi = Cs.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (Cs[m] < c) lo = m; else hi = m; }
        const f = (c - Cs[lo]) / ((Cs[hi] - Cs[lo]) || 1);
        return Rs[lo] + (Rs[hi] - Rs[lo]) * clamp(f);
      };
    }
    function bloomMask(p) {
      const ga = ctx2d(bA), gb = ctx2d(bB);
      ga.setTransform(1, 0, 0, 1, 0, 0); ga.clearRect(0, 0, bA.width, bA.height);
      ga.setTransform(bk, 0, 0, bk, pad, pad);
      // mostly linear, eased at the ends: the brightening rate stays near its mean (no flash) and falls toward 0 at the end
      const pe = clamp(p / BLOOM_END);
      // QA r2 2026-11-02 (motion #2): the onset was the fastest moment of the bloom (a cream cloud ~180 px wide on frame 1,
      // "big" 8,357 -> 12,899 -> 13,522): the ease-out started at 1.4x its mean rate and the area-linear radius grows as
      // sqrt(coverage), fastest at 0. Now the progress eases in quadratically over the first ONSET (coverage ~ p^2, so the
      // radius grows about linearly from 0, ~35 px a frame) and then runs on at the same rate (C1 continuous), ease-out kept.
      const ONSET = 0.3, pg = (pe < ONSET ? (pe * pe) / (2 * ONSET) : pe - ONSET / 2) / (1 - ONSET / 2);
      const e = 0.6 * pg + 0.4 * (1 - (1 - pg) * (1 - pg));   // eases out: the rate falls to 0.6x of its mean at the end
      // the soft edge needs ~feather past the coverage radius; the last few % ramp the radius out to Rend. QA r2: the
      // radius is clamped at 0 (the coverage tail of the soft edge gave a negative R for small e, and a negative radius drew a
      // mirrored disc of |R|, ~180 px, on the first frame)
      const R = Math.max(0, covR(e));
      if (R <= 0) { gb.setTransform(1, 0, 0, 1, 0, 0); gb.clearRect(0, 0, bB.width, bB.height); return bB; }
      ga.fillStyle = '#fff'; ga.beginPath();
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * TAU, c = Math.cos(a), s2 = Math.sin(a);
        const n = 0.65 * fbm2(c * 1.1 + 4, s2 * 1.1 + 4 + p * 0.5, bSeed, 3) + 0.35 * fbm2(c * 2.6 + 9, s2 * 2.6 + 9 - p * 0.4, bSeed + 1, 2);
        const rr = R * shapeK(c, s2) * (1 + bAmp * n);
        if (i === 0) ga.moveTo(cx + c * rr, cy + s2 * rr); else ga.lineTo(cx + c * rr, cy + s2 * rr);
      }
      ga.fill();
      gb.setTransform(1, 0, 0, 1, 0, 0); gb.clearRect(0, 0, bB.width, bB.height);
      gb.filter = `blur(${sig.toFixed(2)}px)`; gb.drawImage(bA, 0, 0); gb.filter = 'none';
      // bristles on the soft edge: radial streaks reaching out (lighter) and pits biting in (destination-out), fixed per angle
      // so the texture rides out with the edge; lightly blurred, so they read as dry brush, not as rays
      if (R > 0) {
        const br = rng('bloom-bristle:' + bSeed);
        ga.setTransform(1, 0, 0, 1, 0, 0); ga.clearRect(0, 0, bA.width, bA.height); ga.setTransform(bk, 0, 0, bk, pad, pad);
        ga.lineCap = 'round';
        const NB = 150, cut = [];
        for (let i = 0; i < NB; i++) {
          const a = ((i + br.range(-0.4, 0.4)) / NB) * TAU, c = Math.cos(a), s2 = Math.sin(a);
          const n = 0.65 * fbm2(c * 1.1 + 4, s2 * 1.1 + 4 + p * 0.5, bSeed, 3) + 0.35 * fbm2(c * 2.6 + 9, s2 * 2.6 + 9 - p * 0.4, bSeed + 1, 2);
          const r0 = R * shapeK(c, s2) * (1 + bAmp * n), len = br.range(0.05, 0.17), w = br.range(10, 26), al = br.range(0.25, 0.6);
          if (br() < 0.55) {
            ga.strokeStyle = `rgba(255,255,255,${al.toFixed(3)})`; ga.lineWidth = w;
            ga.beginPath(); ga.moveTo(cx + c * r0 * 0.92, cy + s2 * r0 * 0.92); ga.lineTo(cx + c * r0 * (1 + len), cy + s2 * r0 * (1 + len)); ga.stroke();
          } else cut.push([c, s2, r0, len, w, al]);
        }
        gb.filter = `blur(${(sig * 0.22).toFixed(2)}px)`; gb.drawImage(bA, 0, 0);
        ga.setTransform(1, 0, 0, 1, 0, 0); ga.clearRect(0, 0, bA.width, bA.height); ga.setTransform(bk, 0, 0, bk, pad, pad);
        for (const [c, s2, r0, len, w, al] of cut) {
          ga.strokeStyle = `rgba(0,0,0,${al.toFixed(3)})`; ga.lineWidth = w;
          ga.beginPath(); ga.moveTo(cx + c * r0 * (1 - len), cy + s2 * r0 * (1 - len)); ga.lineTo(cx + c * r0 * 1.06, cy + s2 * r0 * 1.06); ga.stroke();
        }
        gb.globalCompositeOperation = 'destination-out'; gb.drawImage(bA, 0, 0); gb.globalCompositeOperation = 'source-over';
        gb.filter = 'none';
      }
      if (!bC) return bB;
      const gc = ctx2d(bC);
      gc.setTransform(1, 0, 0, 1, 0, 0); gc.clearRect(0, 0, bC.width, bC.height); gc.drawImage(bB, 0, 0);
      const id = gc.getImageData(0, 0, bC.width, bC.height), d = id.data;
      for (let i = 0, j = 3; i < streakF.length; i++, j += 4) {
        const m = d[j] / 255;
        if (m <= 0.004 || m >= 0.996) continue;
        d[j] = Math.round(255 * m * (1 - STREAK * streakF[i] * 4 * m * (1 - m)));
      }
      gc.putImageData(id, 0, 0);
      return bC;
    }
    let target = null;
    const getTarget = () => {
      if (target) return target;
      const t = o.to;
      if (t && t.snapshot) target = t.snapshot();
      else if (typeof t === 'function') { target = canvas(W * res, H * res, 'static'); const tg = ctx2d(target); tg.setTransform(res, 0, 0, res, 0, 0); t(tg); }
      else target = t;
      return target;
    };
    // o.lead = { color, ahead, colors?, density? } (QA r1 2026-11-02, elegance C2): a dark underpainting runs `ahead` (share
    // of the stroke schedule) in front of the target strokes, so the outgoing canvas first meets a low-chroma dark wash of
    // the incoming palette, not the full-chroma target (vermilion and teal no longer touch at full strength). Not with bloom.
    // QA r2 2026-11-02 (elegance R2E-2, motion #1): the lead was the target strokes themselves filled flat with one near-black
    // (no bristle texture, the darkest slab of the film, rows stacked as parallel stairs), and it started 16% ahead, so its
    // whole first 16% was drawn on the first frame (a 380 x 330 px slab cut in, d 0.72 -> 4.45). Now:
    //  - its own strokes, one per target row and on the same schedule, each turned up to +-2.5 deg about its start and up to
    //    12% wider (the rows no longer stack as parallel stairs), painted as the teal is (a bristle body, dry tips, a ragged
    //    centre-led head) in three close teal-umber shades at `density` (0.82), pitted with the paper tooth;
    //  - the lead offset grows from 0 over the first quarter of the reveal (inOutSine), so frame 1 shows no more lead
    //    than target and the dark lobes open their lead while the brush is already moving.
    const lead = !bloom && o.lead ? o.lead : null;
    const lc = lead ? canvas(W * res, H * res, 'dynamic') : null;
    const leadStrokes = [];
    if (lead) {
      const lr = rng('reveal-lead:' + (o.seed ?? 1));
      const base = toRGB(lead.color);
      const cols = (lead.colors || [shade(base, 0.07), shade(base, -0.08), mix(base, toRGB('#4a4a3c'), 0.25)]).map((c) => css(typeof c === 'string' ? toRGB(c) : c));
      for (const s of strokes) {
        const S0 = s.S, n = S0.n;
        if (n < 2) continue;
        const ax = S0.px[0], ay = S0.py[0], th = lr.range(-1, 1) * (2.5 * Math.PI) / 180, cs = Math.cos(th), sn = Math.sin(th);
        const pts = [];
        for (let i = 0; i < n; i += 2) { const dx = S0.px[i] - ax, dy = S0.py[i] - ay; pts.push([ax + dx * cs - dy * sn, ay + dx * sn + dy * cs]); }
        leadStrokes.push({ S: prepStroke(pts, { width: S0.W * lr.range(0.96, 1.12), color: css(base), colors: cols, body: 0.8, bodyW: 0.6, bristles: clamp(Math.round(S0.W / 6), 20, 40), dry: 0.5, impasto: 0.12, jitter: 0.035, wobble: 0.3, rag: 0.42, splay: 0.16, taper: [0.06, 0.22], lead: 0.8, seed: lr() * 1e6 | 0, step: 6, chunk: 22 }), t0: s.t0, t1: s.t1 });
      }
    }
    let last = null;
    return {
      canvas: cv, strokes, pFull, style,
      seek(q) {
        if (q <= 0 || q >= 1) { if (cv.style.display !== 'none') cv.style.display = 'none'; last = null; return; }
        if (cv.style.display === 'none') cv.style.display = '';
        const key = q;
        if (key === last) return; last = key;
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        g.clearRect(0, 0, cv.width, cv.height);
        let fl;
        if (bloom) {
          g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
          g.drawImage(bloomMask(q), pad, pad, bw, bh, 0, 0, cv.width, cv.height);
          // a gentle global lift under the bloom (the dawn light reaches the far edges a little from the start, so the last
          // band is never lit all at once) plus a soft final flood for the corner leftovers
          const fa = BLOOM_LIFT * smoothstep(0.05, BLOOM_END, q), fb = smoothstep(0.7, 1, q);
          fl = 1 - (1 - fa) * (1 - fb);
        } else {
          const p = fit ? q * pFull : q;
          g.setTransform(res, 0, 0, res, 0, 0);
          for (const s of strokes) { const u = (p - s.t0) / (s.t1 - s.t0); if (u <= 0) continue; drawStroke(g, s.S, E.ease.inOutSine(clamp(u)), 1); }
          fl = fit ? smoothstep(0.9, 1, q) : smoothstep(flood0[0], flood0[1], q);
          g.setTransform(1, 0, 0, 1, 0, 0);
          if (lead) {
            // the underpainting: its own dry strokes `ahead` further on the same schedule (the lead grows from 0 over the
            // first quarter), in the lead shades at `density`, pitted with the paper tooth; the final target flood covers it
            const ah = (lead.ahead ?? 0.2) * E.ease.inOutSine(clamp(q / 0.25));
            const lg = ctx2d(lc), pl = p + ah * (fit ? pFull : 1);
            lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = 1; lg.clearRect(0, 0, lc.width, lc.height);
            lg.setTransform(res, 0, 0, res, 0, 0);
            for (const s of leadStrokes) { const u = (pl - s.t0) / (s.t1 - s.t0); if (u <= 0) continue; drawStroke(lg, s.S, E.ease.inOutSine(clamp(u)), lead.density ?? 0.82); }
            lg.setTransform(1, 0, 0, 1, 0, 0);
            const tooth = grain('paper', (o.seed ?? 1) % 7 + 1).dark;
            lg.globalCompositeOperation = 'destination-out'; lg.globalAlpha = lead.tooth ?? 0.55; lg.fillStyle = lg.createPattern(tooth, 'repeat'); lg.fillRect(0, 0, lc.width, lc.height);
            lg.globalAlpha = 1; lg.globalCompositeOperation = 'source-over';
          }
        }
        if (fl > 0) { g.globalAlpha = fl; g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.globalAlpha = 1; }
        g.globalCompositeOperation = 'source-in';
        const tg = getTarget();
        if (tg) g.drawImage(tg, 0, 0, cv.width, cv.height);
        g.globalCompositeOperation = 'source-over';
        if (lead) { g.globalCompositeOperation = 'destination-over'; g.drawImage(lc, 0, 0); g.globalCompositeOperation = 'source-over'; }   // under the target; the final flood covers it
      },
    };
  }

  /* ------------------------------------------------------------- brush paths */
  let measureSvg = null;
  /** pathPoints(d, step=3) -> [[ [x,y],... ], ...] sub-paths sampled from SVG path data (split at jumps) */
  function pathPoints(d, step = 3) {
    if (!measureSvg) { measureSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); measureSvg.setAttribute('style', 'position:absolute;width:0;height:0;visibility:hidden'); document.body.append(measureSvg); }
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); measureSvg.append(p);
    const L = p.getTotalLength(); const out = []; let cur = [], prev = null;
    for (let s = 0; s <= L + 1e-6; s += step) {
      const q = p.getPointAtLength(Math.min(s, L));
      if (prev && Math.hypot(q.x - prev[0], q.y - prev[1]) > step * 2.5) { if (cur.length > 1) out.push(cur); cur = []; }
      prev = [q.x, q.y]; cur.push(prev);
    }
    if (cur.length > 1) out.push(cur);
    p.remove();
    return out;
  }
  /** brushPath(parent, paths, {rect:[x,y,w,h] canvas placement, transform:[a,b,c,d,e,f] path->rect coords, width, color,
   *  colors, gold (true -> gilded), dry, impasto, alpha, seed, order:'seq'|'together', overlap, res}) -> {canvas, seek(p)}
   *  Paints SVG path data (or point arrays) as brush line work (alpana / aripan / flourishes) with a draw-on. */
  function brushPath(parent, paths, o = {}) {
    const [rx, ry, rw, rh] = o.rect ?? [0, 0, W0, H0];
    const res = o.res ?? 1;
    const cv = canvas(rw * res, rh * res, 'dynamic'), g = ctx2d(cv);
    Object.assign(cv.style, { position: 'absolute', left: rx + 'px', top: ry + 'px', width: rw + 'px', height: rh + 'px', pointerEvents: 'none' });
    if (parent) parent.append(cv);
    const T = o.transform ?? [1, 0, 0, 1, 0, 0];
    const list = [].concat(paths).flatMap((p) => (typeof p === 'string' ? pathPoints(p, o.sample ?? 3) : [p]));
    const r = rng('bpath:' + (o.seed ?? 1));
    const pal = o.palette ? palette(o.palette) : null;
    const gold = o.gold ? (Array.isArray(o.gold) ? o.gold : (pal ? pal.gold : PALETTES.ivory.gold)) : null;
    const strokes = list.map((pts) => {
      const tp = pts.map(([x, y]) => [T[0] * x + T[2] * y + T[4], T[1] * x + T[3] * y + T[5]]);
      const so = gold ? { color: gold[1], color2: gold[2], colors: [gold[1], gold[2], gold[3], gold[0]], body: 0.9, impasto: 0.85, jitter: 0.08 } : { color: o.color ?? '#5a3a20', colors: o.colors, body: o.body ?? 0.75, impasto: o.impasto ?? 0.3, jitter: o.jitter ?? 0.05 };
      return prepStroke(tp, Object.assign(so, { width: o.width ?? 6, dry: o.dry ?? 0.3, alpha: o.alpha ?? 1, taper: o.taper ?? [0.08, 0.35], pressure: o.pressure ?? 0.55, seed: r() * 1e6 | 0, bristles: o.bristles }));
    });
    const tot = strokes.reduce((a, s) => a + s.L + 40, 0) || 1;
    let acc = 0;
    const ov = o.overlap ?? 0.15;
    const times = strokes.map((s) => { const a = acc / tot; acc += s.L + 40; const b = acc / tot; return [a * (1 - ov), Math.min(1, b + (b - a) * ov)]; });
    let last = null;
    return {
      canvas: cv, strokes,
      seek(p) {
        const key = p; if (key === last) return; last = key;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
        g.setTransform(res, 0, 0, res, -rx * res, -ry * res);
        strokes.forEach((S, i) => { const [a, b] = o.order === 'together' ? [0, 1] : times[i]; const u = clamp((p - a) / (b - a || 1)); if (u > 0) drawStroke(g, S, u, 1); });
      },
    };
  }

  /* ------------------------------------------------------------- lettering */
  const INDIC = /[ऀ-෿\u{11480}-\u{114DF}]/u;
  // Zhang-Suen thinning of a binary image (1 = ink), in place
  function thin(B, w, h) {
    const del = [];
    let changed = true, iter = 0;
    while (changed && iter++ < 200) {
      changed = false;
      for (let pass = 0; pass < 2; pass++) {
        del.length = 0;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
          const i = y * w + x; if (!B[i]) continue;
          const p2 = B[i - w], p3 = B[i - w + 1], p4 = B[i + 1], p5 = B[i + w + 1], p6 = B[i + w], p7 = B[i + w - 1], p8 = B[i - 1], p9 = B[i - w - 1];
          const n = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9; if (n < 2 || n > 6) continue;
          const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
          if (A !== 1) continue;
          if (pass === 0) { if (p2 && p4 && p6) continue; if (p4 && p6 && p8) continue; } else { if (p2 && p4 && p8) continue; if (p2 && p6 && p8) continue; }
          del.push(i);
        }
        if (del.length) { changed = true; for (const i of del) B[i] = 0; }
      }
    }
  }
  // chamfer distance to background (1 / 1.41)
  function distT(B, w, h) {
    const D = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) D[i] = B[i] ? 1e9 : 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (!D[i]) continue; D[i] = Math.min(D[i], D[i - 1] + 1, D[i - w] + 1, D[i - w - 1] + 1.41, D[i - w + 1] + 1.41); }
    for (let y = h - 2; y > 0; y--) for (let x = w - 2; x > 0; x--) { const i = y * w + x; if (!D[i]) continue; D[i] = Math.min(D[i], D[i + 1] + 1, D[i + w] + 1, D[i + w + 1] + 1.41, D[i + w - 1] + 1.41); }
    return D;
  }
  const NB = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]]; // 4-neighbours first
  function traceSkeleton(S, w, h) {
    const deg = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (!S[i]) continue; let n = 0; for (const [dx, dy] of NB) n += S[i + dy * w + dx]; deg[i] = n; }
    const vis = new Uint8Array(w * h);
    const edges = [];
    const isNode = (i) => deg[i] !== 2;
    const walk = (startI, firstI) => {
      const chain = [startI, firstI];
      if (!isNode(firstI)) vis[firstI] = 1;
      let prev = startI, cur = firstI;
      while (!isNode(cur)) {
        let next = -1;
        for (const [dx, dy] of NB) { const j = cur + dy * w + dx; if (j === prev || !S[j]) continue; if (isNode(j) ? j !== startI || chain.length > 3 : !vis[j]) { next = j; break; } }
        if (next < 0) break;
        chain.push(next);
        if (!isNode(next)) vis[next] = 1;
        prev = cur; cur = next;
      }
      return chain;
    };
    const done = new Set();
    for (let i = 0; i < w * h; i++) {
      if (!S[i] || !isNode(i)) continue;
      if (deg[i] === 0) { edges.push([i]); continue; }
      for (const [dx, dy] of NB) {
        const j = i + dy * w + dx; if (!S[j]) continue;
        if (isNode(j)) { continue; } // adjacent node pairs (junction clusters) are covered by neighbouring edges' caps
        if (vis[j]) continue;
        const ch = walk(i, j);
        const key = Math.min(ch[0], ch[ch.length - 1]) + ':' + Math.max(ch[0], ch[ch.length - 1]) + ':' + ch.length;
        if (!done.has(key)) { done.add(key); edges.push(ch); }
      }
    }
    // closed loops (no nodes)
    for (let i = 0; i < w * h; i++) {
      if (!S[i] || vis[i] || isNode(i)) continue;
      vis[i] = 1;
      const chain = [i]; let prev = -1, cur = i;
      while (true) {
        let next = -1;
        for (const [dx, dy] of NB) { const j = cur + dy * w + dx; if (j === prev || !S[j] || vis[j]) continue; next = j; break; }
        if (next < 0) break;
        vis[next] = 1; chain.push(next); prev = cur; cur = next;
      }
      chain.push(i);
      if (chain.length > 2) edges.push(chain);
    }
    return edges;
  }
  function smoothPts(P, k = 2) {
    if (P.length < 5) return P;
    const out = P.map((p, i) => { if (i === 0 || i === P.length - 1) return p; let sx = 0, sy = 0, sw = 0; for (let j = -k; j <= k; j++) { const q = P[clamp(i + j, 0, P.length - 1)]; const ww = k + 1 - Math.abs(j); sx += q[0] * ww; sy += q[1] * ww; sw += ww; } return [sx / sw, sy / sw, p[2]]; });
    return out;
  }
  const gdCache = new Map();
  function grainData(c) { if (!gdCache.has(c)) gdCache.set(c, ctx2d(c).getImageData(0, 0, c.width, c.height).data); return gdCache.get(c); }
  const scratch = canvas(8, 8);
  /** residual(edges, ink, Wc, Hc, k, sw, sh) -> [{c, x, y, ta, tb}]: the glyph pixels that no stroke mask covers at
   *  full length (the skeleton drops junction clusters, short spurs, hairline entries and dots), each handed to its
   *  nearest stroke (multi-source BFS on the skeleton grid) and grouped by stroke order into a few cropped canvases.
   *  A group fades in over [mid, end] of its strokes, so the reveal reaches the finished art continuously at p = 1. */
  function residual(edges, ink, Wc, Hc, k, sw, sh) {
    if (!edges.length) return [];
    const cov = canvas(Wc, Hc, true), cg = ctx2d(cov);
    cg.strokeStyle = '#fff'; cg.fillStyle = '#fff'; cg.lineCap = 'round'; cg.lineJoin = 'round';
    for (const e of edges) {
      if (e.pts.length === 1) { cg.beginPath(); cg.arc(e.pts[0][0], e.pts[0][1], e.mw[0] * 0.5, 0, TAU); cg.fill(); continue; }
      for (let i = 1; i < e.pts.length; i++) { cg.lineWidth = Math.max(1, Math.round(e.mw[i])); cg.beginPath(); cg.moveTo(e.pts[i - 1][0], e.pts[i - 1][1]); cg.lineTo(e.pts[i][0], e.pts[i][1]); cg.stroke(); }
    }
    const cd = cg.getImageData(0, 0, Wc, Hc).data, idt = ctx2d(ink).getImageData(0, 0, Wc, Hc).data;
    free(cov);
    // nearest-stroke labels on the skeleton grid
    const lab = new Int32Array(sw * sh).fill(-1), qx = new Int32Array(sw * sh);
    let qh = 0, qt = 0;
    edges.forEach((e, ei) => { for (const p of e.pts) { const gx = clamp(Math.round(p[0] * k + 0.5), 0, sw - 1), gy = clamp(Math.round(p[1] * k + 0.5), 0, sh - 1), i = gy * sw + gx; if (lab[i] < 0) { lab[i] = ei; qx[qt++] = i; } } });
    while (qh < qt) { const i = qx[qh++], x = i % sw, y = (i / sw) | 0; for (const [dx, dy] of NB) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= sw || Y >= sh) continue; const j = Y * sw + X; if (lab[j] < 0) { lab[j] = lab[i]; qx[qt++] = j; } } }
    // groups by stroke order (edges are already in writing order)
    const NG = Math.min(14, edges.length), gOf = edges.map((_, i) => Math.min(NG - 1, Math.floor((i * NG) / edges.length)));
    const G = [...Array(NG)].map(() => ({ px: [], x0: 1e9, y0: 1e9, x1: -1, y1: -1, ta: 1, tb: 0 }));
    edges.forEach((e, i) => { const q = G[gOf[i]]; q.ta = Math.min(q.ta, lerp(e.t0, e.t1, 0.55)); q.tb = Math.max(q.tb, e.t1); });
    for (let y = 0; y < Hc; y++) for (let x = 0; x < Wc; x++) {
      const i = y * Wc + x, a = idt[i * 4 + 3];
      if (a < 6 || cd[i * 4 + 3] >= 250) continue;
      const gi = (Math.floor(y * k) + 1) * sw + Math.floor(x * k) + 1, ei = lab[clamp(gi, 0, sw * sh - 1)];
      if (ei < 0) continue;
      const q = G[gOf[ei]]; q.px.push(i, a);
      if (x < q.x0) q.x0 = x; if (x > q.x1) q.x1 = x; if (y < q.y0) q.y0 = y; if (y > q.y1) q.y1 = y;
    }
    const out = [];
    for (const q of G) {
      if (!q.px.length) continue;
      const w = q.x1 - q.x0 + 1, h = q.y1 - q.y0 + 1, c = canvas(w, h, true), g2 = ctx2d(c), id = g2.createImageData(w, h), d = id.data;
      for (let j = 0; j < q.px.length; j += 2) { const i = q.px[j], x = (i % Wc) - q.x0, y = ((i / Wc) | 0) - q.y0, o4 = (y * w + x) * 4; d[o4] = d[o4 + 1] = d[o4 + 2] = 255; d[o4 + 3] = q.px[j + 1]; }
      g2.putImageData(id, 0, 0);
      out.push({ c, x: q.x0, y: q.y0, ta: Math.min(q.ta, q.tb - 0.02), tb: q.tb });
    }
    return out;
  }
  /** lettering(parent, text, opts) -> {el, canvas, ready, seek(p, t), seekT(lt, start, dur, ease), strokes, width, height}
   *  Hand-painted title. The text is drawn in a real font (correct conjuncts for Devanagari/Bengali), skeletonised into
   *  brush strokes (writing order: lines, words, left to right, top first; the Devanagari/Bengali headline last in
   *  each word), painted with bristle streaks along those strokes, and revealed stroke by stroke through a mask.
   *  opts: font (CSS family stack, default ctx.fonts.hand), size (px, 140), weight, style, color (or palette ink),
   *  palette, fill:'paint'|'gold', x, y, anchor ('center'|'top'|'bottom'|'left'|'right'|'baseline'), lineHeight, tracking (px),
   *  pad, streak (0..1 bristle texture strength), edge (0..1 rim darkening), dry (0..1 tooth/breakup), wet (0..1 fresh
   *  paint darkening at the brush head), shadow (CSS drop-shadow string or false), overlap (0..0.8 concurrent strokes),
   *  shimmer {period, dur, delay, angle} (gold fill), skel (skeleton scale, default ~0.5), seed. */
  function lettering(parent, text, o = {}) {
    text = String(text);
    const lines = text.split('\n');
    const size = o.size ?? 140;
    const family = o.font ?? E.ctx.fonts.hand;
    const spec = `${o.style ?? 'normal'} ${o.weight ?? 400} ${size}px ${family}`;
    const pal = palette(o.palette ?? 'ivory');
    const color = o.color ?? pal.ink;
    const gold = o.fill === 'gold' ? (o.gold ?? pal.gold) : null;
    const el = canvas(4, 4, 'dynamic');
    el.className = 'p-lettering';
    Object.assign(el.style, { position: 'absolute', pointerEvents: 'none', left: '0px', top: '0px' });
    if (o.shadow) el.style.filter = o.shadow === true ? (pal.inkLight ? 'drop-shadow(0 2px 6px rgba(40,10,10,0.35))' : 'drop-shadow(0 1px 3px rgba(60,40,20,0.18))') : o.shadow;
    if (parent) parent.append(el);
    const L = { el, canvas: el, strokes: [], width: 0, height: 0, prepared: false, text };
    const g = ctx2d(el);
    let art = null, ink = null, last = null;
    function prep() {
      if (L.prepared) return; L.prepared = true;
      const m = ctx2d(scratch); m.font = spec;
      m.letterSpacing = o.tracking ? o.tracking + 'px' : '0px';   // always set: the scratch canvas is shared, an earlier tracked lettering leaked into later measurements
      const met = lines.map((ln) => m.measureText(ln));
      const pad = Math.round(o.pad ?? size * 0.32);
      const lh = (o.lineHeight ?? 1.22) * size;
      const asc0 = Math.max(...met.map((q) => q.actualBoundingBoxAscent));
      const desc1 = met[met.length - 1].actualBoundingBoxDescent;
      const inkW = Math.max(...met.map((q) => q.actualBoundingBoxLeft + q.actualBoundingBoxRight));
      const Wc = Math.ceil(inkW + pad * 2), Hc = Math.ceil(pad * 2 + asc0 + lh * (lines.length - 1) + desc1);
      const base = lines.map((_, i) => pad + asc0 + i * lh);
      const xs = met.map((q) => Wc / 2 - (q.actualBoundingBoxRight - q.actualBoundingBoxLeft) / 2);
      L.width = Wc; L.height = Hc; L.baseline = base[0];
      el.width = Wc; el.height = Hc;
      el.style.width = Wc + 'px'; el.style.height = Hc + 'px';
      const anc = o.anchor ?? 'center';
      const ax = anc.includes('left') ? 0 : anc.includes('right') ? 1 : 0.5;
      const x = o.x ?? W0 / 2, y = o.y ?? H0 / 2;
      let top = y - Hc * (anc.includes('top') ? 0 : anc.includes('bottom') ? 1 : 0.5);
      if (anc === 'baseline') top = y - base[0];
      el.style.left = (x - Wc * ax).toFixed(1) + 'px'; el.style.top = top.toFixed(1) + 'px';
      const drawText = (tg, fill) => { tg.font = spec; if (o.tracking) tg.letterSpacing = o.tracking + 'px'; tg.textBaseline = 'alphabetic'; tg.fillStyle = fill; lines.forEach((ln, i) => tg.fillText(ln, xs[i], base[i])); };
      ink = canvas(Wc, Hc, 'static'); const ig = ctx2d(ink); drawText(ig, '#fff');
      // skeleton
      const k = o.skel ?? clamp(64 / size, 0.32, 0.6);
      const sw = Math.ceil(Wc * k) + 2, sh = Math.ceil(Hc * k) + 2;
      const sc = canvas(sw, sh, true), sg = ctx2d(sc);
      sg.drawImage(ink, 1, 1, Wc * k, Hc * k);
      const px = sg.getImageData(0, 0, sw, sh).data;
      const B = new Uint8Array(sw * sh);
      for (let i = 0; i < sw * sh; i++) B[i] = px[i * 4 + 3] > 100 ? 1 : 0;
      for (let x2 = 0; x2 < sw; x2++) { B[x2] = 0; B[(sh - 1) * sw + x2] = 0; } for (let y2 = 0; y2 < sh; y2++) { B[y2 * sw] = 0; B[y2 * sw + sw - 1] = 0; }
      const D = distT(B, sw, sh);
      const Sk = B.slice(); thin(Sk, sw, sh);
      const raw = traceSkeleton(Sk, sw, sh);
      const toFull = (i) => [((i % sw) - 1 + 0.5) / k, (Math.floor(i / sw) - 1 + 0.5) / k, D[i] / k];
      const indic = INDIC.test(text);
      // headline rows (Devanagari shirorekha / Bengali matra): densest row per line
      const headY = base.map((bl) => {
        if (!indic) return null;
        let best = -1, by = 0;
        for (let yy = Math.floor((bl - size * 0.95) * k); yy < Math.ceil(bl * k); yy++) { if (yy < 0 || yy >= sh) continue; let c = 0; for (let x2 = 0; x2 < sw; x2++) c += B[yy * sw + x2]; if (c > best) { best = c; by = yy; } }
        return (by - 1 + 0.5) / k;
      });
      // word ranges per line
      const words = lines.map((ln, li) => {
        const out = []; const re = /\S+/g; let mm;
        while ((mm = re.exec(ln))) { const x0 = xs[li] + m.measureText(ln.slice(0, mm.index)).width; out.push([x0 - size * 0.08, x0 + m.measureText(mm[0]).width + size * 0.08]); }
        return out;
      });
      let thick = 0, nth = 0;
      for (const ch of raw) for (const i of ch) { thick += D[i] / k; nth++; }
      thick = nth ? (thick / nth) * 2 : size * 0.1;
      const edges = [];
      for (const ch of raw) {
        let pts = ch.map(toFull);
        if (pts.length > 1 && pts.length * (1 / k) < thick * 0.6 && ch.length < 3) continue; // tiny spur
        pts = smoothPts(pts, 2);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, my = 0, mx = 0, wmax = 0;
        for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); mx += p[0]; my += p[1]; wmax = Math.max(wmax, p[2]); }
        mx /= pts.length; my /= pts.length;
        let li = 0, bd = Infinity; base.forEach((bl, i) => { const dd = Math.abs(my - (bl - size * 0.35)); if (dd < bd) { bd = dd; li = i; } });
        let wi = 0; bd = Infinity; words[li].forEach(([a, b], i) => { const dd = mx < a ? a - mx : mx > b ? mx - b : 0; if (dd < bd) { bd = dd; wi = i; } });
        const ew = x1 - x0, eh = y1 - y0;
        const head = indic && headY[li] != null && ew > thick * 1.3 && eh < Math.max(thick * 0.9, ew * 0.3) && Math.abs(my - headY[li]) < thick * 1.3;
        // direction: verticals top-down, otherwise left to right
        if (eh > ew * 1.4 ? pts[0][1] > pts[pts.length - 1][1] : pts[0][0] > pts[pts.length - 1][0]) pts.reverse();
        let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        edges.push({ pts, li, wi, head, key: x0 + (y0 - (base[li] - size)) * 0.3, len: Math.max(len, 2), wmax });
      }
      edges.sort((a, b) => a.li - b.li || a.wi - b.wi || (a.head - b.head) || a.key - b.key);
      // timing: proportional to length (+ a pen lift), with optional overlap
      const lift = size * 0.35, ov = o.overlap ?? 0.25;
      let acc = 0; const tot = edges.reduce((s, e) => s + e.len + lift, 0) || 1;
      for (const e of edges) { const a = acc / tot; acc += e.len + lift; const b = (acc - lift) / tot; e.t0 = a * (1 - ov); e.t1 = Math.min(1, b + (b - a) * ov * 2); }
      // QA round 1: normalise so the last stroke ends exactly at p = 1 (no dead hold with a half-written word)
      { const tm = edges.reduce((m, e) => Math.max(m, e.t1), 0) || 1; for (const e of edges) { e.t0 /= tm; e.t1 = Math.min(1, e.t1 / tm); } }
      // mask segments (cumulative lengths)
      for (const e of edges) {
        e.cum = [0]; for (let i = 1; i < e.pts.length; i++) e.cum.push(e.cum[i - 1] + Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]));
        e.mw = e.pts.map((p) => 2 * p[2] * 1.18 + 3.5 / k * 0.5 + 2);
      }
      L.strokes = edges;
      L.resid = residual(edges, ink, Wc, Hc, k, sw, sh);
      // art
      art = canvas(Wc, Hc, 'static'); const ag = ctx2d(art);
      const rr = rng('letter:' + (o.seed ?? 1) + text);
      if (gold) {
        drawText(ag, '#fff');
        ag.globalCompositeOperation = 'source-in';
        ag.drawImage(goldTexture(Wc, Hc, { seed: o.seed ?? 1, gold }), 0, 0);
      } else drawText(ag, css(color));
      ag.globalCompositeOperation = 'source-atop';
      const stk = o.streak ?? 0.85;
      if (stk > 0) for (const e of edges) {
        if (e.pts.length < 3) continue;
        const cols = gold ? [gold[2], gold[3], gold[1], gold[0]] : pal.inkLight ? [shade(color, 0.25), shade(color, -0.14), shade(color, 0.12), color, shade(color, -0.06)] : [shade(color, 0.22), shade(color, -0.14), shade(color, 0.12), color, shade(color, 0.06)];
        const bw = Math.max(4, e.wmax * 2.35);
        const S = prepStroke(e.pts, { width: bw, color: cols[0], colors: cols, body: 0, bristles: clamp(Math.round(bw / 1.5), 4, 22), dry: 0.35, impasto: gold ? 0.9 : 0.6, jitter: 0.08, alpha: stk * (gold ? 0.8 : 0.62), taper: [0.02, 0.06], wobble: 0.04, splay: 0, rag: 0, seed: rr() * 1e6 | 0, step: 1.5, chunk: 9 });
        drawStroke(ag, S);
      }
      // pigment pooling along the rim
      const edgeK = o.edge ?? (gold ? 0.3 : 0.4);
      if (edgeK > 0) {
        const ring = canvas(Wc, Hc, 'static'), rg = ctx2d(ring);
        rg.drawImage(art, 0, 0); rg.globalCompositeOperation = 'destination-out'; rg.filter = `blur(${Math.max(1.2, thick * 0.22)}px)`; rg.drawImage(ink, 0, 0); rg.filter = 'none';
        ag.globalCompositeOperation = 'multiply'; ag.globalAlpha = edgeK; ag.drawImage(ring, 0, 0); ag.globalAlpha = 1;
        free(ring);
        ag.globalCompositeOperation = 'destination-in'; ag.drawImage(ink, 0, 0);
      }
      // dry brush: bristle gaps toward the end of each stroke (the brush running dry), heaviest on long strokes
      const dryK = o.dry ?? 0.45;
      if (dryK > 0) {
        ag.globalCompositeOperation = 'destination-out'; ag.lineCap = 'round';
        for (const e of edges) {
          if (e.pts.length < 4 || e.len < thick * 2.5) continue;
          const nb = clamp(Math.round(e.wmax * 2 / 2.2), 2, 9);
          const S = prepStroke(e.pts, { width: e.wmax * 2.1, color: '#000', body: 0, bristles: nb, dry: 0.7, impasto: 0, jitter: 0, alpha: 1, flat: true, splay: 0, rag: 0, seed: rr() * 1e6 | 0, step: 1.5, chunk: 6 });
          // keep only the tail: these "bristles" are gaps that start late and grow toward the end
          for (const b of S.br) { b.u0 = rr.range(0.55, 0.85); b.u1 = 1; b.lw = rr.range(0.6, 1.5); b.a = dryK * rr.range(0.35, 0.9); b.gk = 0.25; }
          drawStroke(ag, S);
        }
      }
      // rough, brushy contour: threshold the softened glyph against paper-tooth noise
      const rough = o.rough ?? 0.5;
      if (rough > 0) {
        const mk2 = canvas(Wc, Hc, true), mg = ctx2d(mk2);
        mg.filter = `blur(${(1.1 + thick * 0.06).toFixed(2)}px)`; mg.drawImage(ink, 0, 0); mg.filter = 'none';
        const id = mg.getImageData(0, 0, Wc, Hc), d = id.data;
        const gt = grain('rough', 4).grey, gtd = grainData(gt);
        const amp = 0.32 * rough;
        for (let y2 = 0; y2 < Hc; y2++) for (let x2 = 0; x2 < Wc; x2++) {
          const i = (y2 * Wc + x2) * 4, a0 = d[i + 3] / 255;
          if (a0 <= 0.01 || a0 >= 0.995) { d[i + 3] = a0 >= 0.995 ? 255 : 0; continue; }
          const nz = (gtd[((y2 & 511) * 512 + (x2 & 511)) * 4] - 128) / 128;
          const v = a0 + nz * amp;
          d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(255 * smoothstep(0.4, 0.6, v));
        }
        mg.putImageData(id, 0, 0);
        ag.globalCompositeOperation = 'destination-in'; ag.drawImage(mk2, 0, 0);
        free(mk2);
      }
      // a little paper tooth inside
      { const t = grain('rough', 3); ag.save(); ag.globalCompositeOperation = 'destination-out'; ag.globalAlpha = 0.12 + dryK * 0.12; ag.fillStyle = ag.createPattern(t.dark, 'repeat'); ag.fillRect(0, 0, Wc, Hc); ag.restore(); }
      ag.globalCompositeOperation = 'source-over';
      L.wetCol = gold ? css(gold[0]) : css(shade(color, pal.inkLight ? -0.12 : -0.22));
    }
    L.ready = track(document.fonts.load(spec, text).then(() => { if (!L.prepared) prep(); }, () => { console.warn('[P] font load failed', spec); }));
    const shimO = o.shimmer === false ? null : Object.assign({ period: 6, dur: 2.2, delay: 0.6, angle: 20 }, o.shimmer || {});
    L.seek = (p, t = 0) => {
      if (!L.prepared) prep();
      p = clamp(p);
      const shim = gold && shimO && p >= 1 ? (() => { const ph = (((t - shimO.delay) % shimO.period) + shimO.period) % shimO.period; return t >= shimO.delay && ph <= shimO.dur ? ph / shimO.dur : null; })() : null;
      const key = p + '|' + (shim == null ? '' : shim);
      if (key === last) return; last = key;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.clearRect(0, 0, el.width, el.height);
      if (p <= 0) return;
      if (p < 1) {
        g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
        const heads = [];
        for (const e of L.strokes) {
          const q = clamp((p - e.t0) / (e.t1 - e.t0 || 1e-6));
          if (q <= 0) continue;
          const dmax = q * e.cum[e.cum.length - 1];
          if (e.pts.length === 1) { g.fillStyle = '#fff'; g.beginPath(); g.arc(e.pts[0][0], e.pts[0][1], e.mw[0] * 0.5 * q, 0, TAU); g.fill(); continue; }
          let i = 1;
          let cw = -1;
          g.beginPath(); g.moveTo(e.pts[0][0], e.pts[0][1]);
          for (; i < e.pts.length && e.cum[i] <= dmax; i++) {
            const w2 = Math.round(e.mw[i]);
            if (w2 !== cw && cw > 0) { g.lineWidth = cw; g.stroke(); g.beginPath(); g.moveTo(e.pts[i - 1][0], e.pts[i - 1][1]); }
            cw = w2; g.lineTo(e.pts[i][0], e.pts[i][1]);
          }
          let hx = e.pts[i - 1][0], hy = e.pts[i - 1][1];
          if (i < e.pts.length) { const f = (dmax - e.cum[i - 1]) / ((e.cum[i] - e.cum[i - 1]) || 1); hx = lerp(e.pts[i - 1][0], e.pts[i][0], f); hy = lerp(e.pts[i - 1][1], e.pts[i][1], f); g.lineTo(hx, hy); if (cw < 0) cw = Math.round(e.mw[i]); }
          g.lineWidth = Math.max(1, cw); g.stroke();
          if (q < 1) heads.push([e, dmax, hx, hy]);
        }
        // residual ink (hairlines, joins, dots no skeleton stroke covers) fades in as its nearest stroke finishes
        for (const R of L.resid) { const a = smoothstep(R.ta, R.tb, p); if (a <= 0) continue; g.globalAlpha = a; g.drawImage(R.c, R.x, R.y); g.globalAlpha = 1; }
        g.globalCompositeOperation = 'source-in';
        g.drawImage(art, 0, 0);
        // wet paint at the brush head
        const wet = o.wet ?? 0.28;
        if (wet > 0 && heads.length) {
          g.globalCompositeOperation = 'source-atop'; g.strokeStyle = L.wetCol; g.globalAlpha = wet;
          for (const [e, dmax] of heads) {
            const from = Math.max(0, dmax - size * 0.5);
            g.beginPath(); let started = false;
            for (let i = 0; i < e.pts.length && e.cum[i] <= dmax; i++) if (e.cum[i] >= from) { started ? g.lineTo(e.pts[i][0], e.pts[i][1]) : g.moveTo(e.pts[i][0], e.pts[i][1]); started = true; }
            if (started) { g.lineWidth = e.wmax * 2.4; g.stroke(); }
          }
          g.globalAlpha = 1;
        }
      } else {
        g.drawImage(art, 0, 0);
      }
      if (shim != null) {
        const a = ((shimO.angle) * Math.PI) / 180, span = el.width + el.height;
        const c = -span * 0.5 + span * 1.5 * E.ease.inOutSine(shim);
        const gr = g.createLinearGradient(c, 0, c + Math.cos(a) * 160, Math.sin(a) * 160);
        const gl = gold[3];
        const ka = shimO.strength ?? 0.5;
        gr.addColorStop(0, css(gl, 0)); gr.addColorStop(0.5, css(gl, ka)); gr.addColorStop(1, css(gl, 0));
        g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.fillRect(0, 0, el.width, el.height);
      }
      g.globalCompositeOperation = 'source-over';
    };
    L.seekT = (lt, start = 0, dur = 2.5, ease = 'inOutSine') => L.seek(E.prog(lt, start, dur, ease), lt);
    return L;
  }

  /* ------------------------------------------------------- brush-dab particles */
  // unit petal outlines (pointing +x after the caller's rotation; drawn in a ~[-0.5, 0.5] box)
  function petalPath(g, r) {
    const w = r.range(0.4, 0.48), n = r.range(-0.03, 0.03);
    g.beginPath(); g.moveTo(0, 0.46);
    g.bezierCurveTo(-w * 0.95, 0.28, -w * 1.02, -0.22, -w * 0.45, -0.42);
    g.bezierCurveTo(-w * 0.18, -0.5, -0.04, -0.44, n, -0.38);
    g.bezierCurveTo(0.04, -0.44, w * 0.18, -0.5, w * 0.45, -0.42);
    g.bezierCurveTo(w * 1.02, -0.22, w * 0.95, 0.28, 0, 0.46);
    g.closePath();
  }
  function ruffledPath(g, r) {
    g.beginPath(); g.moveTo(0, 0.42);
    g.bezierCurveTo(-0.34, 0.3, -0.42, -0.1, -0.34, -0.28);
    const teeth = 5;
    for (let i = 0; i < teeth; i++) { const x0 = -0.34 + (i / teeth) * 0.68, x1 = -0.34 + ((i + 1) / teeth) * 0.68; g.quadraticCurveTo((x0 + x1) / 2, -0.46 - r.range(0, 0.06), x1, -0.3 - r.range(0, 0.04)); }
    g.bezierCurveTo(0.42, -0.1, 0.34, 0.3, 0, 0.42);
    g.closePath();
  }
  const spriteCache = new Map();
  /** dabSprites(kind, palette, {n, size, seed}) -> [canvas] painted particle sprites.
   *  kinds: 'petal' (rose), 'marigold' (loose marigold petal), 'marigoldHead' (small flower), 'jasmine', 'leaf' (mango leaf),
   *  'spark' (gold dab with glow, use blend 'lighter'), 'dust' (soft warm dab), 'flake' (gold-leaf flake) */
  function dabSprites(kind, pal, o = {}) {
    pal = palette(pal);
    const n = o.n ?? 6, S = o.size ?? 72;
    const key = [kind, pal.name, n, S, o.seed ?? 1, (o.colors || []).join()].join('|');
    if (spriteCache.has(key)) return spriteCache.get(key);
    const r = rng('dab:' + key);
    const out = [];
    for (let i = 0; i < n; i++) {
      const c = canvas(S, S, 'static'), g = ctx2d(c);
      g.translate(S / 2, S / 2);
      const cols = o.colors || pal.petals;
      const col = toRGB(cols[i % cols.length]);
      const sd = r() * 1e6 | 0;
      if (kind === 'petal' || kind === 'marigold') {
        // a shaped petal: gradient body, bristle streaks radiating from the base, light rim; marigold = ruffled edge
        g.save(); g.rotate(-Math.PI / 2 + r.range(-0.2, 0.2));
        const k = S * (kind === 'petal' ? 0.92 : 0.8);
        g.scale(k * r.range(0.9, 1.08), k);
        if (kind === 'petal') petalPath(g, r); else ruffledPath(g, r);
        g.restore();
        g.save(); g.clip();
        const gr = g.createLinearGradient(0, S * 0.42, r.range(-6, 6), -S * 0.42);
        gr.addColorStop(0, css(shade(col, -0.32))); gr.addColorStop(0.45, css(col)); gr.addColorStop(1, css(shade(col, 0.22)));
        g.fillStyle = gr; g.fillRect(-S / 2, -S / 2, S, S);
        for (let q = 0; q < 9; q++) {
          const ang = -Math.PI / 2 + r.range(-0.7, 0.7);
          stroke(g, [[r.range(-2, 2), S * 0.4], [Math.cos(ang) * S * 0.25, S * 0.4 + Math.sin(ang) * S * 0.5], [Math.cos(ang) * S * 0.36, S * 0.4 + Math.sin(ang) * S * 0.95]], { width: S * r.range(0.05, 0.11), color: shade(col, r.range(-0.12, 0.2)), body: 0.3, dry: 0.5, impasto: 0.3, jitter: 0.05, alpha: 0.5, seed: sd + q, step: 1.2, rag: 0 });
        }
        g.restore();
        g.save(); g.rotate(-Math.PI / 2); g.scale(k, k);
        if (kind === 'petal') petalPath(g, rng(sd)); else ruffledPath(g, rng(sd));
        g.restore();
        g.strokeStyle = css(shade(col, 0.35), 0.55); g.lineWidth = 1.1; g.stroke();
      } else if (kind === 'marigoldHead') {
        // pom-pom: rings of small ruffled petals, darker and redder outside, with a soft shadow side
        const R = S * 0.44;
        for (let ring = 0; ring < 5; ring++) {
          const rr = R * (1 - ring * 0.2), cnt = Math.max(5, 18 - ring * 3);
          for (let q = 0; q < cnt; q++) {
            const a = (q / cnt) * TAU + ring * 0.37 + r.range(-0.12, 0.12);
            g.save(); g.translate(Math.cos(a) * rr * 0.62, Math.sin(a) * rr * 0.62); g.rotate(a + Math.PI / 2);
            const kk = S * (0.3 - ring * 0.03); g.scale(kk, kk); ruffledPath(g, r);
            const c0 = shade(mix(col, [200, 70, 20], 0.28 - ring * 0.06), -0.16 + ring * 0.08 + r.range(-0.05, 0.05));
            g.fillStyle = css(c0); g.fill(); g.lineWidth = 0.04; g.strokeStyle = css(shade(c0, -0.25), 0.5); g.stroke();
            g.restore();
          }
        }
        g.globalCompositeOperation = 'source-atop';
        const sh = g.createRadialGradient(-S * 0.12, -S * 0.14, S * 0.05, 0, 0, S * 0.5);
        sh.addColorStop(0, 'rgba(255,240,200,0.28)'); sh.addColorStop(0.6, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(70,20,0,0.35)');
        g.fillStyle = sh; g.fillRect(-S / 2, -S / 2, S, S);
        g.globalCompositeOperation = 'source-over';
      } else if (kind === 'jasmine') {
        const white = [248, 244, 232];
        for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + r.range(-0.08, 0.08); stroke(g, [[Math.cos(a) * S * 0.05, Math.sin(a) * S * 0.05], [Math.cos(a) * S * 0.36, Math.sin(a) * S * 0.36]], { width: S * 0.2, color: white, color2: shade(white, -0.06), body: 0.9, dry: 0.1, impasto: 0.5, taper: [0.15, 0.3], seed: sd + k, step: 1 }); }
        g.fillStyle = 'rgba(214,190,110,0.85)'; g.beginPath(); g.arc(0, 0, S * 0.06, 0, TAU); g.fill();
      } else if (kind === 'leaf') {
        const L2 = S * 0.44;
        const green = o.colors ? col : toRGB(pal.name === 'sage' ? pal.darks[0] : '#6f8a4f');
        const pts = []; for (let q = 0; q <= 16; q++) { const u = q / 16; pts.push([-L2 + u * 2 * L2, Math.sin(u * Math.PI) * S * 0.04]); }
        stroke(g, pts, { width: S * 0.26, color: green, color2: shade(green, 0.15), body: 0.85, dry: 0.2, impasto: 0.5, taper: [0.3, 0.5], seed: sd, step: 1.2 });
        g.strokeStyle = css(shade(green, 0.3), 0.6); g.lineWidth = 0.8; g.beginPath(); g.moveTo(-L2 * 0.9, 0); g.lineTo(L2 * 0.9, S * 0.02); g.stroke();
      } else if (kind === 'spark' || kind === 'dust') {
        const gl = toRGB(kind === 'spark' ? pal.gold[3] : pal.lights[0]);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.48);
        gr.addColorStop(0, css(gl, kind === 'spark' ? 1 : 0.55)); gr.addColorStop(0.18, css(kind === 'spark' ? pal.gold[2] : gl, kind === 'spark' ? 0.7 : 0.35)); gr.addColorStop(1, css(gl, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, S * 0.48, 0, TAU); g.fill();
        if (kind === 'spark') stroke(g, [[-S * 0.12, r.range(-2, 2)], [S * 0.12, r.range(-2, 2)]], { width: S * 0.1, color: pal.gold[2], color2: pal.gold[3], body: 1, dry: 0, impasto: 0.6, taper: [0.3, 0.4], seed: sd, step: 1 });
      } else if (kind === 'flake') {
        g.scale(S / 30, S / 30);
        goldFlecks(g, { count: 1, rect: [-0.5, -0.5, 1, 1], size: [10, 12], gold: pal.gold, seed: sd });
      } else throw new Error('dabSprites: unknown kind ' + kind);
      out.push(c);
    }
    spriteCache.set(key, out);
    return out;
  }
  const DAB_SPAWN = {
    petal: (r) => ({ vy: r.range(38, 70), vx: r.range(-12, 12), sway: r.range(14, 36), swayF: r.range(0.08, 0.18), rot: r.range(0, 360), vr: r.range(-35, 35), size: r.range(26, 44), flip: true, flipF: r.range(0.15, 0.35), alpha: r.range(0.75, 0.95) }),
    marigold: (r) => ({ vy: r.range(45, 80), vx: r.range(-10, 10), sway: r.range(10, 26), swayF: r.range(0.1, 0.2), rot: r.range(0, 360), vr: r.range(-60, 60), size: r.range(20, 34), flip: true, flipF: r.range(0.2, 0.4), alpha: r.range(0.8, 1) }),
    marigoldHead: (r) => ({ vy: r.range(50, 75), sway: r.range(6, 14), swayF: r.range(0.08, 0.14), rot: r.range(0, 360), vr: r.range(-20, 20), size: r.range(34, 52), alpha: 0.95 }),
    jasmine: (r) => ({ vy: r.range(30, 55), vx: r.range(-6, 6), sway: r.range(10, 22), swayF: r.range(0.1, 0.18), rot: r.range(0, 360), vr: r.range(-25, 25), size: r.range(18, 28), alpha: r.range(0.85, 1) }),
    leaf: (r) => ({ vy: r.range(35, 60), vx: r.range(-14, 14), sway: r.range(16, 34), swayF: r.range(0.08, 0.16), rot: r.range(0, 360), vr: r.range(-30, 30), size: r.range(30, 48), flip: true, flipF: r.range(0.12, 0.28), alpha: r.range(0.75, 0.95) }),
    spark: (r) => ({ vy: r.range(-38, -14), vx: r.range(-8, 8), sway: r.range(6, 18), swayF: r.range(0.12, 0.3), size: r.range(10, 26), alpha: r.range(0.45, 0.9) }),
    dust: (r) => ({ vy: r.range(-14, -4), vx: r.range(-6, 6), sway: r.range(10, 30), swayF: r.range(0.05, 0.12), size: r.range(16, 46), alpha: r.range(0.25, 0.6) }),
    flake: (r) => ({ vy: r.range(14, 30), vx: r.range(-6, 6), sway: r.range(8, 18), swayF: r.range(0.1, 0.2), rot: r.range(0, 360), vr: r.range(-50, 50), size: r.range(7, 14), flip: true, flipF: r.range(0.3, 0.6), alpha: 0.95 }),
  };
  /** particles(parent, {kind, palette, colors, sprites:n, ...E.particles opts}) -> E.particles system drawing painted dabs.
   *  Defaults per kind give a slow, calm fall (petals) or rise (sparks, dust). spawn(r, i) may override any field. */
  function particles(parent, o = {}) {
    const kind = o.kind ?? 'petal';
    const spr = dabSprites(kind, o.palette ?? 'ivory', { n: o.sprites ?? 6, size: o.spriteSize ?? 72, seed: o.seed ?? 1, colors: o.colors });
    const def = DAB_SPAWN[kind];
    const H = o.H ?? H0;
    const rising = kind === 'spark' || kind === 'dust';
    const spawn = (r, i) => Object.assign({ y: rising ? r.range(H * 0.4, H + 40) : r.range(-80, H * 0.35), sprite: i % spr.length }, def(r), o.spawn ? o.spawn(r, i) : {});
    const draw = (g, p) => { const s = spr[p.sprite % spr.length]; const k = p.size / s.width; g.drawImage(s, -s.width * k / 2, -s.height * k / 2, s.width * k, s.height * k); };
    const opts = Object.assign({ count: 18, life: [12, 20], loop: true, fade: [1.2, 1.6], blend: kind === 'spark' ? 'lighter' : undefined }, o, { spawn, draw: o.draw || draw });
    delete opts.kind;
    return E.particles(parent, opts);
  }

  /* --------------------------------------------------------------- overlays */
  /** grainOverlay(parent, {kind, seed, alpha, blend, W, H}) -> canvas: a static texture layer over everything
   *  (characters included) so cut-outs sit inside the painting. Default soft-light at 0.35. */
  function grainOverlay(parent, o = {}) {
    const W = o.W ?? W0, H = o.H ?? H0;
    const c = canvas(W, H, 'static'), g = ctx2d(c);
    const t = grain(o.kind ?? 'paper', o.seed ?? 2);
    g.fillStyle = g.createPattern(t.grey, 'repeat'); g.fillRect(0, 0, W, H);
    Object.assign(c.style, { position: 'absolute', left: '0', top: '0', width: W + 'px', height: H + 'px', pointerEvents: 'none', mixBlendMode: o.blend ?? 'soft-light', opacity: String(o.alpha ?? 0.35) });
    if (parent) parent.append(c);
    return c;
  }
  /** vignette(parent, {palette, color, alpha, rx, ry, cy, blend}) -> div: a soft multiply vignette in the palette's deep tone */
  function vignette(parent, o = {}) {
    const pal = palette(o.palette ?? 'ivory');
    const col = o.color ?? pal.ground[2];
    const el = E.h('div', { class: 'p-vignette', style: { position: 'absolute', inset: '0', pointerEvents: 'none', background: `radial-gradient(ellipse ${o.rx ?? 75}% ${o.ry ?? 62}% at 50% ${o.cy ?? 46}%, ${css(col, 0)} 55%, ${css(col, (o.alpha ?? 0.35) * 0.6)} 82%, ${css(col, o.alpha ?? 0.35)} 100%)`, mixBlendMode: o.blend ?? 'multiply' } });
    if (parent) parent.append(el);
    return el;
  }

  /** toImg(canvas, {type, quality, crop:[x,y,w,h]}) -> <img> (data URL; JPEG 0.92 by default). For print/PDF pages: a canvas
   *  prints as a lossless bitmap (huge PDFs); an <img> JPEG keeps cards small. pdf.mjs waits for document.images. */
  function toImg(c, o = {}) {
    let src = c;
    if (o.crop) { const [x, y, w, h] = o.crop; src = canvas(w, h, 'static'); ctx2d(src).drawImage(c, x, y, w, h, 0, 0, w, h); }
    const im = new Image();
    im.src = src.toDataURL(o.type ?? 'image/jpeg', o.quality ?? 0.92);
    im.decoding = 'sync';
    return im;
  }
  const P = {
    PALETTES, palette, ALIAS, toImg,
    canvas, ctx2d, toRGB, css, mix, shade, ramp,
    noise2, fbm2, flow, trace, resample,
    prepStroke, drawStroke, stroke, wash, bleed, deform,
    grain, applyGrain, grainOverlay, vignette,
    goldTexture, goldFlecks, goldStroke, goldShimmer,
    paint, backdrop, liveStrokes, lightSweep, glowPool, paintReveal,
    pathPoints, brushPath, lettering, dabSprites, particles,
    ready, track, STYLES, config,
  };
  window.P = P;
  E.paint = P;
})();
