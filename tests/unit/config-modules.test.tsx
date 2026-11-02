// Config switches (spec 2.4, 8.5, 8.9): A-CUL-3 (cultures off), A-OPT-3 (RSVP link), A-OPT-2 (music, when the
// MusicToggle exists). Each test patches the shared config object and restores it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { config, type SiteConfig } from '../../src/config';
import type { Lang } from '../../src/i18n/types';
import { FILES } from '../helpers';
import { renderAt } from './support/render';

// the config object is shared by every module: patch it in place for one render, restore it afterwards
const saved = structuredClone(config) as SiteConfig;
afterEach(() => {
  Object.assign(config, structuredClone(saved));
  vi.useRealTimers();
});

async function renderWith(patch: (c: SiteConfig) => void, url: string) {
  patch(config);
  return renderAt(url);
}

describe('A-CUL-3: config.sections.cultures = false', () => {
  it('removes the section and its nav item, leaving no empty wrapper', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-11-02T10:00:00Z'), toFake: ['Date'] });
    await renderWith((c) => (c.sections.cultures = false), '/en/');
    expect(document.getElementById('cultures')).toBeNull();
    expect(document.querySelector('a[href="#cultures"]')).toBeNull();
    const main = document.getElementById('main')!;
    const ids = Array.from(main.children).map((el) => el.id);
    expect(ids.indexOf('venues')).toBe(ids.indexOf('reception') + 1);
  });
});

describe('A-OPT-3: config.rsvp.url', () => {
  for (const lang of ['en', 'hi', 'mai', 'bn'] as Lang[]) {
    it(`${lang}: one gilt button, new tab, labelled rsvp.cta`, async () => {
      await renderWith((c) => (c.rsvp.url = 'https://example.com/rsvp'), `/${lang}/`);
      const section = document.getElementById('rsvp')!;
      const links = section.querySelectorAll('a');
      expect(links).toHaveLength(1);
      const a = links[0]!;
      expect(a.className).toContain('btn-gilt');
      expect(a.getAttribute('href')).toBe('https://example.com/rsvp');
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      expect(a.textContent).toContain(FILES[lang].ui['rsvp.cta'] as string);
      expect(section.querySelector('form, input')).toBeNull();
    });
  }
});

const hasMusic = Object.keys(import.meta.glob('../../src/components/chrome/MusicToggle.tsx')).length > 0;

describe.skipIf(!hasMusic)('A-OPT-2: music only on press, fading, paused when hidden, never resuming by itself', () => {
  it('follows the rules', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    await renderWith((c) => (c.music.src = '/music/track.mp3'), '/en/');
    const audio = document.querySelector('audio')!;
    expect(audio.getAttribute('preload')).toBe('none');
    expect(play).not.toHaveBeenCalled();
    const button = document.querySelector<HTMLButtonElement>('button[aria-pressed]')!;
    expect(button.getAttribute('aria-pressed')).toBe('false');
    await act(async () => button.click());
    expect(play).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => new Promise((r) => setTimeout(r, 700))); // the 0.6 s fade-out
    expect(pause).toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(play).toHaveBeenCalledTimes(1);
  });
});
