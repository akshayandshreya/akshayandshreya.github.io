// Spec 3 (motion design), the components in jsdom: tiers on <html> (3.3), entrances on the section clock and the
// still resting state (3.4, 3.8), the paint-reveal stages and fallbacks (3.5), what each tier renders (3.6), and
// reduced motion = nothing animates (G-MOT-3: no pending state, no rAF loop, no idle layer). Real motion, pixels and
// timing are checked in the browser (tests/e2e, tools/shots).
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionProvider } from '../../src/components/motion/MotionProvider';
import { Reveal } from '../../src/components/text/Reveal';
import { HandTitle } from '../../src/components/text/HandTitle';
import { PaintReveal } from '../../src/components/paint/PaintReveal';
import { REVEALS } from '../../src/components/motion/revealPlan';
import { BrushEdge } from '../../src/components/paint/BrushEdge';
import { Veil } from '../../src/components/paint/Veil';
import { LightSweep } from '../../src/components/paint/LightSweep';
import { GlowPulse } from '../../src/components/paint/GlowPulse';
import { LiveStrokes } from '../../src/components/paint/LiveStrokes';
import { Particles } from '../../src/components/motifs/Particles';
import { EveningLights } from '../../src/components/motifs/EveningLights';
import { PARTICLES, eveningLights, particleDabs, strokeSlots } from '../../src/components/motion/layers';
import { EdgeMotifs } from '../../src/components/motifs/EdgeMotifs';
import { Diya } from '../../src/components/motifs/Diya';
import { LineArt } from '../../src/components/motifs/LineArt';
import { activeAnimatorCount, BOOT_CLASS, resetMotionState, wasRevealed } from '../../src/lib/motion';
import { plateEntry } from '../../src/lib/plates';

/* ---------------------------------------------------------------------------------------------- browser stubs */

interface IOEntryInit {
  isIntersecting: boolean;
  intersectionRatio?: number;
  top?: number;
  height?: number;
}
const observers = new Set<FakeIO>();
class FakeIO {
  targets = new Set<Element>();
  constructor(public cb: IntersectionObserverCallback) {
    observers.add(this);
  }
  observe(t: Element) {
    this.targets.add(t);
  }
  unobserve(t: Element) {
    this.targets.delete(t);
  }
  disconnect() {
    this.targets.clear();
    observers.delete(this);
  }
  takeRecords() {
    return [];
  }
}
function fire(target: Element, e: IOEntryInit) {
  const entry = {
    target,
    isIntersecting: e.isIntersecting,
    intersectionRatio: e.intersectionRatio ?? (e.isIntersecting ? 1 : 0),
    boundingClientRect: { top: e.top ?? 100, bottom: (e.top ?? 100) + 800, height: 800 } as DOMRectReadOnly,
    intersectionRect: { height: e.height ?? 0 } as DOMRectReadOnly,
  } as unknown as IntersectionObserverEntry;
  for (const o of [...observers]) if (o.targets.has(target)) o.cb([entry], o as unknown as IntersectionObserver);
}

