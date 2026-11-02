// The gold system components (spec 1.4) and the double frame (1.6).
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import {
  Bindu,
  GoldBrushRing,
  GoldBrushRule,
  GoldLeaf,
  RING_GAP_DEG,
  RING_R,
  ribbonPath,
  ribbonProfile,
  ringPaths,
  rng,
  rulePaths,
} from '../../src/components/text/GoldLeaf';
import { HAIRLINE_CORNERS, Hairlines } from '../../src/components/paint/Hairlines';
import { FILES } from '../helpers';

const NUM = /-?\d+(?:\.\d+)?/g;
const numbers = (d: string) => (d.match(NUM) ?? []).map(Number);

describe('<GoldLeaf> (spec 1.4)', () => {
  it('renders the caller text in the requested element with the gold-leaf class, in every language', () => {
    for (const lang of ['en', 'hi', 'mai', 'bn'] as const) {
      const heading = FILES[lang].variants.G1.heading;
      const { unmount } = render(
        <GoldLeaf as="h1" className="t-hero" id="opening-title">
          {heading}
        </GoldLeaf>,
      );
      const h = screen.getByRole('heading', { level: 1 });
      // exact text (the copy carries NBSP hygiene, which toHaveTextContent would normalise away)
      expect(h.textContent).toBe(heading);
      expect(h).toHaveClass('gold-leaf', 'gold-leaf--shimmer', 't-hero');
      expect(h).toHaveAttribute('id', 'opening-title');
      unmount();
    }
  });

  it('can switch the shimmer off and passes attributes through (the Latin "&" joiner)', () => {
    render(
      <GoldLeaf shimmer={false} lang="en" className="joiner joiner--amp">
        &amp;
      </GoldLeaf>,
    );
    const el = screen.getByText('&');
    expect(el.tagName).toBe('SPAN');
    expect(el).toHaveAttribute('lang', 'en');
    expect(el).toHaveClass('gold-leaf', 'joiner--amp');
    expect(el).not.toHaveClass('gold-leaf--shimmer');
  });
});

