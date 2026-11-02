// The integrated page (spec 3.4, 3.5, 3.6, 5.3): every plate section carries its motion layers and, except the
// opening, the paint-reveal stage that starts from the previous visible section's ground, and each section's
// content is staged on its own timeline. jsdom has no layout and no IntersectionObserver, so this checks the markup
// the motion layer works on; tools/shots/frames.mjs films it running in a browser.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plateEntry } from '../../src/lib/plates';
import { ENTRANCE } from '../../src/lib/motion';
import { renderVariant } from './support/render';

const NOW = Date.parse('2026-11-02T10:00:00Z');
beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});

const IVORY = '#f2e8d8';
const BLUSH = '#f3e6dc';
const groundOf = (id: string) => plateEntry(id)?.groundMid;
const section = (id: string) => document.getElementById(id) as HTMLElement;
const prevGround = (id: string) => section(id).style.getPropertyValue('--prev-ground');

describe('paint-reveal between sections (3.5)', () => {
  it('every plate section but the opening has the reveal stage and the ragged top edge; the opening has neither', () => {
    renderVariant('en', 'G1');
    const plates = Array.from(document.querySelectorAll<HTMLElement>('main > section.plate-section'));
    expect(plates.map((s) => s.id)).toEqual([
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
    for (const s of plates) {
      const frame = s.querySelector(':scope > .frame') as HTMLElement;
      const reveal = s.id !== 'opening';
      expect(Boolean(frame.querySelector(':scope > canvas.reveal-canvas')), `${s.id} reveal canvas`).toBe(reveal);
      expect(Boolean(frame.querySelector(':scope > .reveal-ground')), `${s.id} reveal ground`).toBe(reveal);
      expect(Boolean(s.querySelector(':scope > .brush-edge')), `${s.id} brush edge`).toBe(reveal);
      // the reveal canvas is the last layer under the hairlines
      if (reveal) expect(frame.lastElementChild?.previousElementSibling).toHaveClass('reveal-canvas');
      // no JS state in the markup: the pending stage is only ever set by the running reveal
      expect(s).not.toHaveAttribute('data-paint');
    }
  });

  it('each reveal starts from the previous visible section: its painted ground, or the paper of a band', () => {
    renderVariant('en', 'G1');
    expect(prevGround('invitation')).toBe(groundOf('opening'));
    expect(prevGround('mehndi')).toBe(IVORY); // after the Celebrations band
    expect(prevGround('engagement')).toBe(groundOf('mehndi'));
    expect(prevGround('wedding')).toBe(groundOf('haldi'));
    expect(prevGround('cultures')).toBe(groundOf('reception'));
    expect(prevGround('closing')).toBe(BLUSH); // after the Venues band
    expect(prevGround('opening')).toBe('');
  });

  it('without the Reception the Cultures reveal starts from the Wedding', () => {
    renderVariant('hi', 'B0');
    expect(document.getElementById('reception')).toBeNull();
    expect(prevGround('cultures')).toBe(groundOf('wedding'));
  });
});

describe('frame layers by section (3.6)', () => {
  it('edge motifs where the card has them: mehndi strands, engagement toran, haldi leaf, reception bamboo', () => {
    renderVariant('bn', 'G1');
    for (const id of ['mehndi', 'engagement', 'haldi', 'reception'])
      expect(section(id).querySelector(`.frame > .edge-motifs--${id}`), id).not.toBeNull();
    for (const id of ['opening', 'invitation', 'wedding', 'cultures', 'closing'])
      expect(section(id).querySelector('.frame > .edge-motifs'), id).toBeNull();
  });
});

describe('content timelines (3.4)', () => {
  const at = (el: Element | null) => el?.getAttribute('data-enter');

  it('the opening column enters in the card order', () => {
    renderVariant('en', 'G1');
    const o = section('opening');
    expect(at(o.querySelector('h1.t-hero'))).toBe('text');
    expect(o.querySelectorAll('.t-kicker[data-enter]').length).toBeGreaterThan(0);
    expect(at(o.querySelector('.t-pair'))).toBe('text');
    expect(at(o.querySelector('.t-dateline'))).toBe('text');
    expect(at(o.querySelector('.ganesh__line'))).toBe('draw');
    expect(ENTRANCE.opening.dateline[1]).toBeLessThanOrEqual(2900); // A-OPEN-4: done within 2.9 s
  });

  it('an event stages its title, tagline, couple, facts and actions', () => {
    renderVariant('mai', 'G1');
    for (const id of ['mehndi', 'wedding']) {
      const s = section(id);
      expect(at(s.querySelector('h3.event__title')), `${id} title`).toBe('title');
      expect(at(s.querySelector('.event__tagline')), `${id} tagline`).toBe('text');
      for (const dd of Array.from(s.querySelectorAll('.event__facts dd')))
        expect(at(dd), `${id} ${dd.className}`).toBe('text');
      expect(s.querySelector('.reveal-wrap[data-enter-wrap="feather"] .event__couple'), `${id} couple`).not.toBeNull();
      expect(s.querySelector('.reveal-wrap[data-enter-wrap="fade"] .event__actions'), `${id} actions`).not.toBeNull();
    }
    expect(
      section('wedding').querySelector('.reveal-wrap[data-enter-wrap="rise"] [data-slot="near-motifs"]'),
    ).not.toBeNull();
  });

  it('the invitation names and the closing request enter one after another, not all at once', () => {
    renderVariant('en', 'B1');
    const names = Array.from(section('invitation').querySelectorAll('.invitation__person'));
    expect(names).toHaveLength(2);
    for (const n of names) expect(at(n)).toBe('text');
    expect(at(section('closing').querySelector('h2.t-close'))).toBe('text');
    expect(section('closing').querySelector('.closing__ring .monogram')).not.toBeNull();
  });
});
