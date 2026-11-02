/* Motif helpers (browser). window.Motifs = { load, draw, prefix }.
 *   const svg = await Motifs.load(ctx.assets + 'motifs/lotus_open_line.svg', { prefix: 'm1' }); el.appendChild(svg);
 *   Motifs.draw(svg, p)               // p 0..1: brush draws on stroke by stroke, timed by stroke length
 *   Motifs.draw(svg, p, { mode: 'equal', overlap: 0.3, lift: 0.04, reverse: false })
 * Deterministic: pure function of p (fits E.seek). Works on _line.svg files (mask paths .m-draw). */
(function () {
  const cache = new Map();
  /** Rename every id (and its url(#..)/href references) so a motif can be inlined more than once per page. */
  function prefix(text, pre) {
    if (!pre) return text;
    const ids = [...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids.sort((a, b) => b.length - a.length)) {
      const esc = id.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      text = text.replace(new RegExp(`(id="|url\\(#|href="#)${esc}(?=["\\)])`, 'g'), `$1${pre}-${id}`);
    }
    return text;
  }
  async function load(url, o = {}) {
    if (!cache.has(url)) cache.set(url, fetch(url).then((r) => r.text()));
    const text = prefix(await cache.get(url), o.prefix);
    const host = document.createElement('div');
    host.innerHTML = text.replace(/^<\?xml[^>]*>/, '');
    const svg = host.querySelector('svg');
    if (o.width) svg.setAttribute('width', o.width);
    if (o.height) svg.setAttribute('height', o.height);
    return svg;
  }
  function prep(svg) {
    if (svg.__m) return svg.__m;
    const list = [...svg.querySelectorAll('.m-draw')];
    const lens = list.map((el) => Math.max(1, el.getTotalLength()) + 2);
    list.forEach((el, i) => { el.style.strokeDasharray = `${lens[i]} ${lens[i]}`; });
    return (svg.__m = { list, lens, total: lens.reduce((a, b) => a + b, 0) });
  }
  const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  function draw(svg, p, o = {}) {
    const { list, lens, total } = prep(svg);
    const n = list.length;
    if (!n) return;
    const lift = o.lift ?? 0.12; // pause between strokes (brush lifted), in units of an average stroke
    const mode = o.mode || 'length';
    // time slots
    const w = lens.map((l) => (mode === 'equal' ? 1 : 0.25 + 0.75 * (l / (total / n))));
    const ov = o.overlap ?? 0; // 0 = strictly one after another, 0.5 = half overlap
    const tot = w.reduce((a, b) => a + b, 0) * (1 - ov) + w[n - 1] * ov + lift * (n - 1) * (1 - ov);
    let t = 0;
    for (let i = 0; i < n; i++) {
      const s = t / tot, e = (t + w[i]) / tot;
      const q = clamp((p - s) / (e - s));
      const k = o.reverse ? n - 1 - i : i;
      list[k].style.strokeDashoffset = String(lens[k] * (1 - q));
      t += w[i] * (1 - ov) + lift * (1 - ov);
    }
  }
  window.Motifs = { load, draw, prefix };
})();