describe('brush geometry (card.js goldRule / goldRing)', () => {
  it('the PRNG is deterministic per key', () => {
    const a = rng('rule:3612');
    const b = rng('rule:3612');
    const c = rng('rule:3613');
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(c()).not.toBe(xs[0]);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('a ribbon tapers to a hair at both ends and never exceeds its width', () => {
    const o = { width: 2.6, taper: [0.12, 0.6] as const, pressure: 0.5, seed: 'x' };
    const p = ribbonProfile(24, o);
    const max = Math.max(...p);
    expect(max).toBeLessThanOrEqual(1.3 + 1e-9);
    expect(max).toBeGreaterThan(0.8);
    expect(p[0]!).toBeLessThan(max * 0.15);
    expect(p[24]!).toBeLessThan(max * 0.15);
    const d = ribbonPath(
      Array.from({ length: 25 }, (_, i) => [i * 3, Math.sin(i / 4)] as const),
      o,
    );
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d).not.toMatch(/NaN|Infinity/);
  });

  it('the rule is two mirrored strokes from 8 units off the bindu out to 8 + half', () => {
    const { strokes, bindu } = rulePaths(78, 3612);
    expect(strokes).toHaveLength(2);
    expect(bindu).toEqual({ cx: 0, cy: 0, r: 4 });
    const [l, r] = strokes.map((s) => numbers(s.centre));
    expect(l![0]).toBeCloseTo(-8);
    expect(r![0]).toBeCloseTo(8);
    expect(l![l!.length - 2]).toBeCloseTo(-86);
    expect(r![r!.length - 2]).toBeCloseTo(86);
    // same seed, same strokes (SSR == client)
    expect(rulePaths(78, 3612)).toEqual(rulePaths(78, 3612));
    expect(rulePaths(78, 1).strokes[0]!.ribbon).not.toBe(strokes[0]!.ribbon);
  });

  it('the ring leaves a 14 degree gap at the top for its bindu', () => {
    const { strokes, ends, bindu } = ringPaths(RING_R, RING_GAP_DEG, 3, 3613);
    expect(strokes).toHaveLength(2);
    expect(bindu).toEqual({ cx: 0, cy: -RING_R, r: 4.5 });
    const ang = ends.map(([x, y]) => (Math.atan2(y, x) * 180) / Math.PI);
    const gap = Math.abs(ang[0]! - ang[1]!);
    expect(Math.min(gap, 360 - gap)).toBeCloseTo(RING_GAP_DEG, 6);
    for (const [x, y] of ends) {
      expect(Math.hypot(x, y)).toBeCloseTo(RING_R, 6);
      expect(y).toBeLessThan(0); // both ends are at the top
    }
  });
});

describe('<GoldBrushRule> / <GoldBrushRing> / <Bindu>', () => {
  it('the rule: two strokes (ribbon + sheen each) and a bindu, decorative, ids resolvable', () => {
    const { container } = render(<GoldBrushRule className="opening__rule" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveClass('brush-rule', 'opening__rule');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg.querySelectorAll('.brush-stroke')).toHaveLength(2);
    expect(svg.querySelectorAll('.brush-ribbon')).toHaveLength(2);
    expect(svg.querySelectorAll('.brush-sheen')).toHaveLength(2);
    expect(svg.querySelectorAll('.brush-bindu')).toHaveLength(1);
    // every url(#id) points at an element in this svg
    const refs = [...svg.innerHTML.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]!);
    expect(refs.length).toBeGreaterThanOrEqual(5);
    for (const id of refs) expect(svg.querySelector(`[id="${id}"]`), id).not.toBeNull();
    // the draw-on hook: a centreline with pathLength 1 per stroke, open at rest
    const draws = svg.querySelectorAll('.brush-draw');
    expect(draws).toHaveLength(2);
    for (const d of draws) expect(d).toHaveAttribute('pathLength', '1');
  });

  it('two instances on one page never share gradient or mask ids', () => {
    const { container } = render(
      <>
        <GoldBrushRule />
        <GoldBrushRule />
        <GoldBrushRing />
      </>,
    );
    const ids = [...container.querySelectorAll('[id]')].map((e) => e.id);
    expect(ids.length).toBeGreaterThan(6);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-zA-Z][\w-]*$/);
  });

  it('the ring: two arcs and the bindu in the gap', () => {
    const { container } = render(<GoldBrushRing />);
    const svg = container.querySelector('svg.brush-ring')!;
    expect(svg).toHaveAttribute('viewBox', '-50 -50 100 100');
    expect(svg.querySelectorAll('.brush-ribbon')).toHaveLength(2);
    const b = svg.querySelector('.brush-bindu')!;
    expect(b.getAttribute('cy')).toBe(String(-RING_R));
  });

  it('renders the same markup on the server twice (no random ids or geometry)', () => {
    const a = renderToString(<GoldBrushRule seed={7} />);
    const b = renderToString(<GoldBrushRule seed={7} />);
    expect(a).toBe(b);
  });

  it('<Bindu> is a decorative span', () => {
    const { container } = render(<Bindu className="x" />);
    const s = container.firstElementChild!;
    expect(s).toHaveClass('bindu', 'x');
    expect(s).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('<Hairlines> (spec 1.1, 1.6)', () => {
  it('the frame: two lines and a diamond at each corner, hidden from assistive tech', () => {
    const { container } = render(<Hairlines />);
    const root = container.firstElementChild!;
    expect(root).toHaveClass('frame-lines', 'frame-lines--frame');
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root.querySelector('.frame-lines__line--outer')).not.toBeNull();
    expect(root.querySelector('.frame-lines__line--inner')).not.toBeNull();
    const d = [...root.querySelectorAll('.frame-lines__d')].map((e) =>
      e.className.replace('frame-lines__d frame-lines__d--', ''),
    );
    expect(d).toEqual([...HAIRLINE_CORNERS]);
    expect(root.textContent).toBe('');
  });

  it('the card variant in miniature takes extra classes', () => {
    const { container } = render(<Hairlines variant="card" className="venue-card__frame" />);
    expect(container.firstElementChild).toHaveClass('frame-lines', 'frame-lines--card', 'venue-card__frame');
  });
});
