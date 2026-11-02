// The generated copy schema (spec 4.2). src/i18n/<lang>.json are produced by scripts/gen-i18n.mjs and must match.
import type { UiKey } from '../generated/ui-keys';

export type Lang = 'en' | 'hi' | 'mai' | 'bn';
export type EventKey = 'mehndi' | 'engagement' | 'haldi' | 'wedding' | 'reception';
/** side (G groom-first, B bride-first) x reception (1 shown, 0 hidden) */
export type VariantKey = 'G1' | 'G0' | 'B1' | 'B0';
export type Numerals = 'latin' | 'devanagari' | 'bengali';

export interface LangMeta {
  bcp47: string;
  script: 'Latn' | 'Deva' | 'Beng';
  numerals: Numerals;
  endonym: string;
  short: string;
  ogLocale: string | null;
}

export interface Person {
  text: string;
  honorific: string | null;
  role: 'groom' | 'bride';
}

export interface EventCopy {
  key: EventKey;
  title: string;
  tagline: string;
  date: string;
  time: string;
  dateTime: string;
  venue: string;
  address: [string, string];
  mapQuery: string;
  startUtc: string;
  dateIso: string;
  venueKey: string;
  city: number;
}

export interface DayCopy {
  heading: string;
  dateIso: string;
  venue: string;
  address: [string, string];
  mapQuery: string;
  lines: { key: EventKey; text: string }[];
  city: number;
}

export interface SiteCopy {
  invocation: string;
  invocationSecondary: string | null;
  shloka: [string, string] | null;
  heading: string;
  dateline: { dates: string; cities: string | null };
  pair: { first: string; joiner: string; second: string; text: string };
  pairFull: string;
  monogram: 'AS' | 'SA';
  blessing: string;
  host: string;
  names: { first: Person; second: Person; joiner: string };
  eventsHeading: string;
  labels: { date: string; time: string; venue: string; map: string };
  events: EventCopy[];
  cities: string[];
  days: DayCopy[];
  closing: {
    big: string;
    bigLines: [string, string];
    small: string;
    regards: string;
    families: [string, string, string];
  };
  head: { title: string; description: string; ogAlt: string };
}

export type UiValue = string | { one: string; other: string };
export type UiStrings = Record<UiKey, UiValue>;

export interface SourceInfo {
  contentSha256: string;
  uiSha256: string;
  generatedAt: string | null;
}

export interface LangFile {
  lang: Lang;
  meta: LangMeta;
  ui: UiStrings;
  variants: Record<VariantKey, SiteCopy>;
  source: SourceInfo;
}

export type { UiKey };
