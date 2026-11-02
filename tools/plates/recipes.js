/* Plate recipes (SPEC 1.3): one painting per section, three frame shapes. Classic script, runs in the asset page
 * (tools/plates/plates.html) after vendor/engine.js and vendor/paint.js. Exposes window.RECIPES and window.FRAMES.
 *
 * Coordinates are fractions of the frame: x of width, y of height. `r` (circles, glows, vortices) is a fraction of
 * S = min(W, H), so a glow keeps its size whether the frame is a phone, a tablet or a desktop. Seeds and paint settings
 * are the card's (engine/cards/card.js), so the site paints the same family as the printed invitation. */
(function () {
  'use strict';
  const FRAMES = {
    tall: { W: 1080, H: 2340, widths: [540, 828, 1170] },
    mid: { W: 1080, H: 1350, widths: [768, 1152, 1536] },
    wide: { W: 1920, H: 1080, widths: [1280, 1920, 2560] },
  };

  // card.js BLUSH and TEAL (evening) palettes, rebuilt from paint.js PALETTES
  const BLUSH = () => Object.assign({}, P.palette('ivory'), {
    name: 'blush', paper: '#f3e6dc', ground: ['#f8eee6', '#eedbd0', '#dcc0ae'],
    strokes: ['#efdfd4', '#e8d3c6', '#f4e9e0', '#e2c9b9', '#ecdcd0', '#d9bfae'],
    lights: ['#fbf4ee', '#fdf8f3', '#f6ece4'], darks: ['#c4a08c', '#ad8670'], accent: '#a8814a',
    ink: '#5e2a24', inkAlt: '#7a1e24', petals: ['#e8c06a', '#f3dea8', '#f8f3e6', '#e2b4a6'], glaze: ['#f2d9cf', 0.14],
  });
  const TEAL = () => {
    const pal = P.palette('teal'), mixC = (a, c, k) => P.css(P.mix(a, c, k));
    return Object.assign({}, pal, { name: 'teal-evening', strokes: pal.strokes.map((c) => mixC(c, pal.ground[1], 0.3)), darks: ['#1b3a38', '#173533'], lights: pal.lights.map((c) => mixC(c, '#5d7f6f', 0.3)) });
  };
  const PAL = { ivory: () => P.palette('ivory'), blush: BLUSH, sage: () => P.palette('sage'), rose: () => P.palette('rose'), turmeric: () => P.palette('turmeric'), vermilion: () => P.palette('vermilion'), teal: TEAL };

  // event layouts: stacked (tall, mid) and two columns (wide), couple on the given side
  const eventZones = (side) => (frame) => {
    if (frame !== 'wide') {
      return {
        couple: [0.5, 0.47],
        calm: [{ x: 0.5, y: 0.13, rx: 0.44, ry: 0.07, k: 0.8 }, { x: 0.5, y: 0.47, rx: 0.36, ry: 0.2, k: 0.74 }, { x: 0.5, y: 0.82, rx: 0.46, ry: 0.1, k: 0.88 }],
        floor: 0.74, glow: { x: 0.5, y: 0.46, r: 0.76, k: 0.55 },
      };
    }
    const cx = side === 'left' ? 0.3 : 0.7, tx = 1 - cx;
    return {
      couple: [cx, 0.55],
      calm: [{ x: cx, y: 0.55, rx: 0.18, ry: 0.35, k: 0.7 }, { x: tx, y: 0.5, rx: 0.25, ry: 0.38, k: 0.88 }],
      floor: 0.86, glow: { x: cx, y: 0.5, r: 0.76, k: 0.55 },
    };
  };
  // the card's `under` glows, centred on the couple (card coordinates: couple centre 540,800 on a 1080 page, r in units of 1080)
  const at = (c, dx, dy) => [c[0] + dx, c[1] + dy];

  const RECIPES = {
    opening: {
      palette: 'ivory', style: 'halo', seed: 3611, density: 1, contrast: 1, gold: 1, goldLines: 2, flecks: 40, focal: '50% 30%', mood: 'light',
      zones: (f) => f === 'wide'
        ? { calm: [{ x: 0.5, y: 0.26, r: 0.28, k: 0.82 }, { x: 0.5, y: 0.66, rx: 0.3, ry: 0.3, k: 0.8 }], glow: { x: 0.5, y: 0.27, r: 0.57, k: 0.7 }, vortices: [{ x: 0.5, y: 0.26, r: 0.55, s: 1.2 }] }
        : { calm: [{ x: 0.5, y: 0.24, r: 0.28, k: 0.82 }, { x: 0.5, y: 0.6, rx: 0.44, ry: 0.3, k: 0.8 }], glow: { x: 0.5, y: 0.25, r: 0.57, k: 0.7 }, vortices: [{ x: 0.5, y: 0.24, r: 0.55, s: 1.2 }] },
    },
    invitation: {
      palette: 'blush', style: 'veil', seed: 3621, density: 0.8, contrast: 0.66, gold: 0.7, goldLines: 0, flecks: 30, hue: ['#ead2c6', 0.55], focal: '50% 50%', mood: 'light',
      zones: (f) => ({ calm: [f === 'wide' ? { x: 0.5, y: 0.52, rx: 0.34, ry: 0.4, k: 0.88 } : { x: 0.5, y: 0.52, rx: 0.48, ry: 0.34, k: 0.88 }] }),
    },
    mehndi: { palette: 'sage', style: 'swirl', seed: 3631, density: 0.75, contrast: 0.75, gold: 0.5, goldLines: 0, flecks: 26, focal: '50% 45%', mood: 'light', zones: eventZones('left') },
    engagement: { palette: 'rose', style: 'swirl', seed: 3641, density: 0.7, contrast: 0.55, gold: 0.5, goldLines: 0, flecks: 26, focal: '50% 45%', mood: 'light', zones: eventZones('right') },
    haldi: {
      palette: 'turmeric', style: 'veil', seed: 3651, density: 0.85, contrast: 0.85, gold: 0.5, goldLines: 0, flecks: 30, focal: '50% 45%', mood: 'light', zones: eventZones('left'),
      // sun glows to the upper right of the couple (card: soft-light #eea23a at 780,330 r1100; screen #ffe7ad at 840,250 r560; #fff4d8 on the couple)
      under: (c) => [
        { at: [Math.min(0.92, c[0] + 0.22), 0.17], r: 1.02, color: '#eea23a', alpha: 0.3, blend: 'soft-light' },
        { at: [Math.min(0.95, c[0] + 0.28), 0.13], r: 0.52, color: '#ffe7ad', alpha: 0.5, blend: 'screen' },
        { at: c, r: 0.44, color: '#fff4d8', alpha: 0.38, blend: 'screen' },
      ],
    },
    wedding: {
      palette: 'vermilion', style: 'swirl', seed: 3661, density: 0.8, contrast: 0.75, gold: 0.5, goldLines: 2, flecks: 40, focal: '50% 45%', mood: 'deep', zones: eventZones('right'),
      under: (c) => [{ at: c, r: 0.43, color: '#fbdcc4', alpha: 0.26, blend: 'screen' }],
    },
    reception: {
      palette: 'teal', style: 'veil', seed: 3761, density: 0.66, contrast: 0.44, gold: 0.5, goldLines: 0, flecks: 26, focal: '50% 45%', mood: 'deep', zones: eventZones('left'),
      under: (c) => [{ at: c, r: 0.48, color: '#f0d29a', alpha: 0.34, blend: 'soft-light' }, { at: at(c, 0, 0.012), r: 0.37, color: '#d9b77e', alpha: 0.1, blend: 'screen' }],
    },
    cultures: {
      palette: 'ivory', style: 'halo', seed: 3791, density: 0.6, contrast: 0.5, gold: 0.6, goldLines: 1, flecks: 20, focal: '50% 50%', mood: 'light',
      zones: (f) => ({
        glow: { x: 0.5, y: 0.5, r: 0.7, k: 0.5 },
        calm: f === 'wide' ? [{ x: 0.28, y: 0.5, rx: 0.22, ry: 0.36, k: 0.85 }, { x: 0.72, y: 0.5, rx: 0.22, ry: 0.36, k: 0.85 }]
          : [{ x: 0.5, y: 0.3, rx: 0.42, ry: 0.2, k: 0.85 }, { x: 0.5, y: 0.72, rx: 0.42, ry: 0.2, k: 0.85 }],
      }),
    },
    closing: {
      palette: 'ivory', style: 'halo', seed: 3681, density: 1, contrast: 1, gold: 1, goldLines: 1, flecks: 50, focal: '50% 70%', mood: 'light',
      zones: (f) => f === 'wide'
        ? { calm: [{ x: 0.5, y: 0.42, rx: 0.3, ry: 0.34, k: 0.92 }, { x: 0.5, y: 0.86, rx: 0.14, ry: 0.1, k: 0.7 }], glow: { x: 0.5, y: 0.86, r: 0.5, k: 0.7 } }
        : { calm: [{ x: 0.5, y: 0.42, rx: 0.46, ry: 0.3, k: 0.92 }, { x: 0.5, y: 0.86, rx: 0.24, ry: 0.08, k: 0.7 }], glow: { x: 0.5, y: 0.86, r: 0.5, k: 0.7 } },
    },
  };
  // the light sweep / glow pulse / veil hints the site reads from plates.json
  for (const [id, R] of Object.entries(RECIPES)) R.id = id;
  window.RECIPES = RECIPES;
  window.FRAMES = FRAMES;
  window.PAL = PAL;
})();