let reduce = false;
function stubBrowser({ cores = 8 }: { cores?: number } = {}) {
  vi.stubGlobal('IntersectionObserver', FakeIO);
  window.matchMedia = ((q: string) => ({
    matches: reduce && q.includes('reduce'),
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: cores, configurable: true });
}

beforeEach(() => {
  reduce = false;
  observers.clear();
  resetMotionState();
  document.documentElement.className = '';
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A plate section stand-in whose position on screen the test decides (top in px from the viewport top). */
function Section({ id, top, children, plate }: { id: string; top: number; children: ReactNode; plate?: boolean }) {
  return (
    <section
      id={id}
      data-section={id}
      className="plate-section"
      ref={(el) => {
        if (el)
          el.getBoundingClientRect = () => ({
            top,
            bottom: top + 900,
            height: 900,
            left: 0,
            right: 400,
            width: 400,
            x: 0,
            y: top,
            toJSON: () => ({}),
          });
      }}
    >
      <div className="frame">
        {plate && (
          <div className="plate-scroll">
            <div className="plate-pointer">
              <picture className="plate">
                <img alt="" src="data:," />
              </picture>
            </div>
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

const mount = (ui: ReactNode) => render(<MotionProvider>{ui}</MotionProvider>);

/* --------------------------------------------------------------------------------------------------- tiers */

describe('tiers on <html> (3.3)', () => {
  it('full by default on a capable device, lite on few cores, none under reduced motion', () => {
    stubBrowser();
    const a = mount(<div />);
    expect(document.documentElement.classList.contains('motion-full')).toBe(true);
    a.unmount();
    stubBrowser({ cores: 4 });
    const b = mount(<div />);
    expect(document.documentElement.classList.contains('motion-lite')).toBe(true);
    b.unmount();
    reduce = true;
    stubBrowser();
    mount(<div />);
    expect(document.documentElement.classList.contains('motion-none')).toBe(true);
  });

  it('the boot class is removed once the timelines are armed', () => {
    stubBrowser();
    document.documentElement.classList.add(BOOT_CLASS);
    mount(
      <Section id="mehndi" top={2000}>
        <Reveal>x</Reveal>
      </Section>,
    );
    expect(document.documentElement.classList.contains(BOOT_CLASS)).toBe(false);
  });
});

/* ------------------------------------------------------------------------------------------------- reduced motion */

describe('reduced motion: nothing animates, everything is there (3.8, G-MOT-3)', () => {
  it('no pending state, no idle layer, no rAF loop', () => {
    reduce = true;
    stubBrowser();
    const { container } = mount(
      <Section id="mehndi" top={2000} plate>
        <Reveal at={500}>tagline</Reveal>
        <HandTitle as="h3">Mehndi</HandTitle>
        <Veil plate="mehndi" />
        <LightSweep />
        <GlowPulse plate="mehndi" />
        <LiveStrokes plate="mehndi" />
        <Particles preset="mehndi" />
        <EveningLights />
        <PaintReveal {...REVEALS.mehndi!} />
      </Section>,
    );
    expect(container.querySelectorAll('[data-reveal]')).toHaveLength(0);
    expect(container.querySelector('[data-paint]')).toBeNull();
    for (const sel of ['.veil-layer', '.sweep', '.glow-layer', '.live-strokes', '.particles', '.evening-lights'])
      expect(container.querySelector(sel), sel).toBeNull();
    expect(activeAnimatorCount()).toBe(0);
    // the text is in the DOM with its kind, for the boot hide and the CSS only
    expect(container.querySelector('[data-enter="text"]')?.textContent).toBe('tagline');
    expect(container.querySelector('[data-enter="title"]')?.tagName).toBe('H3');
  });

  it('line art and the diya rest drawn and lit', () => {
    reduce = true;
    stubBrowser();
    const { container } = mount(
      <Section id="closing" top={2000}>
        <LineArt motif="shankha" at={0} />
        <Diya />
      </Section>,
    );
    expect(container.querySelector('.line-art__img')?.getAttribute('src')).toBeTruthy();
    expect(container.querySelectorAll('.diya [data-reveal]')).toHaveLength(0);
    expect(container.querySelectorAll('.diya img')).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------------------------------------- entrances */

describe('entrances on the section clock (3.4)', () => {
  it('below the fold: pending, then played once at its offset, then back to the resting state', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    stubBrowser();
    const { container } = mount(
      <Section id="mehndi" top={2000}>
        <Reveal at={500}>tagline</Reveal>
        <HandTitle as="h3">Mehndi</HandTitle>
      </Section>,
    );
    const text = container.querySelector<HTMLElement>('[data-enter="text"]')!;
    const title = container.querySelector<HTMLElement>('[data-enter="title"]')!;
    expect(text.dataset.reveal).toBe('pending');
    expect(title.dataset.reveal).toBe('pending');
    const section = container.querySelector('section')!;
    act(() => fire(section, { isIntersecting: true, intersectionRatio: 0.1 }));
    expect(text.dataset.reveal).toBe('pending'); // 10% is not yet 25%
    act(() => fire(section, { isIntersecting: true, intersectionRatio: 0.3 }));
    expect(text.dataset.reveal).toBe('in');
    expect(parseInt(text.style.getPropertyValue('--m-delay'))).toBeGreaterThan(450);
    expect(text.style.getPropertyValue('--m-dur')).toBe('560ms');
    expect(title.style.getPropertyValue('--m-dur')).toBe('900ms');
    act(() => vi.advanceTimersByTime(1200));
    expect(text.hasAttribute('data-reveal')).toBe(false);
    expect(text.style.getPropertyValue('--m-delay')).toBe('');
    expect(title.hasAttribute('data-reveal')).toBe(false);
    // once per page load
    act(() => fire(section, { isIntersecting: true, intersectionRatio: 0.9 }));
    expect(text.hasAttribute('data-reveal')).toBe(false);
  });

  it('already on screen at load without the boot class: simply there (no flash)', () => {
    stubBrowser();
    const { container } = mount(
      <Section id="invitation" top={0}>
        <Reveal at={600}>name</Reveal>
      </Section>,
    );
    expect(container.querySelector('[data-reveal]')).toBeNull();
  });

  it('already on screen at load with the boot class: the compressed 600 ms version', () => {
    stubBrowser();
    document.documentElement.classList.add(BOOT_CLASS);
    const { container } = mount(
      <Section id="invitation" top={0}>
        <Reveal at={1450} dur={900}>
          name
        </Reveal>
      </Section>,
    );
    const el = container.querySelector<HTMLElement>('[data-enter]')!;
    expect(el.dataset.reveal).toBe('in');
    const end = parseInt(el.style.getPropertyValue('--m-delay')) + parseInt(el.style.getPropertyValue('--m-dur'));
    expect(end).toBeLessThanOrEqual(610);
  });

  it('lite: shorter fades', () => {
    stubBrowser({ cores: 2 });
    const { container } = mount(
      <Section id="haldi" top={2000}>
        <Reveal at={800}>when</Reveal>
      </Section>,
    );
    act(() => fire(container.querySelector('section')!, { isIntersecting: true, intersectionRatio: 0.5 }));
    const el = container.querySelector<HTMLElement>('[data-enter]')!;
    expect(el.style.getPropertyValue('--m-dur')).toBe(`${Math.round(560 * 0.7)}ms`);
  });

  it('a section jumped past by the nav shows at once', () => {
    stubBrowser();
    const { container } = mount(
      <>
        <Section id="mehndi" top={2000}>
          <Reveal>a</Reveal>
        </Section>
        <Section id="engagement" top={3000}>
          <Reveal>b</Reveal>
        </Section>
      </>,
    );
    const [s1, s2] = container.querySelectorAll('section');
    act(() => fire(s2!, { isIntersecting: true, intersectionRatio: 0.5 }));
    const [a, b] = container.querySelectorAll<HTMLElement>('[data-enter]');
    expect(a!.hasAttribute('data-reveal')).toBe(false);
    expect(b!.dataset.reveal).toBe('in');
    expect(s1).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------------------------------ paint-reveal */

describe('paint-reveal (3.5)', () => {
  it('pending until the trigger; entering from below shows the plate at once and holds nothing back', () => {
    stubBrowser();
    const { container } = mount(
      <Section id="mehndi" top={2000} plate>
        <PaintReveal {...REVEALS.mehndi!} />
        <Reveal>t</Reveal>
      </Section>,
    );
    const section = container.querySelector<HTMLElement>('section')!;
    expect(section.dataset.paint).toBe('pending');
    expect(container.querySelector('.reveal-ground')).toBeTruthy();
    expect(container.querySelector('canvas.reveal-canvas')).toBeTruthy();
    act(() => fire(section, { isIntersecting: true, top: -20, intersectionRatio: 0.5 }));
    expect(section.dataset.paint).toBeUndefined();
    expect(wasRevealed('mehndi')).toBe(true);
    // the timeline was released: the text entrance runs
    expect(container.querySelector<HTMLElement>('[data-enter]')!.dataset.reveal).toBe('in');
  });

  it('lite: a 500 ms crossfade, the timeline starts at 70% of it', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    stubBrowser({ cores: 2 });
    const { container } = mount(
      <Section id="haldi" top={2000} plate>
        <PaintReveal {...REVEALS.haldi!} />
        <Reveal>t</Reveal>
      </Section>,
    );
    const section = container.querySelector<HTMLElement>('section')!;
    const text = container.querySelector<HTMLElement>('[data-enter]')!;
    act(() => fire(section, { isIntersecting: true, top: 500, intersectionRatio: 0.3 }));
    expect(section.dataset.paint).toBe('fade');
    expect(section.style.getPropertyValue('--fade-dur')).toBe('500ms');
    expect(text.dataset.reveal).toBe('pending');
    act(() => vi.advanceTimersByTime(360));
    expect(text.dataset.reveal).toBe('in');
    act(() => vi.advanceTimersByTime(200));
    expect(section.dataset.paint).toBe('done');
    act(() => vi.advanceTimersByTime(1300));
    expect(section.dataset.paint).toBeUndefined();
  });

  it('a section reached at mount (deep link) never waits for a reveal', () => {
    stubBrowser();
    const { container } = mount(
      <Section id="wedding" top={100} plate>
        <PaintReveal {...REVEALS.wedding!} />
      </Section>,
    );
    expect(container.querySelector<HTMLElement>('section')!.dataset.paint).toBeUndefined();
  });

  it('the brush edge is a decorative strip with the texture', () => {
    const { container } = render(<BrushEdge />);
    const el = container.querySelector<HTMLElement>('.brush-edge')!;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.style.getPropertyValue('--edge')).toMatch(/^url\(/);
  });
});

/* ----------------------------------------------------------------------------------------- idle layers per tier */

describe('idle layers per tier (3.6)', () => {
  it('full: veil, sweep, glow, live strokes, evening lights, particles', () => {
    stubBrowser();
    const { container } = mount(
      <Section id="reception" top={2000} plate>
        <Veil plate="reception" />
        <LightSweep />
        <GlowPulse plate="reception" />
        <LiveStrokes plate="reception" />
        <EveningLights />
        <Particles preset="mehndi" />
      </Section>,
    );
    expect(container.querySelector('.veil-layer picture.veil')).toBeTruthy();
    expect(container.querySelector('.sweep__band')).toBeTruthy();
    expect(container.querySelector('.glow-pool')).toBeTruthy();
    expect(container.querySelectorAll('.ls-slot')).toHaveLength(3);
    expect(container.querySelectorAll('.evening-light')).toHaveLength(4);
    expect(container.querySelectorAll('.particles .pt')).toHaveLength(4);
  });

  it('lite: no veil, sweep, glow, strokes or lights; at most 3 particles', () => {
    stubBrowser({ cores: 4 });
    const { container } = mount(
      <Section id="opening" top={2000} plate>
        <Veil plate="opening" />
        <LightSweep />
        <GlowPulse plate="opening" />
        <LiveStrokes plate="opening" />
        <EveningLights />
        <Particles preset="opening" />
      </Section>,
    );
    for (const sel of ['.veil-layer', '.sweep', '.glow-layer', '.live-strokes', '.evening-lights'])
      expect(container.querySelector(sel), sel).toBeNull();
    expect(container.querySelectorAll('.particles .pt')).toHaveLength(3);
  });

  it('edge motifs per event (1.7): strands, toran, banana leaf, bamboo; none for the wedding', () => {
    const count = (ev: Parameters<typeof EdgeMotifs>[0]['event']) =>
      render(<EdgeMotifs event={ev} />).container.querySelectorAll('.edge img').length;
    expect(count('mehndi')).toBe(2);
    expect(count('engagement')).toBe(1);
    expect(count('haldi')).toBe(1);
    expect(count('reception')).toBe(2);
    expect(count('wedding')).toBe(0);
  });

  it('seeded particles: at most 6, lanes across the region, trips of 14-22 s for falling petals', () => {
    for (const [id, set] of Object.entries(PARTICLES)) {
      const d = particleDabs(set, 6, 'u.webp');
      expect(d.length, id).toBe(Math.min(set.n, 6));
      expect(d.length).toBeLessThanOrEqual(6);
      expect(particleDabs(set, 6, 'u.webp')).toEqual(d);
      for (const p of d) {
        const dur = parseFloat(String((p.style as Record<string, string>)['--pt-dur']));
        expect(dur).toBeGreaterThanOrEqual(set.dur[0]);
        expect(dur).toBeLessThanOrEqual(set.dur[1]);
      }
    }
    expect(PARTICLES.mehndi!.dur).toEqual([14, 22]);
    expect(PARTICLES.opening!.n).toBe(6);
    expect(PARTICLES.closing!.n).toBe(5);
    expect(particleDabs(PARTICLES.opening!, 3, 'u')).toHaveLength(3);
  });

  it('live-stroke slots repeat every 10-15 s with seeded phases', () => {
    const fr = plateEntry('mehndi')!.frames.wide;
    const slots = strokeSlots(fr, 'atlas.webp', 'mehndi:wide');
    expect(slots).toHaveLength(3);
    for (const s of slots) {
      const v = s.style as Record<string, string>;
      const period = parseFloat(v['--ls-dur']!);
      expect(period).toBeGreaterThanOrEqual(10);
      expect(period).toBeLessThanOrEqual(15);
      expect(parseFloat(v['--ls-delay']!)).toBeLessThanOrEqual(0);
      expect(v['--ang']).toMatch(/deg$/);
      expect(String(s.sprite.backgroundImage)).toContain('atlas.webp');
    }
    expect(strokeSlots(fr, 'atlas.webp', 'mehndi:wide')).toEqual(slots);
  });

  it('evening lights: four discs in the upper teal, clear of the title', () => {
    const l = eveningLights();
    expect(l).toHaveLength(4);
    for (const s of l) expect(parseFloat(String((s as Record<string, string>)['--ly']))).toBeLessThan(30);
  });
});

describe('line art entrance (3.4)', () => {
  it('stays hidden after the placeholder pass until its turn, then rests drawn', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    stubBrowser();
    const { container } = mount(
      <Section id="invitation" top={2000}>
        <LineArt motif="shankha" at={100} dur={300} />
      </Section>,
    );
    // the art comes near the viewport: its SVG chunk is fetched (after the tier was decided)
    act(() => fire(container.querySelector('.line-art')!, { isIntersecting: true }));
    await act(async () => {
      vi.useRealTimers();
      await new Promise((r) => setTimeout(r, 50));
    });
    const host = container.querySelector<HTMLElement>('.line-art')!;
    expect(host.hasAttribute('data-inline')).toBe(true);
    const strokes = host.querySelectorAll<SVGElement>('.m-draw');
    expect(strokes.length).toBeGreaterThan(0);
    // armed: every stroke is undrawn (dash offset = its length)
    for (const s of strokes) expect(Number(s.style.strokeDashoffset)).toBeGreaterThan(0);
  });
});

describe('no IntersectionObserver (old browsers, jsdom): the still page', () => {
  it('chooses none and starts nothing', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = mount(
      <Section id="cultures" top={2000}>
        <figure>
          <LineArt motif="alpana" scroll />
          <figcaption>caption</figcaption>
        </figure>
        <Reveal>t</Reveal>
      </Section>,
    );
    expect(document.documentElement.classList.contains('motion-none')).toBe(true);
    expect(container.querySelectorAll('[data-reveal]')).toHaveLength(0);
    expect(activeAnimatorCount()).toBe(0);
  });
});
