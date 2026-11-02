// Spec 7.1-7.2, the art building blocks of the component tree: <Plate>/<GoldLayer> (paint), <Sprite>, <Ganesh>,
// <Ghost>, <TirhutaFlourish> (motifs). Checked against the generated manifests (src/assets/*.json), so a renamed or
// missing asset fails here and not on a guest's phone.
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import plates from '../../src/assets/plates.json';
import sprites from '../../src/assets/sprites.json';
import glyphs from '../../src/assets/glyphs/glyphs.json';
import { Plate } from '../../src/components/paint/Plate';
import { GoldLayer } from '../../src/components/paint/GoldLayer';
import { Sprite, type MotifSpriteId } from '../../src/components/motifs/Sprite';
import { Ganesh } from '../../src/components/motifs/Ganesh';
import { Ghost } from '../../src/components/motifs/Ghost';
import { TirhutaFlourish } from '../../src/components/motifs/TirhutaFlourish';
import { plateUrl } from '../../src/lib/plates';
import { spriteUrl } from '../../src/lib/sprites';
import type { EventKey } from '../../src/i18n/types';

const PLATE_IDS = Object.keys(plates.plates);
const EVENTS: EventKey[] = ['mehndi', 'engagement', 'haldi', 'wedding', 'reception'];
type Couple = { width: Record<string, number>; avif: Record<string, string>; webp: Record<string, string> };
const COUPLES = sprites.couples as unknown as Record<EventKey, Couple>;

/** "a 540w, b 828w" -> [[a, 540], [b, 828]] */
const parseSrcSet = (s: string | null) =>
  (s ?? '').split(', ').map((part) => {
    const [url, w] = part.split(' ');
    return [url ?? '', Number((w ?? '').replace(/w$/, ''))] as const;
  });

