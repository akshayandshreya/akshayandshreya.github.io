// The seven palette classes (spec 1.2, src/styles/palettes.css) and which section wears which.
import type { EventKey } from '../i18n/types';

export type Palette = 'ivory' | 'blush' | 'sage' | 'rose' | 'turmeric' | 'vermilion' | 'teal';

export const EVENT_PALETTE: Record<EventKey, Palette> = {
  mehndi: 'sage',
  engagement: 'rose',
  haldi: 'turmeric',
  wedding: 'vermilion',
  reception: 'teal',
};

export const DEEP_PALETTES: ReadonlySet<Palette> = new Set(['vermilion', 'teal']);
