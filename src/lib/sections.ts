// Page order and anchors (spec 2.2) and the hash mapping of 2.1: a hidden section's id maps to its nearest visible
// parent. Section ids are English and identical in every language, so a hash survives a language switch.
import type { EventKey, SiteCopy } from '../i18n/types';
import type { SiteConfig } from '../config';

export type SectionId =
  | 'opening'
  | 'invitation'
  | 'countdown'
  | 'celebrations'
  | EventKey
  | 'cultures'
  | 'venues'
  | 'rsvp'
  | 'gallery'
  | 'closing'
  | 'footer';

export const EVENT_IDS: readonly EventKey[] = ['mehndi', 'engagement', 'haldi', 'wedding', 'reception'];

export interface SectionFlags {
  countdown: boolean;
  cultures: boolean;
  rsvp: boolean;
  gallery: boolean;
}

export function sectionFlags(config: SiteConfig, countdownLive: boolean): SectionFlags {
  return {
    countdown: config.sections.countdown && countdownLive,
    cultures: config.sections.cultures,
    rsvp: Boolean(config.rsvp.url),
    gallery: config.gallery.length > 0,
  };
}

/** The visible sections of a variant, in page order. */
export function visibleSections(copy: SiteCopy, flags: SectionFlags): SectionId[] {
  const out: SectionId[] = ['opening', 'invitation'];
  if (flags.countdown) out.push('countdown');
  out.push('celebrations', ...copy.events.map((e) => e.key));
  if (flags.cultures) out.push('cultures');
  out.push('venues');
  if (flags.rsvp) out.push('rsvp');
  if (flags.gallery) out.push('gallery');
  out.push('closing', 'footer');
  return out;
}

/** The section a hash should scroll to, or null when the hash is not a section id. */
export function resolveSectionHash(hash: string, visible: readonly SectionId[]): SectionId | null {
  const id = decodeURIComponent(hash.replace(/^#/, '')).trim();
  if (!id) return null;
  if ((visible as readonly string[]).includes(id)) return id as SectionId;
  if ((EVENT_IDS as readonly string[]).includes(id) || id === 'countdown') return 'celebrations';
  if (id === 'rsvp' || id === 'gallery') return 'closing';
  if (id === 'cultures') return 'venues';
  return null;
}
