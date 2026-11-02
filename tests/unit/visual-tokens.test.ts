// The visual system as tokens (spec 1.2, 1.2.1, 1.5, 1.6, 1.8, 3.2): the CSS files hold exactly the spec's values, and
// every text colour meets WCAG AA on its paper and on the mid ground of its plate.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MOTION } from '../../src/lib/motion';

const css = (f: string) =>
  readFileSync(resolve(__dirname, '../../src/styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const TOKENS = css('tokens.css');
const PALETTES = css('palettes.css');
const TYPO = css('typography.css');
const BASE = css('base.css');

/** custom properties declared in the first rule whose selector list matches `selector` exactly */
function vars(src: string, selector: string): Record<string, string> {
  const rules = [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const out: Record<string, string> = {};
  for (const m of rules) {
    const sel = (m[1] ?? '').trim().replace(/\s+/g, ' ');
    if (sel !== selector) continue;
    for (const d of (m[2] ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1] as string] = (d[2] as string).trim();
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------ WCAG 2.x */
const rgb = (h: string): [number, number, number] => {
  const x = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)) as [number, number, number];
};
const lum = (c: [number, number, number]) =>
  c
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0);
const ratio = (a: string | [number, number, number], b: string) => {
  const la = lum(typeof a === 'string' ? rgb(a) : a);
  const lb = lum(rgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const mix = (a: string, b: string, p: number): [number, number, number] =>
  rgb(a).map((v, i) => v + (rgb(b)[i]! - v) * p) as [number, number, number];

/* --------------------------------------------------------------------------------------------- spec table 1.2 */
type Row = {
  paper: string;
  ground: [string, string, string];
  ink: string;
  soft: string;
  goldInk: string;
  sep: string;
  gold: [string, string, string, string];
  deep?: true;
};
const SPEC: Record<string, Row> = {
  ivory: {
    paper: '#f2e8d8',
    ground: ['#f7f0e4', '#ebdcc3', '#d9c3a0'],
    ink: '#6f4f22',
    soft: '#785d33',
    goldInk: '#7e5a22',
    sep: '#bf9644',
    gold: ['#8c6526', '#bf9644', '#e6cb86', '#fff3d1'],
  },
  blush: {
    paper: '#f3e6dc',
    ground: ['#f8eee6', '#eedbd0', '#dcc0ae'],
    ink: '#5e2a24',
    soft: '#6e3d33',
    goldInk: '#7e5a22',
    sep: '#bf9644',
    gold: ['#8c6526', '#bf9644', '#e6cb86', '#fff3d1'],
  },
  sage: {
    paper: '#e3e7d4',
    ground: ['#eef0e1', '#cdd6b8', '#a7b78c'],
    ink: '#3f5233',
    soft: '#495c3c',
    goldInk: '#715623',
    sep: '#b9984a',
    gold: ['#86662a', '#b9984a', '#e1cc8c', '#fbf1cf'],
  },
  rose: {
    paper: '#eee0df',
    ground: ['#f6ecea', '#e3c8cc', '#c9a8b9'],
    ink: '#5a3553',
    soft: '#6a4563',
    goldInk: '#6e542a',
    sep: '#bd9a57',
    gold: ['#8a6a35', '#bd9a57', '#e5cf98', '#fff4dc'],
  },
  turmeric: {
    paper: '#f2deaa',
    ground: ['#f8ebc6', '#eccb78', '#d9a547'],
    ink: '#8a2c18',
    soft: '#7d3a1e',
    goldInk: '#724e19',
    sep: '#a3341f',
    gold: ['#8f6220', '#c4952f', '#ecd07e', '#fff3c9'],
  },
  vermilion: {
    paper: '#a02024',
    ground: ['#b8352c', '#9a1e23', '#741320'],
    ink: '#f7ead0',
    soft: '#f0dcc0',
    goldInk: '#f0d88e',
    sep: '#e2b15a',
    gold: ['#9a6a24', '#d1a24a', '#f0d88e', '#fff6d6'],
    deep: true,
  },
  teal: {
    paper: '#21484a',
    ground: ['#2e5a59', '#21484a', '#153537'],
    ink: '#f3e7c6',
    soft: '#e6dbbc',
    goldInk: '#e8cf8a',
    sep: '#d8b468',
    gold: ['#8f6c2f', '#c9a457', '#ecd593', '#fff6d8'],
    deep: true,
  },
};
const LIGHT_SELECTOR = '.pal-ivory, .pal-blush, .pal-sage, .pal-rose, .pal-turmeric';
const DEEP_SELECTOR = '.pal-vermilion, .pal-teal';

describe('palettes (spec 1.2)', () => {
  for (const [name, row] of Object.entries(SPEC)) {
    const v = vars(PALETTES, `.pal-${name}`);
    it(`.pal-${name} holds the spec values`, () => {
      expect(v['--paper']).toBe(row.paper);
      expect([v['--ground-1'], v['--ground-2'], v['--ground-3']]).toEqual(row.ground);
      expect(v['--ink']).toBe(row.ink);
      expect(v['--ink-soft']).toBe(row.soft);
      expect(v['--gold-ink']).toBe(row.goldInk);
      expect(v['--sep']).toBe(row.sep);
      expect([v['--gold-0'], v['--gold-1'], v['--gold-2'], v['--gold-3']]).toEqual(row.gold);
      expect(v['--m-ink']).toMatch(/^#[0-9a-f]{6}$/);
    });
    it(`.pal-${name}: text colours meet AA on the paper and on the mid ground (1.2.1)`, () => {
      for (const ink of [row.ink, row.soft, row.goldInk]) {
        expect(ratio(ink, row.paper)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(ink, row.ground[1])).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('every mood rule derives the shared variables', () => {
    const need = [
      '--rule',
      '--deep',
      '--glaze',
      '--glaze-75',
      '--gl-0',
      '--gl-1',
      '--gl-2',
      '--gl-glint',
      '--bar-ink',
      '--btn-bg',
      '--btn-border',
      '--focus-ink',
      '--sweep-color',
      '--sweep-blend',
      '--mood',
    ];
    for (const sel of [LIGHT_SELECTOR, DEEP_SELECTOR]) {
      const v = vars(PALETTES, sel);
      for (const k of need) expect(v[k], `${sel} ${k}`).toBeTruthy();
    }
    const light = vars(PALETTES, LIGHT_SELECTOR);
    expect(light['--halo']).toContain('var(--paper) 80%');
    expect(light['--halo2']).toContain('var(--paper) 55%');
    expect(vars(PALETTES, '.pal-vermilion')['--halo']).toBe('rgba(104, 14, 24, 0.55)');
    expect(vars(PALETTES, '.pal-teal')['--halo2']).toBe('rgba(12, 36, 38, 0.42)');
  });

  it('gold-leaf text body stays >= 3:1 on its paper (1.2.1, display sizes)', () => {
    const light = vars(PALETTES, LIGHT_SELECTOR);
    const stops = [light['--gl-0'], light['--gl-1'], light['--gl-2']] as string[];
    expect(stops).toEqual(['#7e5a22', '#8c6526', '#9a7232']);
    for (const [name, row] of Object.entries(SPEC)) {
      if (row.deep) continue;
      for (const s of stops) expect(ratio(s, row.paper), `${name} ${s}`).toBeGreaterThanOrEqual(3);
    }
    // deep: the body starts halfway between gold-1 and gold-2
    expect(vars(PALETTES, DEEP_SELECTOR)['--gl-0']).toBe('color-mix(in srgb, var(--gold-1) 50%, var(--gold-2))');
    for (const name of ['vermilion', 'teal']) {
      const row = SPEC[name]!;
      const body = mix(row.gold[1], row.gold[2], 0.5);
      expect(ratio(body, row.paper)).toBeGreaterThanOrEqual(3);
      expect(ratio(body, row.ground[0])).toBeGreaterThanOrEqual(3);
      expect(ratio(row.gold[2], row.paper)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('motif tints follow 1.7', () => {
    expect(vars(PALETTES, '.pal-sage')).toMatchObject({
      '--m-ink': '#4f5b3c',
      '--m-marigold': '#d39a4f',
      '--m-leaf': '#8b9a6b',
      '--m-thread': '#9a5a40',
    });
    expect(vars(PALETTES, '.pal-rose')).toMatchObject({
      '--m-ink': '#5e3a4a',
      '--m-petal': '#c9a2b4',
      '--m-marigold': '#cf9d92',
      '--m-thread': '#9b6a7e',
    });
    expect(vars(PALETTES, '.pal-turmeric')).toMatchObject({
      '--m-ink': '#7a4a1c',
      '--m-gold': '#c99a3a',
      '--m-leaf': '#b0a465',
    });
    expect(vars(PALETTES, '.pal-vermilion')).toMatchObject({
      '--m-ink': '#6e231e',
      '--m-gold': '#d1a24a',
      '--m-red': '#c0473a',
      '--m-thread': '#e2b15a',
    });
    expect(vars(PALETTES, '.pal-teal')).toMatchObject({
      '--m-petal': '#dfbca4',
      '--m-leaf': '#6f8f80',
      '--m-gold-line': '#d8b468',
      '--m-rice': '#efe6d2',
    });
    expect(vars(PALETTES, '.pal-ivory')).toMatchObject({
      '--m-ink': '#a07a34',
      '--m-mithila': '#7a2e22',
      '--m-bengal': '#7a3326',
      '--m-lotus': '#a07a34',
    });
  });
});

/* ------------------------------------------------------------------------------------------- typography 1.5 */
// role -> [en, hi/mai, bn] font-size clamps, from the spec's role table
const FS: Record<string, [string, string, string]> = {
  hero: [
    'clamp(64px, min(15vw, 11svh), 132px)',
    'clamp(52px, min(12.5vw, 9.5svh), 112px)',
    'clamp(56px, min(13.5vw, 10svh), 120px)',
  ],
  names: [
    'clamp(44px, min(11.5vw, 8svh), 96px)',
    'clamp(38px, min(9.6vw, 7svh), 80px)',
    'clamp(40px, min(10.2vw, 7.3svh), 84px)',
  ],
  pair: ['clamp(30px, 7vw, 52px)', 'clamp(26px, 6vw, 44px)', 'clamp(27px, 6.3vw, 46px)'],
  title: [
    'clamp(56px, min(14vw, 10svh), 120px)',
    'clamp(46px, min(11.5vw, 8.3svh), 100px)',
    'clamp(48px, min(12vw, 8.6svh), 104px)',
  ],
  close: ['clamp(40px, 9.5vw, 84px)', 'clamp(32px, 8vw, 68px)', 'clamp(34px, 8.6vw, 72px)'],
  kicker: ['clamp(12.5px, 3vw, 16px)', 'clamp(17px, 4.2vw, 22px)', 'clamp(16px, 4vw, 21px)'],
  dateline: ['clamp(13px, 3vw, 17px)', 'clamp(16px, 3.8vw, 20px)', 'clamp(16px, 3.8vw, 20px)'],
  blessing: ['clamp(18px, 4.3vw, 26px)', 'clamp(16px, 3.8vw, 22px)', 'clamp(16px, 3.8vw, 22px)'],
  host: ['clamp(17px, 3.9vw, 24px)', 'clamp(16px, 3.6vw, 21px)', 'clamp(16px, 3.6vw, 21px)'],
  honor: ['clamp(14px, 3.2vw, 18px)', 'clamp(14px, 3.2vw, 18px)', 'clamp(14px, 3.2vw, 18px)'],
  tagline: ['clamp(18px, 4.4vw, 27px)', 'clamp(16px, 3.9vw, 22px)', 'clamp(16px, 3.9vw, 22px)'],
  when: ['clamp(14px, 3.3vw, 19px)', 'clamp(17px, 4.1vw, 23px)', 'clamp(18px, 4.3vw, 24px)'],
  venue: ['clamp(19px, 4.5vw, 27px)', 'clamp(17px, 4.1vw, 23px)', 'clamp(17px, 4.1vw, 23px)'],
  addr: ['clamp(16px, 3.5vw, 20px)', 'clamp(15px, 3.2vw, 18px)', 'clamp(15px, 3.2vw, 18px)'],
  closeline: ['clamp(17px, 4vw, 24px)', 'clamp(16px, 3.6vw, 21px)', 'clamp(16px, 3.6vw, 21px)'],
  family: ['clamp(15px, 3.5vw, 20px)', 'clamp(18px, 4.2vw, 24px)', 'clamp(18px, 4.2vw, 24px)'],
  ui: ['14px', '16px', '16px'],
  'ui-nav': ['13px', '15px', '15px'],
  digits: ['clamp(40px, 11vw, 72px)', 'clamp(38px, 10vw, 68px)', 'clamp(38px, 10vw, 68px)'],
};

describe('typography per script (spec 1.5)', () => {
  const en = vars(TYPO, ':root');
  const deva = vars(TYPO, ":root:is([lang='hi'], [lang='mai'])");
  const beng = vars(TYPO, ":root[lang='bn']");
  const indic = vars(TYPO, ":root:is([lang='hi'], [lang='mai'], [lang='bn'])");

  it('every role has the spec size in every script', () => {
    for (const [role, [e, d, b]] of Object.entries(FS)) {
      expect(en[`--fs-${role}`], `en ${role}`).toBe(e);
      expect(deva[`--fs-${role}`], `hi/mai ${role}`).toBe(d);
      expect(beng[`--fs-${role}`], `bn ${role}`).toBe(b);
    }
    expect(en['--fs-mono']).toBe('clamp(44px, 11vw, 84px)');
  });

  it('uses the card fonts per script, with the metric-matched fallbacks second', () => {
    expect(en['--font-hand']).toMatch(/^'Pinyon Script'/);
    expect(en['--font-caps']).toMatch(/^'Marcellus', 'Marcellus Fallback'/);
    expect(en['--font-text']).toMatch(/^'Cormorant Garamond'/);
    expect(deva['--font-hand']).toMatch(/^'Amita', 'Amita Fallback'/);
    expect(deva['--font-text']).toMatch(/^'Sahitya', 'Sahitya Fallback'/);
    expect(deva['--font-venue']).toMatch(/^'Noto Serif Devanagari'/);
    expect(beng['--font-hand']).toMatch(/^'Atma', 'Atma Fallback'/);
    expect(beng['--font-text']).toMatch(/^'Tiro Bangla'/);
    expect(beng['--font-addr']).toMatch(/^'Noto Serif Bengali'/);
    // weights that exist as files: Atma 500, Tiro Bangla 400, Sahitya 700 for caps
    expect(beng['--w-hand']).toBe('500');
    expect(beng['--w-text']).toBe('400');
    expect(deva['--w-caps']).toBe('700');
    expect(en['--w-venue']).toBe('600');
  });

  it('never letter-spaces, uppercases or italicises Indic scripts', () => {
    for (const k of ['--ls-caps', '--ls-dateline', '--ls-when', '--ls-family', '--ls-ui']) expect(indic[k]).toBe('0');
    expect(indic['--tt-caps']).toBe('none');
    expect(indic['--fst-italic']).toBe('normal');
    expect(en['--ls-caps']).toBe('0.22em');
    expect(en['--ls-dateline']).toBe('0.16em');
    expect(en['--ls-when']).toBe('0.13em');
    expect(en['--ls-family']).toBe('0.12em');
    expect(en['--ls-ui']).toBe('0.14em');
  });

  it('line heights per role: en / Indic', () => {
    const pairs: [string, string, string][] = [
      ['--lh-hand', '1.15', '1.38'],
      ['--lh-pair', '1.2', '1.4'],
      ['--lh-close', '1.15', '1.45'],
      ['--lh-blessing', '1.35', '1.6'],
      ['--lh-addr', '1.28', '1.5'],
      ['--lh-ui', '1.2', '1.4'],
    ];
    for (const [k, e, i] of pairs) {
      expect(en[k], k).toBe(e);
      expect(indic[k], k).toBe(i);
    }
  });

  it('switches font synthesis off and keeps lining numerals in addresses', () => {
    expect(TYPO).toMatch(/:root\s*\{[^}]*font-synthesis:\s*none/);
    expect(TYPO).toMatch(/\.t-addr\s*\{[^}]*font-variant-numeric:\s*lining-nums/);
    expect(TYPO).toMatch(/\.t-digits\s*\{[^}]*lining-nums tabular-nums/);
  });

  it('gold leaf: gradient + leaf texture clipped to text, with a plain gold fallback (1.4)', () => {
    const rule = TYPO.match(/\.gold-leaf\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/var\(--gl-0\) 0%/);
    expect(rule).toMatch(/var\(--gl-glint\) 50%/);
    expect(rule).toMatch(/var\(--tex-gold-leaf\)/);
    expect(rule).toMatch(/300% 100%/);
    expect(rule).toMatch(/background-blend-mode:\s*multiply/);
    expect(rule).toMatch(/background-clip:\s*text/);
    expect(TYPO).toMatch(/@supports not \(\(background-clip: text\) or \(-webkit-background-clip: text\)\)/);
  });
});

/* ------------------------------------------------------------------------------------------------ tokens 1.6 */
describe('tokens (spec 1.6, 1.8, 3.2)', () => {
  const t = vars(TOKENS, ':root');

  it('spacing, columns and the frame', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => t[`--s-${i}`])).toEqual([
      '4px',
      '8px',
      '12px',
      '16px',
      '24px',
      '32px',
      '48px',
      '64px',
      '96px',
      '128px',
    ]);
    expect(t['--pad-y']).toBe('clamp(72px, 12svh, 160px)');
    expect(t['--pad-x']).toBe('clamp(20px, 6vw, 96px)');
    expect(t['--col']).toBe('min(88vw, 620px)');
    expect(t['--max']).toBe('1280px');
    expect(t['--frame-in']).toBe('clamp(10px, 3.3vw, 32px)');
    expect(t['--frame-gap']).toBe('clamp(6px, 1.05vw, 13px)');
    expect(t['--diamond']).toBe('clamp(6px, 0.9vw, 9px)');
    expect(t['--card-gap']).toBe('8px');
    expect(t['--shadow-card']).toBe('0 14px 40px -26px rgba(60, 40, 20, 0.35)');
    expect(t['--r-card']).toBe('2px');
  });

  it('z-index scale', () => {
    expect([
      t['--z-plate'],
      t['--z-edge'],
      t['--z-reveal'],
      t['--z-content'],
      t['--z-bar'],
      t['--z-sheet'],
      t['--z-skip'],
    ]).toEqual(['0', '10', '15', '20', '50', '60', '100']);
  });

  it('motion tokens mirror src/lib/motion.ts', () => {
    expect(t['--beat']).toBe(`${MOTION.beat}ms`);
    expect(t['--phrase']).toBe(`${MOTION.phrase / 1000}s`);
    expect(t['--half-phrase']).toBe(`${MOTION.halfPhrase / 1000}s`);
    expect(t['--t-text']).toBe(`${MOTION.tText}ms`);
    expect(t['--t-reveal']).toBe(`${MOTION.tReveal}ms`);
    expect(t['--t-title']).toBe(`${MOTION.tTitle}ms`);
    expect(t['--ease-silk']).toBe(MOTION.easeSilk);
    expect(t['--ease-swift']).toBe(MOTION.easeSwift);
    expect(t['--ease-sine']).toBe(MOTION.easeSine);
  });

  it('textures point at the generated files', () => {
    for (const k of ['--tex-paper', '--tex-gold-leaf', '--tex-brush-wipe', '--tex-brush-edge']) {
      const m = t[k]?.match(/url\('\.\.\/assets\/(textures\/[\w-]+\.webp)'\)/);
      expect(m, k).toBeTruthy();
      expect(() => readFileSync(resolve(__dirname, '../../src/assets', m![1]!))).not.toThrow();
    }
  });
});

describe('surfaces (spec 1.6, 6.1)', () => {
  it('the gilt pill is at least 44 px tall and pill-shaped', () => {
    const rule = BASE.match(/\.btn-gilt\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/min-height:\s*var\(--btn-h\)/);
    expect(vars(TOKENS, ':root')['--btn-h']).toBe('44px');
    expect(rule).toMatch(/border-radius:\s*var\(--r-pill\)/);
    expect(rule).toMatch(/border:\s*1px solid var\(--btn-border\)/);
  });

  it('focus is visible everywhere and never removed', () => {
    expect(BASE).toMatch(/:focus-visible\s*\{[^}]*outline:\s*var\(--focus-w\) solid/);
    expect(BASE).not.toMatch(/outline:\s*(none|0)\b/);
  });

  it('the double frame draws two lines and four diamonds', () => {
    for (const c of ['outer', 'inner']) expect(BASE).toContain(`.frame-lines__line--${c}`);
    for (const c of ['tl', 'tr', 'bl', 'br']) expect(BASE).toContain(`.frame-lines__d--${c}`);
    expect(BASE).toMatch(/\.frame-lines__line--inner\s*\{[^}]*opacity:\s*var\(--hairline-inner-alpha\)/);
    expect(vars(TOKENS, ':root')['--hairline-inner-alpha']).toBe('0.6');
  });
});
