/* WeddingInvite (v2) render engine: one deterministic clock for every pixel.
 * Classic script (no modules) so it works from any origin. Exposes window.E.
 * Nothing here reads the wall clock; seek(t) fully determines the page state.
 */
(function () {
  'use strict';
  const W = 1080, H = 1920, FPS = 30;
  const params = new URLSearchParams(location.search);

  /* ------------------------------------------------------------------ math */
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, p) => a + (b - a) * p;
  /** progress of t through [start, start+dur], clamped 0..1, optional easing */
  const prog = (t, start, dur, ease) => {
    const p = dur <= 0 ? (t >= start ? 1 : 0) : clamp((t - start) / dur);
    return ease ? resolveEase(ease)(p) : p;
  };
  const mapRange = (v, a, b, c = 0, d = 1, ease) => {
    const p = clamp((v - a) / (b - a));
    return lerp(c, d, ease ? resolveEase(ease)(p) : p);
  };
  const fract = (x) => x - Math.floor(x);
  const smoothstep = (a, b, x) => { const p = clamp((x - a) / (b - a)); return p * p * (3 - 2 * p); };

  /* --------------------------------------------------------------- easings */
  const PI = Math.PI;
  function cubicBezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dsx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) { const e = sx(t) - x; const d = dsx(t); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; t -= e / d; }
      if (t < 0 || t > 1) { let lo = 0, hi = 1; t = x; for (let i = 0; i < 30; i++) { const v = sx(t); if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
      return sy(t);
    };
  }
  const outBounce = (p) => {
    const n = 7.5625, d = 2.75;
    if (p < 1 / d) return n * p * p;
    if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
    if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
    return n * (p -= 2.625 / d) * p + 0.984375;
  };
  const ease = {
    linear: (p) => p,
    inQuad: (p) => p * p, outQuad: (p) => 1 - (1 - p) * (1 - p),
    inOutQuad: (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
    inCubic: (p) => p * p * p, outCubic: (p) => 1 - Math.pow(1 - p, 3),
    inOutCubic: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    inQuart: (p) => p ** 4, outQuart: (p) => 1 - Math.pow(1 - p, 4),
    inOutQuart: (p) => (p < 0.5 ? 8 * p ** 4 : 1 - Math.pow(-2 * p + 2, 4) / 2),
    outQuint: (p) => 1 - Math.pow(1 - p, 5),
    inSine: (p) => 1 - Math.cos((p * PI) / 2), outSine: (p) => Math.sin((p * PI) / 2),
    inOutSine: (p) => -(Math.cos(PI * p) - 1) / 2,
    inExpo: (p) => (p === 0 ? 0 : Math.pow(2, 10 * p - 10)),
    outExpo: (p) => (p === 1 ? 1 : 1 - Math.pow(2, -10 * p)),
    inOutExpo: (p) => (p === 0 ? 0 : p === 1 ? 1 : p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2),
    inCirc: (p) => 1 - Math.sqrt(1 - p * p), outCirc: (p) => Math.sqrt(1 - Math.pow(p - 1, 2)),
    inBack: (p, s = 1.70158) => (s + 1) * p * p * p - s * p * p,
    outBack: (p, s = 1.70158) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2),
    inOutBack: (p, s = 1.70158 * 1.525) => (p < 0.5 ? (Math.pow(2 * p, 2) * ((s + 1) * 2 * p - s)) / 2 : (Math.pow(2 * p - 2, 2) * ((s + 1) * (p * 2 - 2) + s) + 2) / 2),
    outElastic: (p) => (p === 0 ? 0 : p === 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * ((2 * PI) / 3)) + 1),
    outBounce,
    /** soft "silk" ease used for most UI-ish moves */
    silk: cubicBezier(0.22, 1, 0.36, 1),
    swift: cubicBezier(0.65, 0, 0.35, 1),
    cubicBezier,
    steps: (n) => (p) => Math.min(n, Math.floor(p * n)) / n,
    /** damped spring settling to 1 (closed form, deterministic) */
    spring: (stiff = 9, damp = 5) => (p) => 1 - Math.exp(-damp * p) * Math.cos(stiff * p),
  };
  function resolveEase(e) {
    if (!e) return ease.linear;
    if (typeof e === 'function') return e;
    if (Array.isArray(e)) return cubicBezier(...e);
    const f = ease[e];
    if (!f) throw new Error('unknown ease ' + e);
    return f;
  }

  /* ------------------------------------------------------------- seeded RNG */
  function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  /** mulberry32: rng() -> [0,1). Extra helpers hang off the function. */
  function rng(seed = 1) {
    let a = (typeof seed === 'string' ? hashStr(seed) : seed) >>> 0;
    const r = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    r.range = (lo, hi) => lo + (hi - lo) * r();
    r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.sign = () => (r() < 0.5 ? -1 : 1);
    r.gauss = () => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * PI * v); };
    return r;
  }
  /** stateless hash -> [0,1) for integer lattice points (used by noise) */
  function hash1(i, seed = 0) { let h = Math.imul((i | 0) ^ Math.imul(seed | 0, 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  /** smooth 1-D value noise in [-1,1]; noise(t*freq, seed) for flicker/wobble */
  function noise(x, seed = 0) { const i = Math.floor(x), f = x - i; const u = f * f * (3 - 2 * f); return lerp(hash1(i, seed), hash1(i + 1, seed), u) * 2 - 1; }
  /** fractal noise (3 octaves) */
  function fbm(x, seed = 0) { return noise(x, seed) * 0.57 + noise(x * 2.03, seed + 7) * 0.29 + noise(x * 4.1, seed + 13) * 0.14; }
  const wave = (t, period = 1, amp = 1, phase = 0) => Math.sin(((t / period) + phase) * 2 * PI) * amp;
  const loop = (t, period) => fract(t / period);

  /* ----------------------------------------------------------- interpolation */
  function parseColor(c) {
    if (Array.isArray(c)) return c;
    c = String(c).trim();
    if (c[0] === '#') {
      let h = c.slice(1); if (h.length <= 4) h = h.split('').map((x) => x + x).join('');
      const n = parseInt(h.slice(0, 6), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1];
    }
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]]; }
    return null;
  }
  const isColor = (v) => typeof v === 'string' && (v[0] === '#' || v.startsWith('rgb'));
  function mixColor(a, b, p) { const A = parseColor(a), B = parseColor(b); return `rgba(${Math.round(lerp(A[0], B[0], p))},${Math.round(lerp(A[1], B[1], p))},${Math.round(lerp(A[2], B[2], p))},${+lerp(A[3], B[3], p).toFixed(4)})`; }
  /** interpolate numbers, number arrays, colours; anything else steps at p>=1 */
  function interp(a, b, p) {
    if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * p;
    if (Array.isArray(a) && Array.isArray(b)) return a.map((x, i) => interp(x, b[i], p));
    if (isColor(a) && isColor(b)) return mixColor(a, b, p);
    return p >= 1 ? b : a;
  }
  const tween = (t, { from = 0, to = 1, start = 0, dur = 1, ease: e } = {}) => interp(from, to, prog(t, start, dur, e));
  /** keyframes(t, [[time, value, easeIntoThisKey?], ...]) holds the ends */
  function keyframes(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, e] = keys[i];
      if (t <= t1) { const [t0, v0] = keys[i - 1]; return interp(v0, v1, resolveEase(e)((t - t0) / (t1 - t0 || 1))); }
    }
    return keys[keys.length - 1][1];
  }
  /** delay for item i of n: {each, total, from:'start'|'end'|'center'|'edges'|'random'|index, seed, ease} */
  function stagger(i, n, o = {}) {
    const each = o.total != null ? o.total / Math.max(1, n - 1) : (o.each ?? 0.08);
    let k;
    switch (o.from ?? 'start') {
      case 'start': k = i; break;
      case 'end': k = n - 1 - i; break;
      case 'center': k = Math.abs(i - (n - 1) / 2); break;
      case 'edges': k = (n - 1) / 2 - Math.abs(i - (n - 1) / 2); break;
      case 'random': k = hash1(i, o.seed ?? 7) * (n - 1); break;
      default: k = Math.abs(i - o.from);
    }
    if (o.ease) { const span = (n - 1) || 1; return resolveEase(o.ease)(k / span) * span * each; }
    return k * each;
  }

  /* -------------------------------------------------------------- DOM + style */
  const SVGNS = 'http://www.w3.org/2000/svg';
  const pending = [];
  function applyAttrs(el, attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'class') el.setAttribute('class', v);
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('--')) el.style.setProperty(k, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  function appendKids(el, kids) { for (const c of [].concat(kids ?? [])) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c))); }
  /** h('div', {class, style:{}, text}, [children]) */
  function h(tag, attrs = {}, kids) { const el = document.createElement(tag); applyAttrs(el, attrs); appendKids(el, kids); if (tag === 'img' && attrs.src) track(el); return el; }
  /** svg('path', {d, fill}) ; svg('svg', {viewBox}) */
  function svg(tag, attrs = {}, kids) {
    const el = document.createElementNS(SVGNS, tag);
    applyAttrs(el, attrs); appendKids(el, kids);
    if (tag === 'image' && (attrs.href || attrs['xlink:href'])) pending.push(preload(attrs.href || attrs['xlink:href']));
    return el;
  }
  /** parse an SVG markup string into an element (for imported art) */
  function svgFrom(markup) { const t = document.createElement('template'); t.innerHTML = markup.trim(); return t.content.firstElementChild; }
  function track(img) { pending.push(img.decode ? img.decode().catch(() => console.warn('[E] image failed', img.src)) : Promise.resolve()); return img; }
  const preloadCache = new Map();
  /** preload(url) -> Promise<HTMLImageElement>; use for CSS backgrounds, canvas sprites, svg <image> */
  function preload(url) {
    if (!preloadCache.has(url)) {
      const im = new Image(); im.src = url;
      const pr = im.decode().then(() => im).catch(() => { console.warn('[E] preload failed', url); return im; });
      preloadCache.set(url, pr); pending.push(pr);
    }
    return preloadCache.get(url);
  }
  const img = (src, attrs = {}) => h('img', Object.assign({ src, draggable: 'false' }, attrs));
  /** absolute-positioned layer the size of the stage */
  const layer = (attrs = {}, kids) => { const el = h('div', attrs, kids); el.classList.add('layer'); return el; };

  const TF_KEYS = ['x', 'y', 'z', 'scale', 'sx', 'sy', 'rot', 'rotX', 'rotY', 'skewX', 'skewY', 'xp', 'yp'];
  const num = (v, d) => (v == null ? d : v);
  /** compose a transform string: translate (px, or % via xp/yp), rotate (deg), scale, skew */
  function transform(s) {
    let out = '';
    if (s.xp != null || s.yp != null) out += `translate(${num(s.xp, 0)}%,${num(s.yp, 0)}%) `;
    if (s.x != null || s.y != null || s.z != null) out += `translate3d(${+num(s.x, 0).toFixed(3)}px,${+num(s.y, 0).toFixed(3)}px,${num(s.z, 0)}px) `;
    if (s.rotX) out += `rotateX(${s.rotX}deg) `;
    if (s.rotY) out += `rotateY(${s.rotY}deg) `;
    if (s.rot) out += `rotate(${+s.rot.toFixed(4)}deg) `;
    if (s.skewX || s.skewY) out += `skew(${num(s.skewX, 0)}deg,${num(s.skewY, 0)}deg) `;
    const sc = num(s.scale, 1);
    const sx = sc * num(s.sx, 1), sy = sc * num(s.sy, 1);
    if (sx !== 1 || sy !== 1) out += `scale(${+sx.toFixed(5)},${+sy.toFixed(5)})`;
    return out.trim() || 'none';
  }
  /** set(el, {x,y,scale,rot,opacity,blur,bright,glow,clip,...any css prop or --var}) */
  function set(el, s) {
    if (!el) return el;
    if (Array.isArray(el) || el instanceof NodeList) { for (const e of el) set(e, s); return el; }
    const st = el.style;
    let hasTf = false;
    for (const k of TF_KEYS) if (s[k] != null) { hasTf = true; break; }
    if (hasTf) st.transform = transform(s);
    let filter = null;
    for (const k in s) {
      const v = s[k];
      if (TF_KEYS.includes(k)) continue;
      switch (k) {
        case 'opacity': st.opacity = +clamp(v).toFixed(4); break;
        case 'blur': filter = (filter ?? '') + (v > 0.01 ? `blur(${+v.toFixed(2)}px) ` : ''); break;
        case 'bright': filter = (filter ?? '') + `brightness(${v}) `; break;
        case 'sat': filter = (filter ?? '') + `saturate(${v}) `; break;
        case 'hue': filter = (filter ?? '') + `hue-rotate(${v}deg) `; break;
        case 'glow': { const g = Array.isArray(v) ? v : [v, 'rgba(255,214,120,0.9)']; filter = (filter ?? '') + (g[0] > 0.01 ? `drop-shadow(0 0 ${+g[0].toFixed(2)}px ${g[1]}) ` : ''); break; }
        case 'origin': st.transformOrigin = v; break;
        case 'clip': st.clipPath = v; st.webkitClipPath = v; break;
        case 'mask': st.maskImage = v; st.webkitMaskImage = v; break;
        case 'show': st.visibility = v ? 'visible' : 'hidden'; break;
        default:
          if (k.startsWith('--')) st.setProperty(k, v);
          else st[k] = typeof v === 'number' && PX_PROPS.has(k) ? v + 'px' : v;
      }
    }
    if (filter !== null) st.filter = filter.trim() || 'none';
    return el;
  }
  const PX_PROPS = new Set(['left', 'top', 'right', 'bottom', 'width', 'height', 'fontSize', 'letterSpacing', 'borderRadius']);

  /* ---------------------------------------------------------------- timeline */
  /** Declarative per-scene timeline. tl.to(el, start, dur, {from:{}, to:{}, ease}) then tl.seek(localT).
   *  Several segments may animate the same property: the latest started segment wins, earlier ones
   *  hold their end value; before the first segment the property sits at that segment's `from`.
   *  Elements also accept a static `base` state merged under the animated one. */
  function timeline() {
    const targets = new Map(); // el -> {base, props: Map(prop -> [segments])}
    const calls = [];
    const api = {
      base(el, state) { entry(el).base = Object.assign(entry(el).base, state); return api; },
      to(el, start, dur, o) {
        const els = Array.isArray(el) || el instanceof NodeList ? [...el] : [el];
        els.forEach((e, i) => {
          const delay = o.stagger ? (typeof o.stagger === 'number' ? i * o.stagger : stagger(i, els.length, o.stagger)) : 0;
          const en = entry(e);
          const from = typeof o.from === 'function' ? o.from(i, e) : o.from || {};
          const to = typeof o.to === 'function' ? o.to(i, e) : o.to || {};
          for (const k of new Set([...Object.keys(from), ...Object.keys(to)])) {
            if (!en.props.has(k)) en.props.set(k, []);
            const fv = k in from ? from[k] : en.base[k] ?? defaultOf(k);
            en.props.get(k).push({ start: start + delay, dur, from: fv, to: k in to ? to[k] : fv, ease: resolveEase(o.ease || 'silk') });
          }
        });
        return api;
      },
      /** sugar: fade+rise in */
      enter(el, start, dur = 0.9, o = {}) { return api.to(el, start, dur, { from: Object.assign({ opacity: 0, y: o.dy ?? 40, blur: o.blur ?? 0 }, o.from), to: Object.assign({ opacity: 1, y: 0, blur: 0 }, o.to), ease: o.ease || 'silk', stagger: o.stagger }); },
      exit(el, start, dur = 0.6, o = {}) { return api.to(el, start, dur, { from: Object.assign({ opacity: 1 }, o.from), to: Object.assign({ opacity: 0, y: -(o.dy ?? 20) }, o.to), ease: o.ease || 'inCubic', stagger: o.stagger }); },
      /** arbitrary callback each seek: fn(t) (draw-on, particles, custom maths) */
      call(fn) { calls.push(fn); return api; },
      seek(t) {
        for (const [el, en] of targets) {
          const state = Object.assign({}, en.base);
          for (const [k, segs] of en.props) {
            let v = segs[0].from, best = -Infinity;
            for (const s of segs) {
              if (t >= s.start && s.start >= best) { best = s.start; v = interp(s.from, s.to, s.ease(clamp((t - s.start) / (s.dur || 1e-9)))); }
            }
            state[k] = v;
          }
          set(el, state);
        }
        for (const fn of calls) fn(t);
      },
    };
    function entry(el) { if (!targets.has(el)) targets.set(el, { base: {}, props: new Map() }); return targets.get(el); }
    return api;
  }
  function defaultOf(k) { return { opacity: 1, scale: 1, sx: 1, sy: 1, blur: 0, glow: 0, bright: 1 }[k] ?? 0; }

  /* ------------------------------------------------------- path draw-on, masks */
  /** draw(pathOrSvg, p, {stagger: 0..1 overlap, reverse}) — stroke-dashoffset draw-on of one path or every path/line/circle in a group */
  function draw(target, p, o = {}) {
    const list = target.getTotalLength ? [target] : [...target.querySelectorAll('path,line,polyline,polygon,circle,ellipse,rect')];
    const n = list.length, ov = o.stagger ?? 0.6;
    list.forEach((el, i) => {
      let len = el.__len;
      if (len == null) { len = el.__len = Math.ceil(el.getTotalLength ? el.getTotalLength() : 1000) + 2; el.style.strokeDasharray = `${len} ${len}`; }
      let q = p;
      if (n > 1) { const span = 1 / (1 + (n - 1) * (1 - ov)); const st = i * (1 - ov) * span; q = clamp((p - st) / span); }
      el.style.strokeDashoffset = String(len * (o.reverse ? q - 1 : 1 - q));
    });
  }
  /** reveal(el, p, mode, opts): wipes and irises via clip-path; 'soft-*' via gradient masks.
   *  modes: left,right,up,down (wipe toward), circle, diamond, arch, center-x, center-y, soft-up, soft-down, soft-left, soft-right, soft-radial */
  function reveal(el, p, mode = 'up', o = {}) {
    const q = clamp(p) * 100, r = 100 - q;
    const cx = o.cx ?? 50, cy = o.cy ?? 50;
    let clip = null, mask = null;
    switch (mode) {
      case 'right': clip = `inset(0 ${r}% 0 0)`; break;
      case 'left': clip = `inset(0 0 0 ${r}%)`; break;
      case 'down': clip = `inset(0 0 ${r}% 0)`; break;
      case 'up': clip = `inset(${r}% 0 0 0)`; break;
      case 'center-x': clip = `inset(0 ${r / 2}% 0 ${r / 2}%)`; break;
      case 'center-y': clip = `inset(${r / 2}% 0 ${r / 2}% 0)`; break;
      case 'circle': clip = `circle(${q * (o.max ?? 0.75)}% at ${cx}% ${cy}%)`; break;
      case 'diamond': { const d = q * 1.0; clip = `polygon(${cx}% ${cy - d}%, ${cx + d}% ${cy}%, ${cx}% ${cy + d}%, ${cx - d}% ${cy}%)`; break; }
      case 'arch': clip = `ellipse(${q * 0.62}% ${q * 1.15}% at 50% 100%)`; break;
      case 'soft-up': mask = softMask('to top', p, o.feather); break;
      case 'soft-down': mask = softMask('to bottom', p, o.feather); break;
      case 'soft-right': mask = softMask('to right', p, o.feather); break;
      case 'soft-left': mask = softMask('to left', p, o.feather); break;
      case 'soft-radial': { const f = o.feather ?? 12, R = q * 1.2; mask = `radial-gradient(circle at ${cx}% ${cy}%, #000 ${Math.max(0, R - f)}%, transparent ${R}%)`; break; }
      default: throw new Error('reveal mode ' + mode);
    }
    if (p >= 1 && !o.keep) { clip = 'none'; mask = 'none'; }
    if (clip !== null) { el.style.clipPath = clip; el.style.webkitClipPath = clip; }
    if (mask !== null) { el.style.maskImage = mask; el.style.webkitMaskImage = mask; }
  }
  function softMask(dir, p, feather = 15) { const e = lerp(-feather, 100, clamp(p)); return `linear-gradient(${dir}, #000 ${e}%, transparent ${e + feather}%)`; }

  /* ----------------------------------------------------------------- shimmer */
  /** shimmerText(el, {base, hi}) styles text with a gold gradient; shimmer(el, t, {period, delay}) sweeps a highlight band across it */
  function shimmerText(el, o = {}) {
    const base = o.base || '#b8862b', hi = o.hi || '#fff4c8', mid = o.mid || '#e3b85a';
    Object.assign(el.style, {
      backgroundImage: `linear-gradient(105deg, ${base} 0%, ${mid} 38%, ${hi} 48%, ${mid} 58%, ${base} 100%)`,
      backgroundSize: '300% 100%', webkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', webkitTextFillColor: 'transparent',
    });
    return el;
  }
  function shimmer(el, t, o = {}) {
    const period = o.period ?? 3, dur = o.dur ?? 1.2;
    const ph = ((t - (o.delay ?? 0)) % period + period) % period;
    const p = clamp(ph / dur);
    el.style.backgroundPosition = `${lerp(100, 0, ease.inOutSine(p))}% 0`;
  }
  /** sheen overlay for any element (images too): returns an overlay div; call sheen.seek(t) */
  function sheen(parent, o = {}) {
    const ov = h('div', { class: 'sheen', style: { position: 'absolute', inset: '0', pointerEvents: 'none', mixBlendMode: o.blend || 'screen', backgroundImage: `linear-gradient(${o.angle ?? 110}deg, transparent 35%, ${o.color || 'rgba(255,240,200,0.55)'} 50%, transparent 65%)`, backgroundSize: '250% 100%', backgroundRepeat: 'no-repeat' } });
    if (o.maskSrc) { ov.style.maskImage = ov.style.webkitMaskImage = `url(${o.maskSrc})`; ov.style.maskSize = ov.style.webkitMaskSize = '100% 100%'; }
    parent.append(ov);
    ov.seek = (t) => { const period = o.period ?? 4, dur = o.dur ?? 1.6; const ph = ((t - (o.delay ?? 0)) % period + period) % period; ov.style.backgroundPosition = `${lerp(130, -30, ease.inOutSine(clamp(ph / dur)))}% 0`; };
    return ov;
  }

  /* ---------------------------------------------------------------- particles */
  /** Particle system with closed-form motion (seek to any t, no integration, so chunks match).
   *  particles(parent, {
   *    count, seed, W, H, start=0, life: [a,b] seconds, loop: true (respawn each life; new seeded x per cycle
 *    unless respawnX:false; xRange:[a,b] limits it), prewarm: true (field already full at start),
   *    spawn(r, i) -> {x, y, vx, vy, ax, ay, size, rot, vr, sway, swayF, alpha, sprite, hue, ...any},
   *    draw(g, p, age, life, t)  // canvas 2D draw at origin of particle (already translated/rotated), optional
   *    sprites: [urls] -> preloaded images available as p.img (sprite index p.sprite)
   *    fade: [in, out] seconds, blend: 'lighter' etc
   *  }) -> {canvas, seek(t)} */
  function particles(parent, o) {
    const cw = o.W ?? W, chh = o.H ?? H;
    const cv = h('canvas', { width: cw, height: chh, class: 'particles', style: { position: 'absolute', left: (o.left ?? 0) + 'px', top: (o.top ?? 0) + 'px', width: cw + 'px', height: chh + 'px', pointerEvents: 'none' } });
    parent.append(cv);
    const g = cv.getContext('2d');
    const imgs = [];
    (o.sprites || []).forEach((u, i) => preload(u).then((im) => (imgs[i] = im)));
    const r = rng(o.seed ?? 1);
    const count = o.count ?? 60;
    const life = o.life ?? [4, 7];
    const ps = [];
    for (let i = 0; i < count; i++) {
      const L = Array.isArray(life) ? r.range(life[0], life[1]) : life;
      const base = Object.assign({ x: r() * cw, y: r() * chh, vx: 0, vy: 0, ax: 0, ay: 0, size: 10, rot: 0, vr: 0, sway: 0, swayF: 0.5, phase: r() * 10, alpha: 1, sprite: 0 }, o.spawn ? o.spawn(r, i) : {});
      // born offset spreads respawns; negative so the field is already populated at start when prewarm
      base.life = L; base.born = (o.start ?? 0) + (o.prewarm === false ? r() * L : -r() * L) + (base.delay ?? 0);
      base.seedI = i;
      ps.push(base);
    }
    const fade = o.fade ?? [0.6, 0.8];
    const sys = {
      canvas: cv, list: ps,
      seek(t) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, cw, chh);
        if (o.blend) g.globalCompositeOperation = o.blend;
        const gain = o.opacity ? (typeof o.opacity === 'function' ? o.opacity(t) : o.opacity) : 1;
        if (gain <= 0) return;
        for (const p of ps) {
          let age = t - p.born;
          if (age < 0) continue;
          let cycle = 0;
          if (o.loop !== false) { cycle = Math.floor(age / p.life); age -= cycle * p.life; } else if (age > p.life) continue;
          // each respawn cycle gets its own deterministic jitter
          let x0 = p.x;
          if (cycle && o.respawnX !== false) { const hh = hash1(p.seedI * 131 + cycle, o.seed ?? 1); x0 = o.xRange ? lerp(o.xRange[0], o.xRange[1], hh) : hh * cw; }
          const x = x0 + p.vx * age + 0.5 * p.ax * age * age + Math.sin((age * p.swayF + p.phase) * 2 * PI) * p.sway;
          const y = p.y + p.vy * age + 0.5 * p.ay * age * age;
          const a = p.alpha * gain * Math.min(clamp(age / (fade[0] || 1e-9)), clamp((p.life - age) / (fade[1] || 1e-9)));
          if (a <= 0.002) continue;
          g.globalAlpha = a;
          g.setTransform(1, 0, 0, 1, x, y);
          if (p.rot || p.vr) g.rotate(((p.rot + p.vr * age) * PI) / 180);
          if (p.flip) g.scale(1, Math.cos((age * (p.flipF ?? 1) + p.phase) * 2 * PI));
          if (o.draw) o.draw(g, p, age, t, imgs);
          else if (imgs[p.sprite]) { const im = imgs[p.sprite]; const s = p.size, k = s / Math.max(im.width, im.height); g.drawImage(im, (-im.width * k) / 2, (-im.height * k) / 2, im.width * k, im.height * k); }
          else { g.fillStyle = p.color || '#ffd56b'; g.beginPath(); g.arc(0, 0, p.size / 2, 0, 2 * PI); g.fill(); }
        }
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      },
    };
    return sys;
  }
  /** built-in canvas drawers for particles */
  const drawers = {
    sparkle(g, p, age) { const s = p.size * (0.6 + 0.4 * Math.sin((age * (p.tw ?? 3) + p.phase) * 2 * PI)); const c = p.color || '255,226,150'; const gr = g.createRadialGradient(0, 0, 0, 0, 0, s); gr.addColorStop(0, `rgba(255,255,245,1)`); gr.addColorStop(0.25, `rgba(${c},0.85)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, s, 0, 2 * PI); g.fill(); g.fillStyle = `rgba(255,255,240,0.9)`; g.fillRect(-s * 1.4, -0.6, s * 2.8, 1.2); g.fillRect(-0.6, -s * 1.4, 1.2, s * 2.8); },
    petal(g, p) { const s = p.size; g.fillStyle = p.color || '#f29c1f'; g.beginPath(); g.ellipse(0, 0, s * 0.5, s * 0.28, 0, 0, 2 * PI); g.fill(); g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(-s * 0.1, -s * 0.05, s * 0.25, s * 0.1, 0, 0, 2 * PI); g.fill(); },
    dot(g, p) { g.fillStyle = p.color || '#fff'; g.beginPath(); g.arc(0, 0, p.size / 2, 0, 2 * PI); g.fill(); },
    bokeh(g, p) { const s = p.size; const c = p.color || '255,210,140'; const gr = g.createRadialGradient(0, 0, s * 0.2, 0, 0, s); gr.addColorStop(0, `rgba(${c},0.35)`); gr.addColorStop(0.8, `rgba(${c},0.18)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, s, 0, 2 * PI); g.fill(); },
  };

  /* ----------------------------------------------------------- camera/parallax */
  /** camera(el, {x, y, zoom, rot, ox, oy}) — push/pan the whole scene; origin defaults to centre */
  function camera(el, c) { el.style.transformOrigin = `${c.ox ?? 50}% ${c.oy ?? 50}%`; el.style.transform = `translate3d(${-(c.x ?? 0)}px,${-(c.y ?? 0)}px,0) rotate(${c.rot ?? 0}deg) scale(${c.zoom ?? 1})`; }
  /** parallax([{el, depth}], cam) — depth 0 = fixed backdrop, 1 = moves with camera, >1 = foreground */
  function parallax(layers, c) {
    for (const L of layers) {
      const d = L.depth ?? 1, z = 1 + ((c.zoom ?? 1) - 1) * d;
      L.el.style.transformOrigin = `${c.ox ?? 50}% ${c.oy ?? 50}%`;
      L.el.style.transform = `translate3d(${+(-(c.x ?? 0) * d).toFixed(2)}px,${+(-(c.y ?? 0) * d).toFixed(2)}px,0) scale(${+z.toFixed(5)})`;
    }
  }

  /* -------------------------------------------------------------------- text */
  /** split text into spans for per-word/per-grapheme animation. For Devanagari/Bengali use 'word'
   *  (splitting inside a word breaks conjunct shaping). Returns the array of spans. */
  // word split on breaking white space only: U+00A0 / U+202F / U+2007 bind words (a "ব্লক\u00A0এইচ" stays one word span)
  const WS_BREAK = /([^\S\u00A0\u202F\u2007]+)/, WS_ONLY = /^[^\S\u00A0\u202F\u2007]+$/;
  function splitText(el, by = 'auto', text) {
    const s = text ?? el.textContent;
    el.textContent = '';
    const complex = /[ऀ-෿\u{11480}-\u{114DF}]/u.test(s);
    const mode = by === 'auto' ? (complex ? 'word' : 'grapheme') : by;
    if (mode === 'grapheme' && complex) console.warn('[E] grapheme split on Indic text breaks shaping; use word');
    const parts = [];
    if (mode === 'word') { for (const w of s.split(WS_BREAK)) { if (!w) continue; if (WS_ONLY.test(w)) { el.append(w); continue; } const sp = h('span', { class: 'w', text: w }); el.append(sp); parts.push(sp); } }
    else if (mode === 'line') { s.split('\n').forEach((ln, i) => { if (i) el.append(h('br')); const sp = h('span', { class: 'ln', text: ln }); el.append(sp); parts.push(sp); }); }
    else {
      const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      for (const { segment } of seg.segment(s)) { if (segment === ' ') { el.append(' '); continue; } if (segment === '\n') { el.append(h('br')); continue; } const sp = h('span', { class: 'ch', text: segment }); el.append(sp); parts.push(sp); }
    }
    for (const p of parts) p.style.display = 'inline-block';
    return parts;
  }
  /** script font stacks by language (CSS vars in base.css carry the same names) */
  const FONTS = {
    // v1 roles: script, display, body, deco[, mithila]. v2 painterly roles: hand (brush / hand-lettered title),
    // handSoft (lighter hand for subtitles), caps (classic Roman capitals), accent (restrained Latin script),
    // classic (classical text serif). Latin glyphs inside Indic stacks fall through to the same fonts' Latin subsets.
    en: { script: "'Pinyon Script', 'Great Vibes', cursive", display: "'Playfair Display', serif", body: "'Cormorant Garamond', serif", deco: "'Great Vibes', cursive",
      hand: "'Pinyon Script', 'Italianno', cursive", handSoft: "'Italianno', 'Pinyon Script', cursive", caps: "'Marcellus', 'Cormorant Garamond', serif", accent: "'Italianno', cursive", classic: "'Cormorant Garamond', serif" },
    hi: { script: "'Rozha One', 'Tiro Devanagari Hindi', serif", display: "'Tiro Devanagari Hindi', serif", body: "'Noto Serif Devanagari', serif", deco: "'Yatra One', serif",
      hand: "'Amita', 'Kalam', serif", handSoft: "'Kalam', 'Amita', serif", caps: "'Marcellus', serif", accent: "'Italianno', cursive", classic: "'Sahitya', 'Tiro Devanagari Hindi', serif" },
    mai: { script: "'Rozha One', 'Tiro Devanagari Hindi', serif", display: "'Tiro Devanagari Hindi', serif", body: "'Noto Serif Devanagari', serif", deco: "'Yatra One', serif", mithila: "'Noto Sans Tirhuta', sans-serif",
      hand: "'Amita', 'Kalam', serif", handSoft: "'Kalam', 'Amita', serif", caps: "'Marcellus', serif", accent: "'Italianno', cursive", classic: "'Sahitya', 'Tiro Devanagari Hindi', serif" },
    bn: { script: "'Galada', 'Tiro Bangla', serif", display: "'Tiro Bangla', serif", body: "'Noto Serif Bengali', serif", deco: "'Galada', serif",
      hand: "'Galada', 'Atma', serif", handSoft: "'Atma', 'Galada', serif", caps: "'Marcellus', serif", accent: "'Italianno', cursive", classic: "'Tiro Bangla', 'Noto Serif Bengali', serif" },
  };
  FONTS.mi = FONTS.mai;

  /* ------------------------------------------------------------------- scenes */
  const scenes = [];
  let stage = null, built = false, curT = 0;
  const ctx = {
    W, H, FPS, params,
    lang: params.get('lang') || 'en',
    order: (params.get('order') || 'G').toUpperCase(),
    seed: Number(params.get('seed') || 20261126),
    assets: params.get('assets') || '../assets/',
  };
  ctx.fonts = FONTS[ctx.lang] || FONTS.en;
  /** register(name, start, dur, build(root, ctx, scene), seek(lt, ctx, scene), opts)
   *  or register(name, start, dur, {build, seek, z, pre, post, keepAlive}).
   *  lt = t - start. Scene is visible for lt in [-pre, dur + post]. Higher z draws on top
   *  (default: registration order). scene.p(lt) = lt/dur clamped. */
  function register(name, start, dur, build, seekFn, opts = {}) {
    if (typeof build === 'object' && build) { opts = build; build = opts.build; seekFn = opts.seek; }
    const sc = { name, start, dur, build, seek: seekFn, pre: opts.pre ?? 0, post: opts.post ?? 0, z: opts.z ?? scenes.length, root: null, visible: null, opts };
    sc.end = start + dur;
    sc.p = (lt) => clamp(lt / dur);
    scenes.push(sc);
    if (built) { buildScene(sc); }
    return sc;
  }
  function buildScene(sc) {
    sc.root = h('div', { class: 'scene', 'data-scene': sc.name, style: { zIndex: String(sc.z) } });
    sc.root.style.visibility = 'hidden';
    stage.append(sc.root);
    const r = sc.build ? sc.build(sc.root, ctx, sc) : null;
    if (r && r.then) pending.push(r);
  }
  function duration() { const d = Number(params.get('dur')); if (d > 0) return d; return scenes.reduce((m, s) => Math.max(m, s.end + s.post), 0); }
  /** seek(t): THE clock. Sets every element for time t (seconds). Synchronous. */
  function seek(t) {
    curT = t;
    virtualNow = t * 1000;
    for (const sc of scenes) {
      const lt = t - sc.start;
      const on = sc.opts.keepAlive ? true : lt >= -sc.pre && lt <= sc.dur + sc.post;
      // display:none as well as visibility: a descendant with an explicit visibility:visible escapes a hidden root and
      // stayed painted after its scene ended (frames depended on seek history; QA1 text 1). Builds measure layout
      // under visibility:hidden only, before the first seek, so they are unaffected.
      if (on !== sc.visible) { sc.root.style.visibility = on ? 'visible' : 'hidden'; sc.root.style.display = on ? '' : 'none'; sc.visible = on; }
      if (on && sc.seek) sc.seek(lt, ctx, sc);
    }
    for (const fn of globalHooks) fn(t);
    return t;
  }
  const globalHooks = [];
  /** onSeek(fn): global per-frame hook (overlays spanning all scenes, e.g. a vignette or grain) */
  const onSeek = (fn) => globalHooks.push(fn);

  /** load classic scripts in order (scene files) */
  function loadScripts(urls) {
    return urls.reduce((pr, u) => pr.then(() => new Promise((res, rej) => { const s = document.createElement('script'); s.src = u; s.onload = res; s.onerror = () => rej(new Error('failed to load ' + u)); document.head.append(s); })), Promise.resolve());
  }
  /** fetch JSON relative to page (for strings/config) */
  const json = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });

  /** init(): build all registered scenes, load every font face + image, then seek(0). Resolves when frame-ready. */
  async function init() {
    stage = document.getElementById('stage') || document.body.appendChild(h('div', { id: 'stage' }));
    built = true;
    for (const sc of scenes) buildScene(sc);
    // load every declared font face (unicode-range subsets load lazily otherwise -> fallback glyphs in frames)
    const faces = [...document.fonts];
    await Promise.all(faces.map((f) => f.load().catch(() => console.warn('[E] font failed', f.family))));
    await document.fonts.ready;
    // wait for images, including ones added by async builds
    let n = -1;
    while (n !== pending.length) { n = pending.length; await Promise.all(pending.slice()); }
    seek(0);
    window.__ENGINE_READY = true;
    return { duration: duration(), scenes: scenes.map((s) => ({ name: s.name, start: s.start, dur: s.dur })) };
  }

  /* ------------------------------------------------------------ determinism */
  let virtualNow = 0;
  const seeded = rng(ctx.seed);
  Math.random = seeded; // any stray Math.random is reproducible
  performance.now = () => virtualNow;
  const RealDate = Date;
  const FIXED = new RealDate('2026-11-01T00:00:00Z').getTime();
  window.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(FIXED + virtualNow); } static now() { return FIXED + virtualNow; } };

  window.E = {
    W, H, FPS, ctx, params, FONTS,
    clamp, lerp, prog, mapRange, fract, smoothstep, ease, resolveEase, cubicBezier,
    rng, hash1, hashStr, noise, fbm, wave, loop,
    interp, mixColor, parseColor, tween, keyframes, stagger,
    h, svg, svgFrom, img, layer, preload, set, transform,
    timeline, draw, reveal, shimmerText, shimmer, sheen,
    particles, drawers, camera, parallax, splitText,
    register, seek, duration, init, onSeek, loadScripts, json,
    get t() { return curT; }, scenes,
  };
})();
