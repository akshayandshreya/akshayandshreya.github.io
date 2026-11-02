// The reception=0 overlay, ported from WeddingInvite2 engine/cards/card.js (deepMerge + withoutReception) so the site
// produces exactly the reviewed four-event copy. content.json facts.reception_toggle: objects merge key by key, arrays
// and strings replace, a null value deletes the key; video.canvases are replaced as a whole.

/** Deep merge `b` over `a` (card.js deepMerge, byte-for-byte behaviour). */
export function deepMerge(a, b) {
  if (b === null || b === undefined) return b;
  if (Array.isArray(b) || typeof b !== 'object' || !a || typeof a !== 'object' || Array.isArray(a)) return b;
  const out = Object.assign({}, a);
  for (const [k, x] of Object.entries(b)) {
    if (x === null) delete out[k];
    else out[k] = deepMerge(a[k], x);
  }
  return out;
}

/** Apply `variant.without_reception` (card.js withoutReception). Throws when the overlay is missing. */
export function withoutReception(v) {
  const w = v.without_reception;
  if (!w) throw new Error(`reception=0: no without_reception overlay for ${v.variant_id}`);
  const out = Object.assign({}, v);
  for (const [k, x] of Object.entries(w)) {
    if (k === 'video' && x && Array.isArray(x.canvases)) out.video = Object.assign({}, v.video, x);
    else if (x === null) delete out[k];
    else out[k] = deepMerge(v[k], x);
  }
  delete out.without_reception;
  return out;
}

/** The variant for `reception` 1 (as stored, overlay removed) or 0 (overlay applied). */
export function resolveReception(v, reception) {
  if (reception) {
    const out = Object.assign({}, v);
    delete out.without_reception;
    return out;
  }
  return withoutReception(v);
}