describe('<Plate> (5.5, 6.6)', () => {
  it('knows all nine plates', () => {
    expect(PLATE_IDS).toEqual([
      'opening',
      'invitation',
      'mehndi',
      'engagement',
      'haldi',
      'wedding',
      'reception',
      'cultures',
      'closing',
    ]);
  });

  for (const id of PLATE_IDS) {
    it(`${id}: AVIF then WebP for tall, mid, wide, cover-width sizes, ascending srcsets`, () => {
      const { container } = render(<Plate id={id} />);
      const pic = container.querySelector('picture.plate');
      expect(pic).not.toBeNull();
      const sources = [...pic!.querySelectorAll('source')];
      expect(sources.map((s) => s.getAttribute('type'))).toEqual([
        'image/avif',
        'image/webp',
        'image/avif',
        'image/webp',
        'image/avif',
        'image/webp',
      ]);
      expect(sources.map((s) => s.getAttribute('media'))).toEqual([
        '(max-aspect-ratio: 3/5)',
        '(max-aspect-ratio: 3/5)',
        '(max-aspect-ratio: 5/4)',
        '(max-aspect-ratio: 5/4)',
        null,
        null,
      ]);
      for (const s of sources) {
        expect(s.getAttribute('sizes')).toMatch(/^\(max-aspect-ratio: \d+\/\d+\) [\d.]+l?vh, 100vw$/);
        const set = parseSrcSet(s.getAttribute('srcset'));
        expect(set).toHaveLength(3);
        for (const [url] of set) expect(url).not.toBe('');
        const widths = set.map(([, w]) => w);
        expect([...widths].sort((a, b) => a - b)).toEqual(widths);
      }
      const img = pic!.querySelector('img')!;
      expect(img.getAttribute('alt')).toBe('');
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.getAttribute('fetchpriority')).toBeNull();
      expect(img.getAttribute('src')).not.toBe('');
      expect(Number(img.getAttribute('width')) / Number(img.getAttribute('height'))).toBeCloseTo(16 / 9, 2);
    });
  }

  it('the opening plate is the LCP element: eager, high priority', () => {
    const { container } = render(<Plate id="opening" eager />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('loading')).toBe('eager');
    expect(img.getAttribute('fetchpriority')).toBe('high');
  });

  it('an unknown plate renders nothing (the frame keeps its paper)', () => {
    const { container } = render(<Plate id="nowhere" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('<GoldLayer> (1.3, 1.4)', () => {
  for (const id of PLATE_IDS) {
    it(`${id}: one transparent WebP per frame shape on the base's grid`, () => {
      const { container } = render(<GoldLayer id={id} />);
      const pic = container.querySelector('picture.gold')!;
      const sources = [...pic.querySelectorAll('source')];
      expect(sources.map((s) => s.getAttribute('media'))).toEqual([
        '(max-aspect-ratio: 3/5)',
        '(max-aspect-ratio: 5/4)',
      ]);
      expect(sources.every((s) => s.getAttribute('type') === 'image/webp' && s.getAttribute('srcset'))).toBe(true);
      const img = pic.querySelector('img')!;
      expect(img.getAttribute('src')).toMatch(/gold/);
      expect(img.getAttribute('alt')).toBe('');
    });
  }
});

describe('<Sprite> motifs (1.7)', () => {
  const ids = Object.keys(sprites.motifs) as MotifSpriteId[];

  for (const id of ids) {
    it(`${id}: decorative, sized, keeps its aspect before it loads`, () => {
      const { container } = render(<Sprite id={id} sizes="200px" />);
      const img = container.querySelector('img.sprite')!;
      expect(img.getAttribute('alt')).toBe('');
      expect(img.getAttribute('aria-hidden')).toBe('true');
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.getAttribute('src')).not.toBe('');
      const w = Number(img.getAttribute('width'));
      const h = Number(img.getAttribute('height'));
      const aspect = (sprites.motifs as Record<string, { aspect: number }>)[id]!.aspect;
      expect(w / h).toBeCloseTo(aspect, 1);
      expect((img as HTMLElement).style.aspectRatio).toBe(`${w} / ${h}`);
    });
  }

  it('a height-measured single file (kalash 240h) gets its real width and no srcset', () => {
    const { container } = render(<Sprite id="invitation-kalash" sizes="80px" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('height')).toBe('240');
    expect(img.getAttribute('width')).toBe(String(Math.round(240 * sprites.motifs['invitation-kalash'].aspect)));
    expect(img.getAttribute('srcset')).toBeNull();
  });

  it("a multi-size sprite gets width descriptors and the caller's sizes", () => {
    const { container } = render(<Sprite id="opening-ganesh" sizes="34vw" />);
    const img = container.querySelector('img')!;
    expect(parseSrcSet(img.getAttribute('srcset')).map(([, w]) => w)).toEqual([320, 560]);
    expect(img.getAttribute('sizes')).toBe('34vw');
  });

  it('alt text makes it meaningful', () => {
    const { container } = render(<Sprite id="wedding-kalash" sizes="100px" alt="A kalash" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('alt')).toBe('A kalash');
    expect(img.getAttribute('aria-hidden')).toBeNull();
  });
});

describe('<Sprite couple> (2.3.4)', () => {
  for (const e of EVENTS) {
    it(`${e}: AVIF + WebP at the files' real widths, alt text, the figure as CSS variables`, () => {
      const { container } = render(<Sprite couple={e} alt={`The couple, ${e}`} />);
      const pic = container.querySelector('picture.couple')!;
      expect(pic.getAttribute('data-couple')).toBe(e);
      const avif = pic.querySelector('source[type="image/avif"]')!;
      const widths = Object.values(COUPLES[e].width).sort((a, b) => a - b);
      expect(parseSrcSet(avif.getAttribute('srcset')).map(([, w]) => w)).toEqual(widths);
      const img = pic.querySelector('img')!;
      expect(img.getAttribute('alt')).toBe(`The couple, ${e}`);
      expect(parseSrcSet(img.getAttribute('srcset')).map(([, w]) => w)).toEqual(widths);
      expect(img.getAttribute('sizes')).toBeTruthy();
      expect(img.getAttribute('loading')).toBe('lazy');
      const style = (pic as HTMLElement).style;
      for (const v of ['--couple-aspect', '--couple-hs', '--couple-feet', '--couple-crown'])
        expect(style.getPropertyValue(v)).not.toBe('');
    });
  }
});

describe('<Ganesh>, <Ghost>, <TirhutaFlourish>', () => {
  it('Ganesh: the painted sprite (eager, first screen) under the inlined line art, all decorative', () => {
    const { container } = render(<Ganesh />);
    const root = container.firstElementChild!;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    const img = root.querySelector('img[data-sprite="opening-ganesh"]')!;
    expect(img.getAttribute('loading')).toBe('eager');
    const svg = root.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('90 50 720 700');
    expect(svg.querySelectorAll('.m-draw').length).toBe(21);
  });

  for (const motif of ['alpana', 'aripan'] as const) {
    it(`Ghost ${motif}: an alpha mask in the section ink at low opacity`, () => {
      const { container } = render(<Ghost motif={motif} alpha={0.08} />);
      const el = container.firstElementChild as HTMLElement;
      expect(el.getAttribute('aria-hidden')).toBe('true');
      expect(el.style.getPropertyValue('--ghost-mask')).toMatch(/^url\(".+"\)$/);
      expect(el.style.getPropertyValue('--ghost-alpha')).toBe('0.08');
    });
  }

  it('TirhutaFlourish: six shaped glyphs as outlines, aria-hidden, no text to mis-shape', () => {
    const { container } = render(<TirhutaFlourish />);
    const el = container.firstElementChild!;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelectorAll('svg path')).toHaveLength(glyphs.glyphs['tirhuta-mithila'].glyphIds.length);
    expect(el.querySelector('svg text')).toBeNull();
    expect(el.querySelector('svg [fill="currentColor"]')).not.toBeNull();
  });
});

describe('every file the manifests name is bundled', () => {
  it('plates.json', () => {
    const missing: string[] = [];
    for (const p of Object.values(plates.plates)) {
      for (const f of Object.values(p.frames)) {
        for (const rel of [...Object.values(f.avif), ...Object.values(f.webp), f.gold, f.veil, f.strokes.file])
          if (!plateUrl(rel)) missing.push(rel);
      }
    }
    expect(missing).toEqual([]);
  });

  it('sprites.json (couples and motifs)', () => {
    const missing: string[] = [];
    for (const c of Object.values(COUPLES))
      for (const rel of [...Object.values(c.avif), ...Object.values(c.webp)]) if (!spriteUrl(rel)) missing.push(rel);
    for (const m of Object.values(sprites.motifs as Record<string, { webp: Record<string, string> }>))
      for (const rel of Object.values(m.webp)) if (!spriteUrl(rel)) missing.push(rel);
    for (const d of Object.values(sprites.dabs)) if (!spriteUrl(d.file)) missing.push(d.file);
    expect(missing).toEqual([]);
  });
});
